using Favigon.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace Favigon.Infrastructure.Logging;

public class AuditLogger : IAuditLogger
{
  private readonly ILogger<AuditLogger> _logger;

  public AuditLogger(ILogger<AuditLogger> logger)
  {
    _logger = logger;
  }

  public void Registered(string email) =>
    _logger.LogInformation("[AUDIT] REGISTERED email={Email}", email);

  public void LoginSucceeded(string email) =>
    _logger.LogInformation("[AUDIT] LOGIN_SUCCESS email={Email}", email);

  public void LoginFailed(string email) =>
    _logger.LogWarning("[AUDIT] LOGIN_FAILED email={Email}", email);

  public void LoginRequiresTwoFactor(string email) =>
    _logger.LogInformation("[AUDIT] LOGIN_2FA_REQUIRED email={Email}", email);

  public void TwoFactorVerified(int userId) =>
    _logger.LogInformation("[AUDIT] 2FA_VERIFIED userId={UserId}", userId);

  public void PasswordChanged(int userId) =>
    _logger.LogInformation("[AUDIT] PASSWORD_CHANGED userId={UserId}", userId);

  public void PasswordReset(string email) =>
    _logger.LogInformation("[AUDIT] PASSWORD_RESET email={Email}", email);

  public void TwoFactorEnabled(int userId) =>
    _logger.LogInformation("[AUDIT] 2FA_ENABLED userId={UserId}", userId);

  public void TwoFactorDisabled(int userId) =>
    _logger.LogWarning("[AUDIT] 2FA_DISABLED userId={UserId}", userId);

  public void AccountDeleted(int userId) =>
    _logger.LogWarning("[AUDIT] ACCOUNT_DELETED userId={UserId}", userId);

  public void RefreshTokenRotated(int userId) =>
    _logger.LogInformation("[AUDIT] TOKEN_REFRESHED userId={UserId}", userId);

  public void OAuthProviderLinked(int userId, string provider) =>
    _logger.LogInformation("[AUDIT] OAUTH_LINKED userId={UserId} provider={Provider}", userId, provider);

  public void OAuthProviderUnlinked(int userId, string provider) =>
    _logger.LogWarning("[AUDIT] OAUTH_UNLINKED userId={UserId} provider={Provider}", userId, provider);
}
