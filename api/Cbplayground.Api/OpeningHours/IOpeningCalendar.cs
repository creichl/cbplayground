namespace Cbplayground.Api.OpeningHours;

/// <summary>A time window in which the restaurant is open. <see cref="End"/> is <see cref="Data.OpeningPeriod.EndOfDay"/> for 24:00.</summary>
public record OpenPeriod(TimeOnly Start, TimeOnly End);

/// <summary>Answers when the current tenant's restaurant is open.</summary>
public interface IOpeningCalendar
{
    /// <summary>
    /// The opening hours on <paramref name="date"/>, sorted by start: the hours of a special day if the date has one
    /// (none on a closing day), otherwise none if the date is a public holiday on which the restaurant is closed,
    /// otherwise the regular hours of the day of the week. Empty when the restaurant is closed.
    /// </summary>
    Task<IReadOnlyList<OpenPeriod>> GetOpenPeriodsAsync(DateOnly date, CancellationToken cancellationToken = default);
}
