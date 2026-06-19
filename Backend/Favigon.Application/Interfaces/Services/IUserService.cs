using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Domain.Entities;

namespace Favigon.Application.Interfaces;

public interface IUserService
{
  Task<IReadOnlyList<User>> GetAllAsync();
  Task<User?> GetByIdAsync(int id);
  Task<User?> GetByUsernameAsync(string username);
  Task<IReadOnlyList<User>> SearchAsync(string query);
  Task<User> CreateAsync(UserCreateRequest request);
  Task<User?> UpdateAsync(int id, UserUpdateRequest request);
  Task<bool> DeleteAsync(int id);
  Task<UserResponse?> GetMyProfileAsync(int userId);
  Task<UserResponse?> UpdateMyProfileAsync(int userId, UserProfileUpdateRequest request);
  Task<UserResponse?> UpdateMyProfileImageAsync(
    int userId,
    UserProfileImageUploadRequest request,
    string publicBaseUrl,
    CancellationToken cancellationToken = default);
  Task<bool> DeleteMyAccountAsync(int userId);
  Task<bool> UnlinkProviderAsync(int userId, string provider);

  // Follow
  Task FollowAsync(int followerId, string followeeUsername);
  Task UnfollowAsync(int followerId, string followeeUsername);
  Task<bool> IsFollowingAsync(int followerId, int followeeId);
  Task<int> GetFollowerCountAsync(int userId);
  Task<int> GetFollowingCountAsync(int userId);
  Task<IReadOnlyList<User>> GetFollowersAsync(int userId);
  Task<IReadOnlyList<User>> GetFollowingAsync(int userId);

  // Bookmarks
  Task<IReadOnlyList<ProjectResponse>> GetMyBookmarksAsync(int userId);
}
