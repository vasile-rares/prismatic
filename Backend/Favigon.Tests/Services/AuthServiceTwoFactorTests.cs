using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using AutoMapper;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.Interfaces;
using Favigon.Application.Mappings;
using Favigon.Application.Services;
using Favigon.Domain.Entities;
using Favigon.Tests.Helpers;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace Favigon.Tests.Services;

public class AuthServiceTwoFactorTests
{
  private readonly Mock<IUserRepository> _userRepo = new();
  private readonly Mock<IGithubOAuthClient> _github = new();
  private readonly Mock<IGoogleOAuthClient> _google = new();
  private readonly Mock<IEmailSender> _email = new();
  private readonly Mock<IAuditLogger> _audit = new();
  private readonly AuthService _sut;

  public AuthServiceTwoFactorTests()
  {
    var configExpr = new MapperConfigurationExpression();
    configExpr.AddProfile<MappingProfile>();
    var config = new MapperConfiguration(configExpr, NullLoggerFactory.Instance);
    var mapper = config.CreateMapper();

    _sut = new AuthService(
      _userRepo.Object,
      _github.Object,
      _google.Object,
      _email.Object,
      mapper,
      TestConfiguration.BuildJwtOptions(),
      TestConfiguration.BuildPasswordResetOptions(),
      TestConfiguration.BuildClientOptions(),
      TestConfiguration.BuildTwoFactorOptions(),
      _audit.Object);
  }

  [Fact]
  public async Task Login_WithTwoFactorEnabled_ReturnsPendingChallengeAndSendsCode()
  {
    var user = MakeUser();
    user.IsTwoFactorEnabled = true;

    _userRepo.Setup(r => r.GetByEmailAsync("test@example.com")).ReturnsAsync(user);
    _userRepo.Setup(r => r.UpdateAsync(user)).Returns(Task.CompletedTask);

    var result = await _sut.LoginAsync(new LoginRequest
    {
      Email = "test@example.com",
      Password = "Password123!",
    });

    Assert.NotNull(result);
    Assert.True(result!.RequiresTwoFactor);
    Assert.True(string.IsNullOrWhiteSpace(result.Token));
    Assert.True(string.IsNullOrWhiteSpace(result.RefreshToken));
    Assert.False(string.IsNullOrWhiteSpace(result.TwoFactorToken));
    Assert.Equal("te***@example.com", result.TwoFactorEmailHint);
    Assert.False(string.IsNullOrWhiteSpace(user.TwoFactorCodeHash));
    Assert.NotNull(user.TwoFactorCodeExpiresAt);
    Assert.Equal("login", user.TwoFactorCodePurpose);

    _email.Verify(
      r => r.SendTwoFactorCodeEmailAsync(
        "test@example.com",
        It.Is<string>(code => code.Length == 6 && code.All(char.IsDigit)),
        "login",
        10),
      Times.Once);

    var jwt = new JwtSecurityTokenHandler().ReadJwtToken(result.TwoFactorToken);
    Assert.Equal("two_factor_pending", jwt.Claims.First(c => c.Type == "token_type").Value);
    Assert.Equal("login", jwt.Claims.First(c => c.Type == "two_factor_purpose").Value);
    Assert.Equal("1", jwt.Claims.First(c => c.Type == ClaimTypes.NameIdentifier).Value);
  }

  [Fact]
  public async Task VerifyTwoFactorLogin_WithValidCode_ReturnsTokensAndClearsChallenge()
  {
    var user = MakeUser();
    user.IsTwoFactorEnabled = true;

    string? sentCode = null;
    _userRepo.Setup(r => r.GetByEmailAsync("test@example.com")).ReturnsAsync(user);
    _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);
    _userRepo.Setup(r => r.UpdateAsync(user)).Returns(Task.CompletedTask);
    _email
      .Setup(r => r.SendTwoFactorCodeEmailAsync(user.Email, It.IsAny<string>(), "login", 10))
      .Callback<string, string, string, int>((_, code, _, _) => sentCode = code)
      .Returns(Task.CompletedTask);

    var challenge = await _sut.LoginAsync(new LoginRequest
    {
      Email = "test@example.com",
      Password = "Password123!",
    });

    var result = await _sut.VerifyTwoFactorLoginAsync(new TwoFactorLoginVerifyRequest
    {
      Token = challenge!.TwoFactorToken!,
      Code = sentCode!,
    });

    Assert.False(result.RequiresTwoFactor);
    Assert.False(string.IsNullOrWhiteSpace(result.Token));
    Assert.False(string.IsNullOrWhiteSpace(result.RefreshToken));
    Assert.Null(user.TwoFactorCodeHash);
    Assert.Null(user.TwoFactorCodeExpiresAt);
    Assert.Null(user.TwoFactorCodePurpose);
  }

  [Fact]
  public async Task EnableTwoFactor_WithValidCode_EnablesTwoFactorAndClearsChallenge()
  {
    var user = MakeUser();
    string? sentCode = null;

    _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);
    _userRepo.Setup(r => r.UpdateAsync(user)).Returns(Task.CompletedTask);
    _email
      .Setup(r => r.SendTwoFactorCodeEmailAsync(user.Email, It.IsAny<string>(), "enable", 10))
      .Callback<string, string, string, int>((_, code, _, _) => sentCode = code)
      .Returns(Task.CompletedTask);

    await _sut.SendEnableTwoFactorCodeAsync(user.Id);

    await _sut.EnableTwoFactorAsync(user.Id, new TwoFactorCodeRequest { Code = sentCode! });

    Assert.True(user.IsTwoFactorEnabled);
    Assert.Null(user.TwoFactorCodeHash);
    Assert.Null(user.TwoFactorCodeExpiresAt);
    Assert.Null(user.TwoFactorCodePurpose);
  }

  [Fact]
  public async Task DisableTwoFactor_WithValidCode_DisablesTwoFactorAndClearsChallenge()
  {
    var user = MakeUser();
    user.IsTwoFactorEnabled = true;
    string? sentCode = null;

    _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);
    _userRepo.Setup(r => r.UpdateAsync(user)).Returns(Task.CompletedTask);
    _email
      .Setup(r => r.SendTwoFactorCodeEmailAsync(user.Email, It.IsAny<string>(), "disable", 10))
      .Callback<string, string, string, int>((_, code, _, _) => sentCode = code)
      .Returns(Task.CompletedTask);

    await _sut.SendDisableTwoFactorCodeAsync(user.Id);

    await _sut.DisableTwoFactorAsync(user.Id, new TwoFactorCodeRequest { Code = sentCode! });

    Assert.False(user.IsTwoFactorEnabled);
    Assert.Null(user.TwoFactorCodeHash);
    Assert.Null(user.TwoFactorCodeExpiresAt);
    Assert.Null(user.TwoFactorCodePurpose);
  }

  private static User MakeUser(string password = "Password123!") => new()
  {
    Id = 1,
    Username = "testuser",
    DisplayName = "Test User",
    Email = "test@example.com",
    HasPassword = true,
    PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
    Role = "User",
  };
}
