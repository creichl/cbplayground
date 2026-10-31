using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.OpeningHours;

public class OpeningCalendar(AppDbContext db, ITenantContext tenantContext, IHolidayProvider holidayProvider) : IOpeningCalendar
{
    /// <summary>Whether a restaurant is open on a public holiday unless the Tenant Admin overrides it for that day.</summary>
    public const bool HolidaysOpenByDefault = false;

    /// <summary>Precedence: a special day (closed or special hours) &gt; a public holiday (with its override) &gt; the regular hours.</summary>
    public async Task<IReadOnlyList<OpenPeriod>> GetOpenPeriodsAsync(DateOnly date, CancellationToken cancellationToken = default)
    {
        // The entries do not overlap, so at most one contains the date. A closed day has no periods.
        var specialDay = await db.SpecialDays
            .Include(d => d.Periods)
            .FirstOrDefaultAsync(d => d.From <= date && d.To >= date, cancellationToken);
        if (specialDay is not null)
        {
            return specialDay.Periods
                .OrderBy(p => p.Start)
                .Select(p => new OpenPeriod(p.Start, p.End))
                .ToList();
        }

        if (await IsClosedForHolidayAsync(date, cancellationToken))
        {
            return [];
        }

        var dayOfWeek = date.DayOfWeek;
        return await db.OpeningPeriods
            .Where(p => p.DayOfWeek == dayOfWeek)
            .OrderBy(p => p.Start)
            .Select(p => new OpenPeriod(p.Start, p.End))
            .ToListAsync(cancellationToken);
    }

    private async Task<bool> IsClosedForHolidayAsync(DateOnly date, CancellationToken cancellationToken)
    {
        var location = await db.Tenants
            .Where(t => t.Id == tenantContext.TenantId)
            .Select(t => new { t.CountryCode, t.RegionCode })
            .SingleOrDefaultAsync(cancellationToken);
        if (location?.CountryCode is null || holidayProvider.GetHolidays(location.CountryCode, location.RegionCode, date, date).Count == 0)
        {
            return false;
        }

        var holidayOverride = await db.HolidayOverrides.SingleOrDefaultAsync(o => o.Date == date, cancellationToken);
        return !(holidayOverride?.IsOpen ?? HolidaysOpenByDefault);
    }
}
