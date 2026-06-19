using Favigon.Converter.Models;
using Favigon.Converter.Utils;

namespace Favigon.Converter.Generators;

internal static class MapperLogic
{
  internal static string EmitText(
    IRNode node,
    EmitContext ctx,
    Func<IRNode, string> nodeClass,
    Func<IRNode, string, string> buildLinkAttrs)
  {
    var content = IrProps.GetString(node, "content");
    var href = IrProps.GetString(node, "href");
    var inline = IrProps.GetBool(node, "inline");
    var tag = IrProps.ResolveTag(node, inline ? "span" : "p", "div", "p", "span", "label");

    var bgColor = node.Style?.BackgroundColor;
    if (!string.IsNullOrEmpty(bgColor))
      content = $"<span style=\"background-color: {bgColor}\">{content}</span>";

    if (!string.IsNullOrWhiteSpace(href))
      return FrameworkMapperBase.Paired("a", buildLinkAttrs(node, href), content, ctx.Indent, inlineContent: true);

    return FrameworkMapperBase.Paired(
      tag,
      FrameworkMapperBase.AppendAriaLabel(node, nodeClass(node)),
      content,
      ctx.Indent,
      inlineContent: true);
  }

  internal static string EmitImage(
    IRNode node,
    EmitContext ctx,
    Func<IRNode, string> nodeClass,
    Func<IRNode, string, string> buildLinkAttrs,
    Func<string, string, string>? imgAttrsFormatter = null)
  {
    var src = IrProps.GetString(node, "src");
    var alt = IrProps.GetString(node, "alt");
    var href = IrProps.GetString(node, "href");

    var imgAttrs = imgAttrsFormatter is not null
      ? imgAttrsFormatter(src, alt)
      : $" src=\"{src}\" alt=\"{alt}\"";

    if (!string.IsNullOrWhiteSpace(href))
    {
      var inner = FrameworkMapperBase.SelfClosing("img", imgAttrs, ctx.Deeper().Indent);
      return FrameworkMapperBase.Paired("a", buildLinkAttrs(node, href), inner, ctx.Indent);
    }

    return FrameworkMapperBase.SelfClosing("img", nodeClass(node) + imgAttrs, ctx.Indent);
  }

  internal static string EmitContainer(
    IRNode node,
    EmitContext ctx,
    Func<IRNode, string> nodeClass,
    Func<IRNode, string, string> buildLinkAttrs)
  {
    var href = IrProps.GetString(node, "href");
    var tag = IrProps.ResolveTag(node, "div", "div", "section", "article", "aside", "main", "header", "footer", "nav");

    if (!string.IsNullOrWhiteSpace(href))
      return FrameworkMapperBase.Paired("a", buildLinkAttrs(node, href), FrameworkMapperBase.EmitChildren(node, ctx), ctx.Indent);

    var attrs = FrameworkMapperBase.AppendAriaLabel(node, nodeClass(node));
    attrs += FrameworkMapperBase.FocusAttr(node);
    return FrameworkMapperBase.Paired(tag, attrs, FrameworkMapperBase.EmitChildren(node, ctx), ctx.Indent);
  }

  internal static string EmitFrame(
    IRNode node,
    EmitContext ctx,
    Func<IRNode, string> nodeClass,
    Func<IRNode, string, string> buildLinkAttrs)
  {
    var href = IrProps.GetString(node, "href");
    var tag = IrProps.ResolveTag(node, "div", "div", "section", "article", "aside", "main", "header", "footer", "nav");

    if (!string.IsNullOrWhiteSpace(href))
      return FrameworkMapperBase.Paired("a", buildLinkAttrs(node, href), FrameworkMapperBase.EmitChildren(node, ctx), ctx.Indent);

    var attrs = FrameworkMapperBase.AppendAriaLabel(node, nodeClass(node));
    attrs += FrameworkMapperBase.FocusAttr(node);
    return FrameworkMapperBase.Paired(tag, attrs, FrameworkMapperBase.EmitChildren(node, ctx), ctx.Indent);
  }

  internal static string EmitSvg(
    IRNode node,
    EmitContext ctx,
    Func<IRNode, string> nodeClass)
  {
    var svgContent = IrProps.GetString(node, "svgContent");
    var attrs = nodeClass(node);
    return FrameworkMapperBase.Paired("div", attrs, svgContent, ctx.Indent, inlineContent: true);
  }
}
