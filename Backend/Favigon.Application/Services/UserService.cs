using AutoMapper;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Requests.Assets;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Exceptions;
using Favigon.Application.Interfaces;
using Favigon.Application.Validators;
using Favigon.Domain.Entities;

namespace Favigon.Application.Services;

public class UserService : IUserService
{
  private const long MaxProfileImageSizeBytes = 10 * 1024 * 1024;

  private static readonly HashSet<string> AllowedProfileImageContentTypes = new(StringComparer.OrdinalIgnoreCase)
  {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/avif"
  };

  private readonly IUserRepository _userRepository;
  private readonly IUserProfileImageStorage _userProfileImageStorage;
  private readonly IProjectRepository _projectRepository;
  private readonly IProjectAssetStorage _projectAssetStorage;
  private readonly IMapper _mapper;
  private readonly IAuditLogger _audit;

  public UserService(
    IUserRepository userRepository,
    IUserProfileImageStorage userProfileImageStorage,
    IProjectRepository projectRepository,
    IProjectAssetStorage projectAssetStorage,
    IMapper mapper,
    IAuditLogger audit)
  {
    _userRepository = userRepository;
    _userProfileImageStorage = userProfileImageStorage;
    _projectRepository = projectRepository;
    _projectAssetStorage = projectAssetStorage;
    _mapper = mapper;
    _audit = audit;
  }

  public Task<IReadOnlyList<User>> GetAllAsync()
  {
    return _userRepository.GetAllAsync();
  }

  public Task<User?> GetByIdAsync(int id)
  {
    return _userRepository.GetByIdAsync(id);
  }

  public Task<User?> GetByUsernameAsync(string username)
  {
    return _userRepository.GetByUsernameAsync(username);
  }

  public Task<IReadOnlyList<User>> SearchAsync(string query)
  {
    var sanitized = query.Trim();
    return _userRepository.SearchByQueryAsync(sanitized, 10);
  }

  public async Task<User> CreateAsync(UserCreateRequest request)
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
      Role = string.IsNullOrWhiteSpace(request.Role) ? "User" : request.Role
    };

    return await _userRepository.AddAsync(user);
  }

  public async Task<User?> UpdateAsync(int id, UserUpdateRequest request)
  {
    var existing = await _userRepository.GetByIdAsync(id);
    if (existing == null)
    {
      return null;
    }

    request.Username = request.Username.Trim().ToLowerInvariant();
    request.DisplayName = request.DisplayName.Trim();
    request.Email = request.Email.Trim();

    var normalizedUsername = request.Username;
    if (!string.Equals(existing.Username, normalizedUsername, StringComparison.Ordinal))
    {
      var byUsername = await _userRepository.GetByUsernameAsync(normalizedUsername);
      if (byUsername != null && byUsername.Id != id)
      {
        throw new ConflictException("Username already exists.");
      }
    }

    if (!string.Equals(existing.Email, request.Email, StringComparison.OrdinalIgnoreCase))
    {
      var byEmail = await _userRepository.GetByEmailAsync(request.Email);
      if (byEmail != null && byEmail.Id != id)
      {
        throw new ConflictException("Email already exists.");
      }
    }

    existing.DisplayName = request.DisplayName;
    existing.Username = normalizedUsername;
    existing.Email = request.Email;
    if (!string.IsNullOrWhiteSpace(request.Password))
    {
      existing.HasPassword = true;
      existing.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
    }
    existing.ProfilePictureUrl = request.ProfilePictureUrl;
    existing.Role = string.IsNullOrWhiteSpace(request.Role) ? existing.Role : request.Role;

    await _userRepository.UpdateAsync(existing);
    return existing;
  }

  public async Task<bool> DeleteAsync(int id)
  {
    var existing = await _userRepository.GetByIdAsync(id);
    if (existing == null)
    {
      return false;
    }

    await _userRepository.DeleteAsync(existing);
    return true;
  }

  public async Task<UserResponse?> GetMyProfileAsync(int userId)
  {
    var user = await _userRepository.GetByIdAsync(userId);
    if (user == null) return null;

    return await BuildMyProfileResponseAsync(user);
  }

  public async Task<UserResponse?> UpdateMyProfileAsync(int userId, UserProfileUpdateRequest request)
  {
    var user = await _userRepository.GetByIdAsync(userId);
    if (user == null) return null;

    request.Username = request.Username.Trim().ToLowerInvariant();
    request.DisplayName = request.DisplayName.Trim();

    if (!string.Equals(user.Username, request.Username, StringComparison.Ordinal))
    {
      var byUsername = await _userRepository.GetByUsernameAsync(request.Username);
      if (byUsername != null && byUsername.Id != userId)
        throw new ConflictException("Username already exists.");
    }

    user.DisplayName = request.DisplayName;
    user.Username = request.Username;
    user.Bio = string.IsNullOrWhiteSpace(request.Bio) ? null : request.Bio.Trim();

    await _userRepository.UpdateAsync(user);

    return await BuildMyProfileResponseAsync(user);
  }

  public async Task<UserResponse?> UpdateMyProfileImageAsync(
    int userId,
    UserProfileImageUploadRequest request,
    string publicBaseUrl,
    CancellationToken cancellationToken = default)
  {
    var user = await _userRepository.GetByIdAsync(userId);
    if (user == null) return null;

    ValidateProfileImageUploadRequest(request);

    var previousProfilePictureUrl = user.ProfilePictureUrl;
    var assetPath = await _userProfileImageStorage.SaveImageAsync(
      userId,
      request.Content,
      request.FileName,
      request.ContentType,
      cancellationToken);
    var assetUrl = BuildAbsoluteAssetUrl(publicBaseUrl, assetPath);

    try
    {
      user.ProfilePictureUrl = assetUrl;
      await _userRepository.UpdateAsync(user);
    }
    catch
    {
      await _userProfileImageStorage.DeleteImageAsync(userId, assetPath, CancellationToken.None);
      throw;
    }

    if (!string.IsNullOrWhiteSpace(previousProfilePictureUrl)
      && !string.Equals(previousProfilePictureUrl, assetUrl, StringComparison.OrdinalIgnoreCase))
    {
      await _userProfileImageStorage.DeleteImageAsync(
        userId,
        previousProfilePictureUrl,
        CancellationToken.None);
    }

    return await BuildMyProfileResponseAsync(user);
  }

  public async Task<bool> DeleteMyAccountAsync(int userId)
  {
    var user = await _userRepository.GetByIdAsync(userId);
    if (user == null) return false;

    var projects = await _projectRepository.GetByUserIdAsync(userId);
    var deleteTasks = projects.Select(p =>
      _projectAssetStorage.DeleteProjectAssetsAsync(userId, p.Id, CancellationToken.None));
    await Task.WhenAll(deleteTasks);

    await _userRepository.DeleteAsync(user);
    await _userProfileImageStorage.DeleteUserAssetsAsync(userId, CancellationToken.None);
    _audit.AccountDeleted(userId);
    return true;
  }

  public async Task<bool> UnlinkProviderAsync(int userId, string provider)
  {
    var link = await _userRepository.GetLinkedAccountByUserIdAndProviderAsync(userId, provider);
    if (link == null) return false;

    await _userRepository.RemoveLinkedAccountAsync(link);
    _audit.OAuthProviderUnlinked(userId, provider);
    return true;
  }

  private async Task<UserResponse> BuildMyProfileResponseAsync(User user)
  {
    var linkedAccounts = await _userRepository.GetLinkedAccountsByUserIdAsync(user.Id);
    var response = _mapper.Map<UserResponse>(user);
    response.LinkedAccounts = _mapper.Map<List<LinkedAccountResponse>>(linkedAccounts);
    return response;
  }

  private static void ValidateProfileImageUploadRequest(UserProfileImageUploadRequest request)
  {
    ImageUploadValidator.Validate(new ImageUploadRequest(
      Content: request.Content,
      FileName: request.FileName,
      ContentType: request.ContentType,
      Length: request.Length,
      MaxBytes: MaxProfileImageSizeBytes,
      AllowedTypes: AllowedProfileImageContentTypes,
      AssetLabel: "Image file",
      UnsupportedFormatMessage: "Only PNG, JPEG, WebP, GIF, and AVIF images are supported."));
  }

  private static string BuildAbsoluteAssetUrl(string publicBaseUrl, string assetPath)
  {
    if (string.IsNullOrWhiteSpace(publicBaseUrl))
    {
      throw new ArgumentException("Public base URL is required.", nameof(publicBaseUrl));
    }

    if (string.IsNullOrWhiteSpace(assetPath))
    {
      throw new ArgumentException("Profile image path is required.", nameof(assetPath));
    }

    var normalizedBaseUrl = publicBaseUrl.TrimEnd('/');
    var normalizedAssetPath = assetPath.StartsWith('/') ? assetPath : $"/{assetPath}";
    return $"{normalizedBaseUrl}{normalizedAssetPath}";
  }

  // Follow

  public async Task FollowAsync(int followerId, string followeeUsername)
  {
    var followee = await _userRepository.GetByUsernameAsync(followeeUsername)
      ?? throw new NotFoundException("User not found.");

    if (followee.Id == followerId)
      throw new BusinessRuleException("You cannot follow yourself.");

    var existing = await _userRepository.GetFollowAsync(followerId, followee.Id);
    if (existing != null)
      throw new ConflictException("Already following this user.");

    await _userRepository.AddFollowAsync(new UserFollow
    {
      FollowerId = followerId,
      FolloweeId = followee.Id,
      CreatedAt = DateTime.UtcNow
    });
  }

  public async Task UnfollowAsync(int followerId, string followeeUsername)
  {
    var followee = await _userRepository.GetByUsernameAsync(followeeUsername)
      ?? throw new NotFoundException("User not found.");

    var follow = await _userRepository.GetFollowAsync(followerId, followee.Id)
      ?? throw new BusinessRuleException("Not following this user.");

    await _userRepository.DeleteFollowAsync(follow);
  }

  public Task<bool> IsFollowingAsync(int followerId, int followeeId)
    => _userRepository.IsFollowingAsync(followerId, followeeId);

  public Task<int> GetFollowerCountAsync(int userId)
    => _userRepository.GetFollowerCountAsync(userId);

  public Task<int> GetFollowingCountAsync(int userId)
    => _userRepository.GetFollowingCountAsync(userId);

  public Task<IReadOnlyList<User>> GetFollowersAsync(int userId)
    => _userRepository.GetFollowersAsync(userId);

  public Task<IReadOnlyList<User>> GetFollowingAsync(int userId)
    => _userRepository.GetFollowingAsync(userId);

  // Bookmarks

  public async Task<IReadOnlyList<ProjectResponse>> GetMyBookmarksAsync(int userId)
  {
    var projects = await _projectRepository.GetBookmarkedProjectsAsync(userId);
    var projectIds = projects.Select(p => p.Id).ToList();
    var likedIds = await _projectRepository.GetLikedProjectIdsAsync(userId, projectIds);

    var forkedFromIds = projects
      .Where(p => p.ForkedFromProjectId.HasValue)
      .Select(p => p.ForkedFromProjectId!.Value)
      .Distinct()
      .ToList();
    var forkedOwners = forkedFromIds.Count > 0
      ? await _projectRepository.GetOwnerUsernamesByProjectIdsAsync(forkedFromIds)
      : new Dictionary<int, string>();

    var responses = new List<ProjectResponse>(projects.Count);
    foreach (var project in projects)
    {
      var response = _mapper.Map<ProjectResponse>(project);
      response.ThumbnailDataUrl =
        _projectAssetStorage.GetThumbnailUrl(project.UserId, project.Id) ??
        project.ThumbnailDataUrl;
      response.IsStarredByCurrentUser = true;
      response.IsLikedByCurrentUser = likedIds.Contains(project.Id);
      if (project.ForkedFromProjectId.HasValue && forkedOwners.TryGetValue(project.ForkedFromProjectId.Value, out var username))
        response.ForkedFromOwnerUsername = username;
      responses.Add(response);
    }

    return responses;
  }

}
