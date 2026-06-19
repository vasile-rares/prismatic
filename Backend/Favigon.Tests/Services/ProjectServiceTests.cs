using AutoMapper;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.Interfaces;
using Favigon.Application.Mappings;
using Favigon.Application.Services;
using Favigon.Domain.Entities;
using System.Text.Json;

namespace Favigon.Tests.Services;

public class ProjectServiceTests
{
  private readonly Mock<IProjectRepository> _projectRepo = new();
  private readonly Mock<IProjectAssetStorage> _projectAssetStorage = new();
  private readonly IMapper _mapper;
  private readonly ProjectService _sut;

  public ProjectServiceTests()
  {
    var configExpr = new MapperConfigurationExpression();
    configExpr.AddProfile<MappingProfile>();
    _mapper = new MapperConfiguration(configExpr, NullLoggerFactory.Instance).CreateMapper();
    _sut = new ProjectService(
      _projectRepo.Object,
      _mapper,
      _projectAssetStorage.Object);
  }


  [Fact]
  public async Task GetByUserId_ReturnsProjectsMappedFromRepo()
  {
    var projects = new List<Project>
        {
            new() { Id = 1, UserId = 7, Name = "Alpha", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { Id = 2, UserId = 7, Name = "Beta",  CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow }
        };
    _projectRepo.Setup(r => r.GetByUserIdAsync(7, It.IsAny<bool?>())).ReturnsAsync(projects);
    _projectRepo.Setup(r => r.GetStarredProjectIdsAsync(It.IsAny<int>(), It.IsAny<IEnumerable<int>>())).ReturnsAsync(new HashSet<int>());
    _projectRepo.Setup(r => r.GetLikedProjectIdsAsync(It.IsAny<int>(), It.IsAny<IEnumerable<int>>())).ReturnsAsync(new HashSet<int>());

    var result = await _sut.GetByUserIdAsync(7);

    Assert.Equal(2, result.Count);
    Assert.All(result, p => Assert.Equal(7, p.UserId));
  }

  // GetById

  [Fact]
  public async Task GetById_WhenProjectBelongsToUser_ReturnsMappedResponse()
  {
    var project = new Project { Id = 3, UserId = 5, Name = "MyProj", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
    _projectRepo.Setup(r => r.GetByIdAsync(3, 5)).ReturnsAsync(project);

    var result = await _sut.GetByIdAsync(3, 5);

    Assert.NotNull(result);
    Assert.Equal(3, result.ProjectId);
    Assert.Equal("MyProj", result.Name);
  }

  [Fact]
  public async Task GetById_WhenProjectDoesNotBelongToUser_ReturnsNull()
  {
    _projectRepo.Setup(r => r.GetByIdAsync(3, 99)).ReturnsAsync((Project?)null);

    var result = await _sut.GetByIdAsync(3, 99);

    Assert.Null(result);
  }

  [Fact]
  public async Task RecordView_DelegatesToRepository()
  {
    await _sut.RecordViewAsync(15);

    _projectRepo.Verify(repository => repository.IncrementViewCountAsync(15), Times.Once);
  }

  // Create

  [Fact]
  public async Task Create_TrimsProjectName()
  {
    Project? savedProject = null;
    _projectRepo.Setup(r => r.AddAsync(It.IsAny<Project>()))
        .Callback<Project>(p => savedProject = p)
        .ReturnsAsync((Project p) => p);

    var request = new ProjectCreateRequest { Name = "  My Project  ", IsPublic = false };

    await _sut.CreateAsync(request, userId: 1);

    Assert.NotNull(savedProject);
    Assert.Equal("My Project", savedProject.Name);
  }

  [Fact]
  public async Task Create_SetsUserIdOnProject()
  {
    Project? savedProject = null;
    _projectRepo.Setup(r => r.AddAsync(It.IsAny<Project>()))
        .Callback<Project>(p => savedProject = p)
        .ReturnsAsync((Project p) => p);

    var request = new ProjectCreateRequest { Name = "Test", IsPublic = true };

    await _sut.CreateAsync(request, userId: 42);

    Assert.NotNull(savedProject);
    Assert.Equal(42, savedProject.UserId);
  }

  // Delete

  [Fact]
  public async Task Delete_WhenProjectBelongsToUser_ReturnsTrueAndCallsDelete()
  {
    var project = new Project { Id = 10, UserId = 3, Name = "ToDelete" };
    _projectRepo.Setup(r => r.GetByIdAsync(10, 3)).ReturnsAsync(project);

    var result = await _sut.DeleteAsync(10, 3);

    Assert.True(result);
    _projectAssetStorage.Verify(s => s.DeleteProjectAssetsAsync(3, 10, It.IsAny<CancellationToken>()), Times.Once);
    _projectRepo.Verify(r => r.DeleteAsync(project), Times.Once);
  }

  [Fact]
  public async Task Delete_WhenProjectNotOwnedByUser_ReturnsFalse()
  {
    _projectRepo.Setup(r => r.GetByIdAsync(10, 99)).ReturnsAsync((Project?)null);

    var result = await _sut.DeleteAsync(10, 99);

    Assert.False(result);
    _projectAssetStorage.Verify(s => s.DeleteProjectAssetsAsync(It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    _projectRepo.Verify(r => r.DeleteAsync(It.IsAny<Project>()), Times.Never);
  }


  [Fact]
  public async Task SaveDesign_WithInvalidJson_ThrowsArgumentException()
  {
    var project = new Project { Id = 1, UserId = 5, Name = "P" };
    _projectRepo.Setup(r => r.GetByIdAsync(1, 5)).ReturnsAsync(project);

    var request = new ProjectDesignSaveRequest { DesignJson = "not-valid-json" };

    await Assert.ThrowsAsync<ArgumentException>(() => _sut.SaveDesignAsync(1, 5, request));
  }

  [Fact]
  public async Task SaveDesign_WhenProjectNotFound_ReturnsNull()
  {
    _projectRepo.Setup(r => r.GetByIdAsync(99, 5)).ReturnsAsync((Project?)null);

    var request = new ProjectDesignSaveRequest { DesignJson = "{}" };

    var result = await _sut.SaveDesignAsync(99, 5, request);

    Assert.Null(result);
  }

  [Fact]
  public async Task SaveDesign_WithEmptyJson_StoresEmptyObject()
  {
    var project = new Project { Id = 1, UserId = 5, Name = "P" };
    _projectRepo.Setup(r => r.GetByIdAsync(1, 5)).ReturnsAsync(project);

    var request = new ProjectDesignSaveRequest { DesignJson = " " };

    var result = await _sut.SaveDesignAsync(1, 5, request);

    Assert.NotNull(result);
    Assert.Equal("{}", result.DesignJson);
  }

  [Fact]
  public async Task SaveDesign_WithTransformOptionsArray_NormalizesWithoutJsonNodeParentErrors()
  {
    var project = new Project { Id = 1, UserId = 5, Name = "P" };
    _projectRepo.Setup(r => r.GetByIdAsync(1, 5)).ReturnsAsync(project);

    var request = new ProjectDesignSaveRequest
    {
      DesignJson =
        """
        {
          "id": "canvas-1",
          "type": "Container",
          "props": {
            "favigonCanvasDocument": {
              "version": "2.0",
              "projectId": "proj-1",
              "activePageId": "page-1",
              "pages": [
                {
                  "id": "page-1",
                  "name": "Page 1",
                  "elements": [
                    {
                      "id": "element-1",
                      "type": "rectangle",
                      "x": 12.345,
                      "y": 45.678,
                      "width": 100,
                      "height": 100,
                      "transformOptions": ["scale", "rotate"],
                      "scaleX": 1.234,
                      "scaleY": 1.234,
                      "rotation": 33.335,
                      "visible": true
                    }
                  ]
                }
              ]
            }
          },
          "children": [],
          "variants": {}
        }
        """
    };

    var result = await _sut.SaveDesignAsync(1, 5, request);

    Assert.NotNull(result);

    using var json = JsonDocument.Parse(result.DesignJson);
    var element = json.RootElement
      .GetProperty("props")
      .GetProperty("favigonCanvasDocument")
      .GetProperty("pages")[0]
      .GetProperty("elements")[0];

    Assert.Equal("scale", element.GetProperty("transformOptions")[0].GetString());
    Assert.Equal("rotate", element.GetProperty("transformOptions")[1].GetString());
    Assert.Equal(12.35m, element.GetProperty("x").GetDecimal());
    Assert.Equal(45.68m, element.GetProperty("y").GetDecimal());
    Assert.Equal(1.23m, element.GetProperty("scaleX").GetDecimal());
    Assert.Equal(33.34m, element.GetProperty("rotation").GetDecimal());
  }

  [Fact]
  public async Task SaveDesign_WhenImageAssetIsReplaced_DeletesUnusedPreviousAsset()
  {
    var project = new Project
    {
      Id = 1,
      UserId = 5,
      Name = "P",
      DesignJson = BuildDesignJsonWithAsset("http://localhost:5207/project-assets/5/1/old-image.jpg")
    };
    _projectRepo.Setup(r => r.GetByIdAsync(1, 5)).ReturnsAsync(project);

    var request = new ProjectDesignSaveRequest
    {
      DesignJson = BuildDesignJsonWithAsset("http://localhost:5207/project-assets/5/1/new-image.jpg")
    };

    await _sut.SaveDesignAsync(1, 5, request);

    _projectAssetStorage.Verify(
      s => s.DeleteAssetsAsync(
        5,
        1,
        It.Is<IEnumerable<string>>(paths =>
          paths.Count() == 1 &&
          paths.Single() == "/project-assets/5/1/old-image.jpg"),
        It.IsAny<CancellationToken>()),
      Times.Once);
  }

  [Fact]
  public async Task SaveDesign_WhenImageAssetIsStillReferenced_DoesNotDeleteIt()
  {
    var sharedAsset = "http://localhost:5207/project-assets/5/1/shared-image.jpg";
    var project = new Project
    {
      Id = 1,
      UserId = 5,
      Name = "P",
      DesignJson = BuildDesignJsonWithAssets(sharedAsset, sharedAsset)
    };
    _projectRepo.Setup(r => r.GetByIdAsync(1, 5)).ReturnsAsync(project);

    var request = new ProjectDesignSaveRequest
    {
      DesignJson = BuildDesignJsonWithAsset(sharedAsset)
    };

    await _sut.SaveDesignAsync(1, 5, request);

    _projectAssetStorage.Verify(
      s => s.DeleteAssetsAsync(
        It.IsAny<int>(),
        It.IsAny<int>(),
        It.IsAny<IEnumerable<string>>(),
        It.IsAny<CancellationToken>()),
      Times.Never);
  }

  [Fact]
  public async Task SaveThumbnail_WhenProjectExists_SavesThumbnailAsProjectAsset()
  {
    var project = new Project { Id = 8, UserId = 5, Name = "Thumb Project" };
    _projectRepo.Setup(r => r.GetByIdAsync(8, 5)).ReturnsAsync(project);
    _projectAssetStorage
      .Setup(s => s.SaveThumbnailAsync(5, 8, It.IsAny<Stream>(), "image/jpeg", It.IsAny<CancellationToken>()))
      .ReturnsAsync("/project-assets/5/8/thumbnail.jpg");

    var request = new ProjectImageUploadRequest
    {
      Content = new MemoryStream(new byte[] { 1, 2, 3, 4 }),
      FileName = "thumbnail.jpg",
      ContentType = "image/jpeg",
      Length = 4,
    };

    var saved = await _sut.SaveThumbnailAsync(8, 5, request);

    Assert.True(saved);
    _projectAssetStorage.Verify(
      s => s.SaveThumbnailAsync(5, 8, It.IsAny<Stream>(), "image/jpeg", It.IsAny<CancellationToken>()),
      Times.Once);
    _projectRepo.Verify(r => r.UpdateAsync(It.IsAny<Project>()), Times.Never);
  }

  [Fact]
  public async Task SaveThumbnail_WhenLegacyDatabaseThumbnailExists_ClearsDatabaseValueAfterSavingAsset()
  {
    var project = new Project
    {
      Id = 8,
      UserId = 5,
      Name = "Thumb Project",
      ThumbnailDataUrl = "data:image/jpeg;base64,legacy"
    };
    _projectRepo.Setup(r => r.GetByIdAsync(8, 5)).ReturnsAsync(project);
    _projectAssetStorage
      .Setup(s => s.SaveThumbnailAsync(5, 8, It.IsAny<Stream>(), "image/jpeg", It.IsAny<CancellationToken>()))
      .ReturnsAsync("/project-assets/5/8/thumbnail.jpg");

    var request = new ProjectImageUploadRequest
    {
      Content = new MemoryStream(new byte[] { 1, 2, 3, 4 }),
      FileName = "thumbnail.jpg",
      ContentType = "image/jpeg",
      Length = 4,
    };

    var saved = await _sut.SaveThumbnailAsync(8, 5, request);

    Assert.True(saved);
    Assert.Null(project.ThumbnailDataUrl);
    _projectRepo.Verify(r => r.UpdateAsync(project), Times.Once);
  }

  [Fact]
  public async Task GetById_WhenThumbnailAssetExists_ReturnsAssetUrlInsteadOfDatabaseValue()
  {
    var project = new Project
    {
      Id = 3,
      UserId = 5,
      Name = "MyProj",
      ThumbnailDataUrl = "data:image/jpeg;base64,legacy",
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
    };
    _projectRepo.Setup(r => r.GetByIdAsync(3, 5)).ReturnsAsync(project);
    _projectAssetStorage
      .Setup(s => s.GetThumbnailUrl(5, 3))
      .Returns("/project-assets/5/3/thumbnail.jpg?v=123");

    var result = await _sut.GetByIdAsync(3, 5);

    Assert.NotNull(result);
    Assert.Equal("/project-assets/5/3/thumbnail.jpg?v=123", result!.ThumbnailDataUrl);
  }

  [Fact]
  public async Task SaveThumbnail_WhenContentTypeIsUnsupported_ThrowsArgumentException()
  {
    var project = new Project { Id = 8, UserId = 5, Name = "Thumb Project" };
    _projectRepo.Setup(r => r.GetByIdAsync(8, 5)).ReturnsAsync(project);

    var request = new ProjectImageUploadRequest
    {
      Content = new MemoryStream(new byte[] { 1, 2, 3, 4 }),
      FileName = "thumbnail.svg",
      ContentType = "image/svg+xml",
      Length = 4,
    };

    await Assert.ThrowsAsync<ArgumentException>(() => _sut.SaveThumbnailAsync(8, 5, request));
  }

  // GetDesign

  [Fact]
  public async Task GetDesign_WhenProjectNotFound_ReturnsNull()
  {
    _projectRepo.Setup(r => r.GetByIdAsync(5, 1)).ReturnsAsync((Project?)null);

    var result = await _sut.GetDesignByProjectIdAsync(5, 1);

    Assert.Null(result);
  }

  [Fact]
  public async Task GetDesign_WhenDesignJsonIsEmpty_ReturnsFallback()
  {
    var project = new Project { Id = 2, UserId = 1, Name = "P", DesignJson = "" };
    _projectRepo.Setup(r => r.GetByIdAsync(2, 1)).ReturnsAsync(project);

    var result = await _sut.GetDesignByProjectIdAsync(2, 1);

    Assert.NotNull(result);
    Assert.Equal("{}", result.DesignJson);
  }

  private static string BuildDesignJsonWithAsset(string assetUrl)
  {
    return BuildDesignJsonWithAssets(assetUrl);
  }

  private static string BuildDesignJsonWithAssets(params string[] assetUrls)
  {
    var design = new
    {
      id = "canvas-1",
      type = "Container",
      style = new
      {
        backgroundImage = $"url({assetUrls.FirstOrDefault() ?? string.Empty})"
      },
      props = new
      {
        favigonCanvasDocument = new
        {
          version = "2.0",
          projectId = "proj-1",
          activePageId = "page-1",
          pages = new[]
          {
            new
            {
              id = "page-1",
              name = "Page 1",
              elements = assetUrls.Select((assetUrl, index) => new
              {
                id = $"element-{index + 1}",
                type = "rectangle",
                x = 0,
                y = 0,
                width = 100,
                height = 100,
                visible = true,
                fillMode = "image",
                backgroundImage = assetUrl,
              }).ToArray(),
            }
          }
        }
      },
      children = Array.Empty<object>(),
      variants = new { }
    };

    return JsonSerializer.Serialize(design);
  }
}
