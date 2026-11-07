using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.FloorPlans;
using Cbplayground.Api.Reservations;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// Tables on the floor plans of the restaurant's areas. Only Tenant Admins may manage them. Archived tables and areas
/// (<see cref="Table.ArchivedAtUtc"/>) are not found here: they are neither listed nor changed, and their numbers are free again.
/// </summary>
public static class TableEndpoints
{
    public const int MaxNumberLength = 20;

    public record TableResponse(Guid Id, Guid AreaId, string Number, int Seats, int MinGuests, double PosX, double PosY, TableShape Shape, int Rotation);

    /// <summary>
    /// A new table is placed in the middle of the floor plan image, or, in an area without one, on the first free place of the
    /// arrangement beside the room elements (<see cref="TableLayout.FreePosition"/>). Without <see cref="Shape"/> it gets the default for its seats,
    /// without <see cref="Rotation"/> 0, without <see cref="MinGuests"/> 1.
    /// </summary>
    public record CreateTableRequest(Guid AreaId, string? Number, int Seats, string? Shape, int? Rotation, int? MinGuests);

    /// <summary>
    /// Without <see cref="Shape"/>, <see cref="Rotation"/> or <see cref="MinGuests"/> the stored value stays; a stored
    /// <see cref="MinGuests"/> above the new seats is lowered to them.
    /// </summary>
    public record UpdateTableRequest(string? Number, int Seats, string? Shape, int? Rotation, int? MinGuests);

    /// <summary>New position of a table, relative to the floor plan image (0–1).</summary>
    public record TablePosition(Guid Id, double PosX, double PosY);

    public static void MapTableEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/tables").RequireAuthorization(Policies.RequireTenantAdmin);

        group.MapGet("/", async (AppDbContext db) =>
            (await db.Tables.Where(t => t.ArchivedAtUtc == null).ToListAsync())
                .OrderBy(t => t.Number.Length).ThenBy(t => t.Number, StringComparer.Ordinal)
                .Select(ToResponse));

        group.MapPost("/", async (CreateTableRequest request, AppDbContext db) =>
        {
            var area = await db.Areas.SingleOrDefaultAsync(a => a.Id == request.AreaId && a.ArchivedAtUtc == null);
            if (area is null)
            {
                return ErrorResponse.Result("area_not_found", StatusCodes.Status404NotFound);
            }

            var number = request.Number?.Trim();
            if (await ValidateAsync(db, null, number, request.Seats, request.Shape, request.Rotation, request.MinGuests) is { } error)
            {
                return error;
            }

            var table = new Table
            {
                AreaId = area.Id,
                Number = number!,
                Seats = request.Seats,
                MinGuests = request.MinGuests ?? 1,
                Shape = ParseShape(request.Shape) ?? Table.DefaultShape(request.Seats),
                Rotation = request.Rotation ?? 0,
                PosX = 0.5,
                PosY = 0.5,
            };
            if (area.FloorPlanFileName is null)
            {
                var existing = await db.Tables.Where(t => t.AreaId == area.Id && t.ArchivedAtUtc == null).ToListAsync();
                (table.PosX, table.PosY) = TableLayout.FreePosition(existing, table, area.TableScale, await AreaEndpoints.ElementsForLayoutAsync(db, area));
            }
            db.Tables.Add(table);
            await db.SaveChangesAsync();
            return Results.Created($"/api/admin/tables/{table.Id}", ToResponse(table));
        });

        group.MapPut("/{id:guid}", async (Guid id, UpdateTableRequest request, AppDbContext db) =>
        {
            var table = await db.Tables.SingleOrDefaultAsync(t => t.Id == id && t.ArchivedAtUtc == null);
            if (table is null)
            {
                return Results.NotFound();
            }

            var number = request.Number?.Trim();
            if (await ValidateAsync(db, id, number, request.Seats, request.Shape, request.Rotation, request.MinGuests) is { } error)
            {
                return error;
            }

            table.Number = number!;
            table.Seats = request.Seats;
            table.MinGuests = request.MinGuests ?? Math.Min(table.MinGuests, request.Seats);
            table.Shape = ParseShape(request.Shape) ?? table.Shape;
            table.Rotation = request.Rotation ?? table.Rotation;
            await db.SaveChangesAsync();
            return Results.Ok(ToResponse(table));
        });

        // A table with reservations that have not ended yet cannot be deleted. A table without reservations is deleted, one with
        // reservations (past, cancelled, declined ones) is archived, so they keep their table. The combinations it
        // is part of are deleted in both cases.
        group.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, IAvailabilityService availability, TimeProvider timeProvider) =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync();
            var table = await db.Tables.SingleOrDefaultAsync(t => t.Id == id && t.ArchivedAtUtc == null);
            if (table is null)
            {
                return Results.NotFound();
            }
            if (await TableDeletion.TryDeleteAsync(db, availability, [table], timeProvider.GetUtcNow().UtcDateTime) == TableDeletionResult.Blocked)
            {
                return ErrorResponse.Result("table_has_reservations", StatusCodes.Status409Conflict);
            }

            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Results.NoContent();
        });

        // Saves the positions of several tables at once, e.g. after moving them on the floor plan.
        // Either all positions are saved or none.
        group.MapPut("/positions", async (List<TablePosition> positions, AppDbContext db) =>
        {
            if (positions.Any(p => !IsValidPosition(p.PosX) || !IsValidPosition(p.PosY)))
            {
                return ErrorResponse.Result("position_invalid", StatusCodes.Status400BadRequest);
            }

            var ids = positions.Select(p => p.Id).Distinct().ToList();
            var tables = await db.Tables.Where(t => ids.Contains(t.Id) && t.ArchivedAtUtc == null).ToListAsync();
            if (tables.Count != ids.Count)
            {
                return ErrorResponse.Result("table_not_found", StatusCodes.Status404NotFound);
            }

            foreach (var position in positions)
            {
                var table = tables.Single(t => t.Id == position.Id);
                table.PosX = position.PosX;
                table.PosY = position.PosY;
            }
            await db.SaveChangesAsync();
            return Results.Ok(tables.Select(ToResponse));
        });
    }

    /// <summary>
    /// Checks a new (<paramref name="id"/> null) or changed table; null when it is fine. Shape, rotation and the smallest party
    /// may be missing.
    /// </summary>
    private static async Task<IResult?> ValidateAsync(AppDbContext db, Guid? id, string? number, int seats, string? shape, int? rotation, int? minGuests)
    {
        if (string.IsNullOrEmpty(number) || number.Length > MaxNumberLength)
        {
            return ErrorResponse.Result("table_number_invalid", StatusCodes.Status400BadRequest);
        }
        if (seats < 1)
        {
            return ErrorResponse.Result("seats_invalid", StatusCodes.Status400BadRequest);
        }
        if (minGuests is not null && (minGuests < 1 || minGuests > seats))
        {
            return ErrorResponse.Result("min_guests_invalid", StatusCodes.Status400BadRequest);
        }
        if (shape is not null && ParseShape(shape) is null)
        {
            return ErrorResponse.Result("shape_invalid", StatusCodes.Status400BadRequest);
        }
        if (rotation is not (null or 0 or 90))
        {
            return ErrorResponse.Result("rotation_invalid", StatusCodes.Status400BadRequest);
        }
        // Archived tables do not count: their numbers are free again (filtered unique index).
        if (await db.Tables.AnyAsync(t => t.Number == number && t.Id != id && t.ArchivedAtUtc == null))
        {
            return ErrorResponse.Result("table_number_taken", StatusCodes.Status409Conflict);
        }
        return null;
    }

    private static bool IsValidPosition(double value) => value is >= 0 and <= 1;

    /// <summary>"Round", "Square" or "Rectangle" (in any case, as the JSON enums); null for anything else, numbers included.</summary>
    private static TableShape? ParseShape(string? shape) =>
        Enum.GetValues<TableShape>().Select(s => (TableShape?)s).FirstOrDefault(s => string.Equals(s.ToString(), shape, StringComparison.OrdinalIgnoreCase));

    internal static TableResponse ToResponse(Table table) =>
        new(table.Id, table.AreaId, table.Number, table.Seats, table.MinGuests, table.PosX, table.PosY, table.Shape, table.Rotation);
}
