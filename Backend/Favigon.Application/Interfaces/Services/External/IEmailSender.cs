namespace Favigon.Application.Interfaces;

public interface IEmailSender
{
  Task SendPasswordResetEmailAsync(string toEmail, string resetUrl, int tokenLifetimeMinutes);
  Task SendPasswordSetConfirmationEmailAsync(string toEmail);
  Task SendTwoFactorCodeEmailAsync(string toEmail, string code, string purpose, int expirationMinutes);
}
