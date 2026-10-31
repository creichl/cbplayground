using System.Text.Json.Serialization;

namespace Cbplayground.Api.Data;

/// <summary>What a <see cref="SpecialDay"/> does on its days.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<SpecialDayKind>))]
public enum SpecialDayKind
{
    /// <summary>The restaurant is closed, e.g. company holidays or a private party.</summary>
    Closed,

    /// <summary>The restaurant is open only in the <see cref="SpecialDay.Periods"/> of the entry, e.g. New Year's Eve 18:00–24:00.</summary>
    SpecialHours,
}

/// <summary>
/// One day or a range of days on which the restaurant is closed or has special hours. It takes precedence over public
/// holidays and the regular hours (see <see cref="OpeningHours.OpeningCalendar"/>). The entries of a restaurant do not overlap.
/// </summary>
public class SpecialDay : ITenantOwned
{
    public const int MaxNoteLength = 100;

    /// <summary>The longest range of one entry, in days.</summary>
    public const int MaxDays = 366;

    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    /// <summary>First day of the entry.</summary>
    public DateOnly From { get; set; }

    /// <summary>Last day of the entry (inclusive); the same as <see cref="From"/> for a single day.</summary>
    public DateOnly To { get; set; }

    public SpecialDayKind Kind { get; set; }

    public string? Note { get; set; }

    /// <summary>The opening windows of every day of the entry; only for <see cref="SpecialDayKind.SpecialHours"/>.</summary>
    public List<SpecialDayPeriod> Periods { get; set; } = [];
}

/// <summary>A time window of a <see cref="SpecialDay"/> with special hours. <see cref="End"/> is <see cref="OpeningPeriod.EndOfDay"/> for 24:00.</summary>
public class SpecialDayPeriod : ITenantOwned
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public Guid SpecialDayId { get; set; }

    public TimeOnly Start { get; set; }

    public TimeOnly End { get; set; }
}
