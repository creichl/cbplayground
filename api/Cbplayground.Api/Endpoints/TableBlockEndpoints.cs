using System.Globalization;
using System.Security.Claims;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Reservations;
using Microsoft.EntityFrameworkCore;
using static Cbplayground.Api.Endpoints.OpeningHoursEndpoints;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// Blocked tables (<see cref="TableBlock"/>) for the restaurant's staff (Tenant Admins and Front desk users), always of the signed-in
/// user's restaurant. Tables and blocks of other restaurants, and archived tables, are answered with 404.
/// </summary>
public static class TableBlockEndpoints
{
    /// <summary>A block; <see cref="Start"/> and <see cref="End"/> are "HH:mm", <see cref="End"/> "24:00" for midnight.</summary>
    public record TableBlockResponse(Guid Id, Guid TableId, string TableNumber, Guid AreaId, DateOnly Date, string Start, string End,
        string? Reason, string? CreatedBy, DateTime CreatedAtUtc);

    /// <summary>
    /// A new block of one table on one day. <see cref="Date"/> is "YYYY-MM-DD", <see cref="Start"/> and <see cref="End"/> are quarter
    /// hours "HH:mm" (<see cref="End"/> also "24:00"), <see cref="Reason"/> at most <see cref="TableBlock.MaxReasonLength"/> characters.
    /// Errors (400): "invalid_date", "invalid_time", "start_not_before_end", "invalid_reason"; (409): "table_has_reservations" with the
    /// reservations that occupy the table in that time (<see cref="TableHasReservationsResponse"/>).
    /// </summary>
    public record TableBlockRequest(Guid TableId, string? Date, string? Start, string? End, string? Reason);

    /// <summary>The body of 409 "table_has_reservations": the reservations that occupy the table during the block.</summary>
    public record TableHasReservationsResponse(string Error, IReadOnlyList<StaffReservationEndpoints.ReservationResponse> Reservations);

    public static void MapTableBlockEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/staff/table-blocks").RequireAuthorization(Policies.RequireStaff);

        // The blocks of a day, by start and table number; those of archived tables are left out like the tables.
        group.MapGet("/", async (string? date, AppDbContext db, CancellationToken cancellationToken) =>
        {
            if (!TryParseDate(date, out var day))
            {
                return BadRequest("invalid_date");
            }
            var dayStart = day.ToDateTime(TimeOnly.MinValue);
            var dayEnd = dayStart.AddDays(1);
            var rows = await db.TableBlocks
                .Where(b => b.StartLocal >= dayStart && b.StartLocal < dayEnd)
                .Join(db.Tables.Where(t => t.ArchivedAtUtc == null), b => b.TableId, t => t.Id, (b, t) => new { Block = b, Table = t })
                .ToListAsync(cancellationToken);
            return Results.Ok(rows
                .OrderBy(r => r.Block.StartLocal)
                .ThenBy(r => r.Table.Number.Length).ThenBy(r => r.Table.Number, StringComparer.Ordinal)
                .Select(r => ToResponse(r.Block, r.Table))
                .ToList());
        });

        // A reservation that occupies the table during the block refuses it: it has to be moved or cancelled first.
        group.MapPost("/", async (TableBlockRequest request, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken) =>
        {
            if (!TryParseDate(request.Date, out var date))
            {
                return BadRequest("invalid_date");
            }
            if (!TryParseQuarterHour(request.Start, allowEndOfDay: false, out var start) || !TryParseQuarterHour(request.End, allowEndOfDay: true, out var end))
            {
                return BadRequest("invalid_time");
            }
            if (start >= end)
            {
                return BadRequest("start_not_before_end");
            }
            var reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
            if (reason is { Length: > TableBlock.MaxReasonLength })
            {
                return BadRequest("invalid_reason");
            }

            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var table = await db.Tables.SingleOrDefaultAsync(t => t.Id == request.TableId && t.ArchivedAtUtc == null, cancellationToken);
            if (table is null)
            {
                return Results.NotFound();
            }

            var startLocal = date.ToDateTime(start);
            var endLocal = end == OpeningPeriod.EndOfDay ? date.AddDays(1).ToDateTime(TimeOnly.MinValue) : date.ToDateTime(end);
            // As in the availability: a reservation in a blocking status occupies the table until its end, one whose guest has left
            // only until they left. The block has no buffer, so a reservation that ends at its start does not collide.
            var candidates = await db.Reservations
                .Where(r => (r.TableId == table.Id || r.Tables.Any(t => t.TableId == table.Id))
                    && r.StartLocal < endLocal && r.EndLocal > startLocal
                    && (ReservationRules.BlockingStatuses.Contains(r.Status) || r.Status == ReservationStatus.Completed))
                .Select(r => new { r.Id, r.Status, r.CompletedAtLocal })
                .ToListAsync(cancellationToken);
            var overlapping = candidates
                .Where(r => r.Status != ReservationStatus.Completed || r.CompletedAtLocal > startLocal)
                .Select(r => r.Id)
                .ToList();
            if (overlapping.Count > 0)
            {
                var reservations = await StaffReservationEndpoints.LoadResponsesAsync(db, db.Reservations.Where(r => overlapping.Contains(r.Id)));
                return Results.Json(new TableHasReservationsResponse("table_has_reservations", reservations), statusCode: StatusCodes.Status409Conflict);
            }

            var editor = await ReservationEditor.StaffAsync(user, db, cancellationToken);
            var block = new TableBlock
            {
                TableId = table.Id,
                StartLocal = startLocal,
                EndLocal = endLocal,
                Reason = reason,
                CreatedByUserId = editor.UserId,
                CreatedByDisplayName = editor.DisplayName,
                CreatedAtUtc = DateTime.UtcNow,
            };
            db.TableBlocks.Add(block);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Results.Created($"/api/staff/table-blocks/{block.Id}", ToResponse(block, table));
        });

        // Removing a block frees the table again.
        group.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var block = await db.TableBlocks.SingleOrDefaultAsync(b => b.Id == id, cancellationToken);
            if (block is null)
            {
                return Results.NotFound();
            }
            db.TableBlocks.Remove(block);
            await db.SaveChangesAsync(cancellationToken);
            return Results.NoContent();
        });
    }

    private static bool TryParseDate(string? value, out DateOnly date) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);

    /// <summary>"HH:mm" on a quarter hour (:00, :15, :30, :45); with <paramref name="allowEndOfDay"/> also "24:00".</summary>
    private static bool TryParseQuarterHour(string? value, bool allowEndOfDay, out TimeOnly time) =>
        TryParseTime(value, allowEndOfDay, out time) && (time == OpeningPeriod.EndOfDay || time.Minute % ReservationRules.SlotMinutes == 0);

    private static TableBlockResponse ToResponse(TableBlock block, Table table) => new(
        block.Id,
        table.Id,
        table.Number,
        table.AreaId,
        DateOnly.FromDateTime(block.StartLocal),
        FormatTime(TimeOnly.FromDateTime(block.StartLocal)),
        block.EndLocal.Date > block.StartLocal.Date ? FormatTime(OpeningPeriod.EndOfDay) : FormatTime(TimeOnly.FromDateTime(block.EndLocal)),
        block.Reason,
        block.CreatedByDisplayName,
        block.CreatedAtUtc);

    private static IResult BadRequest(string error) => ErrorResponse.Result(error, StatusCodes.Status400BadRequest);
}
