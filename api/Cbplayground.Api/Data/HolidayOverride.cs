namespace Cbplayground.Api.Data;

/// <summary>
/// A public holiday on which the restaurant deviates from the default (see <see cref="OpeningHours.OpeningCalendar.HolidaysOpenByDefault"/>).
/// When open, the regular hours of the day of the week apply.
/// </summary>
public class HolidayOverride : ITenantOwned
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public DateOnly Date { get; set; }

    public bool IsOpen { get; set; }
}
