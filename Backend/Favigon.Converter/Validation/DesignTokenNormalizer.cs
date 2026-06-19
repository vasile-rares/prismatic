using Favigon.Converter.Models;

namespace Favigon.Converter.Validation;

public static class DesignTokenNormalizer
{
  private static readonly int[] FontSizesPx = [12, 14, 16, 24, 32, 48, 64];

  private static readonly int[] SpacingPx = [0, 8, 16, 24, 32, 40, 48, 64, 80, 96, 120];

  private static readonly int[] BorderRadiiPx = [0, 4, 8, 12, 20, 9999];

  private const double AutoFixOverflowThreshold = 64.0;

  public static void Normalize(IRNode root)
  {
    NormalizeNode(root);
    EnforceFrameConstraints(root);
    FixFlexRowOverflows(root);
  }

  private static void EnforceFrameConstraints(IRNode root)
  {
    if (root.Type != "Frame") return;

    root.Style ??= new IRStyle();
    root.Style.Height = new IRLength { Value = 0, Unit = "fit-content" };
    root.Style.Width ??= new IRLength { Value = 1280, Unit = "px" };
    root.Style.MinHeight = null;
    root.Style.MaxHeight = null;
  }

  private static void NormalizeNode(IRNode node)
  {
    if (node.Style is not null)
      NormalizeStyle(node.Style);

    if (node.Layout is not null)
      NormalizeLayout(node.Layout);

    foreach (var variant in node.Variants.Values)
    {
      if (variant.Style is not null) NormalizeStyle(variant.Style);
      if (variant.Layout is not null) NormalizeLayout(variant.Layout);
    }

    foreach (var child in node.Children)
      NormalizeNode(child);
  }

  private static void NormalizeStyle(IRStyle style)
  {
    style.FontSize = SnapFontSize(style.FontSize);

    style.BorderRadius = SnapBorderRadius(style.BorderRadius);
    style.BorderTopLeftRadius = SnapBorderRadius(style.BorderTopLeftRadius);
    style.BorderTopRightRadius = SnapBorderRadius(style.BorderTopRightRadius);
    style.BorderBottomRightRadius = SnapBorderRadius(style.BorderBottomRightRadius);
    style.BorderBottomLeftRadius = SnapBorderRadius(style.BorderBottomLeftRadius);

    style.Padding = SnapSpacing(style.Padding);
    style.Margin = SnapSpacing(style.Margin);
  }

  private static void NormalizeLayout(IRLayout layout)
  {
    layout.Gap = SnapSpacingLength(layout.Gap);
    layout.RowGap = SnapSpacingLength(layout.RowGap);
    layout.ColumnGap = SnapSpacingLength(layout.ColumnGap);
  }

  private static IRLength? SnapFontSize(IRLength? len)
  {
    if (len is null || len.Unit != "px") return len;
    return new IRLength { Value = SnapToNearest(FontSizesPx, (int)Math.Round(len.Value)), Unit = "px" };
  }

  private static IRLength? SnapBorderRadius(IRLength? len)
  {
    if (len is null || len.Unit != "px") return len;
    var rounded = (int)Math.Round(len.Value);
    if (rounded >= 500) return new IRLength { Value = 9999, Unit = "px" };
    return new IRLength { Value = SnapToNearest(BorderRadiiPx, rounded), Unit = "px" };
  }

  private static IRLength? SnapSpacingLength(IRLength? len)
  {
    if (len is null || len.Unit != "px") return len;
    return new IRLength { Value = SnapToNearest(SpacingPx, (int)Math.Round(len.Value)), Unit = "px" };
  }

  private static IRSpacing? SnapSpacing(IRSpacing? spacing)
  {
    if (spacing is null) return null;
    spacing.Top = SnapSpacingLength(spacing.Top);
    spacing.Right = SnapSpacingLength(spacing.Right);
    spacing.Bottom = SnapSpacingLength(spacing.Bottom);
    spacing.Left = SnapSpacingLength(spacing.Left);
    return spacing;
  }

  private static int SnapToNearest(int[] scale, int value)
  {
    var best = scale[0];
    var bestDist = Math.Abs(value - best);
    foreach (var s in scale)
    {
      var dist = Math.Abs(value - s);
      if (dist < bestDist)
      {
        best = s;
        bestDist = dist;
      }
    }
    return best;
  }

  private static void FixFlexRowOverflows(IRNode node)
  {
    if (node.Layout?.Mode == LayoutMode.Flex &&
        node.Layout.Direction is FlexDirection.Row or null)
    {
      var parentWidth = node.Style?.Width;
      if (parentWidth?.Unit == "px" && node.Children.Count > 1)
      {
        if (node.Children.All(c => c.Style?.Width?.Unit == "px"))
        {
          var paddingLeft = node.Style?.Padding?.Left?.Unit == "px" ? node.Style.Padding.Left.Value : 0;
          var paddingRight = node.Style?.Padding?.Right?.Unit == "px" ? node.Style.Padding.Right.Value : 0;
          var gapLen = node.Layout.ColumnGap ?? node.Layout.Gap;
          var gapPx = gapLen?.Unit == "px" ? gapLen.Value : 0;

          var available = parentWidth.Value - paddingLeft - paddingRight;
          var totalChildren = node.Children.Sum(c => c.Style!.Width!.Value)
                              + gapPx * (node.Children.Count - 1);
          var overflow = totalChildren - available;

          if (overflow > 0.5 && overflow <= AutoFixOverflowThreshold)
          {
            var widest = node.Children.MaxBy(c => c.Style!.Width!.Value)!;
            widest.Style!.Width = new IRLength { Value = widest.Style.Width!.Value - overflow, Unit = "px" };
          }
        }
      }
    }

    foreach (var child in node.Children)
      FixFlexRowOverflows(child);
  }
}
