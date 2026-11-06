using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Reservations;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// The table combinations of an area (<see cref="TableCombination"/>): tables the restaurant pushes together for a larger group.
/// Only Tenant Admins may manage them. Areas and combinations of other restaurants are answered with 404.
/// </summary>
public static class TableCombinationEndpoints
{
    /// <summary>Its tables in number order; <see cref="Label"/> their numbers, e.g. "4 + 5".</summary>
    public record CombinationResponse(Guid Id, Guid AreaId, IReadOnlyList<Guid> TableIds, string Label, int Seats, int MinGuests, bool OnlineBookable);

    /// <summary>
    /// A new combination of at least 2 tables of the area, each once (otherwise 400 "combination_tables_invalid"; the same tables
    /// as another combination: 409 "combination_exists"). Without <see cref="Seats"/> the sum of the tables' seats, without
    /// <see cref="MinGuests"/> the seats of the largest table + 1 (at most the seats), without <see cref="OnlineBookable"/> true.
    /// Errors (400): "combination_seats_invalid" (fewer than the largest table + 1), "combination_min_guests_invalid" (not 1 to the seats).
    /// </summary>
    public record CreateCombinationRequest(List<Guid>? TableIds, int? Seats, int? MinGuests, bool? OnlineBookable);

    /// <summary>Changes seats, smallest online party and online booking; the tables stay. Errors as for a new combination.</summary>
    public record UpdateCombinationRequest(int Seats, int MinGuests, bool OnlineBookable);

    public static void MapTableCombinationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/areas/{areaId:guid}/combinations").RequireAuthorization(Policies.RequireTenantAdmin);

        group.MapGet("/", async (Guid areaId, AppDbContext db) =>
        {
            if (!await db.Areas.AnyAsync(a => a.Id == areaId))
            {
                return Results.NotFound();
            }
            var tables = await db.Tables.Where(t => t.AreaId == areaId).ToDictionaryAsync(t => t.Id);
            var combinations = await db.TableCombinations.Include(c => c.Tables).Where(c => c.AreaId == areaId).ToListAsync();
            return Results.Ok(combinations
                .Select(c => ToResponse(c, tables))
                .OrderBy(c => tables[c.TableIds[0]].Number.Length).ThenBy(c => tables[c.TableIds[0]].Number, StringComparer.Ordinal)
                .ThenBy(c => c.Label, StringComparer.Ordinal));
        });

        group.MapPost("/", async (Guid areaId, CreateCombinationRequest request, AppDbContext db) =>
        {
            if (!await db.Areas.AnyAsync(a => a.Id == areaId))
            {
                return Results.NotFound();
            }
            var tables = await db.Tables.Where(t => t.AreaId == areaId).ToDictionaryAsync(t => t.Id);
            var tableIds = request.TableIds ?? [];
            if (tableIds.Count < 2 || tableIds.Distinct().Count() != tableIds.Count || !tableIds.All(tables.ContainsKey))
            {
                return ErrorResponse.Result("combination_tables_invalid", StatusCodes.Status400BadRequest);
            }
            var existing = await db.TableCombinations.Include(c => c.Tables).Where(c => c.AreaId == areaId).ToListAsync();
            if (existing.Any(c => c.Tables.Count == tableIds.Count && c.Tables.All(t => tableIds.Contains(t.TableId))))
            {
                return ErrorResponse.Result("combination_exists", StatusCodes.Status409Conflict);
            }

            var combined = tableIds.Select(id => tables[id]).ToList();
            var seats = request.Seats ?? combined.Sum(t => t.Seats);
            var minGuests = request.MinGuests ?? Math.Min(combined.Max(t => t.Seats) + 1, seats);
            if (Validate(combined, seats, minGuests) is { } error)
            {
                return error;
            }

            var combination = new TableCombination
            {
                AreaId = areaId,
                Seats = seats,
                MinGuests = minGuests,
                OnlineBookable = request.OnlineBookable ?? true,
                Tables = tableIds.Select(id => new TableCombinationTable { TableId = id }).ToList(),
            };
            db.TableCombinations.Add(combination);
            await db.SaveChangesAsync();
            return Results.Created($"/api/admin/areas/{areaId}/combinations/{combination.Id}", ToResponse(combination, tables));
        });

        group.MapPut("/{id:guid}", async (Guid areaId, Guid id, UpdateCombinationRequest request, AppDbContext db) =>
        {
            var combination = await db.TableCombinations.Include(c => c.Tables).SingleOrDefaultAsync(c => c.Id == id && c.AreaId == areaId);
            if (combination is null)
            {
                return Results.NotFound();
            }
            var tables = await db.Tables.Where(t => t.AreaId == areaId).ToDictionaryAsync(t => t.Id);
            if (Validate(combination.Tables.Select(t => tables[t.TableId]).ToList(), request.Seats, request.MinGuests) is { } error)
            {
                return error;
            }

            combination.Seats = request.Seats;
            combination.MinGuests = request.MinGuests;
            combination.OnlineBookable = request.OnlineBookable;
            await db.SaveChangesAsync();
            return Results.Ok(ToResponse(combination, tables));
        });

        // The reservations on its tables stay: they keep their tables.
        group.MapDelete("/{id:guid}", async (Guid areaId, Guid id, AppDbContext db) =>
        {
            var combination = await db.TableCombinations.SingleOrDefaultAsync(c => c.Id == id && c.AreaId == areaId);
            if (combination is null)
            {
                return Results.NotFound();
            }
            db.TableCombinations.Remove(combination);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    /// <summary>Seats at least the largest table + 1, the smallest online party 1 to the seats; null when both are fine.</summary>
    private static IResult? Validate(List<Table> tables, int seats, int minGuests)
    {
        if (seats < tables.Max(t => t.Seats) + 1)
        {
            return ErrorResponse.Result("combination_seats_invalid", StatusCodes.Status400BadRequest);
        }
        if (minGuests < 1 || minGuests > seats)
        {
            return ErrorResponse.Result("combination_min_guests_invalid", StatusCodes.Status400BadRequest);
        }
        return null;
    }

    private static CombinationResponse ToResponse(TableCombination combination, Dictionary<Guid, Table> tables)
    {
        var combined = StaffReservationEndpoints.InNumberOrder(combination.Tables.Select(t => tables[t.TableId]));
        return new CombinationResponse(combination.Id, combination.AreaId, combined.Select(t => t.Id).ToList(),
            AvailabilityService.CombinedLabel(combined), combination.Seats, combination.MinGuests, combination.OnlineBookable);
    }
}
