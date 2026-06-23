using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;
using Favigon.Infrastructure.Context;
using Microsoft.EntityFrameworkCore;

namespace Favigon.Infrastructure.Repositories;

public class ProjectRepository : IProjectRepository
{
  private readonly FavigonDbContext _context;

  public ProjectRepository(FavigonDbContext context)
  {
    _context = context;
  }

  public async Task<IReadOnlyList<Project>> GetByUserIdAsync(int userId, bool? isPublic = null)
  {
    return await _context.Projects
        .AsNoTracking()
        .AsSplitQuery()
        .Where(p => p.UserId == userId && (isPublic == null || p.IsPublic == isPublic))
        .Include(p => p.Bookmarks)
        .Include(p => p.Likes)
        .Include(p => p.ForkedFromProject)
            .ThenInclude(fp => fp!.User)
        .ToListAsync();
  }

  public Task<Project?> GetByIdAsync(int id, int userId)
  {
    return _context.Projects
      .Include(p => p.ForkedFromProject)
          .ThenInclude(fp => fp!.User)
      .FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);
  }

  public Task<Project?> GetPublicByIdAsync(int id)
  {
    return _context.Projects.FirstOrDefaultAsync(p => p.Id == id && p.IsPublic);
  }

  public Task<Project?> GetBySlugAsync(string slug, int userId)
  {
    return _context.Projects.FirstOrDefaultAsync(p => p.Slug == slug && p.UserId == userId);
  }

  public Task<Project?> GetPublicBySlugAsync(string slug)
  {
    return _context.Projects.FirstOrDefaultAsync(p => p.Slug == slug && p.IsPublic);
  }

  public Task<bool> SlugExistsForUserAsync(string slug, int userId, int? excludeProjectId = null)
  {
    return _context.Projects.AnyAsync(p =>
      p.Slug == slug && p.UserId == userId && (excludeProjectId == null || p.Id != excludeProjectId));
  }

  public async Task<Project> AddAsync(Project project)
  {
    _context.Projects.Add(project);
    await _context.SaveChangesAsync();
    return project;
  }

  public async Task UpdateAsync(Project project)
  {
    _context.Projects.Update(project);
    await _context.SaveChangesAsync();
  }

  public async Task DeleteAsync(Project project)
  {
    _context.Projects.Remove(project);
    await _context.SaveChangesAsync();
  }

  public Task IncrementViewCountAsync(int projectId)
  {
    return _context.Projects
      .Where(p => p.Id == projectId && p.IsPublic)
      .ExecuteUpdateAsync(s => s.SetProperty(p => p.ViewCount, p => p.ViewCount + 1));
  }

  public Task<Project?> GetPublicByIdWithDesignAsync(int id)
  {
    return _context.Projects
      .AsNoTracking()
      .FirstOrDefaultAsync(p => p.Id == id && p.IsPublic);
  }

  public async Task<Dictionary<int, string>> GetOwnerUsernamesByProjectIdsAsync(IEnumerable<int> projectIds)
  {
    var ids = projectIds.ToList();
    return await _context.Projects
      .AsNoTracking()
      .Where(p => ids.Contains(p.Id))
      .Join(_context.Users,
            p => p.UserId,
            u => u.Id,
            (p, u) => new { p.Id, u.Username })
      .ToDictionaryAsync(x => x.Id, x => x.Username);
  }

  // Likes

  public Task<ProjectLike?> GetLikeAsync(int userId, int projectId)
    => _context.ProjectLikes.FirstOrDefaultAsync(l => l.UserId == userId && l.ProjectId == projectId);

  public async Task AddLikeAsync(ProjectLike like)
  {
    _context.ProjectLikes.Add(like);
    await _context.SaveChangesAsync();
  }

  public async Task DeleteLikeAsync(ProjectLike like)
  {
    _context.ProjectLikes.Remove(like);
    await _context.SaveChangesAsync();
  }

  public Task<bool> IsLikedAsync(int userId, int projectId)
    => _context.ProjectLikes.AnyAsync(l => l.UserId == userId && l.ProjectId == projectId);

  public async Task<HashSet<int>> GetLikedProjectIdsAsync(int userId, IEnumerable<int> projectIds)
  {
    var ids = projectIds.ToList();
    var liked = await _context.ProjectLikes
      .Where(l => l.UserId == userId && ids.Contains(l.ProjectId))
      .Select(l => l.ProjectId)
      .ToListAsync();
    return liked.ToHashSet();
  }

  // Bookmarks

  public Task<ProjectBookmark?> GetBookmarkAsync(int userId, int projectId)
    => _context.ProjectBookmarks.FirstOrDefaultAsync(b => b.UserId == userId && b.ProjectId == projectId);

  public async Task AddBookmarkAsync(ProjectBookmark bookmark)
  {
    _context.ProjectBookmarks.Add(bookmark);
    await _context.SaveChangesAsync();
  }

  public async Task DeleteBookmarkAsync(ProjectBookmark bookmark)
  {
    _context.ProjectBookmarks.Remove(bookmark);
    await _context.SaveChangesAsync();
  }

  public Task<bool> IsBookmarkedAsync(int userId, int projectId)
    => _context.ProjectBookmarks.AnyAsync(b => b.UserId == userId && b.ProjectId == projectId);

  public async Task<HashSet<int>> GetStarredProjectIdsAsync(int userId, IEnumerable<int> projectIds)
  {
    var ids = projectIds.ToList();
    var starred = await _context.ProjectBookmarks
      .Where(b => b.UserId == userId && ids.Contains(b.ProjectId))
      .Select(b => b.ProjectId)
      .ToListAsync();
    return starred.ToHashSet();
  }

  public async Task<IReadOnlyList<Project>> GetBookmarkedProjectsAsync(int userId)
  {
    return await _context.ProjectBookmarks
      .AsNoTracking()
      .AsSplitQuery()
      .Where(b => b.UserId == userId)
      .OrderByDescending(b => b.CreatedAt)
      .Include(b => b.Project).ThenInclude(p => p.Bookmarks)
      .Include(b => b.Project).ThenInclude(p => p.Likes)
      .Select(b => b.Project)
      .ToListAsync();
  }
}
