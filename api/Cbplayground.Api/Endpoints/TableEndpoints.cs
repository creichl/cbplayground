using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.FloorPlans;
using Cbplayground.Api.Reservations;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>Tables on the floor plans of the restaurant's areas. Only Tenant Admins may manage them.</summary>
public static class TableEndpoints
{
    public const int MaxNumberLength = 20;

    public record TableResponse(Guid Id, Guid AreaId, string Number, int Seats, double PosX, double PosY, TableShape Shape, int Rotation);

    /// <summary>
    /// A new table is placed in the middle of the floor plan image, or, in an area without one, on the first free place of the
    /// arrangement (<see cref="TableLayout.FreePosition"/>). Without <see cref="Shape"/> it gets the default for its seats,
    /// without <see cref="Rotation"/> 0.
    /// </summary>
    public record CreateTableRequest(Guid AreaId, string? Number, int Seats, string? Shape, int? Rotation);

    /// <summary>Without <see cref="Shape"/> or <see cref="Rotation"/> the stored value stays.</summary>
    public record UpdateTableRequest(string? Number, int Seats, string? Shape, int? Rotation);

    /// <summary>New position of a table, relative to the floor plan image (0–1).</summary>
    public record TablePosition(Guid Id, double PosX, double PosY);

    public static void MapTableEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/tables").RequireAuthorization(Policies.RequireTenantAdmin);

        group.MapGet("/", async (AppDbContext db) =>
            (await db.Tables.ToListAsync())
                .OrderBy(t => t.Number.Length).ThenBy(t => t.Number, StringComparer.Ordinal)
                .Select(ToResponse));

        group.MapPost("/", async (CreateTableRequest request, AppDbContext db) =>
        {
            var area = await db.Areas.SingleOrDefaultAsync(a => a.Id == request.AreaId);
            if (area is null)
            {
                return ErrorResponse.Result("area_not_found", StatusCodes.Status404NotFound);
            }

            var number = request.Number?.Trim();
            if (await ValidateAsync(db, null, number, request.Seats, request.Shape, request.Rotation) is { } error)
            {
                return error;
            }

            var table = new Table
            {
                AreaId = area.Id,
                Number = number!,
                Seats = request.Seats,
                Shape = ParseShape(request.Shape) ?? Table.DefaultShape(request.Seats),
                Rotation = request.Rotation ?? 0,
                PosX = 0.5,
                PosY = 0.5,
            };
            if (area.FloorPlanFileName is null)
            {
                var existing = await db.Tables.Where(t => t.AreaId == area.Id).ToListAsync();
                (table.PosX, table.PosY) = TableLayout.FreePosition(existing, table, area.TableScale);
            }
            db.Tables.Add(table);
            await db.SaveChangesAsync();
            return Results.Created($"/api/admin/tables/{table.Id}", ToResponse(table));
        });

        group.MapPut("/{id:guid}", async (Guid id, UpdateTableRequest request, AppDbContext db) =>
        {
            var table = await db.Tables.SingleOrDefaultAsync(t => t.Id == id);
            if (table is null)
            {
                return Results.NotFound();
            }

            var number = request.Number?.Trim();
            if (await ValidateAsync(db, id, number, request.Seats, request.Shape, request.Rotation) is { } error)
            {
                return error;
            }

            table.Number = number!;
            table.Seats = request.Seats;
            table.Shape = ParseShape(request.Shape) ?? table.Shape;
            table.Rotation = request.Rotation ?? table.Rotation;
            await db.SaveChangesAsync();
            return Results.Ok(ToResponse(table));
        });

        // A table with reservations that have not ended yet cannot be deleted; its past, cancelled and declined ones are deleted with it.
        group.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, IAvailabilityService availability) =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync();
            var table = await db.Tables.SingleOrDefaultAsync(t => t.Id == id);
            if (table is null)
            {
                return Results.NotFound();
            }
            if (!await TableDeletion.TryRemoveReservationsAsync(db, availability, [table.Id]))
            {
                return ErrorResponse.Result("table_has_reservations", StatusCodes.Status409Conflict);
            }

            db.Tables.Remove(table);
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
            var tables = await db.Tables.Where(t => ids.Contains(t.Id)).ToListAsync();
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

    /// <summary>Checks a new (<paramref name="id"/> null) or changed table; null when it is fine. Shape and rotation may be missing.</summary>
    private static async Task<IResult?> ValidateAsync(AppDbContext db, Guid? id, string? number, int seats, string? shape, int? rotation)
    {
        if (string.IsNullOrEmpty(number) || number.Length > MaxNumberLength)
        {
            return ErrorResponse.Result("table_number_invalid", StatusCodes.Status400BadRequest);
        }
        if (seats < 1)
        {
            return ErrorResponse.Result("seats_invalid", StatusCodes.Status400BadRequest);
        }
        if (shape is not null && ParseShape(shape) is null)
        {
            return ErrorResponse.Result("shape_invalid", StatusCodes.Status400BadRequest);
        }
        if (rotation is not (null or 0 or 90))
        {
            return ErrorResponse.Result("rotation_invalid", StatusCodes.Status400BadRequest);
        }
        if (await db.Tables.AnyAsync(t => t.Number == number && t.Id != id))
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
        new(table.Id, table.AreaId, table.Number, table.Seats, table.PosX, table.PosY, table.Shape, table.Rotation);
}
