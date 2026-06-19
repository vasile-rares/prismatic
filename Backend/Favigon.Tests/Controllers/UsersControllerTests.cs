using System.Security.Claims;
using Favigon.API.Controllers;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;

namespace Favigon.Tests.Controllers;

public class UsersControllerTests
{
  private readonly Mock<IUserService> _userService = new();
  private readonly UsersController _controller;

  public UsersControllerTests()
  {
    _controller = new UsersController(_userService.Object)
    {
      ControllerContext = CreateControllerContext(userId: 7)
    };
  }

  private static ControllerContext CreateControllerContext(int userId, string role = "User")
  {
    var claims = new[]
    {
      new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
      new Claim(ClaimTypes.Role, role),
    };
    var identity = new ClaimsIdentity(claims, "Test");
    return new ControllerContext
    {
      HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) }
    };
  }

  // GetMe

  [Fact]
  public async Task GetMe_WhenUserFound_ReturnsOk()
  {
    var profile = new UserResponse { UserId = 7, Username = "alice", Email = "alice@test.com" };
    _userService.Setup(s => s.GetMyProfileAsync(7)).ReturnsAsync(profile);

    var result = await _controller.GetMe();

    var ok = Assert.IsType<OkObjectResult>(result);
    Assert.Equal(profile, ok.Value);
  }

  [Fact]
  public async Task GetMe_WhenUserNotFound_ReturnsNotFound()
  {
    _userService.Setup(s => s.GetMyProfileAsync(7)).ReturnsAsync((UserResponse?)null);

    var result = await _controller.GetMe();

    Assert.IsType<NotFoundResult>(result);
  }

  // UpdateMe

  [Fact]
  public async Task UpdateMe_WhenUserNotFound_ReturnsNotFound()
  {
    var request = new Application.DTOs.Requests.UserProfileUpdateRequest
    {
      Username = "alice",
      DisplayName = "Alice",
    };
    _userService.Setup(s => s.UpdateMyProfileAsync(7, request)).ReturnsAsync((UserResponse?)null);

    var result = await _controller.UpdateMe(request);

    Assert.IsType<NotFoundResult>(result);
  }

  [Fact]
  public async Task UpdateMe_WhenUserFound_ReturnsOk()
  {
    var request = new Application.DTOs.Requests.UserProfileUpdateRequest
    {
      Username = "alice2",
      DisplayName = "Alice Two",
    };
    var updated = new UserResponse { UserId = 7, Username = "alice2", Email = "alice2@test.com" };
    _userService.Setup(s => s.UpdateMyProfileAsync(7, request)).ReturnsAsync(updated);

    var result = await _controller.UpdateMe(request);

    var ok = Assert.IsType<OkObjectResult>(result);
    Assert.Equal(updated, ok.Value);
  }

  // Search

  [Fact]
  public async Task Search_WithQueryShorterThanTwo_ReturnsEmptyList()
  {
    var result = await _controller.Search("a");

    var ok = Assert.IsType<OkObjectResult>(result);
    Assert.IsType<List<object>>(ok.Value);
    _userService.Verify(s => s.SearchAsync(It.IsAny<string>()), Times.Never);
  }

  [Fact]
  public async Task Search_WithBlankQuery_ReturnsEmptyList()
  {
    var result = await _controller.Search("  ");

    var ok = Assert.IsType<OkObjectResult>(result);
    Assert.IsType<List<object>>(ok.Value);
    _userService.Verify(s => s.SearchAsync(It.IsAny<string>()), Times.Never);
  }

  [Fact]
  public async Task Search_WithValidQuery_CallsServiceAndReturnsOk()
  {
    var users = new List<User>
    {
      new() { Id = 1, Username = "alice", DisplayName = "Alice", Email = "a@test.com" },
    };
    _userService.Setup(s => s.SearchAsync("ali")).ReturnsAsync(users);

    var result = await _controller.Search("ali");

    var ok = Assert.IsType<OkObjectResult>(result);
    Assert.NotNull(ok.Value);
    _userService.Verify(s => s.SearchAsync("ali"), Times.Once);
  }

  // DeleteMe

  [Fact]
  public async Task DeleteMe_WhenFound_ReturnsNoContent()
  {
    _userService.Setup(s => s.DeleteMyAccountAsync(7)).ReturnsAsync(true);

    var result = await _controller.DeleteMe();

    Assert.IsType<NoContentResult>(result);
  }

  [Fact]
  public async Task DeleteMe_WhenNotFound_ReturnsNotFound()
  {
    _userService.Setup(s => s.DeleteMyAccountAsync(7)).ReturnsAsync(false);

    var result = await _controller.DeleteMe();

    Assert.IsType<NotFoundResult>(result);
  }
}
