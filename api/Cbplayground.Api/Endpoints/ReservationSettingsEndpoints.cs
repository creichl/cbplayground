using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// The reservation settings of the signed-in Tenant Admin's restaurant. Settings, duration rules and pacing rules are read and
/// saved together.
/// </summary>
public static class ReservationSettingsEndpoints
{
    public const int MinDurationMinutes = 15;
    public const int MaxDurationMinutes = 480;
    public const int DurationStepMinutes = 15;
    public const int MaxLeadTimeMinutes = 1440;
    public const int MinBookingHorizonDays = 1;
    public const int MaxBookingHorizonDays = 365;
    public const int MaxBufferMinutes = 60;
    public const int BufferStepMinutes = 5;

    public record DurationRuleDto(int MinGuests, int MaxGuests, int DurationMinutes);

    /// <summary>A pacing rule: at most <see cref="MaxCovers"/> guests per 15-minute start slot from <see cref="From"/> to
    /// <see cref="To"/> ("HH:mm", the end may be "24:00") on the <see cref="Days"/>.</summary>
    public record PacingRuleDto(IReadOnlyList<DayOfWeek>? Days, string? From, string? To, int MaxCovers);

    /// <summary>
    /// The settings. The booking rules (lead time, booking horizon, buffer, largest online party) get their defaults when
    /// a request leaves them out; <see cref="MaxOnlinePartySize"/> null means the largest table that can be booked online.
    /// Without <see cref="PacingRules"/> there is no pacing limit.
    /// </summary>
    public record ReservationSettingsDto(
        ConfirmationMode ConfirmationMode,
        TableSelectionMode TableSelectionMode,
        int DefaultDurationMinutes,
        IReadOnlyList<DurationRuleDto>? DurationRules,
        int MinLeadTimeMinutes = ReservationSettings.DefaultMinLeadTimeMinutes,
        int BookingHorizonDays = ReservationSettings.DefaultBookingHorizonDays,
        int BufferMinutes = ReservationSettings.DefaultBufferMinutes,
        int? MaxOnlinePartySize = null,
        IReadOnlyList<PacingRuleDto>? PacingRules = null);

    /// <summary>
    /// Why the settings were rejected: "invalid_mode" (unknown confirmation or table selection mode),
    /// "invalid_duration" (not 15–480 in steps of 15), "invalid_min_guests" (below 1), "min_greater_than_max", "overlapping_rules",
    /// "invalid_lead_time" (not 0–1440 minutes), "invalid_booking_horizon" (not 1–365 days), "invalid_buffer" (not 0–60 minutes
    /// in steps of 5), "invalid_max_party_size" (below 1), "invalid_pacing_rule" (no or an unknown or repeated day, a time that is
    /// not "HH:mm", from not before to, or not 1–500 guests) or "overlapping_pacing_rules" (two rules overlap on the same day).
    /// </summary>
    public record SettingsError(string Error);

    public static void MapReservationSettingsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/reservation-settings").RequireAuthorization(Policies.RequireTenantAdmin);

        group.MapGet("/", async (AppDbContext db) => await LoadAsync(db));

        group.MapPut("/", async (ReservationSettingsDto request, AppDbContext db) =>
        {
            if (Validate(request) is { } error)
            {
                return Results.BadRequest(new SettingsError(error));
            }

            var settings = await db.ReservationSettings.SingleOrDefaultAsync();
            if (settings is null)
            {
                settings = new ReservationSettings();
                db.ReservationSettings.Add(settings);
            }
            settings.ConfirmationMode = request.ConfirmationMode;
            settings.TableSelectionMode = request.TableSelectionMode;
            settings.DefaultDurationMinutes = request.DefaultDurationMinutes;
            settings.MinLeadTimeMinutes = request.MinLeadTimeMinutes;
            settings.BookingHorizonDays = request.BookingHorizonDays;
            settings.BufferMinutes = request.BufferMinutes;
            settings.MaxOnlinePartySize = request.MaxOnlinePartySize;

            // The rules are replaced as a whole, in the same transaction as the settings.
            db.DurationRules.RemoveRange(await db.DurationRules.ToListAsync());
            db.DurationRules.AddRange((request.DurationRules ?? []).Select(r => new DurationRule
            {
                MinGuests = r.MinGuests,
                MaxGuests = r.MaxGuests,
                DurationMinutes = r.DurationMinutes,
            }));
            db.PacingRules.RemoveRange(await db.PacingRules.ToListAsync());
            db.PacingRules.AddRange((request.PacingRules ?? []).Select(ToPacingRule));
            await db.SaveChangesAsync();

            return Results.Ok(await LoadAsync(db));
        });
    }

    /// <summary>The stored settings, or the defaults when the restaurant has not saved any yet.</summary>
    private static async Task<ReservationSettingsDto> LoadAsync(AppDbContext db)
    {
        var settings = await db.ReservationSettings.AsNoTracking().SingleOrDefaultAsync() ?? new ReservationSettings();
        var rules = await db.DurationRules
            .OrderBy(r => r.MinGuests)
            .Select(r => new DurationRuleDto(r.MinGuests, r.MaxGuests, r.DurationMinutes))
            .ToListAsync();
        var pacingRules = (await db.PacingRules.ToListAsync())
            .OrderBy(r => r.Days.Min()).ThenBy(r => r.From)
            .Select(r => new PacingRuleDto(r.Days.Order().ToList(), OpeningHoursEndpoints.FormatTime(r.From),
                OpeningHoursEndpoints.FormatTime(r.To), r.MaxCovers))
            .ToList();
        return new ReservationSettingsDto(settings.ConfirmationMode, settings.TableSelectionMode, settings.DefaultDurationMinutes, rules,
            settings.MinLeadTimeMinutes, settings.BookingHorizonDays, settings.BufferMinutes, settings.MaxOnlinePartySize, pacingRules);
    }

    /// <summary>A validated rule as stored.</summary>
    private static PacingRule ToPacingRule(PacingRuleDto rule)
    {
        OpeningHoursEndpoints.TryParseTime(rule.From, allowEndOfDay: false, out var from);
        OpeningHoursEndpoints.TryParseTime(rule.To, allowEndOfDay: true, out var to);
        return new PacingRule { Days = rule.Days!.Order().ToList(), From = from, To = to, MaxCovers = rule.MaxCovers };
    }

    /// <summary>The error code of the first problem, or null if the settings are valid. Gaps between the rules are allowed.</summary>
    public static string? Validate(ReservationSettingsDto settings)
    {
        if (!Enum.IsDefined(settings.ConfirmationMode) || !Enum.IsDefined(settings.TableSelectionMode))
        {
            return "invalid_mode";
        }
        if (!IsValidDuration(settings.DefaultDurationMinutes))
        {
            return "invalid_duration";
        }

        var rules = settings.DurationRules ?? [];
        foreach (var rule in rules)
        {
            if (rule.MinGuests < 1)
            {
                return "invalid_min_guests";
            }
            if (rule.MinGuests > rule.MaxGuests)
            {
                return "min_greater_than_max";
            }
            if (!IsValidDuration(rule.DurationMinutes))
            {
                return "invalid_duration";
            }
        }

        var sorted = rules.OrderBy(r => r.MinGuests).ToList();
        for (var i = 1; i < sorted.Count; i++)
        {
            if (sorted[i].MinGuests <= sorted[i - 1].MaxGuests)
            {
                return "overlapping_rules";
            }
        }

        if (settings.MinLeadTimeMinutes is < 0 or > MaxLeadTimeMinutes)
        {
            return "invalid_lead_time";
        }
        if (settings.BookingHorizonDays is < MinBookingHorizonDays or > MaxBookingHorizonDays)
        {
            return "invalid_booking_horizon";
        }
        if (settings.BufferMinutes is < 0 or > MaxBufferMinutes || settings.BufferMinutes % BufferStepMinutes != 0)
        {
            return "invalid_buffer";
        }
        if (settings.MaxOnlinePartySize is < 1)
        {
            return "invalid_max_party_size";
        }
        return ValidatePacingRules(settings.PacingRules ?? []);
    }

    private static string? ValidatePacingRules(IReadOnlyList<PacingRuleDto> rules)
    {
        var ranges = new List<(DayOfWeek Day, TimeOnly From, TimeOnly To)>();
        foreach (var rule in rules)
        {
            if (rule.Days is not { Count: > 0 } days || !days.All(Enum.IsDefined) || days.Distinct().Count() != days.Count
                || !OpeningHoursEndpoints.TryParseTime(rule.From, allowEndOfDay: false, out var from)
                || !OpeningHoursEndpoints.TryParseTime(rule.To, allowEndOfDay: true, out var to)
                || from >= to
                || rule.MaxCovers is < PacingRule.MinCovers or > PacingRule.MaxCoversLimit)
            {
                return "invalid_pacing_rule";
            }
            ranges.AddRange(days.Select(day => (day, from, to)));
        }

        foreach (var day in ranges.GroupBy(r => r.Day))
        {
            var sorted = day.OrderBy(r => r.From).ToList();
            for (var i = 1; i < sorted.Count; i++)
            {
                if (sorted[i].From < sorted[i - 1].To)
                {
                    return "overlapping_pacing_rules";
                }
            }
        }
        return null;
    }

    /// <summary>15 to 480 minutes in steps of 15; also for the duration staff set on a single reservation.</summary>
    public static bool IsValidDuration(int minutes) =>
        minutes is >= MinDurationMinutes and <= MaxDurationMinutes && minutes % DurationStepMinutes == 0;
}
