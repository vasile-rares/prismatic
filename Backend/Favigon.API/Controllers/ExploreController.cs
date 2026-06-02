using Favigon.API.Extensions;
using Favigon.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Favigon.API.Controllers;

[ApiController]
[Route("api/explore")]
[Authorize]
public class ExploreController : ControllerBase
{
  private readonly IExploreService _exploreService;

  public ExploreController(IExploreService exploreService)
  {
    _exploreService = exploreService;
  }

  [HttpGet("trending")]
  public async Task<IActionResult> GetTrending()
  {
    User.TryGetUserId(out var viewerUserId);
    var projects = await _exploreService.GetTrendingAsync(viewerUserId);
    return Ok(projects);
  }

  [HttpGet("recommended")]
  public async Task<IActionResult> GetRecommended()
  {
    User.TryGetUserId(out var viewerUserId);
    var (projects, isPersonalized) = await _exploreService.GetRecommendedAsync(viewerUserId);
    return Ok(new { isPersonalized, projects });
  }

  [HttpGet("people")]
  public async Task<IActionResult> GetSuggestedPeople()
  {
    User.TryGetUserId(out var viewerUserId);
    var users = await _exploreService.GetSuggestedPeopleAsync(viewerUserId);
    return Ok(users);
  }
}
