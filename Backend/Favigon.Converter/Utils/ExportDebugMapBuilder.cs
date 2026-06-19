using System.Text.Json;
using Favigon.Converter.Models;

namespace Favigon.Converter.Utils;

public static class ExportDebugMapBuilder
{
  private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

  private static readonly IReadOnlyDictionary<string, string> SimpleTagMap =
    new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
      ["Heading"]    = "h2",
      ["Link"]       = "a",
      ["Card"]       = "div",
      ["Icon"]       = "span",
      ["Badge"]      = "span",
      ["Table"]      = "table",
      ["Button"]     = "button",
      ["Input"]      = "input",
      ["Textarea"]   = "textarea",
      ["Select"]     = "select",
      ["Checkbox"]   = "label",
      ["Radio"]      = "label",
      ["Toggle"]     = "label",
      ["Form"]       = "form",
      ["Stack"]      = "div",
      ["Row"]        = "div",
      ["Column"]     = "div",
      ["Grid"]       = "div",
      ["Navbar"]     = "nav",
      ["Sidebar"]    = "aside",
      ["Modal"]      = "dialog",
      ["Drawer"]     = "div",
      ["Tooltip"]    = "div",
      ["Tabs"]       = "div",
      ["Accordion"]  = "details",
      ["Breadcrumb"] = "nav",
      ["Pagination"] = "nav",
    };

  public static string Build(
    string pageName,
    string framework,
    IRNode exportRoot,
    IReadOnlyDictionary<string, NodeCssClasses> cssClassMap)
  {
    var payload = new
    {
      pageName,
      framework = framework.ToLowerInvariant(),
      rootNodeId = exportRoot.Id,
      nodes = Flatten(exportRoot)
        .Select(node => BuildNodeEntry(node, cssClassMap))
        .ToList()
    };

    return JsonSerializer.Serialize(payload, JsonOptions);
  }

  private static object BuildNodeEntry(
    IRNode node,
    IReadOnlyDictionary<string, NodeCssClasses> cssClassMap)
  {
    var cssClasses = cssClassMap.TryGetValue(node.Id, out var resolvedClasses)
      ? resolvedClasses
      : new NodeCssClasses(CssClassNameResolver.GetBaseClassName(node), CssClassNameResolver.GetBaseClassName(node));

    return new
    {
      id = node.Id,
      type = node.Type,
      name = node.Meta.Name,
      htmlTag = ResolveHtmlTag(node),
      markupClass = cssClasses.MarkupClasses,
      cssSelector = $".{cssClasses.TargetClass}"
    };
  }

  private static IEnumerable<IRNode> Flatten(IRNode root)
  {
    yield return root;

    foreach (var child in root.Children)
    {
      foreach (var descendant in Flatten(child))
        yield return descendant;
    }
  }

  private static string ResolveHtmlTag(IRNode node)
  {
    switch (node.Type)
    {
      case "Text":
        return !string.IsNullOrWhiteSpace(IrProps.GetString(node, "href"))
          ? "a"
          : IrProps.ResolveTag(node, IrProps.GetBool(node, "inline") ? "span" : "p", "div", "p", "span", "label");

      case "Heading":
        return $"h{Math.Clamp(IrProps.GetInt(node, "level", 2), 1, 6)}";

      case "Image":
        return !string.IsNullOrWhiteSpace(IrProps.GetString(node, "href")) ? "a" : "img";

      case "Avatar":
        return !string.IsNullOrWhiteSpace(IrProps.GetString(node, "src")) ? "img" : "span";

      case "List":
        return IrProps.GetBool(node, "ordered") ? "ol" : "ul";

      case "Divider":
        return string.Equals(IrProps.GetString(node, "orientation", "horizontal"), "vertical", StringComparison.OrdinalIgnoreCase)
          ? "div"
          : "hr";

      case "Container":
      case "Frame":
        return !string.IsNullOrWhiteSpace(IrProps.GetString(node, "href"))
          ? "a"
          : IrProps.ResolveTag(node, "div", "div", "section", "article", "aside", "main", "header", "footer", "nav");
    }

    return SimpleTagMap.TryGetValue(node.Type, out var tag) ? tag : "div";
  }
}