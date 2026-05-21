using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;
using Favigon.Infrastructure.Context;
using Microsoft.EntityFrameworkCore;

namespace Favigon.Infrastructure.Repositories;

public class ExploreRepository : IExploreRepository
{
  private readonly FavigonDbContext _context;

  public ExploreRepository(FavigonDbContext context)
  {
    _context = context;
  }

  public async Task<IReadOnlyList<Project>> GetTrendingProjectsAsync(int limit)
  {
    return await _context.Projects
      .AsSplitQuery()
      .Where(p => p.IsPublic && p.ForkedFromProjectId == null)
      .Include(p => p.User)
      .Include(p => p.Bookmarks)
      .Include(p => p.Likes)
      .OrderByDescending(p => p.Bookmarks.Count)
      .ThenByDescending(p => p.UpdatedAt)
      .Take(limit)
      .ToListAsync();
  }

  public async Task<IReadOnlyList<Project>> GetRecommendedProjectsAsync(int viewerUserId, int limit)
  {
    if (viewerUserId > 0)
    {
      var followedProjects = await _context.UserFollows
        .Where(f => f.FollowerId == viewerUserId)
        .SelectMany(f => f.Followee.Projects.Where(p => p.IsPublic && p.ForkedFromProjectId == null))
        .AsSplitQuery()
        .Include(p => p.User)
        .Include(p => p.Bookmarks)
        .Include(p => p.Likes)
        .Where(p => p.UserId != viewerUserId)
        .OrderByDescending(p => p.UpdatedAt)
        .Take(limit)
        .ToListAsync();

      if (followedProjects.Count > 0)
        return followedProjects;
    }

    // Fallback: recently updated public projects
    return await _context.Projects
      .AsSplitQuery()
      .Where(p => p.IsPublic && p.ForkedFromProjectId == null && (viewerUserId == 0 || p.UserId != viewerUserId))
      .Include(p => p.User)
      .Include(p => p.Bookmarks)
      .Include(p => p.Likes)
      .OrderByDescending(p => p.UpdatedAt)
      .Take(limit)
      .ToListAsync();
  }

  public async Task<IReadOnlyList<User>> GetSuggestedUsersAsync(int viewerUserId, int limit)
  {
    return await _context.Users
      .AsSplitQuery()
      .Where(u => viewerUserId == 0
        ? true
        : u.Id != viewerUserId && !u.Followers.Any(f => f.FollowerId == viewerUserId))
      .Include(u => u.Followers)
      .Include(u => u.Projects)
      .OrderByDescending(u => u.Followers.Count)
      .ThenByDescending(u => u.Projects.Count(p => p.IsPublic))
      .Take(limit)
      .ToListAsync();
  }
}
