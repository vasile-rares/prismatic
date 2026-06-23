using Favigon.Domain.Entities;

namespace Favigon.Application.Interfaces;


public interface IProjectRepository
{
  Task<IReadOnlyList<Project>> GetByUserIdAsync(int userId, bool? isPublic = null);
  Task<Project?> GetByIdAsync(int id, int userId);
  Task<Project?> GetPublicByIdAsync(int id);
  Task<Project?> GetBySlugAsync(string slug, int userId);
  Task<Project?> GetPublicBySlugAsync(string slug);
  Task<bool> SlugExistsForUserAsync(string slug, int userId, int? excludeProjectId = null);
  Task<Project> AddAsync(Project project);
  Task UpdateAsync(Project project);
  Task DeleteAsync(Project project);
  Task IncrementViewCountAsync(int projectId);
  Task<Project?> GetPublicByIdWithDesignAsync(int id);
  Task<Dictionary<int, string>> GetOwnerUsernamesByProjectIdsAsync(IEnumerable<int> projectIds);

  // Likes
  Task<ProjectLike?> GetLikeAsync(int userId, int projectId);
  Task AddLikeAsync(ProjectLike like);
  Task DeleteLikeAsync(ProjectLike like);
  Task<bool> IsLikedAsync(int userId, int projectId);
  Task<HashSet<int>> GetLikedProjectIdsAsync(int userId, IEnumerable<int> projectIds);

  // Bookmarks
  Task<ProjectBookmark?> GetBookmarkAsync(int userId, int projectId);
  Task AddBookmarkAsync(ProjectBookmark bookmark);
  Task DeleteBookmarkAsync(ProjectBookmark bookmark);
  Task<bool> IsBookmarkedAsync(int userId, int projectId);
  Task<HashSet<int>> GetStarredProjectIdsAsync(int userId, IEnumerable<int> projectIds);
  Task<IReadOnlyList<Project>> GetBookmarkedProjectsAsync(int userId);
}
