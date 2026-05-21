namespace Favigon.Application.Options;

public sealed class JwtOptions
{
  public const string SectionName = "JwtSettings";

  public string? Issuer { get; set; }

  public string? Audience { get; set; }

  public string? Key { get; set; }

  public int AccessTokenMinutes { get; set; } = 15;

  public int RefreshTokenDays { get; set; } = 30;
}
