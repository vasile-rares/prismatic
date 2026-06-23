namespace Favigon.Application.Interfaces;

public interface IAuditLogger
{
  void Registered(string email);
  void LoginSucceeded(string email);
  void LoginFailed(string email);
  void LoginRequiresTwoFactor(string email);
  void TwoFactorVerified(int userId);
  void PasswordChanged(int userId);
  void PasswordReset(string email);
  void TwoFactorEnabled(int userId);
  void TwoFactorDisabled(int userId);
  void AccountDeleted(int userId);
  void RefreshTokenRotated(int userId);
  void OAuthProviderLinked(int userId, string provider);
  void OAuthProviderUnlinked(int userId, string provider);
}
