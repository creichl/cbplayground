using System.Text.Json.Serialization;

namespace Cbplayground.Api.Data;

/// <summary>A label the staff give a guest. The set is fixed, the same for every restaurant.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<GuestTag>))]
public enum GuestTag
{
    Vip,
    Regular,
    Press,
    Staff,
    Difficult,
}

/// <summary>
/// A guest of one restaurant, recognised by the phone number or the email address of their reservations
/// (<see cref="Reservations.GuestProfiles"/>). Within a restaurant no two guests have the same phone number or email address.
/// Deleting a guest anonymises their reservations (GDPR).
/// </summary>
public class Guest : ITenantOwned
{
    public const int MaxNameLength = Reservation.MaxNameLength;

    /// <summary>Room for a normalised number with the country code added to the longest number a reservation accepts.</summary>
    public const int MaxPhoneLength = 40;

    public const int MaxEmailLength = Reservation.MaxEmailLength;
    public const int MaxNotesLength = 1000;
    public const int MaxAllergyNotesLength = 500;

    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public required string Name { get; set; }

    /// <summary>
    /// Normalised (<see cref="Reservations.GuestProfiles.NormalizePhone"/>): "+" with the country code and the digits where the
    /// country code is known, e.g. "+436601234567", otherwise the digits only.
    /// </summary>
    public string? Phone { get; set; }

    /// <summary>In lower case.</summary>
    public string? Email { get; set; }

    public string? Notes { get; set; }

    public string? AllergyNotes { get; set; }

    public List<GuestTag> Tags { get; set; } = [];

    public DateTime CreatedAtUtc { get; set; }

    public DateTime UpdatedAtUtc { get; set; }
}
