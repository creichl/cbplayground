using System.Net.Mail;
using Cbplayground.Api.Data;

namespace Cbplayground.Api.Reservations;

/// <summary>The guest's details of a reservation, trimmed; empty values are null.</summary>
public record GuestDetails(string Name, string? Phone, string? Email, string? Notes)
{
    /// <summary>A phone number has at least this many digits.</summary>
    private const int MinPhoneDigits = 6;

    /// <summary>
    /// Trims and checks the guest's details. <paramref name="contactRequired"/>: a phone number or an email address is needed
    /// (online bookings). Errors: "invalid_name", "contact_required", "invalid_phone", "invalid_email", "invalid_notes".
    /// </summary>
    public static (GuestDetails? Details, string? Error) Parse(string? name, string? phone, string? email, string? notes, bool contactRequired)
    {
        var details = new GuestDetails(name?.Trim() ?? "", EmptyToNull(phone), EmptyToNull(email), EmptyToNull(notes));
        if (details.Name.Length == 0 || details.Name.Length > Reservation.MaxNameLength)
        {
            return (null, "invalid_name");
        }
        if (contactRequired && details.Phone is null && details.Email is null)
        {
            return (null, "contact_required");
        }
        if (details.Phone is not null && !IsValidPhone(details.Phone))
        {
            return (null, "invalid_phone");
        }
        if (details.Email is not null && !IsValidEmail(details.Email))
        {
            return (null, "invalid_email");
        }
        if (details.Notes?.Length > Reservation.MaxNotesLength)
        {
            return (null, "invalid_notes");
        }
        return (details, null);
    }

    private static string? EmptyToNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>Digits with an optional leading "+" and the usual separators (space, "-", "/", ".", parentheses).</summary>
    private static bool IsValidPhone(string phone) =>
        phone.Length <= Reservation.MaxPhoneLength
        && phone.Count(char.IsAsciiDigit) >= MinPhoneDigits
        && phone.Select((c, i) => char.IsAsciiDigit(c) || c is ' ' or '-' or '/' or '.' or '(' or ')' || (c == '+' && i == 0)).All(ok => ok);

    private static bool IsValidEmail(string email) =>
        email.Length <= Reservation.MaxEmailLength
        && MailAddress.TryCreate(email, out var address)
        && address.Address == email
        && address.Host.Contains('.');
}
