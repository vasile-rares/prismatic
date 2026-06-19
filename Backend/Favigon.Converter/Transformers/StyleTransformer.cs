using System.Linq;
using Favigon.Converter.Models;

namespace Favigon.Converter.Transformers;

public static class StyleTransformer
{
  public static Dictionary<string, string> ToCssProperties(IRStyle style)
  {
    var css = new Dictionary<string, string>(StringComparer.Ordinal);

    if (style.Color is not null) css["color"] = style.Color;
    if (style.Background is not null) css["background"] = style.Background;
    if (style.BackgroundImage is not null) css["background-image"] = style.BackgroundImage;
    if (style.BackgroundSize is not null) css["background-size"] = style.BackgroundSize;
    if (style.BackgroundPosition is not null) css["background-position"] = style.BackgroundPosition;
    if (style.BackgroundRepeat is not null) css["background-repeat"] = style.BackgroundRepeat;
    if (style.ObjectFit is not null) css["object-fit"] = style.ObjectFit;
    if (style.Transform is not null) { css["-webkit-transform"] = style.Transform; css["transform"] = style.Transform; }
    if (style.TransformOrigin is not null) { css["-webkit-transform-origin"] = style.TransformOrigin; css["transform-origin"] = style.TransformOrigin; }
    if (style.BackfaceVisibility is not null)
    { css["-webkit-backface-visibility"] = style.BackfaceVisibility; css["backface-visibility"] = style.BackfaceVisibility; }
    if (style.TransformStyle is not null) { css["-webkit-transform-style"] = style.TransformStyle; css["transform-style"] = style.TransformStyle; }
    if (style.Filter is not null) { css["-webkit-filter"] = style.Filter; css["filter"] = style.Filter; }
    if (style.BackdropFilter is not null) { css["-webkit-backdrop-filter"] = style.BackdropFilter; css["backdrop-filter"] = style.BackdropFilter; }
    if (style.BackgroundClip is not null) { css["-webkit-background-clip"] = style.BackgroundClip; css["background-clip"] = style.BackgroundClip; }
    if (style.Border is not null) ApplyBorder(css, style.Border);

    if (style.BorderRadius is { Value: not 0 }) css["border-radius"] = style.BorderRadius.ToString();
    if (style.BorderTopLeftRadius is { Value: not 0 })
      css["border-top-left-radius"] = style.BorderTopLeftRadius.ToString();
    if (style.BorderTopRightRadius is { Value: not 0 })
      css["border-top-right-radius"] = style.BorderTopRightRadius.ToString();
    if (style.BorderBottomRightRadius is { Value: not 0 })
      css["border-bottom-right-radius"] = style.BorderBottomRightRadius.ToString();
    if (style.BorderBottomLeftRadius is { Value: not 0 })
      css["border-bottom-left-radius"] = style.BorderBottomLeftRadius.ToString();
    if (style.FontSize is not null) css["font-size"] = style.FontSize.ToString();
    if (style.FontWeight is not null) css["font-weight"] = style.FontWeight.Value.ToString();
    if (style.FontFamily is not null) css["font-family"] = style.FontFamily;
    if (style.FontStyle is not null) css["font-style"] = style.FontStyle;
    if (style.TextAlign is not null) css["text-align"] = style.TextAlign;
    if (style.TextShadow is not null) css["text-shadow"] = style.TextShadow;
    if (style.TextTransform is not null) css["text-transform"] = style.TextTransform;
    if (style.TextWrap is not null) css["text-wrap"] = style.TextWrap;
    if (style.WhiteSpace is not null) css["white-space"] = style.WhiteSpace;
    if (style.WordBreak is not null) css["word-break"] = style.WordBreak;
    if (style.TextDecorationLine is not null)
    {
      css["text-decoration-line"] = style.TextDecorationLine;
      if (style.TextDecorationColor is not null) css["text-decoration-color"] = style.TextDecorationColor;
      if (style.TextDecorationStyle is not null) css["text-decoration-style"] = style.TextDecorationStyle;
      if (style.TextDecorationThickness is not null) css["text-decoration-thickness"] = style.TextDecorationThickness;
    }
    if (style.BackgroundColor is not null) css["background-color"] = style.BackgroundColor;
    if (style.LineHeight is not null) css["line-height"] = style.LineHeight.ToString();
    if (style.LetterSpacing is not null) css["letter-spacing"] = style.LetterSpacing.ToString();
    if (style.Overflow is not null) css["overflow"] = style.Overflow.Value.ToString().ToLower();

    if (style.Shadows is { Count: > 0 })
      css["box-shadow"] = string.Join(", ", style.Shadows.Select(s => s.ToCss()));

    if (style.Opacity is not null && style.Opacity.Value != 1.0) css["opacity"] = style.Opacity.Value.ToString("G");

    if (style.MixBlendMode is not null) css["mix-blend-mode"] = style.MixBlendMode;

    if (style.Cursor is not null) css["cursor"] = style.Cursor;

    if (style.Width is not null) css["width"] = FormatDimensionPx(style.Width);
    if (style.Height is not null) css["height"] = FormatDimensionPx(style.Height);
    if (style.MinWidth is not null) css["min-width"] = FormatDimensionPx(style.MinWidth);
    if (style.MaxWidth is not null) css["max-width"] = FormatDimensionPx(style.MaxWidth);
    if (style.MinHeight is not null) css["min-height"] = FormatDimensionPx(style.MinHeight);
    if (style.MaxHeight is not null) css["max-height"] = FormatDimensionPx(style.MaxHeight);

    if (style.Padding is not null) ApplySpacing(css, "padding", style.Padding);
    if (style.Margin is not null) ApplySpacing(css, "margin", style.Margin);

    return css;
  }

  public static Dictionary<string, string> MergeToProperties(
    IRLayout? layout,
    IRStyle? style,
    IRPosition? position = null)
  {
    var merged = new Dictionary<string, string>(StringComparer.Ordinal);

    if (layout is not null)
      foreach (var kv in LayoutTransformer.ToCssProperties(layout))
        merged[kv.Key] = kv.Value;

    if (style is not null)
      foreach (var kv in ToCssProperties(style))
        merged[kv.Key] = kv.Value;

    if (position is not null)
    {
      var positionCss = position.Mode switch
      {
        PositionMode.Relative => "relative",
        PositionMode.Absolute => "absolute",
        PositionMode.Fixed => "fixed",
        PositionMode.Sticky => "sticky",
        _ => null,
      };
      if (positionCss is not null) merged["position"] = positionCss;

      if (position.Top is not null) merged["top"] = position.Top.ToString();
      if (position.Right is not null) merged["right"] = position.Right.ToString();
      if (position.Bottom is not null) merged["bottom"] = position.Bottom.ToString();
      if (position.Left is not null) merged["left"] = position.Left.ToString();
    }

    return merged;
  }

  // Helpers

  private static void ApplySpacing(Dictionary<string, string> css, string prop, IRSpacing s)
  {
    var t = s.Top?.ToString();
    var r = s.Right?.ToString();
    var b = s.Bottom?.ToString();
    var l = s.Left?.ToString();

    if (t == r && r == b && b == l && t is not null)
    { css[prop] = t; return; }

    if (t is not null) css[$"{prop}-top"] = t;
    if (r is not null) css[$"{prop}-right"] = r;
    if (b is not null) css[$"{prop}-bottom"] = b;
    if (l is not null) css[$"{prop}-left"] = l;
  }

  private static void ApplyBorder(Dictionary<string, string> css, IRBorder border)
  {
    if (border.Style == Models.BorderStyle.None)
    {
      css["border"] = "none";
      return;
    }

    bool hasSpecificSides = border.Top.HasValue || border.Right.HasValue
                         || border.Bottom.HasValue || border.Left.HasValue;
    bool hasSpecificWidths = border.TopWidth is not null || border.RightWidth is not null
                          || border.BottomWidth is not null || border.LeftWidth is not null;

    if (!hasSpecificSides && !hasSpecificWidths)
    {
      css["border"] = BuildBorderDeclaration(border.Width, border.Style, border.Color);
      return;
    }

    css["border-top"] = BuildBorderSideDeclaration(border.Top, border.TopWidth, border.Width, border.Style, border.Color);
    css["border-right"] = BuildBorderSideDeclaration(border.Right, border.RightWidth, border.Width, border.Style, border.Color);
    css["border-bottom"] = BuildBorderSideDeclaration(border.Bottom, border.BottomWidth, border.Width, border.Style, border.Color);
    css["border-left"] = BuildBorderSideDeclaration(border.Left, border.LeftWidth, border.Width, border.Style, border.Color);
  }

  private static string BuildBorderSideDeclaration(
    bool? enabled,
    IRLength? specificWidth,
    IRLength? fallbackWidth,
    Models.BorderStyle style,
    string? color)
  {
    if (enabled is false)
      return "none";

    if (specificWidth is not null)
      return specificWidth.Value <= 0
        ? "none"
        : BuildBorderDeclaration(specificWidth, style, color);

    if (enabled is true)
      return fallbackWidth is not null && fallbackWidth.Value <= 0
        ? "none"
        : BuildBorderDeclaration(fallbackWidth, style, color);

    return "none";
  }

  private static string BuildBorderDeclaration(IRLength? width, Models.BorderStyle style, string? color)
  {
    var parts = new List<string>();
    if (width is not null) parts.Add(width.ToString());
    parts.Add(MapBorderStyle(style));
    if (color is not null) parts.Add(color);
    return string.Join(" ", parts);
  }

  private static string MapBorderStyle(Models.BorderStyle style) => style switch
  {
    Models.BorderStyle.Dashed => "dashed",
    Models.BorderStyle.Dotted => "dotted",
    Models.BorderStyle.Double => "double",
    _ => "solid"
  };

  private static string FormatDimensionPx(IRLength len) =>
    len.Unit == "px" ? $"{(int)Math.Round(len.Value)}px" : len.ToString();
}
