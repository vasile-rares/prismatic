namespace Favigon.Application.Options;

public sealed class PasswordResetOptions
{
  public const string SectionName = "PasswordReset";

  public int TokenMinutes { get; set; } = 30;
}
