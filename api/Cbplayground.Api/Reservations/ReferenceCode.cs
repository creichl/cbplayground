using System.Security.Cryptography;
using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Reservations;

/// <summary>The reference code of a reservation: 6 characters without the easily confused 0/O, 1/I/L.</summary>
public static class ReferenceCode
{
    private const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    /// <summary>A code no reservation of any restaurant has yet.</summary>
    public static async Task<string> GenerateUniqueAsync(AppDbContext db, CancellationToken cancellationToken = default)
    {
        while (true)
        {
            var code = RandomNumberGenerator.GetString(Alphabet, Reservation.ReferenceCodeLength);
            if (!await db.Reservations.IgnoreQueryFilters().AnyAsync(r => r.ReferenceCode == code, cancellationToken))
            {
                return code;
            }
        }
    }
}
