using Favigon.Converter;
using Favigon.Converter.Models;

namespace Favigon.Tests.Converter;

public class ConverterEngineTests
{
  [Fact]
  public void GenerateMultiPage_HtmlNormalizesCanvasRootAndViewportFrameNames()
  {
    var sut = new ConverterEngine();
    var root = new IRNode
    {
      Id = "canvas-project-123",
      Type = "Container",
      Props = new Dictionary<string, object?>
      {
        ["role"] = "canvas-root",
        ["pageName"] = "Home"
      },
      Layout = new IRLayout
      {
        Mode = LayoutMode.Flex,
        Direction = FlexDirection.Column
      },
      Style = new IRStyle
      {
        Width = new IRLength { Value = 100, Unit = "%" },
        Height = new IRLength { Value = 100, Unit = "%" }
      },
      Children =
      [
        new IRNode
        {
          Id = "frame-home",
          Type = "Frame",
          // Canvas-level position that must NOT appear in exported CSS for .page
          Position = new IRPosition
          {
            Mode = PositionMode.Absolute,
            Left = new IRLength { Value = 800, Unit = "px" },
            Top = new IRLength { Value = 500, Unit = "px" }
          },
          Style = new IRStyle
          {
            Width = new IRLength { Value = 1280, Unit = "px" },
            Height = new IRLength { Value = 720, Unit = "px" }
          },
          Meta = new IRMeta
          {
            Name = "Desktop"
          }
        }
      ]
    };

    var files = sut.GenerateMultiPage(
      [
        ("Home", 1280, root)
      ],
      "html");

    var homeHtml = Assert.Single(files, file => file.Path == "home.html");
    var homeCss = Assert.Single(files, file => file.Path == "home.css");

    Assert.Contains("class=\"page\"", homeHtml.Content);
    Assert.DoesNotContain("class=\"desktop\"", homeHtml.Content, StringComparison.OrdinalIgnoreCase);
    Assert.DoesNotContain("container-project-123", homeHtml.Content, StringComparison.OrdinalIgnoreCase);

    Assert.Contains(".page", homeCss.Content);
    Assert.DoesNotContain(".desktop", homeCss.Content, StringComparison.OrdinalIgnoreCase);
    Assert.DoesNotContain(".container-project-123", homeCss.Content, StringComparison.OrdinalIgnoreCase);

    // .page must be position: relative (containing block) with no canvas coordinates
    Assert.Contains("position: relative", homeCss.Content);
    Assert.DoesNotContain("position: absolute", homeCss.Content);
    Assert.DoesNotContain("left:", homeCss.Content);
    Assert.DoesNotContain("top:", homeCss.Content);
  }

  [Fact]
  public void GenerateMultiPage_HtmlUsesUniqueScopedClassesForDuplicateNames()
  {
    var sut = new ConverterEngine();
    var root = new IRNode
    {
      Id = "canvas-project-456",
      Type = "Container",
      Props = new Dictionary<string, object?>
      {
        ["role"] = "canvas-root",
        ["pageName"] = "Home"
      },
      Children =
      [
        new IRNode
        {
          Id = "frame-home",
          Type = "Frame",
          Meta = new IRMeta
          {
            Name = "Desktop"
          },
          Children =
          [
            new IRNode
            {
              Id = "rect-a",
              Type = "Container",
              Meta = new IRMeta
              {
                Name = "Rectangle"
              },
              Style = new IRStyle
              {
                Width = new IRLength { Value = 120, Unit = "px" },
                Height = new IRLength { Value = 80, Unit = "px" }
              }
            },
            new IRNode
            {
              Id = "rect-b",
              Type = "Container",
              Meta = new IRMeta
              {
                Name = "Rectangle"
              },
              Style = new IRStyle
              {
                Width = new IRLength { Value = 200, Unit = "px" },
                Height = new IRLength { Value = 100, Unit = "px" }
              }
            }
          ]
        }
      ]
    };

    var files = sut.GenerateMultiPage(
      [
        ("Home", 1280, root)
      ],
      "html");

    var homeHtml = Assert.Single(files, file => file.Path == "home.html");
    var homeCss = Assert.Single(files, file => file.Path == "home.css");

    Assert.Contains("rect rect-1", homeHtml.Content);
    Assert.Contains("rect rect-2", homeHtml.Content);

    Assert.Contains(".rect-1", homeCss.Content);
    Assert.Contains(".rect-2", homeCss.Content);
  }

  [Fact]
  public void GenerateMultiPage_CssOmitsDefaultOpacityAndZeroBorderRadius()
  {
    var sut = new ConverterEngine();
    var root = new IRNode
    {
      Id = "canvas-project-defaults",
      Type = "Container",
      Props = new Dictionary<string, object?> { ["role"] = "canvas-root" },
      Children =
      [
        new IRNode
        {
          Id = "rect-default",
          Type = "Container",
          Meta = new IRMeta { Name = "Box" },
          Style = new IRStyle
          {
            Width = new IRLength { Value = 100, Unit = "px" },
            Height = new IRLength { Value = 100, Unit = "px" },
            Opacity = 1.0,
            BorderRadius = new IRLength { Value = 0, Unit = "px" }
          }
        },
        new IRNode
        {
          Id = "rect-custom",
          Type = "Container",
          Meta = new IRMeta { Name = "Custom" },
          Style = new IRStyle
          {
            Width = new IRLength { Value = 80, Unit = "px" },
            Height = new IRLength { Value = 80, Unit = "px" },
            Opacity = 0.5,
            BorderRadius = new IRLength { Value = 8, Unit = "px" }
          }
        }
      ]
    };

    var files = sut.GenerateMultiPage([("Page", 1280, root)], "html");

    var css = Assert.Single(files, f => f.Path == "page.css");

    // Default values must NOT appear
    Assert.DoesNotContain("opacity: 1", css.Content);
    Assert.DoesNotContain("border-radius: 0", css.Content);

    // Non-default values MUST appear
    Assert.Contains("opacity: 0.5", css.Content);
    Assert.Contains("border-radius: 8px", css.Content);
  }

  [Fact]
  public void GenerateMultiPage_HtmlEmitsOverflowFromStyle()
  {
    var sut = new ConverterEngine();
    var root = new IRNode
    {
      Id = "canvas-project-789",
      Type = "Container",
      Props = new Dictionary<string, object?>
      {
        ["role"] = "canvas-root",
        ["pageName"] = "Home"
      },
      Children =
      [
        new IRNode
        {
          Id = "frame-home",
          Type = "Frame",
          Meta = new IRMeta
          {
            Name = "Desktop"
          },
          Style = new IRStyle
          {
            Width = new IRLength { Value = 1280, Unit = "px" },
            Height = new IRLength { Value = 720, Unit = "px" },
            Overflow = OverflowMode.Clip
          }
        }
      ]
    };

    var files = sut.GenerateMultiPage(
      [
        ("Home", 1280, root)
      ],
      "html");

    var homeCss = Assert.Single(files, file => file.Path == "home.css");
    Assert.Contains("overflow: clip;", homeCss.Content);
  }

  [Fact]
  public void GenerateMultiPage_HtmlEmitsScrollOverflowFromStyle()
  {
    var sut = new ConverterEngine();
    var root = new IRNode
    {
      Id = "canvas-project-overflow-scroll",
      Type = "Container",
      Props = new Dictionary<string, object?>
      {
        ["role"] = "canvas-root",
        ["pageName"] = "Scrollable"
      },
      Children =
      [
        new IRNode
        {
          Id = "frame-scroll",
          Type = "Frame",
          Meta = new IRMeta
          {
            Name = "Scrollable Frame"
          },
          Style = new IRStyle
          {
            Width = new IRLength { Value = 1280, Unit = "px" },
            Height = new IRLength { Value = 720, Unit = "px" },
            Overflow = OverflowMode.Scroll
          }
        }
      ]
    };

    var files = sut.GenerateMultiPage(
      [
        ("Scrollable", 1280, root)
      ],
      "html");

    var css = Assert.Single(files, file => file.Path == "scrollable.css");
    Assert.Contains("overflow: scroll;", css.Content);
  }

  // ── Responsive output ────────────────────────────────────

  [Fact]
  public void GenerateResponsiveOutput_ExclusiveBpNode_AppearsInHtmlHiddenByDefaultAndVisibleInMedia()
  {
    var sut = new ConverterEngine();

    // Primary (Desktop): one child element
    var desktopRoot = new IRNode
    {
      Id = "canvas-project-resp",
      Type = "Container",
      Props = new Dictionary<string, object?> { ["role"] = "canvas-root" },
      Children =
      [
        new IRNode
        {
          Id = "frame-desktop",
          Type = "Frame",
          Meta = new IRMeta { Name = "Desktop" },
          Style = new IRStyle
          {
            Width = new IRLength { Value = 1280, Unit = "px" },
            Height = new IRLength { Value = 800, Unit = "px" }
          },
          Children =
          [
            new IRNode
            {
              Id = "hero-shared",
              Type = "Container",
              Meta = new IRMeta { Name = "Hero" },
              Style = new IRStyle
              {
                Width = new IRLength { Value = 1200, Unit = "px" },
                Height = new IRLength { Value = 400, Unit = "px" },
                Background = "#ffffff"
              }
            }
          ]
        }
      ]
    };

    // Mobile (375px): shared Hero (remapped to same ID) + exclusive MobileMenu node
    var mobileRoot = new IRNode
    {
      Id = "canvas-project-resp",
      Type = "Container",
      Props = new Dictionary<string, object?> { ["role"] = "canvas-root" },
      Children =
      [
        new IRNode
        {
          Id = "frame-desktop",            // same as primary — this is the synced root
          Type = "Frame",
          Meta = new IRMeta { Name = "Desktop" },
          Style = new IRStyle
          {
            Width = new IRLength { Value = 375, Unit = "px" },
            Height = new IRLength { Value = 800, Unit = "px" }
          },
          Children =
          [
            new IRNode
            {
              Id = "hero-shared",           // shared — same ID as in primary
              Type = "Container",
              Meta = new IRMeta { Name = "Hero" },
              Style = new IRStyle
              {
                Width = new IRLength { Value = 375, Unit = "px" },
                Height = new IRLength { Value = 200, Unit = "px" },
                Background = "#ffffff"
              }
            },
            new IRNode
            {
              Id = "mobile-menu",           // exclusive to Mobile — not in primary
              Type = "Container",
              Meta = new IRMeta { Name = "Mobile Menu" },  // slugifies to "mobile-menu"
              Style = new IRStyle
              {
                Width = new IRLength { Value = 375, Unit = "px" },
                Height = new IRLength { Value = 60, Unit = "px" },
                Background = "#000000"
              }
            }
          ]
        }
      ]
    };

    var (html, css) = sut.GenerateResponsiveOutput(
      [(desktopRoot, 1280, "Desktop – 1280px"), (mobileRoot, 375, "Mobile – 375px")],
      "html");

    // 1. The exclusive mobile node must appear in the HTML
    Assert.Contains("mobile-menu", html);

    // 2. The exclusive node's CSS class must be hidden in the base CSS
    Assert.Matches(@"\.mobile-menu\s*\{\s*display:\s*none", css);

    // 3. The @media block must un-hide it (display: block or explicit display value)
    Assert.Matches(@"@media\s*\(max-width:\s*375px\)", css);
    var mediaIndex = css.IndexOf("@media", StringComparison.Ordinal);
    var mediaBlock = css[mediaIndex..];
    Assert.Contains("mobile-menu", mediaBlock);
    Assert.Contains("display:", mediaBlock);

    // 4. The Hero shared node must NOT get display:none in the base CSS
    var baseRegion = css[..mediaIndex];
    Assert.DoesNotMatch(@"\.hero\s*\{\s*display:\s*none", baseRegion);
  }

  [Fact]
  public void GenerateResponsiveOutput_PrimaryOnlyNode_GetsDisplayNoneAtBreakpoint()
  {
    var sut = new ConverterEngine();

    var desktopRoot = new IRNode
    {
      Id = "canvas-resp2",
      Type = "Container",
      Props = new Dictionary<string, object?> { ["role"] = "canvas-root" },
      Children =
      [
        new IRNode
        {
          Id = "frame-d",
          Type = "Frame",
          Meta = new IRMeta { Name = "Desktop" },
          Style = new IRStyle { Width = new IRLength { Value = 1280, Unit = "px" }, Height = new IRLength { Value = 800, Unit = "px" } },
          Children =
          [
            new IRNode
            {
              Id = "sidebar",
              Type = "Container",
              Meta = new IRMeta { Name = "Sidebar" },
              Style = new IRStyle { Width = new IRLength { Value = 300, Unit = "px" }, Height = new IRLength { Value = 800, Unit = "px" } }
            }
          ]
        }
      ]
    };

    // Mobile: no Sidebar (it's desktop-only)
    var mobileRoot = new IRNode
    {
      Id = "canvas-resp2",
      Type = "Container",
      Props = new Dictionary<string, object?> { ["role"] = "canvas-root" },
      Children =
      [
        new IRNode
        {
          Id = "frame-d",
          Type = "Frame",
          Meta = new IRMeta { Name = "Desktop" },
          Style = new IRStyle { Width = new IRLength { Value = 375, Unit = "px" }, Height = new IRLength { Value = 800, Unit = "px" } }
        }
      ]
    };

    var (_, css) = sut.GenerateResponsiveOutput(
      [(desktopRoot, 1280, "Desktop – 1280px"), (mobileRoot, 375, "Mobile – 375px")],
      "html");

    var mediaIndex = css.IndexOf("@media", StringComparison.Ordinal);
    Assert.True(mediaIndex >= 0, "Expected a @media block in the CSS");
    var mediaBlock = css[mediaIndex..];

    // Sidebar is primary-only → must be hidden at mobile
    Assert.Contains("sidebar", mediaBlock);
    Assert.Contains("display: none", mediaBlock);
  }

  [Fact]
  public void GenerateResponsiveOutput_HoverEffectDiff_EmittedInMediaQuery()
  {
    var sut = new ConverterEngine();

    static IRNode MakeRoot(string frameId, int frameWidth, float hoverOpacity) => new IRNode
    {
      Id = "canvas-hover",
      Type = "Container",
      Props = new Dictionary<string, object?> { ["role"] = "canvas-root" },
      Children =
      [
        new IRNode
        {
          Id = frameId,
          Type = "Frame",
          Meta = new IRMeta { Name = "Desktop" },
          Style = new IRStyle
          {
            Width = new IRLength { Value = frameWidth, Unit = "px" },
            Height = new IRLength { Value = 800, Unit = "px" }
          },
          Children =
          [
            new IRNode
            {
              Id = "hover-btn",
              Type = "Container",
              Meta = new IRMeta { Name = "Button" },
              Style = new IRStyle { Width = new IRLength { Value = 200, Unit = "px" }, Height = new IRLength { Value = 50, Unit = "px" } },
              Effects = [new IREffect { Trigger = "hover", Opacity = hoverOpacity }]
            }
          ]
        }
      ]
    };

    var (_, css) = sut.GenerateResponsiveOutput(
      [(MakeRoot("frame-d", 1280, 0.8f), 1280, "Desktop – 1280px"),
       (MakeRoot("frame-d", 375, 0.3f), 375, "Mobile – 375px")],
      "html");

    var mediaIndex = css.IndexOf("@media", StringComparison.Ordinal);
    Assert.True(mediaIndex >= 0, "Expected @media block");
    var mediaBlock = css[mediaIndex..];

    // Hover pseudo-class diff must appear inside the @media block
    Assert.Contains(":hover", mediaBlock);
    Assert.Contains("opacity:", mediaBlock);
  }

  [Fact]
  public void GenerateResponsiveOutput_NewKeyframeAtBreakpoint_EmittedBeforeMedia()
  {
    var sut = new ConverterEngine();

    var primaryRoot = new IRNode
    {
      Id = "canvas-kf",
      Type = "Container",
      Props = new Dictionary<string, object?> { ["role"] = "canvas-root" },
      Children =
      [
        new IRNode
        {
          Id = "frame-d",
          Type = "Frame",
          Meta = new IRMeta { Name = "Desktop" },
          Style = new IRStyle { Width = new IRLength { Value = 1280, Unit = "px" }, Height = new IRLength { Value = 800, Unit = "px" } },
          Children =
          [
            new IRNode
            {
              Id = "banner",
              Type = "Container",
              Meta = new IRMeta { Name = "Banner" },
              Style = new IRStyle { Width = new IRLength { Value = 1200, Unit = "px" }, Height = new IRLength { Value = 300, Unit = "px" } }
              // No animation on desktop
            }
          ]
        }
      ]
    };

    var mobileRoot = new IRNode
    {
      Id = "canvas-kf",
      Type = "Container",
      Props = new Dictionary<string, object?> { ["role"] = "canvas-root" },
      Children =
      [
        new IRNode
        {
          Id = "frame-d",
          Type = "Frame",
          Meta = new IRMeta { Name = "Desktop" },
          Style = new IRStyle { Width = new IRLength { Value = 375, Unit = "px" }, Height = new IRLength { Value = 800, Unit = "px" } },
          Children =
          [
            new IRNode
            {
              Id = "banner",
              Type = "Container",
              Meta = new IRMeta { Name = "Banner" },
              Style = new IRStyle { Width = new IRLength { Value = 375, Unit = "px" }, Height = new IRLength { Value = 200, Unit = "px" } },
              Effects = [new IREffect { Preset = "slide", Trigger = "onLoad", Opacity = 0.0, Duration = 400 }]
            }
          ]
        }
      ]
    };

    var (_, css) = sut.GenerateResponsiveOutput(
      [(primaryRoot, 1280, "Desktop – 1280px"), (mobileRoot, 375, "Mobile – 375px")],
      "html");

    // New keyframe must appear in the CSS
    Assert.Contains("@keyframes", css);

    // Keyframe must appear BEFORE the @media block
    var kfIndex = css.IndexOf("@keyframes", StringComparison.Ordinal);
    var mediaIndex = css.IndexOf("@media", StringComparison.Ordinal);
    Assert.True(kfIndex >= 0 && mediaIndex >= 0 && kfIndex < mediaIndex,
      "Expected @keyframes to appear before the @media block");
  }

  [Fact]
  public void GenerateResponsiveOutput_ReorderedFlexChildren_EmitsOrderInMedia()
  {
    var sut = new ConverterEngine();

    var primaryRoot = new IRNode
    {
      Id = "canvas-order",
      Type = "Container",
      Props = new Dictionary<string, object?> { ["role"] = "canvas-root" },
      Children =
      [
        new IRNode
        {
          Id = "frame-d",
          Type = "Frame",
          Meta = new IRMeta { Name = "Desktop" },
          Style = new IRStyle { Width = new IRLength { Value = 1280, Unit = "px" }, Height = new IRLength { Value = 800, Unit = "px" } },
          Children =
          [
            new IRNode
            {
              Id = "row",
              Type = "Container",
              Meta = new IRMeta { Name = "Row" },
              Layout = new IRLayout { Mode = LayoutMode.Flex, Direction = FlexDirection.Row },
              Style = new IRStyle { Width = new IRLength { Value = 1280, Unit = "px" }, Height = new IRLength { Value = 400, Unit = "px" } },
              Children =
              [
                new IRNode { Id = "alpha", Type = "Container", Meta = new IRMeta { Name = "Alpha" }, Style = new IRStyle { Width = new IRLength { Value = 300, Unit = "px" }, Height = new IRLength { Value = 400, Unit = "px" } } },
                new IRNode { Id = "beta",  Type = "Container", Meta = new IRMeta { Name = "Beta"  }, Style = new IRStyle { Width = new IRLength { Value = 980, Unit = "px" }, Height = new IRLength { Value = 400, Unit = "px" } } }
              ]
            }
          ]
        }
      ]
    };

    // Mobile: same structure but children reversed [beta, alpha]
    var mobileRoot = new IRNode
    {
      Id = "canvas-order",
      Type = "Container",
      Props = new Dictionary<string, object?> { ["role"] = "canvas-root" },
      Children =
      [
        new IRNode
        {
          Id = "frame-d",
          Type = "Frame",
          Meta = new IRMeta { Name = "Desktop" },
          Style = new IRStyle { Width = new IRLength { Value = 375, Unit = "px" }, Height = new IRLength { Value = 800, Unit = "px" } },
          Children =
          [
            new IRNode
            {
              Id = "row",
              Type = "Container",
              Meta = new IRMeta { Name = "Row" },
              Layout = new IRLayout { Mode = LayoutMode.Flex, Direction = FlexDirection.Column },
              Style = new IRStyle { Width = new IRLength { Value = 375, Unit = "px" }, Height = new IRLength { Value = 800, Unit = "px" } },
              Children =
              [
                new IRNode { Id = "beta",  Type = "Container", Meta = new IRMeta { Name = "Beta"  }, Style = new IRStyle { Width = new IRLength { Value = 375, Unit = "px" }, Height = new IRLength { Value = 300, Unit = "px" } } },
                new IRNode { Id = "alpha", Type = "Container", Meta = new IRMeta { Name = "Alpha" }, Style = new IRStyle { Width = new IRLength { Value = 375, Unit = "px" }, Height = new IRLength { Value = 300, Unit = "px" } } }
              ]
            }
          ]
        }
      ]
    };

    var (_, css) = sut.GenerateResponsiveOutput(
      [(primaryRoot, 1280, "Desktop – 1280px"), (mobileRoot, 375, "Mobile – 375px")],
      "html");

    var mediaIndex = css.IndexOf("@media", StringComparison.Ordinal);
    Assert.True(mediaIndex >= 0, "Expected @media block");
    var mediaBlock = css[mediaIndex..];

    // Both alpha and beta must have explicit order values in the @media block
    Assert.Matches(@"\.alpha\s*\{[^}]*order:\s*1", mediaBlock);
    Assert.Matches(@"\.beta\s*\{[^}]*order:\s*0", mediaBlock);
  }

  [Fact]
  public void GenerateResponsiveOutput_DuplicateNamedSharedChildren_KeepPrimaryClassMapping()
  {
    var sut = new ConverterEngine();

    var primaryRoot = new IRNode
    {
      Id = "canvas-duplicate-order",
      Type = "Container",
      Props = new Dictionary<string, object?> { ["role"] = "canvas-root" },
      Children =
      [
        new IRNode
        {
          Id = "frame-d",
          Type = "Frame",
          Meta = new IRMeta { Name = "Desktop" },
          Layout = new IRLayout { Mode = LayoutMode.Flex, Direction = FlexDirection.Row },
          Style = new IRStyle
          {
            Width = new IRLength { Value = 1280, Unit = "px" },
            Height = new IRLength { Value = 720, Unit = "px" },
            Background = "#FFFFFF"
          },
          Children =
          [
            new IRNode
            {
              Id = "rect-red",
              Type = "Container",
              Meta = new IRMeta { Name = "Rectangle" },
              Style = new IRStyle
              {
                Width = new IRLength { Value = 435, Unit = "px" },
                Height = new IRLength { Value = 251, Unit = "px" },
                Background = "#FF0000"
              }
            },
            new IRNode
            {
              Id = "rect-green",
              Type = "Container",
              Meta = new IRMeta { Name = "Rectangle" },
              Style = new IRStyle
              {
                Width = new IRLength { Value = 435, Unit = "px" },
                Height = new IRLength { Value = 251, Unit = "px" },
                Background = "#00FF48"
              }
            }
          ]
        }
      ]
    };

    var mobileRoot = new IRNode
    {
      Id = "canvas-duplicate-order",
      Type = "Container",
      Props = new Dictionary<string, object?> { ["role"] = "canvas-root" },
      Children =
      [
        new IRNode
        {
          Id = "frame-d",
          Type = "Frame",
          Meta = new IRMeta { Name = "Desktop" },
          Layout = new IRLayout { Mode = LayoutMode.Flex, Direction = FlexDirection.Column },
          Style = new IRStyle
          {
            Width = new IRLength { Value = 375, Unit = "px" },
            Height = new IRLength { Value = 720, Unit = "px" },
            Background = "#FFFFFF"
          },
          Children =
          [
            new IRNode
            {
              Id = "rect-green",
              Type = "Container",
              Meta = new IRMeta { Name = "Rectangle" },
              Style = new IRStyle
              {
                Width = new IRLength { Value = 375, Unit = "px" },
                Height = new IRLength { Value = 251, Unit = "px" },
                Background = "#00FF48"
              }
            },
            new IRNode
            {
              Id = "rect-red",
              Type = "Container",
              Meta = new IRMeta { Name = "Rectangle" },
              Style = new IRStyle
              {
                Width = new IRLength { Value = 375, Unit = "px" },
                Height = new IRLength { Value = 251, Unit = "px" },
                Background = "#FF0000"
              }
            }
          ]
        }
      ]
    };

    var (html, css) = sut.GenerateResponsiveOutput(
      [(primaryRoot, 1280, "Desktop â€“ 1280px"), (mobileRoot, 375, "Mobile â€“ 375px")],
      "html");

    Assert.Contains("rect rect-1", html);
    Assert.Contains("rect rect-2", html);

    var mediaIndex = css.IndexOf("@media", StringComparison.Ordinal);
    Assert.True(mediaIndex >= 0, "Expected @media block");
    var mediaBlock = css[mediaIndex..];

    Assert.Matches(@"\.rect-1\s*\{[\s\S]*order:\s*1;", mediaBlock);
    Assert.Matches(@"\.rect-2\s*\{[\s\S]*order:\s*0;", mediaBlock);
    Assert.DoesNotMatch(@"\.rect-1\s*\{[\s\S]*background:", mediaBlock);
    Assert.DoesNotMatch(@"\.rect-2\s*\{[\s\S]*background:", mediaBlock);
  }
}
