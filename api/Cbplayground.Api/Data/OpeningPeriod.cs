namespace Cbplayground.Api.Data;

/// <summary>A time window in which the restaurant is open on a day of the week. A day can have several of them.</summary>
public class OpeningPeriod : ITenantOwned
{
    /// <summary>The end of the day (24:00). <see cref="TimeOnly"/> cannot hold 24:00, so its largest value stands for it.</summary>
    public static readonly TimeOnly EndOfDay = TimeOnly.MaxValue;

    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public DayOfWeek DayOfWeek { get; set; }

    /// <summary>TimeOnly instead of TimeSpan, so SQLite can sort and compare it.</summary>
    public TimeOnly Start { get; set; }

    /// <summary>Always after <see cref="Start"/> on the same day; <see cref="EndOfDay"/> means 24:00.</summary>
    public TimeOnly End { get; set; }
}
