using Favigon.API.Extensions;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Extensions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Favigon.API.Controllers;

[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController : ControllerBase
{
  private readonly IUserService _userService;

  public UsersController(IUserService userService)
  {
    _userService = userService;
  }

  [HttpGet]
  [Authorize(Roles = "Admin")]
  public async Task<IActionResult> GetAll()
  {
    var users = await _userService.GetAllAsync();
    return Ok(users);
  }

  [HttpGet("me")]
  public async Task<IActionResult> GetMe()
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    var profile = await _userService.GetMyProfileAsync(userId);
    if (profile == null) return NotFound();

    return Ok(profile);
  }

  [HttpPut("me")]
  public async Task<IActionResult> UpdateMe([FromBody] UserProfileUpdateRequest request)
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    var updated = await _userService.UpdateMyProfileAsync(userId, request);
    if (updated == null) return NotFound();

    return Ok(updated);
  }

  [HttpPost("me/profile-image")]
  [RequestSizeLimit(10 * 1024 * 1024)]
  public async Task<IActionResult> UploadMyProfileImage(IFormFile? file)
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    if (file == null)
    {
      return BadRequest("Image file is required.");
    }

    await using var stream = file.OpenReadStream();
    var publicBaseUrl = UriHelper.BuildAbsolute(Request.Scheme, Request.Host, Request.PathBase);
    var updated = await _userService.UpdateMyProfileImageAsync(
      userId,
      new UserProfileImageUploadRequest
      {
        Content = stream,
        FileName = file.FileName,
        ContentType = file.ContentType,
        Length = file.Length,
      },
      publicBaseUrl,
      HttpContext.RequestAborted);

    if (updated == null)
    {
      return NotFound();
    }

    return Ok(updated);
  }

  [HttpDelete("me")]
  public async Task<IActionResult> DeleteMe()
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    var deleted = await _userService.DeleteMyAccountAsync(userId);
    if (!deleted) return NotFound();

    var isSecure = Request.IsHttps || Request.Headers["X-Forwarded-Proto"] == "https";
    Response.Cookies.Append("jwt", "", new Microsoft.AspNetCore.Http.CookieOptions
    {
      HttpOnly = true,
      Secure = isSecure,
      SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Strict,
      Expires = DateTime.UtcNow.AddDays(-1)
    });
    Response.Cookies.Append("refresh_token", "", new Microsoft.AspNetCore.Http.CookieOptions
    {
      HttpOnly = true,
      Secure = isSecure,
      SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Strict,
      Path = "/api/account/refresh",
      Expires = DateTime.UtcNow.AddDays(-1)
    });
    return NoContent();
  }

  [HttpDelete("me/linked-accounts/{provider}")]
  public async Task<IActionResult> UnlinkProvider(string provider)
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    var unlinked = await _userService.UnlinkProviderAsync(userId, provider.ToLowerInvariant());
    return unlinked ? NoContent() : NotFound();
  }

  [HttpGet("{id:int}")]
  [Authorize(Roles = "Admin")]
  public async Task<IActionResult> GetById(int id)
  {
    var user = await _userService.GetByIdAsync(id);
    if (user == null)
    {
      return NotFound();
    }

    return Ok(user);
  }

  [HttpPost]
  [Authorize(Roles = "Admin")]
  public async Task<IActionResult> Create([FromBody] UserCreateRequest request)
  {
    var created = await _userService.CreateAsync(request);
    return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
  }

  [HttpPut("{id:int}")]
  [Authorize(Roles = "Admin")]
  public async Task<IActionResult> Update(int id, [FromBody] UserUpdateRequest request)
  {
    var updated = await _userService.UpdateAsync(id, request);
    if (updated == null)
    {
      return NotFound();
    }

    return Ok(updated);
  }

  [HttpGet("search")]
  [EnableRateLimiting("users")]
  public async Task<IActionResult> Search([FromQuery] string q)
  {
    if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
    {
      return Ok(new List<object>());
    }

    var users = await _userService.SearchAsync(q);
    return Ok(users.Select(u => new
    {
      userId = u.Id,
      u.DisplayName,
      u.Username,
      u.ProfilePictureUrl
    }));
  }

  [HttpGet("{username}")]
  public async Task<IActionResult> GetByUsername(string username)
  {
    var user = await _userService.GetByUsernameAsync(username);
    if (user == null)
    {
      return NotFound();
    }

    User.TryGetUserId(out var viewerUserId);

    var followerCount = await _userService.GetFollowerCountAsync(user.Id);
    var followingCount = await _userService.GetFollowingCountAsync(user.Id);
    var isFollowedByCurrentUser = viewerUserId > 0
      ? await _userService.IsFollowingAsync(viewerUserId, user.Id)
      : false;

    return Ok(new
    {
      userId = user.Id,
      user.DisplayName,
      user.Username,
      user.ProfilePictureUrl,
      user.Bio,
      user.CreatedAt,
      followerCount,
      followingCount,
      isFollowedByCurrentUser
    });
  }

  [HttpPost("{username}/follow")]
  public async Task<IActionResult> Follow(string username)
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    await _userService.FollowAsync(userId, username);
    return Ok();
  }

  [HttpDelete("{username}/follow")]
  public async Task<IActionResult> Unfollow(string username)
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    await _userService.UnfollowAsync(userId, username);
    return NoContent();
  }

  [HttpGet("{username}/followers")]
  public async Task<IActionResult> GetFollowers(string username)
  {
    var user = await _userService.GetByUsernameAsync(username);
    if (user == null) return NotFound();

    var followers = await _userService.GetFollowersAsync(user.Id);
    return Ok(followers.Select(u => new
    {
      userId = u.Id,
      u.DisplayName,
      u.Username,
      u.ProfilePictureUrl
    }));
  }

  [HttpGet("{username}/following")]
  public async Task<IActionResult> GetFollowing(string username)
  {
    var user = await _userService.GetByUsernameAsync(username);
    if (user == null) return NotFound();

    var following = await _userService.GetFollowingAsync(user.Id);
    return Ok(following.Select(u => new
    {
      userId = u.Id,
      u.DisplayName,
      u.Username,
      u.ProfilePictureUrl
    }));
  }

  [HttpGet("me/stars")]
  public async Task<IActionResult> GetMyStars()
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    var bookmarks = await _userService.GetMyBookmarksAsync(userId);
    return Ok(bookmarks);
  }

  [HttpDelete("{id:int}")]
  [Authorize(Roles = "Admin")]
  public async Task<IActionResult> Delete(int id)
  {
    var deleted = await _userService.DeleteAsync(id);
    return deleted ? NoContent() : NotFound();
  }
}
