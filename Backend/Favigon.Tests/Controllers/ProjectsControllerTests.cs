using System.Security.Claims;
using Favigon.API.Controllers;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;

namespace Favigon.Tests.Controllers;

public class ProjectsControllerTests
{
  private readonly Mock<IProjectService> _projectService = new();
  private readonly ProjectsController _controller;

  public ProjectsControllerTests()
  {
    _controller = new ProjectsController(_projectService.Object)
    {
      ControllerContext = CreateControllerContext(userId: 1)
    };
  }

  private static ControllerContext CreateControllerContext(int userId)
  {
    var claims = new[] { new Claim(ClaimTypes.NameIdentifier, userId.ToString()) };
    var identity = new ClaimsIdentity(claims, "Test");
    return new ControllerContext
    {
      HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) }
    };
  }

  // GetAll

  [Fact]
  public async Task GetAll_ReturnsOkWithProjects()
  {
    var projects = new List<ProjectResponse>
    {
      new() { ProjectId = 1, UserId = 1, Name = "Alpha" },
      new() { ProjectId = 2, UserId = 1, Name = "Beta" },
    };
    _projectService.Setup(s => s.GetByUserIdAsync(1, null, null)).ReturnsAsync(projects);

    var result = await _controller.GetAll();

    var ok = Assert.IsType<OkObjectResult>(result);
    Assert.Equal(projects, ok.Value);
  }

  // GetById

  [Fact]
  public async Task GetById_WhenFound_ReturnsOk()
  {
    var project = new ProjectResponse { ProjectId = 5, UserId = 1, Name = "MyProj" };
    _projectService.Setup(s => s.GetByIdAsync(5, 1)).ReturnsAsync(project);

    var result = await _controller.GetById(5);

    var ok = Assert.IsType<OkObjectResult>(result);
    Assert.Equal(project, ok.Value);
  }

  [Fact]
  public async Task GetById_WhenNotFound_ReturnsNotFound()
  {
    _projectService.Setup(s => s.GetByIdAsync(99, 1)).ReturnsAsync((ProjectResponse?)null);

    var result = await _controller.GetById(99);

    Assert.IsType<NotFoundResult>(result);
  }

  // Create

  [Fact]
  public async Task Create_ReturnsCreatedAtAction()
  {
    var request = new ProjectCreateRequest { Name = "NewProj", IsPublic = false };
    var created = new ProjectResponse { ProjectId = 10, UserId = 1, Name = "NewProj" };
    _projectService.Setup(s => s.CreateAsync(request, 1)).ReturnsAsync(created);

    var result = await _controller.Create(request);

    var createdAt = Assert.IsType<CreatedAtActionResult>(result);
    Assert.Equal(nameof(_controller.GetById), createdAt.ActionName);
    Assert.Equal(10, (int)createdAt.RouteValues!["id"]!);
    Assert.Equal(created, createdAt.Value);
  }

  // Update

  [Fact]
  public async Task Update_WhenFound_ReturnsOk()
  {
    var request = new ProjectUpdateRequest { Name = "Renamed" };
    var updated = new ProjectResponse { ProjectId = 3, UserId = 1, Name = "Renamed" };
    _projectService.Setup(s => s.UpdateAsync(3, request, 1)).ReturnsAsync(updated);

    var result = await _controller.Update(3, request);

    var ok = Assert.IsType<OkObjectResult>(result);
    Assert.Equal(updated, ok.Value);
  }

  [Fact]
  public async Task Update_WhenNotFound_ReturnsNotFound()
  {
    var request = new ProjectUpdateRequest { Name = "Ghost" };
    _projectService.Setup(s => s.UpdateAsync(99, request, 1)).ReturnsAsync((ProjectResponse?)null);

    var result = await _controller.Update(99, request);

    Assert.IsType<NotFoundResult>(result);
  }

  // Delete

  [Fact]
  public async Task Delete_WhenFound_ReturnsNoContent()
  {
    _projectService
      .Setup(s => s.DeleteAsync(7, 1, It.IsAny<CancellationToken>()))
      .ReturnsAsync(true);

    var result = await _controller.Delete(7);

    Assert.IsType<NoContentResult>(result);
  }

  [Fact]
  public async Task Delete_WhenNotFound_ReturnsNotFound()
  {
    _projectService
      .Setup(s => s.DeleteAsync(99, 1, It.IsAny<CancellationToken>()))
      .ReturnsAsync(false);

    var result = await _controller.Delete(99);

    Assert.IsType<NotFoundResult>(result);
  }

  // SaveDesign

  [Fact]
  public async Task SaveDesign_WhenFound_ReturnsOk()
  {
    var request = new ProjectDesignSaveRequest { DesignJson = "{}" };
    var saved = new ProjectDesignResponse { ProjectId = 2 };
    _projectService.Setup(s => s.SaveDesignAsync(2, 1, request)).ReturnsAsync(saved);

    var result = await _controller.SaveDesign(2, request);

    var ok = Assert.IsType<OkObjectResult>(result);
    Assert.Equal(saved, ok.Value);
  }

  [Fact]
  public async Task SaveDesign_WhenProjectNotFound_ReturnsNotFound()
  {
    var request = new ProjectDesignSaveRequest { DesignJson = "{}" };
    _projectService.Setup(s => s.SaveDesignAsync(99, 1, request)).ReturnsAsync((ProjectDesignResponse?)null);

    var result = await _controller.SaveDesign(99, request);

    Assert.IsType<NotFoundResult>(result);
  }

  [Fact]
  public async Task RecordView_DelegatesToProjectService()
  {
    var result = await _controller.RecordView(12);

    Assert.IsType<NoContentResult>(result);
    _projectService.Verify(service => service.RecordViewAsync(12), Times.Once);
  }
}
