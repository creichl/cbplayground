using Cbplayground.Api.Data;
using Cbplayground.Api.OpeningHours;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Reservations;

/// <summary>
/// Links reservations to the guest profiles of their restaurant (<see cref="Guest"/>): by the phone number, otherwise by the email
/// address, otherwise a new profile. The migration AddGuestProfiles does the same in SQL for the reservations that existed before.
/// </summary>
public static class GuestProfiles
{
    /// <summary>The country calling codes of the restaurants' countries, for phone numbers entered without one.</summary>
    private static readonly IReadOnlyDictionary<string, string> CallingCodes = new Dictionary<string, string>
    {
        [Locations.Germany] = "49",
        [Locations.Austria] = "43",
        [Locations.Serbia] = "381",
    };

    /// <summary>
    /// A phone number as the profiles store and compare it: "+" with the digits when it starts with "+" or "00"; a national number
    /// ("0" first) with the country code of the restaurant's country in place of the "0", if the restaurant has a location; otherwise
    /// the digits only. So "+43 660 1234567", "0043 660/1234567" and, in Austria, "0660 1234567" are all "+436601234567".
    /// Null for an empty number.
    /// </summary>
    public static string? NormalizePhone(string? phone, string? countryCode)
    {
        var trimmed = phone?.Trim() ?? "";
        var digits = new string(trimmed.Where(char.IsAsciiDigit).ToArray());
        if (digits.Length == 0)
        {
            return null;
        }
        if (trimmed.StartsWith('+'))
        {
            return $"+{digits}";
        }
        if (digits.StartsWith("00", StringComparison.Ordinal))
        {
            return $"+{digits[2..]}";
        }
        if (digits.StartsWith('0') && countryCode is not null && CallingCodes.TryGetValue(countryCode, out var callingCode))
        {
            return $"+{callingCode}{digits[1..]}";
        }
        return digits;
    }

    /// <summary>An email address as the profiles store and compare it: trimmed and in lower case; null when empty.</summary>
    public static string? NormalizeEmail(string? email) =>
        string.IsNullOrWhiteSpace(email) ? null : email.Trim().ToLowerInvariant();

    /// <summary>
    /// Links the reservation to the guest of the current restaurant with its phone number, otherwise with its email address, and
    /// creates the guest when there is none. Fields of the profile that are empty are filled in from the reservation (a phone
    /// number or email address only if no other guest has it); values the profile has are kept. A reservation without phone
    /// number and email address gets no guest. The new guest is added to the context, not saved; profiles added and not saved
    /// yet are found too, so the seed can link many reservations in one save.
    /// </summary>
    public static async Task LinkAsync(AppDbContext db, Reservation reservation, string? countryCode, DateTime nowUtc,
        CancellationToken cancellationToken = default)
    {
        var phone = NormalizePhone(reservation.GuestPhone, countryCode);
        var email = NormalizeEmail(reservation.GuestEmail);
        if (phone is null && email is null)
        {
            reservation.GuestId = null;
            return;
        }

        var guest = (phone is null ? null : await FindAsync(db, g => g.Phone == phone, cancellationToken))
            ?? (email is null ? null : await FindAsync(db, g => g.Email == email, cancellationToken));
        if (guest is null)
        {
            guest = new Guest { Id = Guid.NewGuid(), Name = reservation.GuestName, CreatedAtUtc = nowUtc, UpdatedAtUtc = nowUtc };
            db.Guests.Add(guest);
        }

        var changed = false;
        // A walk-in without a name is stored as "Walk-in": a real name replaces it.
        if (guest.Name == Reservation.WalkInName && reservation.GuestName != Reservation.WalkInName)
        {
            guest.Name = reservation.GuestName;
            changed = true;
        }
        if (guest.Phone is null && phone is not null && await FindAsync(db, g => g.Phone == phone, cancellationToken) is null)
        {
            guest.Phone = phone;
            changed = true;
        }
        if (guest.Email is null && email is not null && await FindAsync(db, g => g.Email == email, cancellationToken) is null)
        {
            guest.Email = email;
            changed = true;
        }
        if (changed)
        {
            guest.UpdatedAtUtc = nowUtc;
        }
        reservation.GuestId = guest.Id;
    }

    /// <summary>The guest of the current restaurant that matches, among the ones added and not saved yet, then in the database.</summary>
    private static async Task<Guest?> FindAsync(AppDbContext db, System.Linq.Expressions.Expression<Func<Guest, bool>> predicate,
        CancellationToken cancellationToken) =>
        db.Guests.Local.Where(g => db.Entry(g).State != EntityState.Deleted).FirstOrDefault(predicate.Compile())
        ?? await db.Guests.FirstOrDefaultAsync(predicate, cancellationToken);
}
