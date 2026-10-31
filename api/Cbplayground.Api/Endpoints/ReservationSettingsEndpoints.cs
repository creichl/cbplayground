using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>The reservation settings of the signed-in Tenant Admin's restaurant. Settings and duration rules are read and saved together.</summary>
public static class ReservationSettingsEndpoints
{
    public const int MinDurationMinutes = 15;
    public const int MaxDurationMinutes = 480;
    public const int DurationStepMinutes = 15;

    public record DurationRuleDto(int MinGuests, int MaxGuests, int DurationMinutes);

    public record ReservationSettingsDto(
        ConfirmationMode ConfirmationMode,
        TableSelectionMode TableSelectionMode,
        int DefaultDurationMinutes,
        IReadOnlyList<DurationRuleDto>? DurationRules);

    /// <summary>
    /// Why the settings were rejected: "invalid_mode" (unknown confirmation or table selection mode),
    /// "invalid_duration" (not 15–480 in steps of 15), "invalid_min_guests" (below 1), "min_greater_than_max" or "overlapping_rules".
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

            // The rules are replaced as a whole, in the same transaction as the settings.
            db.DurationRules.RemoveRange(await db.DurationRules.ToListAsync());
            db.DurationRules.AddRange((request.DurationRules ?? []).Select(r => new DurationRule
            {
                MinGuests = r.MinGuests,
                MaxGuests = r.MaxGuests,
                DurationMinutes = r.DurationMinutes,
            }));
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
        return new ReservationSettingsDto(settings.ConfirmationMode, settings.TableSelectionMode, settings.DefaultDurationMinutes, rules);
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
        return null;
    }

    /// <summary>15 to 480 minutes in steps of 15; also for the duration staff set on a single reservation.</summary>
    public static bool IsValidDuration(int minutes) =>
        minutes is >= MinDurationMinutes and <= MaxDurationMinutes && minutes % DurationStepMinutes == 0;
}
