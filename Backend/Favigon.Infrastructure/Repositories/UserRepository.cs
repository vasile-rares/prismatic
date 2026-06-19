using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;
using Favigon.Infrastructure.Context;
using Microsoft.EntityFrameworkCore;

namespace Favigon.Infrastructure.Repositories;

public class UserRepository : IUserRepository
{
  private readonly FavigonDbContext _context;

  public UserRepository(FavigonDbContext context)
  {
    _context = context;
  }

  public async Task<IReadOnlyList<User>> GetAllAsync()
  {
    return await _context.Users.AsNoTracking().ToListAsync();
  }

  public Task<User?> GetByIdAsync(int id)
  {
    return _context.Users.FirstOrDefaultAsync(u => u.Id == id);
  }

  public Task<User?> GetByUsernameAsync(string username)
  {
    return _context.Users.FirstOrDefaultAsync(u => u.Username == username);
  }

  public Task<User?> GetByEmailAsync(string email)
  {
    return _context.Users.FirstOrDefaultAsync(u => u.Email == email);
  }

  public Task<User?> GetByPasswordResetTokenHashAsync(string tokenHash)
  {
    return _context.Users.FirstOrDefaultAsync(u => u.PasswordResetTokenHash == tokenHash);
  }

  public async Task<IReadOnlyList<User>> SearchByQueryAsync(string query, int limit)
  {
    return await _context.Users
        .AsNoTracking()
        .Where(u => EF.Functions.ILike(u.Username, $"%{query}%") ||
                    EF.Functions.ILike(u.DisplayName, $"%{query}%"))
        .Take(limit)
        .ToListAsync();
  }

  public async Task<User> AddAsync(User user)
  {
    _context.Users.Add(user);
    await _context.SaveChangesAsync();
    return user;
  }

  public async Task UpdateAsync(User user)
  {
    _context.Users.Update(user);
    await _context.SaveChangesAsync();
  }

  public async Task DeleteAsync(User user)
  {
    _context.Users.Remove(user);
    await _context.SaveChangesAsync();
  }

  // Follow

  public Task<UserFollow?> GetFollowAsync(int followerId, int followeeId)
    => _context.UserFollows.FirstOrDefaultAsync(f => f.FollowerId == followerId && f.FolloweeId == followeeId);

  public async Task AddFollowAsync(UserFollow follow)
  {
    _context.UserFollows.Add(follow);
    await _context.SaveChangesAsync();
  }

  public async Task DeleteFollowAsync(UserFollow follow)
  {
    _context.UserFollows.Remove(follow);
    await _context.SaveChangesAsync();
  }

  public Task<int> GetFollowerCountAsync(int userId)
    => _context.UserFollows.CountAsync(f => f.FolloweeId == userId);

  public Task<int> GetFollowingCountAsync(int userId)
    => _context.UserFollows.CountAsync(f => f.FollowerId == userId);

  public Task<bool> IsFollowingAsync(int followerId, int followeeId)
    => _context.UserFollows.AnyAsync(f => f.FollowerId == followerId && f.FolloweeId == followeeId);

  public async Task<IReadOnlyList<User>> GetFollowersAsync(int userId)
  {
    return await _context.UserFollows
      .Where(f => f.FolloweeId == userId)
      .OrderByDescending(f => f.CreatedAt)
      .Select(f => f.Follower)
      .ToListAsync();
  }

  public async Task<IReadOnlyList<User>> GetFollowingAsync(int userId)
  {
    return await _context.UserFollows
      .Where(f => f.FollowerId == userId)
      .OrderByDescending(f => f.CreatedAt)
      .Select(f => f.Followee)
      .ToListAsync();
  }

  // Linked accounts

  public Task<LinkedAccount?> GetLinkedAccountByProviderAsync(string provider, string providerUserId)
    => _context.LinkedAccounts
      .Include(a => a.User)
      .FirstOrDefaultAsync(a => a.Provider == provider && a.ProviderUserId == providerUserId);

  public Task<IReadOnlyList<LinkedAccount>> GetLinkedAccountsByUserIdAsync(int userId)
    => _context.LinkedAccounts
      .Where(a => a.UserId == userId)
      .ToListAsync()
      .ContinueWith(t => (IReadOnlyList<LinkedAccount>)t.Result);

  public Task<LinkedAccount?> GetLinkedAccountByUserIdAndProviderAsync(int userId, string provider)
    => _context.LinkedAccounts.FirstOrDefaultAsync(a => a.UserId == userId && a.Provider == provider);

  public async Task<LinkedAccount> AddLinkedAccountAsync(LinkedAccount linkedAccount)
  {
    _context.LinkedAccounts.Add(linkedAccount);
    await _context.SaveChangesAsync();
    return linkedAccount;
  }

  public async Task UpdateLinkedAccountAsync(LinkedAccount linkedAccount)
  {
    _context.LinkedAccounts.Update(linkedAccount);
    await _context.SaveChangesAsync();
  }

  public async Task RemoveLinkedAccountAsync(LinkedAccount linkedAccount)
  {
    _context.LinkedAccounts.Remove(linkedAccount);
    await _context.SaveChangesAsync();
  }
}
