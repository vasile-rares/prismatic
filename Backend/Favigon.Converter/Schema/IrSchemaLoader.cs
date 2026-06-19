using System.Reflection;

namespace Favigon.Converter.Schema;

public static class IrSchemaLoader
{
  private const string ResourceName = "Favigon.Converter.Schema.IrAiSchema.json";

  private static string? _cachedEmbeddedSchema;

  ///
  public static string GetAiSchema(string? overridePath = null)
  {
    if (!string.IsNullOrWhiteSpace(overridePath))
    {
      var resolved = Path.IsPathRooted(overridePath)
          ? overridePath
          : Path.GetFullPath(overridePath, Directory.GetCurrentDirectory());

      if (File.Exists(resolved))
        return File.ReadAllText(resolved);
    }

    if (_cachedEmbeddedSchema is not null)
      return _cachedEmbeddedSchema;

    var assembly = Assembly.GetExecutingAssembly();
    using var stream = assembly.GetManifestResourceStream(ResourceName)
        ?? throw new InvalidOperationException(
            $"Embedded resource '{ResourceName}' not found in '{assembly.FullName}'. " +
            "Ensure IrAiSchema.json is marked as EmbeddedResource in Favigon.Converter.csproj.");

    using var reader = new StreamReader(stream);
    _cachedEmbeddedSchema = reader.ReadToEnd();
    return _cachedEmbeddedSchema;
  }
}
