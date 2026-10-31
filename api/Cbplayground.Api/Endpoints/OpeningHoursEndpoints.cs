using System.Globalization;
using System.Text.RegularExpressions;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.OpeningHours;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// Opening hours, location and public holidays of the signed-in Tenant Admin's restaurant.
/// Invalid input is answered with 400 and <c>{ "error": "..." }</c>; the codes are listed at the request types.
/// </summary>
public static partial class OpeningHoursEndpoints
{
    public record ErrorResponse(string Error);

    /// <summary>A time window on a day of the week. Times are "HH:mm"; the end may be "24:00".</summary>
    public record PeriodDto(DayOfWeek DayOfWeek, string Start, string End);

    /// <summary>
    /// The whole week. Errors: "invalid_day", "invalid_time", "start_not_before_end", "overlapping_periods".
    /// </summary>
    public record OpeningHoursDto(IReadOnlyList<PeriodDto>? Periods);

    /// <summary>Errors: "invalid_country", "region_required", "invalid_region", "region_not_allowed".</summary>
    public record LocationRequest(string? CountryCode, string? RegionCode);

    public record LocationResponse(string? CountryCode, string? RegionCode, string? TimeZoneId);

    /// <summary>A day with one or more public holidays (<see cref="Keys"/>) and whether the restaurant is open on it.</summary>
    public record HolidayResponse(DateOnly Date, IReadOnlyList<string> Keys, bool IsOpen);

    /// <summary>Errors: "not_a_holiday".</summary>
    public record HolidayOverrideRequest(bool IsOpen);

    [GeneratedRegex(@"^([01]\d|2[0-3]):[0-5]\d$")]
    private static partial Regex TimePattern();

    public static void MapOpeningHoursEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin").RequireAuthorization(Policies.RequireTenantAdmin);

        group.MapGet("/opening-hours", async (AppDbContext db) =>
        {
            var periods = await db.OpeningPeriods
                .OrderBy(p => p.DayOfWeek)
                .ThenBy(p => p.Start)
                .ToListAsync();
            return new OpeningHoursDto(periods.Select(p => new PeriodDto(p.DayOfWeek, FormatTime(p.Start), FormatTime(p.End))).ToList());
        });

        group.MapPut("/opening-hours", async (OpeningHoursDto request, AppDbContext db) =>
        {
            var periods = new List<OpeningPeriod>();
            foreach (var dto in request.Periods ?? [])
            {
                if (!Enum.IsDefined(dto.DayOfWeek))
                {
                    return Error("invalid_day");
                }
                if (!TryParseTime(dto.Start, allowEndOfDay: false, out var start) || !TryParseTime(dto.End, allowEndOfDay: true, out var end))
                {
                    return Error("invalid_time");
                }
                if (start >= end)
                {
                    return Error("start_not_before_end");
                }
                periods.Add(new OpeningPeriod { DayOfWeek = dto.DayOfWeek, Start = start, End = end });
            }

            foreach (var day in periods.GroupBy(p => p.DayOfWeek))
            {
                var sorted = day.OrderBy(p => p.Start).ToList();
                for (var i = 1; i < sorted.Count; i++)
                {
                    if (sorted[i].Start < sorted[i - 1].End)
                    {
                        return Error("overlapping_periods");
                    }
                }
            }

            // The query filter limits this to the current tenant's periods.
            db.OpeningPeriods.RemoveRange(await db.OpeningPeriods.ToListAsync());
            db.OpeningPeriods.AddRange(periods);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapGet("/location", async (ITenantContext tenantContext, AppDbContext db) =>
            await db.Tenants
                .Where(t => t.Id == tenantContext.TenantId)
                .Select(t => new LocationResponse(t.CountryCode, t.RegionCode, t.TimeZoneId))
                .SingleAsync());

        group.MapPut("/location", async (LocationRequest request, ITenantContext tenantContext, AppDbContext db) =>
        {
            var regionCode = string.IsNullOrEmpty(request.RegionCode) ? null : request.RegionCode;
            if (Locations.Validate(request.CountryCode, regionCode) is { } error)
            {
                return Error(error);
            }

            var tenant = await db.Tenants.SingleAsync(t => t.Id == tenantContext.TenantId);
            tenant.CountryCode = request.CountryCode;
            tenant.RegionCode = regionCode;
            tenant.TimeZoneId = Locations.TimeZones[request.CountryCode!];
            await db.SaveChangesAsync();
            return Results.Ok(new LocationResponse(tenant.CountryCode, tenant.RegionCode, tenant.TimeZoneId));
        });

        // Without from/to: the next 12 months, starting today in the restaurant's time zone.
        group.MapGet("/holidays", async (DateOnly? from, DateOnly? to, ITenantContext tenantContext, AppDbContext db, IHolidayProvider holidayProvider) =>
        {
            var tenant = await db.Tenants.SingleAsync(t => t.Id == tenantContext.TenantId);
            if (tenant.CountryCode is null || tenant.TimeZoneId is null)
            {
                return Results.Ok(Array.Empty<HolidayResponse>());
            }

            var start = from ?? DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, tenant.TimeZoneId));
            var end = to ?? start.AddYears(1).AddDays(-1);
            if (end < start || end > start.AddYears(2))
            {
                return Error("invalid_range");
            }

            var holidays = holidayProvider.GetHolidays(tenant.CountryCode, tenant.RegionCode, start, end);
            var overrides = await db.HolidayOverrides
                .Where(o => o.Date >= start && o.Date <= end)
                .ToDictionaryAsync(o => o.Date, o => o.IsOpen);

            return Results.Ok(holidays
                .GroupBy(h => h.Date)
                .Select(day => new HolidayResponse(
                    day.Key,
                    day.Select(h => h.Key).ToList(),
                    overrides.TryGetValue(day.Key, out var isOpen) ? isOpen : OpeningCalendar.HolidaysOpenByDefault))
                .ToList());
        });

        // Stores an override only when it differs from the default, so a change of the default applies to all other holidays.
        group.MapPut("/holidays/{date}", async (DateOnly date, HolidayOverrideRequest request, ITenantContext tenantContext, AppDbContext db, IHolidayProvider holidayProvider) =>
        {
            var tenant = await db.Tenants.SingleAsync(t => t.Id == tenantContext.TenantId);
            if (tenant.CountryCode is null || holidayProvider.GetHolidays(tenant.CountryCode, tenant.RegionCode, date, date).Count == 0)
            {
                return Error("not_a_holiday");
            }

            var holidayOverride = await db.HolidayOverrides.SingleOrDefaultAsync(o => o.Date == date);
            if (request.IsOpen == OpeningCalendar.HolidaysOpenByDefault)
            {
                if (holidayOverride is not null)
                {
                    db.HolidayOverrides.Remove(holidayOverride);
                }
            }
            else if (holidayOverride is null)
            {
                db.HolidayOverrides.Add(new HolidayOverride { Date = date, IsOpen = request.IsOpen });
            }
            else
            {
                holidayOverride.IsOpen = request.IsOpen;
            }
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static IResult Error(string error) => Results.BadRequest(new ErrorResponse(error));

    /// <summary>Parses "HH:mm"; with <paramref name="allowEndOfDay"/> also "24:00" (<see cref="OpeningPeriod.EndOfDay"/>).</summary>
    internal static bool TryParseTime(string? value, bool allowEndOfDay, out TimeOnly time)
    {
        if (allowEndOfDay && value == "24:00")
        {
            time = OpeningPeriod.EndOfDay;
            return true;
        }
        time = default;
        return value is not null
            && TimePattern().IsMatch(value)
            && TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out time);
    }

    /// <summary>"HH:mm", and "24:00" for <see cref="OpeningPeriod.EndOfDay"/>.</summary>
    internal static string FormatTime(TimeOnly time) =>
        time == OpeningPeriod.EndOfDay ? "24:00" : time.ToString("HH:mm", CultureInfo.InvariantCulture);
}
