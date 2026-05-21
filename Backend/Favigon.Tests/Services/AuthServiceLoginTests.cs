using AutoMapper;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.Interfaces;
using Favigon.Application.Mappings;
using Favigon.Application.Services;
using Favigon.Domain.Entities;
using Favigon.Tests.Helpers;

namespace Favigon.Tests.Services;

public class AuthServiceLoginTests
{
  private readonly Mock<IUserRepository> _userRepo = new();
  private readonly Mock<IGithubOAuthClient> _github = new();
  private readonly Mock<IGoogleOAuthClient> _google = new();
  private readonly Mock<IEmailSender> _email = new();
  private readonly Mock<IAuditLogger> _audit = new();
  private readonly IMapper _mapper;
  private readonly AuthService _sut;

  public AuthServiceLoginTests()
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

  private User MakeUser(string password = "Password123!") => new()
  {
    Id = 1,
    Username = "testuser",
    DisplayName = "Test User",
    Email = "test@example.com",
    PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
    Role = "User"
  };

  [Fact]
  public async Task Login_WithValidCredentials_ReturnsAuthResponse()
  {
    // Arrange
    _userRepo.Setup(r => r.GetByEmailAsync("test@example.com"))
        .ReturnsAsync(MakeUser());

    var request = new LoginRequest { Email = "test@example.com", Password = "Password123!" };

    // Act
    var result = await _sut.LoginAsync(request);

    // Assert
    Assert.NotNull(result);
    Assert.False(string.IsNullOrEmpty(result.Token));
    Assert.False(string.IsNullOrEmpty(result.RefreshToken));
  }

  [Fact]
  public async Task Login_WithWrongPassword_ReturnsNull()
  {
    // Arrange
    _userRepo.Setup(r => r.GetByEmailAsync("test@example.com"))
        .ReturnsAsync(MakeUser("CorrectPassword!"));

    var request = new LoginRequest { Email = "test@example.com", Password = "WrongPassword!" };

    // Act
    var result = await _sut.LoginAsync(request);

    // Assert
    Assert.Null(result);
  }

  [Fact]
  public async Task Login_WithoutLocalPassword_ReturnsNull()
  {
    // Arrange
    _userRepo.Setup(r => r.GetByEmailAsync("test@example.com"))
        .ReturnsAsync(new User
        {
          Id = 1,
          Username = "testuser",
          DisplayName = "Test User",
          Email = "test@example.com",
          HasPassword = false,
          PasswordHash = BCrypt.Net.BCrypt.HashPassword("UnusedPassword123"),
          Role = "User"
        });

    var request = new LoginRequest { Email = "test@example.com", Password = "Password123!" };

    // Act
    var result = await _sut.LoginAsync(request);

    // Assert
    Assert.Null(result);
  }

  [Fact]
  public async Task Login_WithNonExistentEmail_ReturnsNull()
  {
    // Arrange
    _userRepo.Setup(r => r.GetByEmailAsync(It.IsAny<string>())).ReturnsAsync((User?)null);

    var request = new LoginRequest { Email = "nobody@example.com", Password = "Password123!" };

    // Act
    var result = await _sut.LoginAsync(request);

    // Assert
    Assert.Null(result);
  }

  [Fact]
  public async Task Login_TrimsEmailBeforeLookup()
  {
    // Arrange
    _userRepo.Setup(r => r.GetByEmailAsync("test@example.com"))
        .ReturnsAsync(MakeUser());

    var request = new LoginRequest { Email = "  test@example.com  ", Password = "Password123!" };

    // Act
    var result = await _sut.LoginAsync(request);

    // Assert
    Assert.NotNull(result);
    _userRepo.Verify(r => r.GetByEmailAsync("test@example.com"), Times.Once);
  }

  [Fact]
  public async Task Login_AccessToken_HasCorrectClaims()
  {
    // Arrange
    _userRepo.Setup(r => r.GetByEmailAsync("test@example.com"))
        .ReturnsAsync(MakeUser());

    var request = new LoginRequest { Email = "test@example.com", Password = "Password123!" };

    // Act
    var result = await _sut.LoginAsync(request);

    // Assert - decode token and verify claims
    Assert.NotNull(result);
    var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
    var jwt = handler.ReadJwtToken(result!.Token);

    Assert.Equal("1", jwt.Claims.First(c => c.Type == System.Security.Claims.ClaimTypes.NameIdentifier).Value);
    Assert.Equal("test@example.com", jwt.Claims.First(c => c.Type == "email").Value);
    Assert.Equal("User", jwt.Claims.First(c => c.Type == System.Security.Claims.ClaimTypes.Role).Value);
  }

  [Fact]
  public async Task Login_RefreshToken_HasTokenTypeRefreshClaim()
  {
    // Arrange
    _userRepo.Setup(r => r.GetByEmailAsync("test@example.com"))
        .ReturnsAsync(MakeUser());

    var request = new LoginRequest { Email = "test@example.com", Password = "Password123!" };

    // Act
    var result = await _sut.LoginAsync(request);

    // Assert
    Assert.NotNull(result);
    var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
    var jwt = handler.ReadJwtToken(result!.RefreshToken);
    Assert.Equal("refresh", jwt.Claims.First(c => c.Type == "token_type").Value);
  }
}
