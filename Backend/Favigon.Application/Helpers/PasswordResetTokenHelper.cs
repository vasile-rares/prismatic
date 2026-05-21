using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Favigon.Application.Helpers;

public static class PasswordResetTokenHelper
{
  public static string BuildResetUrl(string? baseUrl, string rawToken)
  {
    if (string.IsNullOrWhiteSpace(baseUrl))
    {
      throw new InvalidOperationException("Client base URL is not configured on the server.");
    }

    return $"{baseUrl.TrimEnd('/')}/reset-password?token={Uri.EscapeDataString(rawToken)}";
  }

  public static string GenerateRawToken()
  {
    return Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
  }

  public static string HashToken(string rawToken)
  {
    var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));
    return Convert.ToHexString(hashBytes);
  }
}
