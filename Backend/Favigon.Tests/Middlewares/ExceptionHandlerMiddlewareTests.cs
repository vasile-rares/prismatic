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
    var (middleware, ctx) = Build(new BusinessRuleException("already exists"));

    await middleware.InvokeAsync(ctx);

    Assert.Equal(422, ctx.Response.StatusCode);
  }

  [Fact]
  public async Task Invoke_WhenArgumentException_Returns400BadRequest()
  {
    var (middleware, ctx) = Build(new ArgumentException("bad argument"));

    await middleware.InvokeAsync(ctx);

    Assert.Equal(400, ctx.Response.StatusCode);
  }

  [Fact]
  public async Task Invoke_WhenUnknownException_Returns500InternalServerError()
  {
    var (middleware, ctx) = Build(new Exception("something broke"));

    await middleware.InvokeAsync(ctx);

    Assert.Equal(500, ctx.Response.StatusCode);
  }

  [Fact]
  public async Task Invoke_WhenArgumentException_IncludesMessageInTitle()
  {
    var (middleware, ctx) = Build(new ArgumentException("Design is invalid"));

    await middleware.InvokeAsync(ctx);
    var body = await ReadResponseBodyAsync(ctx.Response);

    Assert.Contains("Design is invalid", body);
  }

  [Fact]
  public async Task Invoke_WhenAppException_IncludesMessageInTitle()
  {
    var (middleware, ctx) = Build(new ConflictException("Username already exists."));

    await middleware.InvokeAsync(ctx);
    var body = await ReadResponseBodyAsync(ctx.Response);

    Assert.Contains("Username already exists.", body);
  }

  [Fact]
  public async Task Invoke_WhenUnknownException_UsesGenericTitle()
  {
    var (middleware, ctx) = Build(new Exception("internal details"));

    await middleware.InvokeAsync(ctx);
    var body = await ReadResponseBodyAsync(ctx.Response);

    Assert.Contains("An unexpected error occurred.", body);
    Assert.DoesNotContain("internal details", body);
  }

  [Fact]
  public async Task Invoke_InDevelopment_IncludesStackTrace()
  {
    var (middleware, ctx) = Build(new Exception("boom"), isDevelopment: true);

    await middleware.InvokeAsync(ctx);
    var body = await ReadResponseBodyAsync(ctx.Response);

    Assert.Contains("boom", body);
  }

  [Fact]
  public async Task Invoke_InProduction_HidesStackTrace()
  {
    var (middleware, ctx) = Build(new Exception("secretMessage"), isDevelopment: false);

    await middleware.InvokeAsync(ctx);
    var body = await ReadResponseBodyAsync(ctx.Response);

    Assert.DoesNotContain("secretMessage", body);
  }

  [Fact]
  public async Task Invoke_SetsContentTypeToApplicationJson()
  {
    var (middleware, ctx) = Build(new ArgumentException("bad"));

    await middleware.InvokeAsync(ctx);

    Assert.Equal("application/json", ctx.Response.ContentType);
  }

  [Fact]
  public async Task Invoke_WhenNoException_PassesThroughWithoutError()
  {
    var ctx = new DefaultHttpContext();
    ctx.Response.Body = new MemoryStream();

    var logger = Mock.Of<ILogger<ExceptionHandlerMiddleware>>();
    var environment = new Mock<IHostEnvironment>();
    environment.Setup(e => e.EnvironmentName).Returns(Environments.Production);

    var middleware = new ExceptionHandlerMiddleware(
        _ => Task.CompletedTask,
        logger,
        environment.Object);

    await middleware.InvokeAsync(ctx);

    Assert.Equal(200, ctx.Response.StatusCode);
  }
}
