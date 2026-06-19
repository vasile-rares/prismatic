using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Favigon.Converter.Models;

public class IRNode
{
  public string Id { get; set; } = "";
  public string Type { get; set; } = "";

  public Dictionary<string, object?> Props { get; set; } = new();

  public IRLayout? Layout { get; set; }

  public IRStyle? Style { get; set; }

  public IRPosition? Position { get; set; }

  public Dictionary<string, IRVariant> Variants { get; set; } = new();

  public List<IRNode> Children { get; set; } = new();

  public IRMeta Meta { get; set; } = new();

  public List<IREffect>? Effects { get; set; }
}

public class IREffect
{
  public string Preset { get; set; } = "";
  public string Trigger { get; set; } = "onLoad";
  public double? Opacity { get; set; }
  public double? Scale { get; set; }
  public double? Rotate { get; set; }
  public string RotationMode { get; set; } = "2d";
  public double? SkewX { get; set; }
  public double? SkewY { get; set; }
  public double? OffsetX { get; set; }
  public double? OffsetY { get; set; }
  public string? Fill { get; set; }
  public string? Shadow { get; set; }
  public int Duration { get; set; } = 500;
  public int Delay { get; set; } = 0;
  public string Iterations { get; set; } = "1";
  public string Easing { get; set; } = "ease";
  public string Direction { get; set; } = "normal";
  public string FillMode { get; set; } = "forwards";
  public string OffScreenBehavior { get; set; } = "play";
}

public class IRLayout
{
  public LayoutMode Mode { get; set; } = LayoutMode.Flex;

  public FlexDirection? Direction { get; set; }
  public AlignItems? Align { get; set; }
  public JustifyContent? Justify { get; set; }
  public IRLength? Gap { get; set; }
  public IRLength? RowGap { get; set; }
  public IRLength? ColumnGap { get; set; }
  public bool? Wrap { get; set; }

  public int? Columns { get; set; }
  public int? Rows { get; set; }
  public string? GridTemplateColumns { get; set; }
  public string? GridTemplateRows { get; set; }
}

public class IRPosition
{
  public PositionMode Mode { get; set; } = PositionMode.Flow;

  public IRLength? Top { get; set; }
  public IRLength? Right { get; set; }
  public IRLength? Bottom { get; set; }
  public IRLength? Left { get; set; }
}

public class IRStyle
{
  public string? Color { get; set; }
  public string? Background { get; set; }
  public string? BackgroundImage { get; set; }
  public string? BackgroundSize { get; set; }
  public string? BackgroundPosition { get; set; }
  public string? BackgroundRepeat { get; set; }
  public string? ObjectFit { get; set; }
  public string? Transform { get; set; }
  public string? TransformOrigin { get; set; }
  public string? BackfaceVisibility { get; set; }
  public string? TransformStyle { get; set; }

  public IRLength? Width { get; set; }
  public IRLength? Height { get; set; }

  public IRLength? MinWidth { get; set; }
  public IRLength? MaxWidth { get; set; }

  public IRLength? MinHeight { get; set; }
  public IRLength? MaxHeight { get; set; }

  public IRLength? FontSize { get; set; }
  public int? FontWeight { get; set; }
  public string? FontFamily { get; set; }
  public string? FontStyle { get; set; }
  public IRLength? LineHeight { get; set; }
  public IRLength? LetterSpacing { get; set; }

  public string? TextAlign { get; set; }

  public string? TextShadow { get; set; }
  public string? TextTransform { get; set; }
  public string? TextWrap { get; set; }
  public string? WhiteSpace { get; set; }
  public string? WordBreak { get; set; }
  public string? TextDecorationLine { get; set; }
  public string? TextDecorationColor { get; set; }
  public string? TextDecorationStyle { get; set; }
  public string? TextDecorationThickness { get; set; }

  public string? BackgroundColor { get; set; }

  public IRLength? BorderRadius { get; set; }
  public IRLength? BorderTopLeftRadius { get; set; }
  public IRLength? BorderTopRightRadius { get; set; }
  public IRLength? BorderBottomRightRadius { get; set; }
  public IRLength? BorderBottomLeftRadius { get; set; }
  public IRBorder? Border { get; set; }

  public OverflowMode? Overflow { get; set; }
  public List<IRShadow>? Shadows { get; set; }

  public double? Opacity { get; set; }

  public string? MixBlendMode { get; set; }

  public string? Cursor { get; set; }

  public string? Filter { get; set; }
  public string? BackdropFilter { get; set; }

  public string? BackgroundClip { get; set; }

  public IRSpacing? Padding { get; set; }
  public IRSpacing? Margin { get; set; }
}

public class IRShadow
{
  public bool Inset { get; set; }
  public double X { get; set; }
  public double Y { get; set; }
  public double Blur { get; set; }
  public double Spread { get; set; }
  public string Color { get; set; } = "rgba(0,0,0,0.1)";

  public string ToCss()
  {
    var prefix = Inset ? "inset " : "";
    return $"{prefix}{X}px {Y}px {Blur}px {Spread}px {Color}";
  }
}

public class IRSpacing
{
  public IRLength? Top { get; set; }
  public IRLength? Right { get; set; }
  public IRLength? Bottom { get; set; }
  public IRLength? Left { get; set; }
}

public class IRBorder
{
  public IRLength? Width { get; set; }
  public string? Color { get; set; }
  public BorderStyle Style { get; set; } = BorderStyle.Solid;
  public IRLength? TopWidth { get; set; }
  public IRLength? RightWidth { get; set; }
  public IRLength? BottomWidth { get; set; }
  public IRLength? LeftWidth { get; set; }

  public bool? Top { get; set; }
  public bool? Right { get; set; }
  public bool? Bottom { get; set; }
  public bool? Left { get; set; }
}

[JsonConverter(typeof(IRLengthConverter))]
public class IRLength
{
  public double Value { get; set; }
  public string Unit { get; set; } = "px";

  internal static readonly HashSet<string> CssKeywordUnits =
    new(StringComparer.OrdinalIgnoreCase) { "fit-content", "auto", "max-content", "min-content" };

  public override string ToString() =>
    CssKeywordUnits.Contains(Unit) ? Unit : $"{Value}{Unit}";
}

internal sealed class IRLengthConverter : JsonConverter<IRLength>
{
  private static readonly Regex CssLengthRegex = new(
      @"^(-?\d*\.?\d+)(px|%|rem|em|vw|vh)$",
      RegexOptions.Compiled | RegexOptions.IgnoreCase);

  public override IRLength Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
  {
    if (reader.TokenType == JsonTokenType.String)
    {
      return ParseCssString(reader.GetString() ?? "0px");
    }

    if (reader.TokenType != JsonTokenType.StartObject)
      throw new JsonException($"Expected object or string for IRLength, got {reader.TokenType}.");

    double value = 0;
    string unit = "px";

    while (reader.Read() && reader.TokenType != JsonTokenType.EndObject)
    {
      if (reader.TokenType != JsonTokenType.PropertyName) continue;
      var propName = reader.GetString();
      reader.Read();

      if (string.Equals(propName, "value", StringComparison.OrdinalIgnoreCase))
      {
        if (reader.TokenType == JsonTokenType.Number)
        {
          value = reader.GetDouble();
        }
        else if (reader.TokenType == JsonTokenType.String)
        {
          var raw = reader.GetString() ?? "0";
          var parsed = ParseCssString(raw);
          value = parsed.Value;
          unit = parsed.Unit;
        }
      }
      else if (string.Equals(propName, "unit", StringComparison.OrdinalIgnoreCase))
      {
        if (reader.TokenType == JsonTokenType.String)
          unit = reader.GetString() ?? "px";
      }
      else
      {
        reader.Skip();
      }
    }

    return new IRLength { Value = value, Unit = unit };
  }

  public override void Write(Utf8JsonWriter writer, IRLength value, JsonSerializerOptions options)
  {
    writer.WriteStartObject();
    writer.WriteNumber("value", value.Value);
    writer.WriteString("unit", value.Unit);
    writer.WriteEndObject();
  }

  private static IRLength ParseCssString(string raw)
  {
    raw = raw.Trim();

    if (IRLength.CssKeywordUnits.Contains(raw))
      return new IRLength { Value = 0, Unit = raw.ToLowerInvariant() };

    var match = CssLengthRegex.Match(raw);
    if (match.Success && double.TryParse(match.Groups[1].Value, System.Globalization.NumberStyles.Any,
        System.Globalization.CultureInfo.InvariantCulture, out var num))
    {
      return new IRLength { Value = num, Unit = match.Groups[2].Value.ToLowerInvariant() };
    }

    if (double.TryParse(raw, System.Globalization.NumberStyles.Any,
        System.Globalization.CultureInfo.InvariantCulture, out var bare))
    {
      return new IRLength { Value = bare, Unit = "px" };
    }

    return new IRLength { Value = 0, Unit = "px" };
  }
}

public class IRVariant
{
  public IRLayout? Layout { get; set; }
  public IRStyle? Style { get; set; }
  public Dictionary<string, object?>? Props { get; set; }
}

public class IRMeta
{
  public string? Name { get; set; }
  public bool Hidden { get; set; }
  public string? ComponentInstanceId { get; set; }
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum OverflowMode
{
  Clip,
  Visible,
  Hidden,
  Scroll
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum LayoutMode
{
  Block,
  Flex,
  Grid
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PositionMode
{
  Flow,
  Relative,
  Absolute,
  Fixed,
  Sticky
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum FlexDirection
{
  Row,
  Column,
  RowReverse,
  ColumnReverse
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AlignItems
{
  Start,
  Center,
  End,
  Stretch,
  Baseline
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum JustifyContent
{
  Start,
  Center,
  End,
  SpaceBetween,
  SpaceAround,
  SpaceEvenly
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum BorderStyle
{
  Solid,
  Dashed,
  Dotted,
  Double,
  None
}
