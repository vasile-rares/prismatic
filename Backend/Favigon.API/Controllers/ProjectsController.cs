using Favigon.API.Extensions;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;
using Microsoft.AspNetCore.Http.Extensions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Favigon.API.Controllers;

[ApiController]
[Route("api/projects")]
[Authorize]
public class ProjectsController : ControllerBase
{
  private readonly IProjectService _projectService;

  public ProjectsController(IProjectService projectService)
  {
    _projectService = projectService;
  }

  [HttpGet]
  public async Task<IActionResult> GetAll()
  {
    if (!User.TryGetUserId(out var userId))
    {
      return Unauthorized();
    }

    var projects = await _projectService.GetByUserIdAsync(userId);
    return Ok(projects);
  }

  [HttpGet("{id:int}")]
  public async Task<IActionResult> GetById(int id)
  {
    if (!User.TryGetUserId(out var userId))
    {
      return Unauthorized();
    }

    var project = await _projectService.GetByIdAsync(id, userId);
    if (project == null)
    {
      return NotFound();
    }

    return Ok(project);
  }

  [HttpGet("by-slug/{slug}")]
  public async Task<IActionResult> GetBySlug(string slug)
  {
    if (!User.TryGetUserId(out var userId))
    {
      return Unauthorized();
    }

    var project = await _projectService.GetBySlugAsync(slug, userId);
    if (project == null)
    {
      return NotFound();
    }

    return Ok(project);
  }

  [HttpPost]
  public async Task<IActionResult> Create([FromBody] ProjectCreateRequest request)
  {
    if (!User.TryGetUserId(out var userId))
    {
      return Unauthorized();
    }

    var created = await _projectService.CreateAsync(request, userId);
    return CreatedAtAction(nameof(GetById), new { id = created.ProjectId }, created);
  }

  [HttpPut("{id:int}")]
  public async Task<IActionResult> Update(int id, [FromBody] ProjectUpdateRequest request)
  {
    if (!User.TryGetUserId(out var userId))
    {
      return Unauthorized();
    }

    var updated = await _projectService.UpdateAsync(id, request, userId);
    if (updated == null)
    {
      return NotFound();
    }

    return Ok(updated);
  }

  [HttpDelete("{id:int}")]
  public async Task<IActionResult> Delete(int id)
  {
    if (!User.TryGetUserId(out var userId))
    {
      return Unauthorized();
    }

    var deleted = await _projectService.DeleteAsync(id, userId, HttpContext.RequestAborted);
    return deleted ? NoContent() : NotFound();
  }

  [HttpPost("{id:int}/assets/images")]
  [RequestSizeLimit(10 * 1024 * 1024)]
  public async Task<IActionResult> UploadImage(int id, IFormFile? file)
  {
    if (!User.TryGetUserId(out var userId))
    {
      return Unauthorized();
    }

    if (file == null)
    {
      return BadRequest("Image file is required.");
    }

    await using var stream = file.OpenReadStream();
    var assetPath = await _projectService.UploadImageAsync(
      id,
      userId,
      new ProjectImageUploadRequest
      {
        Content = stream,
        FileName = file.FileName,
        ContentType = file.ContentType,
        Length = file.Length,
      },
      HttpContext.RequestAborted);

    if (assetPath == null)
    {
      return NotFound();
    }

    var assetUrl = UriHelper.BuildAbsolute(
      Request.Scheme,
      Request.Host,
      Request.PathBase,
      assetPath);

    return Ok(new ProjectImageUploadResponse
    {
      AssetUrl = assetUrl
    });
  }

  [HttpGet("{id:int}/design")]
  public async Task<IActionResult> GetDesign(int id)
  {
    if (!User.TryGetUserId(out var userId))
    {
      return Unauthorized();
    }

    var design = await _projectService.GetDesignByProjectIdAsync(id, userId);
    if (design == null)
    {
      return NotFound();
    }

    return Ok(design);
  }

  [HttpPut("{id:int}/design")]
  [RequestSizeLimit(5 * 1024 * 1024)]
  public async Task<IActionResult> SaveDesign(int id, [FromBody] ProjectDesignSaveRequest request)
  {
    if (!User.TryGetUserId(out var userId))
    {
      return Unauthorized();
    }

    var saved = await _projectService.SaveDesignAsync(id, userId, request);
    if (saved == null)
    {
      return NotFound();
    }

    return Ok(saved);
  }

  [HttpPost("{id:int}/flush")]
  [Consumes("multipart/form-data")]
  [RequestSizeLimit(15 * 1024 * 1024)]
  public async Task<IActionResult> FlushProjectState(
    int id,
    [FromForm] string? designJson,
    IFormFile? thumbnailFile)
  {
    if (!User.TryGetUserId(out var userId))
    {
      return Unauthorized();
    }

    if (string.IsNullOrWhiteSpace(designJson) && thumbnailFile == null)
    {
      return BadRequest("Design JSON or thumbnail file is required.");
    }

    if (!string.IsNullOrWhiteSpace(designJson))
    {
      var savedDesign = await _projectService.SaveDesignAsync(
        id,
        userId,
        new ProjectDesignSaveRequest
        {
          DesignJson = designJson
        });

      if (savedDesign == null)
      {
        return NotFound();
      }
    }

    if (thumbnailFile != null)
    {
      await using var stream = thumbnailFile.OpenReadStream();
      var savedThumbnail = await _projectService.SaveThumbnailAsync(
        id,
        userId,
        new ProjectImageUploadRequest
        {
          Content = stream,
          FileName = thumbnailFile.FileName,
          ContentType = thumbnailFile.ContentType,
          Length = thumbnailFile.Length,
        },
        HttpContext.RequestAborted);

      if (!savedThumbnail)
      {
        return NotFound();
      }
    }

    return NoContent();
  }

  [HttpPut("{id:int}/thumbnail")]
  [Consumes("multipart/form-data")]
  [RequestSizeLimit(5 * 1024 * 1024)]
  public async Task<IActionResult> SaveThumbnail(int id, IFormFile? file)
  {
    if (!User.TryGetUserId(out var userId))
    {
      return Unauthorized();
    }

    if (file == null)
    {
      return BadRequest("Thumbnail file is required.");
    }

    await using var stream = file.OpenReadStream();
    var saved = await _projectService.SaveThumbnailAsync(
      id,
      userId,
      new ProjectImageUploadRequest
      {
        Content = stream,
        FileName = file.FileName,
        ContentType = file.ContentType,
        Length = file.Length,
      },
      HttpContext.RequestAborted);

    return saved ? NoContent() : NotFound();
  }

  [HttpGet("user/{userId:int}")]
  public async Task<IActionResult> GetPublicByUserId(int userId)
  {
    int? viewerUserId = User.TryGetUserId(out var vid) ? vid : null;
    var projects = await _projectService.GetByUserIdAsync(userId, isPublic: true, viewerUserId: viewerUserId);
    return Ok(projects);
  }

  [HttpPost("{id:int}/star")]
  public async Task<IActionResult> Star(int id)
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    await _projectService.BookmarkAsync(userId, id);
    return Ok();
  }

  [HttpDelete("{id:int}/star")]
  public async Task<IActionResult> Unstar(int id)
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    await _projectService.UnbookmarkAsync(userId, id);
    return NoContent();
  }

  [AllowAnonymous]
  [HttpPost("{id:int}/view")]
  public async Task<IActionResult> RecordView(int id)
  {
    await _projectService.RecordViewAsync(id);
    return NoContent();
  }

  [HttpPost("{id:int}/like")]
  public async Task<IActionResult> Like(int id)
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    await _projectService.LikeAsync(userId, id);
    return Ok();
  }

  [HttpDelete("{id:int}/like")]
  public async Task<IActionResult> Unlike(int id)
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    await _projectService.UnlikeAsync(userId, id);
    return NoContent();
  }

  [HttpPost("{id:int}/fork")]
  public async Task<IActionResult> Fork(int id)
  {
    if (!User.TryGetUserId(out var userId)) return Unauthorized();

    var forked = await _projectService.ForkAsync(id, userId);
    if (forked == null) return NotFound();

    return CreatedAtAction(nameof(GetById), new { id = forked.ProjectId }, forked);
  }

}
