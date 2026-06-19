using Favigon.Domain.Entities;

namespace Favigon.Application.Interfaces;


public interface IUserRepository
{
  Task<IReadOnlyList<User>> GetAllAsync();
  Task<User?> GetByIdAsync(int id);
  Task<User?> GetByUsernameAsync(string username);
  Task<User?> GetByEmailAsync(string email);
  Task<User?> GetByPasswordResetTokenHashAsync(string tokenHash);
  Task<IReadOnlyList<User>> SearchByQueryAsync(string query, int limit);
  Task<User> AddAsync(User user);
  Task UpdateAsync(User user);
  Task DeleteAsync(User user);

  // Follow
  Task<UserFollow?> GetFollowAsync(int followerId, int followeeId);
  Task AddFollowAsync(UserFollow follow);
  Task DeleteFollowAsync(UserFollow follow);
  Task<int> GetFollowerCountAsync(int userId);
  Task<int> GetFollowingCountAsync(int userId);
  Task<bool> IsFollowingAsync(int followerId, int followeeId);
  Task<IReadOnlyList<User>> GetFollowersAsync(int userId);
  Task<IReadOnlyList<User>> GetFollowingAsync(int userId);

  // Linked accounts
  Task<LinkedAccount?> GetLinkedAccountByProviderAsync(string provider, string providerUserId);
  Task<IReadOnlyList<LinkedAccount>> GetLinkedAccountsByUserIdAsync(int userId);
  Task<LinkedAccount?> GetLinkedAccountByUserIdAndProviderAsync(int userId, string provider);
  Task<LinkedAccount> AddLinkedAccountAsync(LinkedAccount linkedAccount);
  Task UpdateLinkedAccountAsync(LinkedAccount linkedAccount);
  Task RemoveLinkedAccountAsync(LinkedAccount linkedAccount);
}
