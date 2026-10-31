namespace Cbplayground.Api.OpeningHours;

/// <summary>A public holiday. <see cref="Key"/> names it, e.g. "corpusChristi"; the web frontend translates it.</summary>
public record Holiday(DateOnly Date, string Key);

/// <summary>Calculates the public holidays of a country and region. Works offline.</summary>
public interface IHolidayProvider
{
    /// <summary>
    /// The public holidays from <paramref name="from"/> to <paramref name="to"/> (both inclusive), sorted by date.
    /// <paramref name="regionCode"/> is the German federal state (e.g. "DE-BY") and null for Austria and Serbia.
    /// A multi-day holiday has one entry per day.
    /// </summary>
    IReadOnlyList<Holiday> GetHolidays(string countryCode, string? regionCode, DateOnly from, DateOnly to);
}
