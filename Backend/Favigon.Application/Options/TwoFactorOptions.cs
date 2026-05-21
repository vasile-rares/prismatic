namespace Favigon.Application.Options;

public sealed class TwoFactorOptions
{
  public const string SectionName = "TwoFactor";

  public int CodeMinutes { get; set; } = 10;
}
