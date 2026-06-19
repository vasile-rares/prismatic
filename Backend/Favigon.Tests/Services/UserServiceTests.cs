using AutoMapper;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Exceptions;
using Favigon.Application.Interfaces;
using Favigon.Application.Services;
using Favigon.Domain.Entities;
using Moq;

namespace Favigon.Tests.Services;

public class UserServiceTests
{
  private readonly Mock<IUserRepository> _userRepo = new();
  private readonly Mock<IUserProfileImageStorage> _profileImageStorage = new();
  private readonly Mock<IProjectRepository> _projectRepo = new();
  private readonly Mock<IProjectAssetStorage> _projectAssetStorage = new();
  private readonly Mock<IMapper> _mapper = new();
  private readonly Mock<IAuditLogger> _audit = new();
  private readonly UserService _sut;

  public UserServiceTests()
  {
    _sut = new UserService(
      _userRepo.Object,
      _profileImageStorage.Object,
      _projectRepo.Object,
      _projectAssetStorage.Object,
      _mapper.Object,
      _audit.Object);
  }

  [Fact]
  public async Task Create_WithValidRequest_AddsUser()
  {
    _userRepo.Setup(r => r.GetByUsernameAsync(It.IsAny<string>())).ReturnsAsync((User?)null);
    _userRepo.Setup(r => r.GetByEmailAsync(It.IsAny<string>())).ReturnsAsync((User?)null);
    _userRepo.Setup(r => r.AddAsync(It.IsAny<User>()))
        .ReturnsAsync((User u) => { u.Id = 1; return u; });

    var request = new UserCreateRequest
    {
      Username = "newuser",
      DisplayName = "New User",
      Email = "new@example.com",
      Password = "Password123!"
    };

    var result = await _sut.CreateAsync(request);

    Assert.NotNull(result);
    Assert.Equal("newuser", result.Username);
    _userRepo.Verify(r => r.AddAsync(It.IsAny<User>()), Times.Once);
  }

  [Fact]
  public async Task Create_WhenUsernameExists_ThrowsConflictException()
  {
    _userRepo.Setup(r => r.GetByUsernameAsync("existing"))
        .ReturnsAsync(new User { Id = 1, Username = "existing", Email = "x@x.com" });

    var request = new UserCreateRequest
    {
      Username = "existing",
      DisplayName = "Test",
      Email = "new@example.com",
      Password = "Password123!"
    };

    var ex = await Assert.ThrowsAsync<ConflictException>(() => _sut.CreateAsync(request));
    Assert.Equal("Username already exists.", ex.Message);
  }

  [Fact]
  public async Task Update_WhenUserNotFound_ReturnsNull()
  {
    _userRepo.Setup(r => r.GetByIdAsync(99)).ReturnsAsync((User?)null);

    var request = new UserUpdateRequest
    {
      Username = "test",
      DisplayName = "Test",
      Email = "test@test.com"
    };

    var result = await _sut.UpdateAsync(99, request);

    Assert.Null(result);
  }

  [Fact]
  public async Task Update_WithNewPassword_HashesPassword()
  {
    var existingUser = new User
    {
      Id = 1,
      Username = "user1",
      DisplayName = "User",
      Email = "user@test.com",
      PasswordHash = BCrypt.Net.BCrypt.HashPassword("OldPass"),
      Role = "User"
    };
    _userRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(existingUser);
    _userRepo.Setup(r => r.GetByUsernameAsync("user1")).ReturnsAsync(existingUser);
    _userRepo.Setup(r => r.GetByEmailAsync("user@test.com")).ReturnsAsync(existingUser);

    var request = new UserUpdateRequest
    {
      Username = "user1",
      DisplayName = "User",
      Email = "user@test.com",
      Password = "NewPass123!"
    };

    var result = await _sut.UpdateAsync(1, request);

    Assert.NotNull(result);
    Assert.NotEqual("NewPass123!", result!.PasswordHash);
    Assert.True(BCrypt.Net.BCrypt.Verify("NewPass123!", result.PasswordHash));
  }

  [Fact]
  public async Task Delete_WhenUserExists_ReturnsTrueAndCallsDelete()
  {
    var user = new User { Id = 5, Username = "del", Email = "del@test.com" };
    _userRepo.Setup(r => r.GetByIdAsync(5)).ReturnsAsync(user);

    var result = await _sut.DeleteAsync(5);

    Assert.True(result);
    _userRepo.Verify(r => r.DeleteAsync(user), Times.Once);
  }

  [Fact]
  public async Task Delete_WhenUserNotFound_ReturnsFalse()
  {
    _userRepo.Setup(r => r.GetByIdAsync(99)).ReturnsAsync((User?)null);

    var result = await _sut.DeleteAsync(99);

    Assert.False(result);
    _userRepo.Verify(r => r.DeleteAsync(It.IsAny<User>()), Times.Never);
  }

  [Fact]
  public async Task UpdateMyProfileImage_WhenUploadSucceeds_StoresAbsoluteUrlAndDeletesPreviousLocalImage()
  {
    var user = new User
    {
      Id = 7,
      Username = "designer",
      DisplayName = "Designer",
      Email = "designer@test.com",
      ProfilePictureUrl = "https://api.favigon.test/user-profile-assets/7/old-image.png"
    };

    _userRepo.Setup(r => r.GetByIdAsync(7)).ReturnsAsync(user);
    _profileImageStorage
      .Setup(s => s.SaveImageAsync(7, It.IsAny<Stream>(), "avatar.png", "image/png", It.IsAny<CancellationToken>()))
      .ReturnsAsync("/user-profile-assets/7/new-image.png");
    _userRepo
      .Setup(r => r.GetLinkedAccountsByUserIdAsync(7))
      .ReturnsAsync(Array.Empty<LinkedAccount>());
    _mapper
      .Setup(m => m.Map<UserResponse>(It.IsAny<User>()))
      .Returns<User>(mappedUser => new UserResponse
      {
        UserId = mappedUser.Id,
        DisplayName = mappedUser.DisplayName,
        Username = mappedUser.Username,
        Email = mappedUser.Email,
        ProfilePictureUrl = mappedUser.ProfilePictureUrl,
        LinkedAccounts = new List<LinkedAccountResponse>()
      });
    _mapper
      .Setup(m => m.Map<List<LinkedAccountResponse>>(It.IsAny<object>()))
      .Returns(new List<LinkedAccountResponse>());

    var request = new UserProfileImageUploadRequest
    {
      Content = new MemoryStream(new byte[] { 1, 2, 3 }),
      FileName = "avatar.png",
      ContentType = "image/png",
      Length = 3,
    };

    var result = await _sut.UpdateMyProfileImageAsync(
      7,
      request,
      "https://api.favigon.test",
      CancellationToken.None);

    Assert.NotNull(result);
    Assert.Equal("https://api.favigon.test/user-profile-assets/7/new-image.png", result!.ProfilePictureUrl);
    _userRepo.Verify(
      r => r.UpdateAsync(It.Is<User>(u => u.ProfilePictureUrl == "https://api.favigon.test/user-profile-assets/7/new-image.png")),
      Times.Once);
    _profileImageStorage.Verify(
      s => s.DeleteImageAsync(7, "https://api.favigon.test/user-profile-assets/7/old-image.png", It.IsAny<CancellationToken>()),
      Times.Once);
  }

  [Fact]
  public async Task DeleteMyAccount_WhenUserExists_DeletesStoredProfileAssets()
  {
    var user = new User { Id = 5, Username = "delme", Email = "delme@test.com" };
    _userRepo.Setup(r => r.GetByIdAsync(5)).ReturnsAsync(user);
    _projectRepo.Setup(r => r.GetByUserIdAsync(5, null)).ReturnsAsync(new List<Project>());

    var result = await _sut.DeleteMyAccountAsync(5);

    Assert.True(result);
    _userRepo.Verify(r => r.DeleteAsync(user), Times.Once);
    _profileImageStorage.Verify(s => s.DeleteUserAssetsAsync(5, It.IsAny<CancellationToken>()), Times.Once);
  }
}
