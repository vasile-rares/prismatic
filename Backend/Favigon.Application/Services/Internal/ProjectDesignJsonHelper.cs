using Favigon.Converter.Models;
using Favigon.Converter.Validation;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Favigon.Application.Services.Internal;

internal static class ProjectDesignJsonHelper
{
  private static readonly JsonSerializerOptions IrDeserializationOptions = new()
  {
    PropertyNameCaseInsensitive = true
  };

  public static string NormalizeAndValidate(string? designJson)
  {
    if (string.IsNullOrWhiteSpace(designJson))
    {
      return "{}";
    }

    JsonNode? rootNode;
    try
    {
      rootNode = JsonNode.Parse(designJson);
    }
    catch (JsonException ex)
    {
      throw new ArgumentException("Design JSON is not valid JSON.", ex);
    }

    if (rootNode is null)
    {
      return "{}";
    }

    if (rootNode is not JsonObject rootObject)
    {
      throw new ArgumentException("Design JSON root must be a JSON object.");
    }

    if (rootObject.Count == 0)
    {
      return "{}";
    }

    NormalizeNumbers(rootObject);

    var normalizedDesignJson = rootObject.ToJsonString(new JsonSerializerOptions
    {
      WriteIndented = false
    });

    IRNode? irRoot;
    try
    {
      irRoot = JsonSerializer.Deserialize<IRNode>(normalizedDesignJson, IrDeserializationOptions);
    }
    catch (JsonException ex)
    {
      throw new ArgumentException("Design JSON does not match the expected IR shape.", ex);
    }

    if (irRoot == null)
    {
      throw new ArgumentException("Design JSON does not contain a valid IR root node.");
    }

    var validationErrors = IrValidator.GetValidationErrors(irRoot, skipLayoutMath: true);
    if (validationErrors.Count > 0)
    {
      var details = string.Join(" ", validationErrors.Take(3));
      throw new ArgumentException($"Design JSON failed IR validation. {details}");
    }

    return normalizedDesignJson;
  }

  public static HashSet<string> CollectManagedProjectAssetPaths(
    string? designJson,
    int userId,
    int projectId)
  {
    var assetPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    if (string.IsNullOrWhiteSpace(designJson))
    {
      return assetPaths;
    }

    JsonNode? rootNode;
    try
    {
      rootNode = JsonNode.Parse(designJson);
    }
    catch (JsonException)
    {
      return assetPaths;
    }

    if (rootNode == null)
    {
      return assetPaths;
    }

    var assetPrefix = $"/project-assets/{userId}/{projectId}/";
    CollectManagedProjectAssetPaths(rootNode, assetPrefix, assetPaths);
    return assetPaths;
  }

  private static void NormalizeNumbers(JsonNode node)
  {
    switch (node)
    {
      case JsonObject jsonObject:
        foreach (var propertyName in jsonObject.Select(property => property.Key).ToList())
        {
          var childNode = jsonObject[propertyName];
          if (childNode is null)
          {
            continue;
          }

          if (childNode is JsonValue jsonValue
            && TryNormalizeJsonValue(jsonValue, out var normalizedValue))
          {
            jsonObject[propertyName] = normalizedValue;
          }

          if (childNode is not JsonValue)
          {
            NormalizeNumbers(childNode);
          }
        }
        break;
      case JsonArray jsonArray:
        for (var index = 0; index < jsonArray.Count; index++)
        {
          var childNode = jsonArray[index];
          if (childNode is null)
          {
            continue;
          }

          if (childNode is JsonValue jsonValue
            && TryNormalizeJsonValue(jsonValue, out var normalizedValue))
          {
            jsonArray[index] = normalizedValue;
          }

          if (childNode is not JsonValue)
          {
            NormalizeNumbers(childNode);
          }
        }
        break;
    }
  }

  private static bool TryNormalizeJsonValue(JsonValue value, out JsonNode normalizedValue)
  {
    normalizedValue = value;

    if (value.TryGetValue<JsonElement>(out var jsonElement)
      && jsonElement.ValueKind == JsonValueKind.Number
      && jsonElement.TryGetDecimal(out var number))
    {
      var rounded = Math.Round(number, 2, MidpointRounding.AwayFromZero);
      normalizedValue = JsonValue.Create(rounded)!;
      return true;
    }

    return false;
  }

  private static void CollectManagedProjectAssetPaths(
    JsonNode node,
    string assetPrefix,
    HashSet<string> assetPaths)
  {
    switch (node)
    {
      case JsonObject jsonObject:
        foreach (var property in jsonObject)
        {
          if (property.Value != null)
          {
            CollectManagedProjectAssetPaths(property.Value, assetPrefix, assetPaths);
          }
        }
        break;
      case JsonArray jsonArray:
        foreach (var item in jsonArray)
        {
          if (item != null)
          {
            CollectManagedProjectAssetPaths(item, assetPrefix, assetPaths);
          }
        }
        break;
      case JsonValue jsonValue when jsonValue.TryGetValue<string>(out var value):
        var normalizedAssetPath = TryNormalizeManagedProjectAssetPath(value, assetPrefix);
        if (normalizedAssetPath != null)
        {
          assetPaths.Add(normalizedAssetPath);
        }
        break;
    }
  }

  private static string? TryNormalizeManagedProjectAssetPath(string rawValue, string assetPrefix)
  {
    var candidate = UnwrapCssUrl(rawValue);
    if (string.IsNullOrWhiteSpace(candidate))
    {
      return null;
    }

    var path = candidate;
    if (Uri.TryCreate(candidate, UriKind.Absolute, out var absoluteUri))
    {
      path = absoluteUri.AbsolutePath;
    }

    var pathWithoutQuery = path.Split(['?', '#'], 2)[0];
    return pathWithoutQuery.StartsWith(assetPrefix, StringComparison.OrdinalIgnoreCase)
      ? pathWithoutQuery
      : null;
  }

  private static string UnwrapCssUrl(string value)
  {
    var trimmed = value.Trim();
    if (!trimmed.StartsWith("url(", StringComparison.OrdinalIgnoreCase) || !trimmed.EndsWith(')'))
    {
      return trimmed;
    }

    trimmed = trimmed[4..^1].Trim();
    if (
      (trimmed.StartsWith('\"') && trimmed.EndsWith('\"')) ||
      (trimmed.StartsWith('\'') && trimmed.EndsWith('\''))
    )
    {
      trimmed = trimmed[1..^1];
    }

    return trimmed;
  }
}
