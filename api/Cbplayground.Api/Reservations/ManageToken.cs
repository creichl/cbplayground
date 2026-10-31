using System.Buffers.Text;
using System.Security.Cryptography;

namespace Cbplayground.Api.Reservations;

/// <summary>
/// The token in the guest's link to manage an online reservation: 32 random bytes, URL-safe Base64. Only its SHA-256 is stored
/// (<see cref="Data.Reservation.ManageTokenHash"/>).
/// </summary>
public static class ManageToken
{
    private const int TokenBytes = 32;

    /// <summary>A new token for the link and the hash to store.</summary>
    public static (string Token, byte[] Hash) Create()
    {
        var bytes = RandomNumberGenerator.GetBytes(TokenBytes);
        return (Base64Url.EncodeToString(bytes), SHA256.HashData(bytes));
    }

    /// <summary>The hash of a token from a link; a token that is not URL-safe Base64 of 32 bytes gets a hash no reservation has.</summary>
    public static byte[] Hash(string? token)
    {
        var bytes = new byte[TokenBytes];
        if (token is null || !Base64Url.IsValid(token, out var length) || length != TokenBytes
            || Base64Url.DecodeFromChars(token, bytes) != TokenBytes)
        {
            // Hash an empty input instead, so the comparison takes the same time.
            return SHA256.HashData(ReadOnlySpan<byte>.Empty);
        }
        return SHA256.HashData(bytes);
    }

    /// <summary>Compares in constant time; a reservation without a stored hash never matches.</summary>
    public static bool Matches(byte[]? storedHash, byte[] hash) =>
        storedHash is not null && CryptographicOperations.FixedTimeEquals(storedHash, hash);
}
