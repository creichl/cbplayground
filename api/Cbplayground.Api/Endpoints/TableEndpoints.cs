using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Reservations;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>Tables on the floor plans of the restaurant's areas. Only Tenant Admins may manage them.</summary>
public static class TableEndpoints
{
    public const int MaxNumberLength = 20;

    public record TableResponse(Guid Id, Guid AreaId, string Number, int Seats, double PosX, double PosY);

    /// <summary>A new table is placed in the middle of the floor plan.</summary>
    public record CreateTableRequest(Guid AreaId, string? Number, int Seats);

    public record UpdateTableRequest(string? Number, int Seats);

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
            if (!await db.Areas.AnyAsync(a => a.Id == request.AreaId))
            {
                return ErrorResponse.Result("area_not_found", StatusCodes.Status404NotFound);
            }

            var number = request.Number?.Trim();
            if (await ValidateAsync(db, null, number, request.Seats) is { } error)
            {
                return error;
            }

            var table = new Table { AreaId = request.AreaId, Number = number!, Seats = request.Seats, PosX = 0.5, PosY = 0.5 };
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
            if (await ValidateAsync(db, id, number, request.Seats) is { } error)
            {
                return error;
            }

            table.Number = number!;
            table.Seats = request.Seats;
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

    /// <summary>Checks number and seats of a new (<paramref name="id"/> null) or changed table; null when they are fine.</summary>
    private static async Task<IResult?> ValidateAsync(AppDbContext db, Guid? id, string? number, int seats)
    {
        if (string.IsNullOrEmpty(number) || number.Length > MaxNumberLength)
        {
            return ErrorResponse.Result("table_number_invalid", StatusCodes.Status400BadRequest);
        }
        if (seats < 1)
        {
            return ErrorResponse.Result("seats_invalid", StatusCodes.Status400BadRequest);
        }
        if (await db.Tables.AnyAsync(t => t.Number == number && t.Id != id))
        {
            return ErrorResponse.Result("table_number_taken", StatusCodes.Status409Conflict);
        }
        return null;
    }

    private static bool IsValidPosition(double value) => value is >= 0 and <= 1;

    private static TableResponse ToResponse(Table table) => new(table.Id, table.AreaId, table.Number, table.Seats, table.PosX, table.PosY);
}
