using Favigon.API.Middlewares;
using Favigon.Application.Exceptions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Moq;

namespace Favigon.Tests.Middlewares;

public class ExceptionHandlerMiddlewareTests
{
  private static (ExceptionHandlerMiddleware Middleware, DefaultHttpContext Context) Build(
      Exception exceptionToThrow,
      bool isDevelopment = false)
  {
    var next = new RequestDelegate(_ => throw exceptionToThrow);

    var logger = Mock.Of<ILogger<ExceptionHandlerMiddleware>>();

    var environment = new Mock<IHostEnvironment>();
    environment.Setup(e => e.EnvironmentName)
        .Returns(isDevelopment ? Environments.Development : Environments.Production);

    var middleware = new ExceptionHandlerMiddleware(next, logger, environment.Object);

    var ctx = new DefaultHttpContext();
    ctx.Response.Body = new MemoryStream();

    return (middleware, ctx);
  }

  private static async Task<string> ReadResponseBodyAsync(HttpResponse response)
  {
    response.Body.Seek(0, SeekOrigin.Begin);
    return await new StreamReader(response.Body).ReadToEndAsync();
  }

  [Fact]
  public async Task Invoke_WhenAppException_ReturnsConfiguredStatusCode()
  {
    // Arrange
    var (middleware, ctx) = Build(new BusinessRuleException("already exists"));

    // Act
    await middleware.InvokeAsync(ctx);

    // Assert
    Assert.Equal(422, ctx.Response.StatusCode);
  }

  [Fact]
  public async Task Invoke_WhenArgumentException_Returns400BadRequest()
  {
    // Arrange
    var (middleware, ctx) = Build(new ArgumentException("bad argument"));

    // Act
    await middleware.InvokeAsync(ctx);

    // Assert
    Assert.Equal(400, ctx.Response.StatusCode);
  }

  [Fact]
  public async Task Invoke_WhenUnknownException_Returns500InternalServerError()
  {
    // Arrange
    var (middleware, ctx) = Build(new Exception("something broke"));

    // Act
    await middleware.InvokeAsync(ctx);

    // Assert
    Assert.Equal(500, ctx.Response.StatusCode);
  }

  [Fact]
  public async Task Invoke_WhenArgumentException_IncludesMessageInTitle()
  {
    // Arrange
    var (middleware, ctx) = Build(new ArgumentException("Design is invalid"));

    // Act
    await middleware.InvokeAsync(ctx);
    var body = await ReadResponseBodyAsync(ctx.Response);

    // Assert
    Assert.Contains("Design is invalid", body);
  }

  [Fact]
  public async Task Invoke_WhenAppException_IncludesMessageInTitle()
  {
    // Arrange
    var (middleware, ctx) = Build(new ConflictException("Username already exists."));

    // Act
    await middleware.InvokeAsync(ctx);
    var body = await ReadResponseBodyAsync(ctx.Response);

    // Assert
    Assert.Contains("Username already exists.", body);
  }

  [Fact]
  public async Task Invoke_WhenUnknownException_UsesGenericTitle()
  {
    // Arrange
    var (middleware, ctx) = Build(new Exception("internal details"));

    // Act
    await middleware.InvokeAsync(ctx);
    var body = await ReadResponseBodyAsync(ctx.Response);

    // Assert
    Assert.Contains("An unexpected error occurred.", body);
    Assert.DoesNotContain("internal details", body);
  }

  [Fact]
  public async Task Invoke_InDevelopment_IncludesStackTrace()
  {
    // Arrange
    var (middleware, ctx) = Build(new Exception("boom"), isDevelopment: true);

    // Act
    await middleware.InvokeAsync(ctx);
    var body = await ReadResponseBodyAsync(ctx.Response);

    // Assert
    Assert.Contains("boom", body);
  }

  [Fact]
  public async Task Invoke_InProduction_HidesStackTrace()
  {
    // Arrange
    var (middleware, ctx) = Build(new Exception("secretMessage"), isDevelopment: false);

    // Act
    await middleware.InvokeAsync(ctx);
    var body = await ReadResponseBodyAsync(ctx.Response);

    // Assert
    Assert.DoesNotContain("secretMessage", body);
  }

  [Fact]
  public async Task Invoke_SetsContentTypeToApplicationJson()
  {
    // Arrange
    var (middleware, ctx) = Build(new ArgumentException("bad"));

    // Act
    await middleware.InvokeAsync(ctx);

    // Assert
    Assert.Equal("application/json", ctx.Response.ContentType);
  }

  [Fact]
  public async Task Invoke_WhenNoException_PassesThroughWithoutError()
  {
    // Arrange
    var ctx = new DefaultHttpContext();
    ctx.Response.Body = new MemoryStream();

    var logger = Mock.Of<ILogger<ExceptionHandlerMiddleware>>();
    var environment = new Mock<IHostEnvironment>();
    environment.Setup(e => e.EnvironmentName).Returns(Environments.Production);

    var middleware = new ExceptionHandlerMiddleware(
        _ => Task.CompletedTask,
        logger,
        environment.Object);

    // Act
    await middleware.InvokeAsync(ctx);

    // Assert
    Assert.Equal(200, ctx.Response.StatusCode);
  }
}
