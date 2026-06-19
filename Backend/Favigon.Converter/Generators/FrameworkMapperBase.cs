using System.Text;
using Favigon.Converter.Abstractions;
using Favigon.Converter.Models;
using Favigon.Converter.Transformers;
using Favigon.Converter.Utils;

namespace Favigon.Converter.Generators;

public abstract class FrameworkMapperBase : IComponentMapper
{
  private static readonly AsyncLocal<EmitContext?> CurrentContext = new();

  public abstract string Type { get; }

  protected abstract string ClassAttributeName { get; }
  protected abstract string OpenNodeComment(IRNode node, EmitContext ctx);
  protected abstract string CloseNodeComment(IRNode node, EmitContext ctx);

  public string Emit(IRNode node, EmitContext ctx)
  {
    var cssClasses = ctx.GetCssClasses(node);
    var cssProps = StyleTransformer.MergeToProperties(node.Layout, node.Style, node.Position);
    if (node.Meta.Hidden)
      cssProps["display"] = "none";

    EffectProcessor.Apply(node, ctx, cssProps, cssClasses.TargetClass);

    if (node.Type == "Text")
      cssProps.Remove("background-color");

    ctx.Styles.AddBase(cssClasses.TargetClass, cssProps);

    var sb = new StringBuilder();
    var previousContext = CurrentContext.Value;
    try
    {
      CurrentContext.Value = ctx;
      sb.Append(OpenNodeComment(node, ctx));
      sb.Append(EmitElement(node, ctx));
      sb.Append(CloseNodeComment(node, ctx));
    }
    finally
    {
      CurrentContext.Value = previousContext;
    }

    return sb.ToString();
  }

  protected abstract string EmitElement(IRNode node, EmitContext ctx);

  protected string NodeClass(IRNode node)
  {
    var context = CurrentContext.Value ?? throw new InvalidOperationException("Emit context is not available.");
    var cssClasses = node is null ? throw new ArgumentNullException(nameof(node)) : context.GetCssClasses(node);
    return $" {ClassAttributeName}=\"{cssClasses.MarkupClasses}\"";
  }

  protected internal static string EmitChildren(IRNode node, EmitContext ctx)
  {
    if (node.Children.Count == 0) return string.Empty;

    var sb = new StringBuilder();
    foreach (var child in node.Children)
      sb.Append(ctx.EmitChild(child, ctx.Deeper()));

    return sb.ToString();
  }

  protected static string GetProp(IRNode node, string key, string defaultValue = "") =>
    IrProps.GetString(node, key, defaultValue);

  protected static bool GetBoolProp(IRNode node, string key, bool defaultValue = false) =>
    IrProps.GetBool(node, key, defaultValue);

  protected static int GetIntProp(IRNode node, string key, int defaultValue = 0) =>
    IrProps.GetInt(node, key, defaultValue);

  protected internal static string AppendAriaLabel(IRNode node, string attrs)
  {
    var ariaLabel = GetProp(node, "ariaLabel");
    return string.IsNullOrWhiteSpace(ariaLabel)
      ? attrs
      : $"{attrs} aria-label=\"{ariaLabel}\"";
  }

  protected internal static string ResolveTag(IRNode node, string defaultTag, params string[] allowedTags) =>
    IrProps.ResolveTag(node, defaultTag, allowedTags);

  protected internal static string FocusAttr(IRNode node)
  {
    if (node.Effects is null or { Count: 0 }) return string.Empty;
    foreach (var effect in node.Effects)
    {
      if (string.Equals(effect.Trigger, "focus", StringComparison.OrdinalIgnoreCase))
        return " tabindex=\"0\"";
    }
    return string.Empty;
  }

  protected string BuildLinkAttrs(IRNode node, string href)
  {
    var attrs = NodeClass(node) + $" href=\"{href}\"";
    var target = GetProp(node, "target");
    if (!string.IsNullOrEmpty(target))
    {
      attrs += $" target=\"{target}\"";
      if (target == "_blank")
        attrs += " rel=\"noopener noreferrer\"";
    }
    return AppendAriaLabel(node, attrs);
  }

  protected internal static string SelfClosing(string tag, string attrs, string indent) =>
    $"{indent}<{tag}{attrs} />\n";

  protected internal static string Paired(string tag, string attrs, string inner, string indent, bool inlineContent = false)
  {
    if (string.IsNullOrEmpty(inner))
      return $"{indent}<{tag}{attrs}></{tag}>\n";

    if (inlineContent)
      return $"{indent}<{tag}{attrs}>{inner}</{tag}>\n";

    return $"{indent}<{tag}{attrs}>\n{inner}{indent}</{tag}>\n";
  }
}
