using Favigon.API.Controllers;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;
using Favigon.Application.Validators;
using Favigon.Converter.Models;
using Microsoft.AspNetCore.Mvc;
using Moq;

namespace Favigon.Tests.Controllers;

public class ConverterControllerTests
{
  private readonly Mock<IConverterService> _converterServiceMock = new();
  private readonly ConverterController _controller;

  public ConverterControllerTests()
  {
    _controller = new ConverterController(_converterServiceMock.Object);
  }

  // Generate

  [Fact]
  public void Generate_WithIr_ReturnsOk()
  {
    var request = new ConverterRequest { Framework = "html", Ir = new IRNode() };
    var expected = new ConverterResponse { Html = "<div/>", Css = "" };
    _converterServiceMock
        .Setup(s => s.Generate(It.IsAny<IRNode>(), "html"))
        .Returns(expected);

    var result = _controller.Generate(request, new ConverterGenerateValidator());

    var ok = Assert.IsType<OkObjectResult>(result);
    Assert.Equal(expected, ok.Value);
  }

  [Fact]
  public void Generate_WithPages_ReturnsOk()
  {
    var pages = new List<ConverterPageInput>
        {
            new() { ViewportWidth = 1280, Ir = new IRNode() },
            new() { ViewportWidth = 768, Ir = new IRNode() },
        };
    var request = new ConverterRequest { Framework = "html", Pages = pages };
    var expected = new ConverterResponse { Html = "<div/>", Css = "" };
    _converterServiceMock
        .Setup(s => s.GenerateResponsive(pages, "html"))
        .Returns(expected);

    var result = _controller.Generate(request, new ConverterGenerateValidator());

    var ok = Assert.IsType<OkObjectResult>(result);
    Assert.Equal(expected, ok.Value);
  }

  [Fact]
  public void Generate_WithNeitherIrNorPages_ReturnsBadRequest()
  {
    var request = new ConverterRequest { Framework = "html" };

    var result = _controller.Generate(request, new ConverterGenerateValidator());

    Assert.IsType<BadRequestObjectResult>(result);
  }

  [Fact]
  public void Generate_WithEmptyFramework_ReturnsBadRequest()
  {
    var request = new ConverterRequest { Framework = "", Ir = new IRNode() };

    var result = _controller.Generate(request, new ConverterGenerateValidator());

    Assert.IsType<BadRequestObjectResult>(result);
  }

  // Validate

  [Fact]
  public void Validate_WithIr_ReturnsOk()
  {
    var request = new ConverterRequest { Ir = new IRNode() };
    _converterServiceMock
        .Setup(s => s.Validate(It.IsAny<IRNode>()))
        .Returns(true);

    var result = _controller.Validate(request, new ConverterValidateValidator());

    var ok = Assert.IsType<OkObjectResult>(result);
    var response = Assert.IsType<ConverterResponse>(ok.Value);
    Assert.True(response.IsValid);
  }

  [Fact]
  public void Validate_WithoutIr_ReturnsBadRequest()
  {
    var request = new ConverterRequest();

    var result = _controller.Validate(request, new ConverterValidateValidator());

    Assert.IsType<BadRequestObjectResult>(result);
  }

  // GenerateFiles

  [Fact]
  public void GenerateFiles_WithPages_ReturnsOk()
  {
    var pages = new List<ConverterPageInput>
        {
            new() { ViewportWidth = 1280, Ir = new IRNode() },
        };
    var request = new ConverterRequest { Framework = "html", Pages = pages };
    var expected = new MultiPageConverterResponse();
    _converterServiceMock
        .Setup(s => s.GenerateMultiPage(pages, "html"))
        .Returns(expected);

    var result = _controller.GenerateFiles(request, new ConverterGenerateFilesValidator());

    var ok = Assert.IsType<OkObjectResult>(result);
    Assert.Equal(expected, ok.Value);
  }

  [Fact]
  public void GenerateFiles_WithoutPages_ReturnsBadRequest()
  {
    var request = new ConverterRequest { Framework = "html" };

    var result = _controller.GenerateFiles(request, new ConverterGenerateFilesValidator());

    Assert.IsType<BadRequestObjectResult>(result);
  }

  [Fact]
  public void GenerateFiles_WithEmptyPages_ReturnsBadRequest()
  {
    var request = new ConverterRequest { Framework = "html", Pages = new List<ConverterPageInput>() };

    var result = _controller.GenerateFiles(request, new ConverterGenerateFilesValidator());

    Assert.IsType<BadRequestObjectResult>(result);
  }
}
