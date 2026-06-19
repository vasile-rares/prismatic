using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.Helpers;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Exceptions;
using Favigon.Application.Interfaces;
using Favigon.Application.Options;
using Favigon.Domain.Entities;
using AutoMapper;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Extensions.Options;

namespace Favigon.Application.Services;

public class AuthService : IAuthService
{
  private const string TwoFactorPendingTokenType = "two_factor_pending";
  private const string TwoFactorLoginPurpose = "login";
  private const string TwoFactorEnablePurpose = "enable";
  private const string TwoFactorDisablePurpose = "disable";

  private readonly IUserRepository _userRepository;
  private readonly IGithubOAuthClient _githubOAuthClient;
  private readonly IGoogleOAuthClient _googleOAuthClient;
  private readonly IEmailSender _emailSender;
  private readonly IMapper _mapper;
  private readonly JwtOptions _jwtOptions;
  private readonly PasswordResetOptions _passwordResetOptions;
  private readonly ClientOptions _clientOptions;
  private readonly TwoFactorOptions _twoFactorOptions;
  private readonly IAuditLogger _audit;

  public AuthService(
      IUserRepository userRepository,
      IGithubOAuthClient githubOAuthClient,
      IGoogleOAuthClient googleOAuthClient,
      IEmailSender emailSender,
      IMapper mapper,
      IOptions<JwtOptions> jwtOptions,
      IOptions<PasswordResetOptions> passwordResetOptions,
      IOptions<ClientOptions> clientOptions,
      IOptions<TwoFactorOptions> twoFactorOptions,
      IAuditLogger audit)
  {
    _userRepository = userRepository;
    _githubOAuthClient = githubOAuthClient;
    _googleOAuthClient = googleOAuthClient;
    _emailSender = emailSender;
    _mapper = mapper;
    _jwtOptions = jwtOptions.Value;
    _passwordResetOptions = passwordResetOptions.Value;
    _clientOptions = clientOptions.Value;
    _twoFactorOptions = twoFactorOptions.Value;
    _audit = audit;
  }

  public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
  {
    request.Username = request.Username.Trim().ToLowerInvariant();
    request.DisplayName = request.DisplayName.Trim();
    request.Email = request.Email.Trim();

    var existingByUsername = await _userRepository.GetByUsernameAsync(request.Username);
    if (existingByUsername != null)
    {
      throw new ConflictException("Username already exists.");
    }

    var existingByEmail = await _userRepository.GetByEmailAsync(request.Email);
    if (existingByEmail != null)
    {
      throw new ConflictException("Email already exists.");
    }

    var user = new User
    {
      Username = request.Username,
      DisplayName = request.DisplayName,
      Email = request.Email,
      HasPassword = true,
      PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
      ProfilePictureUrl = request.ProfilePictureUrl,
      Role = "User"
    };

    await _userRepository.AddAsync(user);

    _audit.Registered(user.Email);
    return CreateAuthenticatedResponse(user);
  }

  public async Task<AuthResponse?> LoginAsync(LoginRequest request)
  {
    var email = request.Email.Trim();
    var user = await _userRepository.GetByEmailAsync(email);

    if (user is null)
    {
      _audit.LoginFailed(email);
      return null;
    }

    if (!user.HasPassword || string.IsNullOrWhiteSpace(user.PasswordHash))
    {
      _audit.LoginFailed(email);
      return null;
    }

    if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
    {
      _audit.LoginFailed(email);
      return null;
    }

    return await CreateLoginResponseAsync(user);
  }

  public async Task<AuthResponse> LoginWithGithubAsync(GithubAuthRequest request)
  {
    var code = request.Code?.Trim();
    if (string.IsNullOrWhiteSpace(code))
    {
      throw new ArgumentException("GitHub authorization code is required.");
    }

    var githubProfile = await _githubOAuthClient.GetUserProfileAsync(code);
    var normalizedEmail = githubProfile.Email.Trim().ToLowerInvariant();

    var user = await FindOrCreateOAuthUserAsync(
      "github",
      githubProfile.ProviderUserId,
      normalizedEmail,
      AuthUsernameHelper.BuildUsernameCandidate(githubProfile.Username, normalizedEmail, "github_user"),
      githubProfile.DisplayName,
      githubProfile.ProfilePictureUrl);

    return await CreateLoginResponseAsync(user);
  }

  public async Task<AuthResponse> LoginWithGoogleAsync(GoogleAuthRequest request)
  {
    var code = request.Code?.Trim();
    if (string.IsNullOrWhiteSpace(code))
    {
      throw new ArgumentException("Google authorization code is required.");
    }

    var googleProfile = await _googleOAuthClient.GetUserProfileAsync(code);
    var normalizedEmail = googleProfile.Email.Trim().ToLowerInvariant();
    var user = await FindOrCreateOAuthUserAsync(
      "google",
      googleProfile.ProviderUserId,
      normalizedEmail,
      AuthUsernameHelper.BuildUsernameCandidate(googleProfile.DisplayName, normalizedEmail, "google_user"),
      googleProfile.DisplayName,
      googleProfile.ProfilePictureUrl);

    return await CreateLoginResponseAsync(user);
  }

  public async Task<AuthResponse> VerifyTwoFactorLoginAsync(TwoFactorLoginVerifyRequest request)
  {
    var (userId, purpose) = ValidateTwoFactorPendingToken(request.Token);
    if (!string.Equals(purpose, TwoFactorLoginPurpose, StringComparison.Ordinal))
    {
      throw new BusinessRuleException("Verification session is invalid or has expired. Please sign in again.");
    }

    var user = await _userRepository.GetByIdAsync(userId)
      ?? throw new BusinessRuleException("Verification session is invalid or has expired. Please sign in again.");

    if (!user.IsTwoFactorEnabled)
    {
      throw new BusinessRuleException("Two-factor authentication is not enabled for this account.");
    }

    ValidateTwoFactorCodeOrThrow(user, request.Code, TwoFactorLoginPurpose);
    ClearTwoFactorChallenge(user);

    await _userRepository.UpdateAsync(user);
    _audit.TwoFactorVerified(user.Id);
    return CreateAuthenticatedResponse(user);
  }

  public async Task SendPasswordResetAsync(ForgotPasswordRequest request)
  {
    var normalizedEmail = request.Email.Trim().ToLowerInvariant();
    var user = await _userRepository.GetByEmailAsync(normalizedEmail);
    if (user is null || !user.HasPassword)
    {
      return;
    }

    var tokenLifetimeMinutes = _passwordResetOptions.TokenMinutes > 0 ? _passwordResetOptions.TokenMinutes : 30;
    var rawToken = PasswordResetTokenHelper.GenerateRawToken();
    var tokenHash = PasswordResetTokenHelper.HashToken(rawToken);
    var expiresAt = DateTime.UtcNow.AddMinutes(tokenLifetimeMinutes);

    user.PasswordResetTokenHash = tokenHash;
    user.PasswordResetExpiresAt = expiresAt;
    await _userRepository.UpdateAsync(user);

    var resetUrl = PasswordResetTokenHelper.BuildResetUrl(_clientOptions.BaseUrl, rawToken);

    await _emailSender.SendPasswordResetEmailAsync(user.Email, resetUrl, tokenLifetimeMinutes);
  }

  public async Task ResetPasswordAsync(ResetPasswordRequest request)
  {
    var token = request.Token?.Trim() ?? string.Empty;
    if (string.IsNullOrWhiteSpace(token))
    {
      throw new BusinessRuleException("Password reset link is invalid or has expired.");
    }

    var tokenHash = PasswordResetTokenHelper.HashToken(token);
    var user = await _userRepository.GetByPasswordResetTokenHashAsync(tokenHash);
    if (user is null || user.PasswordResetExpiresAt <= DateTime.UtcNow)
    {
      throw new BusinessRuleException("Password reset link is invalid or has expired.");
    }

    user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
    user.HasPassword = true;
    user.PasswordResetTokenHash = null;
    user.PasswordResetExpiresAt = null;
    ClearTwoFactorChallenge(user);
    await _userRepository.UpdateAsync(user);
    _audit.PasswordReset(user.Email);
  }

  public async Task SetPasswordAsync(int userId, SetPasswordRequest request)
  {
    var user = await _userRepository.GetByIdAsync(userId)
      ?? throw new NotFoundException("User not found.");

    if (user.HasPassword)
    {
      throw new BusinessRuleException("Password is already set for this account.");
    }

    user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
    user.HasPassword = true;
    user.PasswordResetTokenHash = null;
    user.PasswordResetExpiresAt = null;
    ClearTwoFactorChallenge(user);

    await _userRepository.UpdateAsync(user);
    await _emailSender.SendPasswordSetConfirmationEmailAsync(user.Email);
  }

  public async Task ChangePasswordAsync(int userId, ChangePasswordRequest request)
  {
    var user = await _userRepository.GetByIdAsync(userId)
      ?? throw new NotFoundException("User not found.");

    if (!user.HasPassword || string.IsNullOrWhiteSpace(user.PasswordHash))
    {
      throw new BusinessRuleException("You need to set a password before you can change it.");
    }

    if (!BCrypt.Net.BCrypt.Verify(request.CurrentPassword, user.PasswordHash))
    {
      throw new BusinessRuleException("Current password is incorrect.");
    }

    if (BCrypt.Net.BCrypt.Verify(request.NewPassword, user.PasswordHash))
    {
      throw new BusinessRuleException("New password must be different from your current password.");
    }

    user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
    user.PasswordResetTokenHash = null;
    user.PasswordResetExpiresAt = null;
    ClearTwoFactorChallenge(user);

    await _userRepository.UpdateAsync(user);
    _audit.PasswordChanged(userId);
  }

  public async Task SendEnableTwoFactorCodeAsync(int userId)
  {
    var user = await _userRepository.GetByIdAsync(userId)
      ?? throw new NotFoundException("User not found.");

    if (user.IsTwoFactorEnabled)
    {
      throw new BusinessRuleException("Two-factor authentication is already enabled.");
    }

    await IssueTwoFactorCodeAsync(user, TwoFactorEnablePurpose);
  }

  public async Task EnableTwoFactorAsync(int userId, TwoFactorCodeRequest request)
  {
    var user = await _userRepository.GetByIdAsync(userId)
      ?? throw new NotFoundException("User not found.");

    if (user.IsTwoFactorEnabled)
    {
      throw new BusinessRuleException("Two-factor authentication is already enabled.");
    }

    ValidateTwoFactorCodeOrThrow(user, request.Code, TwoFactorEnablePurpose);
    user.IsTwoFactorEnabled = true;
    ClearTwoFactorChallenge(user);

    await _userRepository.UpdateAsync(user);
    _audit.TwoFactorEnabled(userId);
  }

  public async Task SendDisableTwoFactorCodeAsync(int userId)
  {
    var user = await _userRepository.GetByIdAsync(userId)
      ?? throw new NotFoundException("User not found.");

    if (!user.IsTwoFactorEnabled)
    {
      throw new BusinessRuleException("Two-factor authentication is not enabled.");
    }

    await IssueTwoFactorCodeAsync(user, TwoFactorDisablePurpose);
  }

  public async Task DisableTwoFactorAsync(int userId, TwoFactorCodeRequest request)
  {
    var user = await _userRepository.GetByIdAsync(userId)
      ?? throw new NotFoundException("User not found.");

    if (!user.IsTwoFactorEnabled)
    {
      throw new BusinessRuleException("Two-factor authentication is not enabled.");
    }

    ValidateTwoFactorCodeOrThrow(user, request.Code, TwoFactorDisablePurpose);
    user.IsTwoFactorEnabled = false;
    ClearTwoFactorChallenge(user);

    await _userRepository.UpdateAsync(user);
    _audit.TwoFactorDisabled(userId);
  }

  public async Task LinkWithGithubAsync(int userId, GithubAuthRequest request)
  {
    var code = request.Code?.Trim();
    if (string.IsNullOrWhiteSpace(code))
      throw new ArgumentException("GitHub authorization code is required.");

    var githubProfile = await _githubOAuthClient.GetUserProfileAsync(code);
    var normalizedEmail = githubProfile.Email.Trim().ToLowerInvariant();
    await LinkProviderAsync(userId, "github", githubProfile.ProviderUserId, normalizedEmail, githubProfile.ProfilePictureUrl);
  }

  public async Task LinkWithGoogleAsync(int userId, GoogleAuthRequest request)
  {
    var code = request.Code?.Trim();
    if (string.IsNullOrWhiteSpace(code))
      throw new ArgumentException("Google authorization code is required.");

    var googleProfile = await _googleOAuthClient.GetUserProfileAsync(code);
    var normalizedEmail = googleProfile.Email.Trim().ToLowerInvariant();
    await LinkProviderAsync(userId, "google", googleProfile.ProviderUserId, normalizedEmail, googleProfile.ProfilePictureUrl);
  }

  private async Task LinkProviderAsync(int userId, string provider, string providerUserId, string normalizedEmail, string? profilePictureUrl = null)
  {
    var existingLink = await _userRepository.GetLinkedAccountByProviderAsync(provider, providerUserId);
    if (existingLink != null && existingLink.UserId != userId)
      throw new ConflictException($"This {provider} account is already linked to a different Favigon account.");

    if (existingLink != null)
    {
      if (!string.Equals(existingLink.ProviderEmail, normalizedEmail, StringComparison.OrdinalIgnoreCase))
      {
        existingLink.ProviderEmail = normalizedEmail;
        await _userRepository.UpdateLinkedAccountAsync(existingLink);
      }
      return;
    }

    var existingUserLink = await _userRepository.GetLinkedAccountByUserIdAndProviderAsync(userId, provider);
    if (existingUserLink != null)
      throw new ConflictException($"You already have a {provider} account connected.");

    await _userRepository.AddLinkedAccountAsync(new LinkedAccount
    {
      UserId = userId,
      Provider = provider,
      ProviderUserId = providerUserId,
      ProviderEmail = normalizedEmail,
    });

    if (!string.IsNullOrWhiteSpace(profilePictureUrl))
    {
      var user = await _userRepository.GetByIdAsync(userId);
      if (user is not null && string.IsNullOrWhiteSpace(user.ProfilePictureUrl))
      {
        user.ProfilePictureUrl = profilePictureUrl;
        await _userRepository.UpdateAsync(user);
      }
    }

    _audit.OAuthProviderLinked(userId, provider);
  }

  private async Task<string> GenerateUniqueUsernameAsync(string candidate)
  {
    var baseUsername = candidate;
    var suffix = 0;

    while (await _userRepository.GetByUsernameAsync(candidate) is not null)
    {
      suffix++;
      candidate = $"{baseUsername}{suffix}";
    }

    return candidate;
  }

  private async Task<User> FindOrCreateOAuthUserAsync(
    string provider,
    string providerUserId,
    string normalizedEmail,
    string usernameCandidate,
    string? displayNameCandidate,
    string? profilePictureUrl)
  {
    var existingProvider = await _userRepository.GetLinkedAccountByProviderAsync(provider, providerUserId);
    if (existingProvider?.User is not null)
    {
      var linkedUser = existingProvider.User;

      if (!string.Equals(existingProvider.ProviderEmail, normalizedEmail, StringComparison.OrdinalIgnoreCase))
      {
        existingProvider.ProviderEmail = normalizedEmail;
        await _userRepository.UpdateLinkedAccountAsync(existingProvider);
      }

      if (string.IsNullOrWhiteSpace(linkedUser.ProfilePictureUrl) && !string.IsNullOrWhiteSpace(profilePictureUrl))
      {
        linkedUser.ProfilePictureUrl = profilePictureUrl;
        await _userRepository.UpdateAsync(linkedUser);
      }

      return linkedUser;
    }

    var user = await _userRepository.GetByEmailAsync(normalizedEmail);
    if (user is null)
    {
      var username = await GenerateUniqueUsernameAsync(usernameCandidate);
      var displayName = string.IsNullOrWhiteSpace(displayNameCandidate)
        ? username
        : displayNameCandidate.Trim();

      user = new User
      {
        Username = username,
        DisplayName = displayName,
        Email = normalizedEmail,
        HasPassword = false,
        PasswordHash = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString("N")),
        ProfilePictureUrl = profilePictureUrl,
        Role = "User"
      };

      await _userRepository.AddAsync(user);
    }
    else if (string.IsNullOrWhiteSpace(user.ProfilePictureUrl) && !string.IsNullOrWhiteSpace(profilePictureUrl))
    {
      user.ProfilePictureUrl = profilePictureUrl;
      await _userRepository.UpdateAsync(user);
    }

    await _userRepository.AddLinkedAccountAsync(new LinkedAccount
    {
      UserId = user.Id,
      Provider = provider,
      ProviderUserId = providerUserId,
      ProviderEmail = normalizedEmail,
    });

    return user;
  }

  public async Task<AuthResponse> RefreshAsync(string refreshToken)
  {
    var (key, issuer, audience) = GetJwtSettings();
    var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));

    ClaimsPrincipal principal;
    try
    {
      principal = new JwtSecurityTokenHandler().ValidateToken(refreshToken, new TokenValidationParameters
      {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateIssuerSigningKey = true,
        ValidateLifetime = true,
        ValidIssuer = issuer,
        ValidAudience = audience,
        IssuerSigningKey = signingKey,
        ClockSkew = TimeSpan.FromMinutes(1)
      }, out _);
    }
    catch
    {
      throw new ArgumentException("Invalid or expired refresh token.");
    }

    var tokenType = principal.FindFirstValue("token_type");
    if (tokenType != "refresh")
      throw new ArgumentException("Invalid token type.");

    var userIdStr = principal.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdStr, out var userId))
      throw new ArgumentException("Invalid token.");

    var user = await _userRepository.GetByIdAsync(userId)
      ?? throw new ArgumentException("User not found.");

    _audit.RefreshTokenRotated(userId);
    return CreateAuthenticatedResponse(user);
  }

  private async Task<AuthResponse> CreateLoginResponseAsync(User user)
  {
    if (!user.IsTwoFactorEnabled)
    {
      _audit.LoginSucceeded(user.Email);
      return CreateAuthenticatedResponse(user);
    }

    _audit.LoginRequiresTwoFactor(user.Email);
    return await CreateTwoFactorChallengeAsync(user, TwoFactorLoginPurpose);
  }

  private AuthResponse CreateAuthenticatedResponse(User user)
  {
    var (token, expiresAt) = GenerateJwtToken(user);
    var (refreshToken, _) = GenerateRefreshToken(user);

    var response = _mapper.Map<AuthResponse>(user);
    response.RequiresTwoFactor = false;
    response.TwoFactorToken = null;
    response.TwoFactorEmailHint = null;
    response.Token = token;
    response.ExpiresAt = expiresAt;
    response.RefreshToken = refreshToken;
    return response;
  }

  private async Task<AuthResponse> CreateTwoFactorChallengeAsync(User user, string purpose)
  {
    await IssueTwoFactorCodeAsync(user, purpose);

    return new AuthResponse
    {
      UserId = user.Id,
      DisplayName = user.DisplayName,
      Username = user.Username,
      Email = user.Email,
      ProfilePictureUrl = user.ProfilePictureUrl,
      Role = user.Role,
      RequiresTwoFactor = true,
      TwoFactorToken = GenerateTwoFactorPendingToken(user, purpose),
      TwoFactorEmailHint = MaskEmail(user.Email),
    };
  }

  private async Task IssueTwoFactorCodeAsync(User user, string purpose)
  {
    var expirationMinutes = GetTwoFactorCodeLifetimeMinutes();
    var code = TwoFactorCodeHelper.GenerateCode();

    user.TwoFactorCodeHash = TwoFactorCodeHelper.HashCode(code);
    user.TwoFactorCodeExpiresAt = DateTime.UtcNow.AddMinutes(expirationMinutes);
    user.TwoFactorCodePurpose = purpose;

    await _userRepository.UpdateAsync(user);
    await _emailSender.SendTwoFactorCodeEmailAsync(user.Email, code, purpose, expirationMinutes);
  }

  private void ValidateTwoFactorCodeOrThrow(User user, string code, string expectedPurpose)
  {
    var normalizedCode = code?.Trim() ?? string.Empty;
    var hashedCode = TwoFactorCodeHelper.HashCode(normalizedCode);

    if (string.IsNullOrWhiteSpace(user.TwoFactorCodeHash) ||
        user.TwoFactorCodeExpiresAt is null ||
        user.TwoFactorCodeExpiresAt <= DateTime.UtcNow ||
        !string.Equals(user.TwoFactorCodePurpose, expectedPurpose, StringComparison.Ordinal) ||
        !string.Equals(user.TwoFactorCodeHash, hashedCode, StringComparison.Ordinal))
    {
      throw new BusinessRuleException("Verification code is invalid or has expired.");
    }
  }

  private void ClearTwoFactorChallenge(User user)
  {
    user.TwoFactorCodeHash = null;
    user.TwoFactorCodeExpiresAt = null;
    user.TwoFactorCodePurpose = null;
  }

  private (int UserId, string Purpose) ValidateTwoFactorPendingToken(string pendingToken)
  {
    var (key, issuer, audience) = GetJwtSettings();
    var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));

    ClaimsPrincipal principal;
    try
    {
      principal = new JwtSecurityTokenHandler().ValidateToken(pendingToken, new TokenValidationParameters
      {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateIssuerSigningKey = true,
        ValidateLifetime = true,
        ValidIssuer = issuer,
        ValidAudience = audience,
        IssuerSigningKey = signingKey,
        ClockSkew = TimeSpan.FromMinutes(1)
      }, out _);
    }
    catch
    {
      throw new BusinessRuleException("Verification session is invalid or has expired. Please sign in again.");
    }

    var tokenType = principal.FindFirstValue("token_type");
    if (tokenType != TwoFactorPendingTokenType)
    {
      throw new BusinessRuleException("Verification session is invalid or has expired. Please sign in again.");
    }

    var purpose = principal.FindFirstValue("two_factor_purpose")?.Trim() ?? string.Empty;
    var userIdStr = principal.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdStr, out var userId) || string.IsNullOrWhiteSpace(purpose))
    {
      throw new BusinessRuleException("Verification session is invalid or has expired. Please sign in again.");
    }

    return (userId, purpose);
  }

  private string GenerateTwoFactorPendingToken(User user, string purpose)
  {
    var (key, issuer, audience) = GetJwtSettings();
    var expiresAt = DateTime.UtcNow.AddMinutes(GetTwoFactorCodeLifetimeMinutes());

    var claims = new[]
    {
      new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
      new Claim("token_type", TwoFactorPendingTokenType),
      new Claim("two_factor_purpose", purpose),
      new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
    };

    var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
    var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

    var token = new JwtSecurityToken(
      issuer: issuer,
      audience: audience,
      claims: claims,
      expires: expiresAt,
      signingCredentials: credentials);

    return new JwtSecurityTokenHandler().WriteToken(token);
  }

  private int GetTwoFactorCodeLifetimeMinutes()
  {
    return _twoFactorOptions.CodeMinutes > 0 ? _twoFactorOptions.CodeMinutes : 10;
  }

  private static string MaskEmail(string email)
  {
    var normalized = email?.Trim() ?? string.Empty;
    var atIndex = normalized.IndexOf('@');
    if (atIndex <= 0 || atIndex == normalized.Length - 1)
    {
      return normalized;
    }

    var localPart = normalized[..atIndex];
    var domain = normalized[(atIndex + 1)..];
    var visibleLocal = localPart.Length switch
    {
      <= 1 => localPart,
      2 => localPart[..1],
      _ => localPart[..2],
    };

    return $"{visibleLocal}***@{domain}";
  }

  private (string Token, DateTime ExpiresAt) GenerateJwtToken(User user)
  {
    var (key, issuer, audience) = GetJwtSettings();
    var expirationMinutes = _jwtOptions.AccessTokenMinutes > 0 ? _jwtOptions.AccessTokenMinutes : 15;
    var expiresAt = DateTime.UtcNow.AddMinutes(expirationMinutes);

    var claims = new[]
    {
      new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
      new Claim(JwtRegisteredClaimNames.Email, user.Email),
      new Claim(ClaimTypes.Name, user.DisplayName),
      new Claim(ClaimTypes.Role, user.Role),
      new Claim("username", user.Username),
      new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
    };

    var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
    var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

    var token = new JwtSecurityToken(
        issuer: issuer,
        audience: audience,
        claims: claims,
        expires: expiresAt,
        signingCredentials: credentials);

    return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
  }

  private (string Token, DateTime ExpiresAt) GenerateRefreshToken(User user)
  {
    var (key, issuer, audience) = GetJwtSettings();
    var expirationDays = _jwtOptions.RefreshTokenDays > 0 ? _jwtOptions.RefreshTokenDays : 30;
    var expiresAt = DateTime.UtcNow.AddDays(expirationDays);

    var claims = new[]
    {
      new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
      new Claim("token_type", "refresh"),
      new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
    };

    var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
    var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

    var token = new JwtSecurityToken(
        issuer: issuer,
        audience: audience,
        claims: claims,
        expires: expiresAt,
        signingCredentials: credentials);

    return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
  }

  private (string Key, string? Issuer, string? Audience) GetJwtSettings()
  {
    var key = _jwtOptions.Key
      ?? throw new InvalidOperationException("JwtSettings:Key is not configured.");
    return (key, _jwtOptions.Issuer, _jwtOptions.Audience);
  }
}
