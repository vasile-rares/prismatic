using AutoMapper;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.Interfaces;
using Favigon.Application.Mappings;
using Favigon.Application.Services;
using Favigon.Domain.Entities;
using Favigon.Tests.Helpers;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Favigon.Tests.Services;

public class AuthServiceRefreshTests
{
  private readonly Mock<IUserRepository> _userRepo = new();
  private readonly Mock<IGithubOAuthClient> _github = new();
  private readonly Mock<IGoogleOAuthClient> _google = new();
  private readonly Mock<IEmailSender> _email = new();
  private readonly Mock<IAuditLogger> _audit = new();
  private readonly IMapper _mapper;
  private readonly AuthService _sut;

  public AuthServiceRefreshTests()
  {
    var configExpr = new MapperConfigurationExpression();
    configExpr.AddProfile<MappingProfile>();
    var config = new MapperConfiguration(configExpr, NullLoggerFactory.Instance);
    _mapper = config.CreateMapper();
    _sut = new AuthService(
        _userRepo.Object,
        _github.Object, _google.Object,
        _email.Object, _mapper,
        TestConfiguration.BuildJwtOptions(),
        TestConfiguration.BuildPasswordResetOptions(),
        TestConfiguration.BuildClientOptions(),
        TestConfiguration.BuildTwoFactorOptions(),
        _audit.Object);
  }

  private User MakeUser() => new()
  {
    Id = 42,
    Username = "testuser",
    DisplayName = "Test User",
    Email = "test@example.com",
    PasswordHash = BCrypt.Net.BCrypt.HashPassword("pass"),
    Role = "User"
  };

  private string BuildRefreshToken(int userId, string tokenType = "refresh", DateTime? expiry = null)
  {
    var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestConfiguration.JwtKey));
    var claims = new[]
    {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim("token_type", tokenType),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };
    var token = new JwtSecurityToken(
        issuer: TestConfiguration.JwtIssuer,
        audience: TestConfiguration.JwtAudience,
        claims: claims,
        expires: expiry ?? DateTime.UtcNow.AddDays(30),
        signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

    return new JwtSecurityTokenHandler().WriteToken(token);
  }

  [Fact]
  public async Task Refresh_WithValidToken_ReturnsNewTokens()
  {
    // Arrange
    var user = MakeUser();
    var refreshToken = BuildRefreshToken(user.Id);
    _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);

    // Act
    var result = await _sut.RefreshAsync(refreshToken);

    // Assert
    Assert.NotNull(result);
    Assert.False(string.IsNullOrEmpty(result.Token));
    Assert.False(string.IsNullOrEmpty(result.RefreshToken));
    // New refresh token should be different (new Jti)
    Assert.NotEqual(refreshToken, result.RefreshToken);
  }

  [Fact]
  public async Task Refresh_WithExpiredToken_ThrowsArgumentException()
  {
    // Arrange
    var expiredToken = BuildRefreshToken(42, expiry: DateTime.UtcNow.AddDays(-1));

    // Act & Assert
    var ex = await Assert.ThrowsAsync<ArgumentException>(() => _sut.RefreshAsync(expiredToken));
    Assert.Equal("Invalid or expired refresh token.", ex.Message);
  }

  [Fact]
  public async Task Refresh_WithAccessTokenInsteadOfRefreshToken_ThrowsArgumentException()
  {
    // Arrange — build a token with token_type: access (not refresh)
    var wrongTypeToken = BuildRefreshToken(42, tokenType: "access");

    // Act & Assert
    var ex = await Assert.ThrowsAsync<ArgumentException>(() => _sut.RefreshAsync(wrongTypeToken));
    Assert.Equal("Invalid token type.", ex.Message);
  }

  [Fact]
  public async Task Refresh_WithRandomGarbage_ThrowsArgumentException()
  {
    var ex = await Assert.ThrowsAsync<ArgumentException>(() => _sut.RefreshAsync("totally.not.a.token"));
    Assert.Equal("Invalid or expired refresh token.", ex.Message);
  }

  [Fact]
  public async Task Refresh_WhenUserNotFound_ThrowsArgumentException()
  {
    // Arrange
    var refreshToken = BuildRefreshToken(999);
    _userRepo.Setup(r => r.GetByIdAsync(999)).ReturnsAsync((User?)null);

    // Act & Assert
    var ex = await Assert.ThrowsAsync<ArgumentException>(() => _sut.RefreshAsync(refreshToken));
    Assert.Equal("User not found.", ex.Message);
  }
}
