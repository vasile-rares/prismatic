using AutoMapper;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Requests.Assets;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Exceptions;
using Favigon.Application.Interfaces;
using Favigon.Application.Services.Internal;
using Favigon.Domain.Entities;

namespace Favigon.Application.Services;

public class ProjectService : IProjectService
{
  private readonly IProjectRepository _projectRepository;
  private readonly IMapper _mapper;
  private readonly IProjectAssetStorage _projectAssetStorage;

  public ProjectService(
    IProjectRepository projectRepository,
    IMapper mapper,
    IProjectAssetStorage projectAssetStorage)
  {
    _projectRepository = projectRepository;
    _mapper = mapper;
    _projectAssetStorage = projectAssetStorage;
  }

  public async Task<IReadOnlyList<ProjectResponse>> GetByUserIdAsync(int userId, bool? isPublic = null, int? viewerUserId = null)
  {
    var projects = await _projectRepository.GetByUserIdAsync(userId, isPublic);
    var projectIds = projects.Select(p => p.Id).ToList();

    var contextUserId = viewerUserId ?? userId;
    var starredIds = await _projectRepository.GetStarredProjectIdsAsync(contextUserId, projectIds);
    var likedIds = await _projectRepository.GetLikedProjectIdsAsync(contextUserId, projectIds);

    var forkedFromIds = projects
      .Where(p => p.ForkedFromProjectId.HasValue)
      .Select(p => p.ForkedFromProjectId!.Value)
      .Distinct()
      .ToList();
    var forkedOwners = forkedFromIds.Count > 0
      ? await _projectRepository.GetOwnerUsernamesByProjectIdsAsync(forkedFromIds)
      : new Dictionary<int, string>();

    return projects.Select(p =>
    {
      var r = MapProjectResponse(p);
      r.IsStarredByCurrentUser = starredIds.Contains(p.Id);
      r.IsLikedByCurrentUser = likedIds.Contains(p.Id);
      if (p.ForkedFromProjectId.HasValue && forkedOwners.TryGetValue(p.ForkedFromProjectId.Value, out var username))
        r.ForkedFromOwnerUsername = username;
      return r;
    }).ToList();
  }

  public async Task<ProjectResponse?> GetByIdAsync(int id, int userId)
  {
    var project = await _projectRepository.GetByIdAsync(id, userId);
    return project == null ? null : MapProjectResponse(project);
  }

  public async Task<ProjectResponse?> GetBySlugAsync(string slug, int userId)
  {
    var project = await _projectRepository.GetBySlugAsync(slug, userId)
                  ?? await _projectRepository.GetPublicBySlugAsync(slug);
    if (project == null) return null;

    var response = MapProjectResponse(project);
    response.IsStarredByCurrentUser = await _projectRepository.IsBookmarkedAsync(userId, project.Id);
    response.IsLikedByCurrentUser = await _projectRepository.IsLikedAsync(userId, project.Id);
    return response;
  }

  public Task RecordViewAsync(int projectId)
  {
    return _projectRepository.IncrementViewCountAsync(projectId);
  }

  public async Task<ProjectResponse> CreateAsync(ProjectCreateRequest request, int userId)
  {
    request.Name = request.Name.Trim();

    var project = _mapper.Map<Project>(request);
    project.UserId = userId;
    project.Slug = await GenerateUniqueSlugAsync(request.Name, userId);

    var created = await _projectRepository.AddAsync(project);
    return MapProjectResponse(created);
  }

  public async Task<ProjectResponse?> UpdateAsync(int id, ProjectUpdateRequest request, int userId)
  {
    var existing = await _projectRepository.GetByIdAsync(id, userId);
    if (existing == null) return null;

    request.Name = request.Name.Trim();
    var nameChanged = !string.Equals(existing.Name, request.Name, StringComparison.Ordinal);
    _mapper.Map(request, existing);

    if (nameChanged)
    {
      existing.Slug = await GenerateUniqueSlugAsync(request.Name, userId, excludeProjectId: id);
    }

    await _projectRepository.UpdateAsync(existing);
    return MapProjectResponse(existing);
  }

  public async Task<bool> DeleteAsync(int id, int userId, CancellationToken cancellationToken = default)
  {
    var existing = await _projectRepository.GetByIdAsync(id, userId);
    if (existing == null) return false;

    await _projectAssetStorage.DeleteProjectAssetsAsync(existing.UserId, existing.Id, cancellationToken);
    await _projectRepository.DeleteAsync(existing);
    return true;
  }

  public async Task<ProjectDesignResponse?> GetDesignByProjectIdAsync(int projectId, int userId)
  {
    var project = await _projectRepository.GetByIdAsync(projectId, userId)
                  ?? await _projectRepository.GetPublicByIdAsync(projectId);
    if (project == null) return null;

    return new ProjectDesignResponse
    {
      ProjectId = project.Id,
      DesignJson = string.IsNullOrWhiteSpace(project.DesignJson) ? "{}" : project.DesignJson,
      UpdatedAt = project.UpdatedAt
    };
  }

  public async Task<ProjectDesignResponse?> SaveDesignAsync(int projectId, int userId, ProjectDesignSaveRequest request)
  {
    var project = await _projectRepository.GetByIdAsync(projectId, userId);
    if (project == null) return null;

    var previousAssetPaths = ProjectDesignJsonHelper.CollectManagedProjectAssetPaths(
      project.DesignJson,
      project.UserId,
      project.Id);
    var normalizedDesignJson = ProjectDesignJsonHelper.NormalizeAndValidate(request.DesignJson);
    var currentAssetPaths = ProjectDesignJsonHelper.CollectManagedProjectAssetPaths(
      normalizedDesignJson,
      project.UserId,
      project.Id);

    project.DesignJson = normalizedDesignJson;
    await _projectRepository.UpdateAsync(project);

    var orphanedAssetPaths = previousAssetPaths
      .Except(currentAssetPaths, StringComparer.OrdinalIgnoreCase)
      .ToArray();
    if (orphanedAssetPaths.Length > 0)
    {
      await _projectAssetStorage.DeleteAssetsAsync(project.UserId, project.Id, orphanedAssetPaths);
    }

    return new ProjectDesignResponse
    {
      ProjectId = project.Id,
      DesignJson = string.IsNullOrWhiteSpace(project.DesignJson) ? "{}" : project.DesignJson,
      UpdatedAt = project.UpdatedAt
    };
  }

  public async Task<bool> SaveThumbnailAsync(
    int projectId,
    int userId,
    ProjectImageUploadRequest request,
    CancellationToken cancellationToken = default)
  {
    var project = await _projectRepository.GetByIdAsync(projectId, userId);
    if (project == null) return false;

    ProjectAssetUploadValidation.ValidateThumbnail(request);

    await _projectAssetStorage.SaveThumbnailAsync(
      project.UserId,
      project.Id,
      request.Content,
      request.ContentType,
      cancellationToken);

    if (!string.IsNullOrWhiteSpace(project.ThumbnailDataUrl))
    {
      project.ThumbnailDataUrl = null;
      await _projectRepository.UpdateAsync(project);
    }

    return true;
  }

  private ProjectResponse MapProjectResponse(Project project)
  {
    var response = _mapper.Map<ProjectResponse>(project);
    response.ThumbnailDataUrl =
      _projectAssetStorage.GetThumbnailUrl(project.UserId, project.Id) ??
      project.ThumbnailDataUrl;
    response.ForkedFromOwnerUsername = project.ForkedFromProject?.User?.Username;
    return response;
  }

  public async Task<ProjectResponse?> ForkAsync(int sourceProjectId, int userId)
  {
    var source = await _projectRepository.GetPublicByIdWithDesignAsync(sourceProjectId);
    if (source == null) return null;

    var forkedName = $"{source.Name} (Fork)";
    var fork = new Project
    {
      UserId = userId,
      Name = forkedName,
      Slug = await GenerateUniqueSlugAsync(forkedName, userId),
      DesignJson = source.DesignJson,
      IsPublic = false,
      ForkedFromProjectId = source.Id,
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
    };

    var created = await _projectRepository.AddAsync(fork);
    return MapProjectResponse(created);
  }

  private async Task<string> GenerateUniqueSlugAsync(string name, int userId, int? excludeProjectId = null)
  {
    var baseSlug = BuildSlug(name);
    var candidate = baseSlug;
    var suffix = 2;

    while (true)
    {
      var exists = await _projectRepository.SlugExistsForUserAsync(candidate, userId, excludeProjectId);
      if (!exists) return candidate;
      candidate = $"{baseSlug}-{suffix++}";
    }
  }

  private static string BuildSlug(string name)
  {
    var slug = name.Trim().ToLowerInvariant();
    slug = System.Text.RegularExpressions.Regex.Replace(slug, @"[^a-z0-9\s-]", "");
    slug = System.Text.RegularExpressions.Regex.Replace(slug, @"\s+", "-");
    slug = System.Text.RegularExpressions.Regex.Replace(slug, @"-{2,}", "-");
    slug = slug.Trim('-');
    if (string.IsNullOrEmpty(slug)) slug = "project";
    return slug.Length > 100 ? slug[..100] : slug;
  }

  // Likes

  public async Task LikeAsync(int userId, int projectId)
  {
    var project = await _projectRepository.GetPublicByIdAsync(projectId);
    if (project == null)
    {
      project = await _projectRepository.GetByIdAsync(projectId, userId);
    }

    if (project == null)
      throw new NotFoundException("Project not found or not accessible.");

    var existing = await _projectRepository.GetLikeAsync(userId, projectId);
    if (existing != null)
      throw new ConflictException("Project is already liked.");

    await _projectRepository.AddLikeAsync(new ProjectLike
    {
      UserId = userId,
      ProjectId = projectId,
      CreatedAt = DateTime.UtcNow
    });
  }

  public async Task UnlikeAsync(int userId, int projectId)
  {
    var like = await _projectRepository.GetLikeAsync(userId, projectId)
        ?? throw new BusinessRuleException("Project is not liked.");

    await _projectRepository.DeleteLikeAsync(like);
  }

  // Bookmarks

  public async Task BookmarkAsync(int userId, int projectId)
  {
    var project = await _projectRepository.GetPublicByIdAsync(projectId);
    if (project == null)
    {
      project = await _projectRepository.GetByIdAsync(projectId, userId);
    }

    if (project == null)
      throw new NotFoundException("Project not found or not accessible.");

    var existing = await _projectRepository.GetBookmarkAsync(userId, projectId);
    if (existing != null)
      throw new ConflictException("Project is already starred.");

    await _projectRepository.AddBookmarkAsync(new ProjectBookmark
    {
      UserId = userId,
      ProjectId = projectId,
      CreatedAt = DateTime.UtcNow
    });
  }

  public async Task UnbookmarkAsync(int userId, int projectId)
  {
    var bookmark = await _projectRepository.GetBookmarkAsync(userId, projectId)
      ?? throw new BusinessRuleException("Project is not starred.");

    await _projectRepository.DeleteBookmarkAsync(bookmark);
  }

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

  // Assets

  public async Task<string?> UploadImageAsync(
    int projectId,
    int userId,
    ProjectImageUploadRequest request,
    CancellationToken cancellationToken = default)
  {
    var project = await _projectRepository.GetByIdAsync(projectId, userId);
    if (project == null)
    {
      return null;
    }

    ProjectAssetUploadValidation.ValidateImage(request);

    return await _projectAssetStorage.SaveImageAsync(
      userId,
      projectId,
      request.Content,
      request.FileName,
      request.ContentType,
      cancellationToken);
  }

}
