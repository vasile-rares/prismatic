using Favigon.Application.Options;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace Favigon.Tests.Helpers;

public static class TestConfiguration
{
  public const string JwtKey = "testkey_testkey_testkey_testkey_testkey_32chars!!";
  public const string JwtIssuer = "FavigonAPI";
  public const string JwtAudience = "FavigonClient";

  public static IConfiguration Build(Dictionary<string, string?>? overrides = null)
  {
    var settings = new Dictionary<string, string?>
    {
      ["JwtSettings:Key"] = JwtKey,
      ["JwtSettings:Issuer"] = JwtIssuer,
      ["JwtSettings:Audience"] = JwtAudience,
      ["JwtSettings:AccessTokenMinutes"] = "60",
      ["JwtSettings:RefreshTokenDays"] = "30",
      ["PasswordReset:TokenMinutes"] = "30",
      ["Client:BaseUrl"] = "http://localhost:4200",
    };

    if (overrides is not null)
      foreach (var kv in overrides)
        settings[kv.Key] = kv.Value;

    return new ConfigurationBuilder()
        .AddInMemoryCollection(settings)
        .Build();
  }

  public static IOptions<JwtOptions> BuildJwtOptions(Dictionary<string, string?>? overrides = null)
  {
    var configuration = Build(overrides);
    return Options.Create(configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions());
  }

  public static IOptions<PasswordResetOptions> BuildPasswordResetOptions(Dictionary<string, string?>? overrides = null)
  {
    var configuration = Build(overrides);
    return Options.Create(configuration.GetSection(PasswordResetOptions.SectionName).Get<PasswordResetOptions>() ?? new PasswordResetOptions());
  }

  public static IOptions<ClientOptions> BuildClientOptions(Dictionary<string, string?>? overrides = null)
  {
    var configuration = Build(overrides);
    return Options.Create(configuration.GetSection(ClientOptions.SectionName).Get<ClientOptions>() ?? new ClientOptions());
  }

  public static IOptions<TwoFactorOptions> BuildTwoFactorOptions(Dictionary<string, string?>? overrides = null)
  {
    var configuration = Build(overrides);
    return Options.Create(configuration.GetSection(TwoFactorOptions.SectionName).Get<TwoFactorOptions>() ?? new TwoFactorOptions());
  }
}
