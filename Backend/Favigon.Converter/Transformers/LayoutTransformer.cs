using Favigon.Converter.Models;

namespace Favigon.Converter.Transformers;

public static class LayoutTransformer
{
  public static Dictionary<string, string> ToCssProperties(IRLayout layout)
  {
    var css = new Dictionary<string, string>(StringComparer.Ordinal);

    css["display"] = layout.Mode switch
    {
      LayoutMode.Block => "block",
      LayoutMode.Grid => "grid",
      _ => "flex",
    };

    if (layout.Mode == LayoutMode.Flex)
    {
      if (layout.Direction is not null)
        css["flex-direction"] = MapFlexDirection(layout.Direction.Value);

      if (layout.Align is not null) css["align-items"] = MapAlignItems(layout.Align.Value);
      if (layout.Justify is not null) css["justify-content"] = MapJustifyContent(layout.Justify.Value);
      if (layout.Wrap is not null) css["flex-wrap"] = layout.Wrap.Value ? "wrap" : "nowrap";
      if (layout.Wrap == true && layout.Align is not null)
        css["align-content"] = MapAlignItems(layout.Align.Value);
    }

    if (layout.Gap is not null) css["gap"] = layout.Gap.ToString();
    if (layout.RowGap is not null) css["row-gap"] = layout.RowGap.ToString();
    if (layout.ColumnGap is not null) css["column-gap"] = layout.ColumnGap.ToString();

    if (layout.Mode == LayoutMode.Grid)
    {
      if (layout.GridTemplateColumns is not null)
        css["grid-template-columns"] = layout.GridTemplateColumns;
      else if (layout.Columns is not null)
        css["grid-template-columns"] = $"repeat({layout.Columns}, minmax(0, 1fr))";

      if (layout.GridTemplateRows is not null)
        css["grid-template-rows"] = layout.GridTemplateRows;
      else if (layout.Rows is not null)
        css["grid-template-rows"] = $"repeat({layout.Rows}, minmax(0, 1fr))";
    }

    return css;
  }

  private static string MapFlexDirection(FlexDirection value) => value switch
  {
    FlexDirection.Column => "column",
    FlexDirection.RowReverse => "row-reverse",
    FlexDirection.ColumnReverse => "column-reverse",
    _ => "row",
  };

  private static string MapAlignItems(AlignItems value) => value switch
  {
    AlignItems.Start => "flex-start",
    AlignItems.End => "flex-end",
    AlignItems.Center => "center",
    AlignItems.Stretch => "stretch",
    AlignItems.Baseline => "baseline",
    _ => "stretch"
  };

  private static string MapJustifyContent(JustifyContent value) => value switch
  {
    JustifyContent.Start => "flex-start",
    JustifyContent.End => "flex-end",
    JustifyContent.Center => "center",
    JustifyContent.SpaceBetween => "space-between",
    JustifyContent.SpaceAround => "space-around",
    JustifyContent.SpaceEvenly => "space-evenly",
    _ => "flex-start"
  };
}
