using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Reservations;

/// <summary>The duration of a reservation of the current restaurant, from its reservation settings.</summary>
public interface IReservationDurationPolicy
{
    /// <summary>The duration of the rule whose range contains <paramref name="guests"/>, otherwise the default duration.</summary>
    Task<int> GetDurationAsync(int guests, CancellationToken cancellationToken = default);
}

public class ReservationDurationPolicy(AppDbContext db) : IReservationDurationPolicy
{
    public async Task<int> GetDurationAsync(int guests, CancellationToken cancellationToken = default)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(guests, 1);

        var ruleDuration = await db.DurationRules
            .Where(r => r.MinGuests <= guests && guests <= r.MaxGuests)
            .Select(r => (int?)r.DurationMinutes)
            .FirstOrDefaultAsync(cancellationToken);
        if (ruleDuration is { } minutes)
        {
            return minutes;
        }

        var settings = await db.ReservationSettings.SingleOrDefaultAsync(cancellationToken) ?? new ReservationSettings();
        return settings.DefaultDurationMinutes;
    }
}
