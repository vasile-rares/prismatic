using AutoMapper;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.Exceptions;
using Favigon.Application.Interfaces;
using Favigon.Application.Mappings;
using Favigon.Application.Services;
using Favigon.Domain.Entities;
using Favigon.Tests.Helpers;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace Favigon.Tests.Services;

public class AuthServicePasswordManagementTests
{
  private readonly Mock<IUserRepository> _userRepo = new();
  private readonly Mock<IGithubOAuthClient> _github = new();
  private readonly Mock<IGoogleOAuthClient> _google = new();
  private readonly Mock<IEmailSender> _email = new();
  private readonly Mock<IAuditLogger> _audit = new();
  private readonly AuthService _sut;

  public AuthServicePasswordManagementTests()
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
  public async Task SetPassword_ForPasswordlessAccount_StoresHashAndSendsConfirmationEmail()
  {
    // Arrange
    var user = new User
    {
      Id = 7,
      Username = "oauthuser",
      DisplayName = "OAuth User",
      Email = "oauth@example.com",
      HasPassword = false,
      PasswordHash = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString("N")),
      Role = "User"
    };

    _userRepo.Setup(r => r.GetByIdAsync(7)).ReturnsAsync(user);
    _userRepo.Setup(r => r.UpdateAsync(user)).Returns(Task.CompletedTask);

    // Act
    await _sut.SetPasswordAsync(7, new SetPasswordRequest { Password = "NewPassword123" });

    // Assert
    Assert.True(user.HasPassword);
    Assert.True(BCrypt.Net.BCrypt.Verify("NewPassword123", user.PasswordHash));
    _email.Verify(r => r.SendPasswordSetConfirmationEmailAsync("oauth@example.com"), Times.Once);
  }

  [Fact]
  public async Task SetPassword_WhenPasswordAlreadyExists_ThrowsBusinessRuleException()
  {
    // Arrange
    var user = new User
    {
      Id = 7,
      Username = "localuser",
      DisplayName = "Local User",
      Email = "local@example.com",
      HasPassword = true,
      PasswordHash = BCrypt.Net.BCrypt.HashPassword("ExistingPassword123"),
      Role = "User"
    };

    _userRepo.Setup(r => r.GetByIdAsync(7)).ReturnsAsync(user);

    // Act
    var exception = await Assert.ThrowsAsync<BusinessRuleException>(() =>
      _sut.SetPasswordAsync(7, new SetPasswordRequest { Password = "NewPassword123" }));

    // Assert
    Assert.Equal("Password is already set for this account.", exception.Message);
  }

  [Fact]
  public async Task ChangePassword_WithCorrectCurrentPassword_UpdatesPasswordHash()
  {
    // Arrange
    var user = new User
    {
      Id = 9,
      Username = "changeme",
      DisplayName = "Change Me",
      Email = "change@example.com",
      HasPassword = true,
      PasswordHash = BCrypt.Net.BCrypt.HashPassword("OldPassword123"),
      Role = "User"
    };

    var originalHash = user.PasswordHash;

    _userRepo.Setup(r => r.GetByIdAsync(9)).ReturnsAsync(user);
    _userRepo.Setup(r => r.UpdateAsync(user)).Returns(Task.CompletedTask);

    // Act
    await _sut.ChangePasswordAsync(9, new ChangePasswordRequest
    {
      CurrentPassword = "OldPassword123",
      NewPassword = "NewPassword123"
    });

    // Assert
    Assert.NotEqual(originalHash, user.PasswordHash);
    Assert.True(BCrypt.Net.BCrypt.Verify("NewPassword123", user.PasswordHash));
  }

  [Fact]
  public async Task ChangePassword_WithWrongCurrentPassword_ThrowsBusinessRuleException()
  {
    // Arrange
    var user = new User
    {
      Id = 9,
      Username = "changeme",
      DisplayName = "Change Me",
      Email = "change@example.com",
      HasPassword = true,
      PasswordHash = BCrypt.Net.BCrypt.HashPassword("OldPassword123"),
      Role = "User"
    };

    _userRepo.Setup(r => r.GetByIdAsync(9)).ReturnsAsync(user);

    // Act
    var exception = await Assert.ThrowsAsync<BusinessRuleException>(() =>
      _sut.ChangePasswordAsync(9, new ChangePasswordRequest
      {
        CurrentPassword = "WrongPassword123",
        NewPassword = "NewPassword123"
      }));

    // Assert
    Assert.Equal("Current password is incorrect.", exception.Message);
  }
}
