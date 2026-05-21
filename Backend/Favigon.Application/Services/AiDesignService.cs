using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;
using Favigon.Application.Options;
using Favigon.Converter.Models;
using Favigon.Converter.Schema;
using Favigon.Converter.Validation;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Favigon.Application.Services;

public partial class AiDesignService(
  IAiClient aiClient,
  IOptions<AiSchemaOptions> schemaOptions,
  IMemoryCache cache,
  ILogger<AiDesignService> logger) : IAiDesignService
{
  private readonly string? _aiSchema = IrSchemaLoader.GetAiSchema(schemaOptions.Value.FilePath);

  private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(10);

  private static string BuildCacheKey(AiDesignRequest r)
  {
    var raw = $"design|{r.Prompt}|{r.ViewportWidth}|{r.Model ?? ""}";
    return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));
  }

  private static readonly JsonSerializerOptions JsonOptions = new()
  {
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    Converters =
    {
      new System.Text.Json.Serialization.JsonStringEnumConverter(JsonNamingPolicy.CamelCase),
      new SafeIRNodeListConverter()
    }
  };

  [GeneratedRegex(@"```(?:json)?\s*\n?([\s\S]*?)\n?\s*```")]
  private static partial Regex CodeFenceRegex();

  private static string ExtractJson(string raw)
  {
    var trimmed = raw.Trim();

    // Strip markdown code fences
    var fenceMatch = CodeFenceRegex().Match(trimmed);
    if (fenceMatch.Success)
      trimmed = fenceMatch.Groups[1].Value.Trim();

    // Find the outermost { ... } if there's extra text
    var firstBrace = trimmed.IndexOf('{');
    var lastBrace = trimmed.LastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace)
      trimmed = trimmed[firstBrace..(lastBrace + 1)];

    return trimmed;
  }

  private (IRNode? ir, string? error) TryParseIr(string raw, string context)
  {
    logger.LogDebug("AI {Context} raw response ({Length} chars): {Raw}", context, raw.Length, raw[..Math.Min(raw.Length, 2000)]);
    var json = ExtractJson(raw);

    IRNode? ir;
    try
    {
      ir = JsonSerializer.Deserialize<IRNode>(json, JsonOptions);
    }
    catch (JsonException ex)
    {
      logger.LogError(ex, "AI {Context} returned unparseable JSON. Raw (first 1000 chars): {Raw}", context, json[..Math.Min(json.Length, 1000)]);
      return (null, "AI returned an invalid design structure.");
    }

    if (ir is null)
      return (null, "AI returned an empty design.");

    AssignSequentialIds(ir);

    // Phase 1: snap AI values to design token scale before validation runs
    DesignTokenNormalizer.Normalize(ir);

    var errors = IrValidator.GetValidationErrors(ir);
    if (errors.Count > 0)
    {
      logger.LogWarning("AI {Context} IR failed validation ({ErrorCount} errors): {Errors}", context, errors.Count, string.Join("; ", errors));
      return (null, string.Join("\n", errors.Take(10)));
    }

    return (ir, null);
  }

  public async Task<AiDesignResponse> GenerateDesignAsync(AiDesignRequest request, CancellationToken ct = default)
  {
    // Cache only when not modifying an existing design
    if (request.ExistingIr is null)
    {
      var key = BuildCacheKey(request);
      if (cache.TryGetValue(key, out AiDesignResponse? cached))
      {
        logger.LogDebug("[Cache HIT] design key={Key}", key[..8]);
        return cached!;
      }
    }

    var userMessage = BuildUserMessage(request);
    string raw;

    try
    {
      raw = await aiClient.ChatCompletionAsync(SystemPrompt, userMessage, request.Model, _aiSchema, ct);
    }
    catch (Exception ex)
    {
      logger.LogError(ex, "AI chat completion failed for prompt: {Prompt}", request.Prompt);
      return new AiDesignResponse { Success = false, Message = "AI service is temporarily unavailable." };
    }

    var (ir, validationErrors) = TryParseIr(raw, "generate");

    // Auto-repair: if validation failed, retry once with the errors
    if (ir is null && validationErrors is not null && !validationErrors.StartsWith("AI returned"))
    {
      logger.LogInformation("Attempting AI self-repair for validation errors");
      try
      {
        var brokenJson = ExtractJson(raw);
        var truncatedJson = brokenJson.Length > 3000 ? brokenJson[..3000] + "... (truncated)" : brokenJson;
        var repairPrompt = $"""
          Validation errors:
          {validationErrors}

          Original request: {request.Prompt}
          Broken output (fix this):
          {truncatedJson}
          """;

        var repairRaw = await aiClient.ChatCompletionAsync(RepairSystemPrompt, repairPrompt, request.Model, _aiSchema, ct);
        var (repairIr, _) = TryParseIr(repairRaw, "repair");
        if (repairIr is not null)
          ir = repairIr;
      }
      catch (Exception ex)
      {
        logger.LogWarning(ex, "AI self-repair attempt failed");
      }
    }

    if (ir is null)
      return new AiDesignResponse { Success = false, Message = "AI returned an invalid design. Please try rephrasing." };

    var response = new AiDesignResponse { Success = true, Ir = ir };

    if (request.ExistingIr is null)
      cache.Set(BuildCacheKey(request), response, CacheTtl);

    return response;
  }

  public async IAsyncEnumerable<AiStreamEvent> GenerateDesignStreamingAsync(
      AiDesignRequest request,
      [EnumeratorCancellation] CancellationToken ct = default)
  {
    var userMessage = BuildUserMessage(request);
    var buffer = new StringBuilder();

    await foreach (var chunk in aiClient.StreamChatCompletionAsync(SystemPrompt, userMessage, request.Model, _aiSchema, ct))
    {
      buffer.Append(chunk);
      yield return new AiStreamEvent("chunk", chunk);
    }

    var raw = buffer.ToString();
    var (ir, validationErrors) = TryParseIr(raw, "streaming");

    // Auto-repair: if validation failed (not a JSON parse error), retry once
    if (ir is null && validationErrors is not null && !validationErrors.StartsWith("AI returned"))
    {
      logger.LogInformation("Attempting AI streaming self-repair for validation errors");
      try
      {
        var brokenJson = ExtractJson(raw);
        var truncatedJson = brokenJson.Length > 3000 ? brokenJson[..3000] + "... (truncated)" : brokenJson;
        var repairPrompt = $"""
          Validation errors:
          {validationErrors}

          Original request: {request.Prompt}
          Broken output (fix this):
          {truncatedJson}
          """;

        var repairRaw = await aiClient.ChatCompletionAsync(RepairSystemPrompt, repairPrompt, request.Model, _aiSchema, ct);
        var (repairIr, _) = TryParseIr(repairRaw, "streaming-repair");
        if (repairIr is not null)
          ir = repairIr;
      }
      catch (Exception ex)
      {
        logger.LogWarning(ex, "AI streaming self-repair attempt failed");
      }
    }

    if (ir is null)
    {
      yield return new AiStreamEvent("error", "AI returned an invalid design. Please try rephrasing.");
      yield break;
    }

    var irJson = JsonSerializer.Serialize(ir, JsonOptions);
    yield return new AiStreamEvent("result", irJson);
  }

  private static string BuildUserMessage(AiDesignRequest request)
  {
    var sb = new StringBuilder();
    sb.AppendLine(request.Prompt);
    sb.AppendLine();
    sb.AppendLine($"Target viewport width: {request.ViewportWidth}px.");

    if (request.ExistingIr is not null)
    {
      sb.AppendLine();
      sb.AppendLine("Current design on canvas (modify or extend it as needed):");
      sb.AppendLine(JsonSerializer.Serialize(request.ExistingIr, JsonOptions));
    }

    return sb.ToString();
  }

  private static void AssignSequentialIds(IRNode root)
  {
    var counter = 1;
    AssignIds(root, ref counter);

    static void AssignIds(IRNode node, ref int counter)
    {
      node.Id = counter++.ToString();
      foreach (var child in node.Children)
        AssignIds(child, ref counter);
    }
  }

  private const string RepairSystemPrompt =
    "You are a JSON repair assistant. Fix the listed validation errors in the IR design JSON. " +
    "Return ONLY the corrected complete JSON object — no explanation, no markdown, no code fences.";

  internal const string IrSchemaReference = """

    ## Canvas Rendering Model — READ THIS FIRST
    The canvas renders each node at its declared size. Height behaviour depends entirely on the height mode you choose — pick the WRONG mode and content will be clipped or collapse to 0.

    ### Three height modes — pick the right one:
    - **fit-content** `{ "value": 0, "unit": "fit-content" }`: The container GROWS to wrap all its children. Content is NEVER clipped. **This is the DEFAULT for sections, cards, forms, and any container holding text or variable content.**
    - **fixed px** `{ "value": N, "unit": "px" }`: Exact declared height. Overflow IS CLIPPED — invisible. Use ONLY for: navbar (64–72px), image containers, buttons (44–56px), hero rows (480–640px).
    - **fill (100%)** `{ "value": 100, "unit": "%" }`: Fills the parent's remaining height. ONLY works when the PARENT has a fixed `px` height. Inside a fit-content parent, fill collapses to 0px — NEVER use fill inside a fit-content parent.

    - **Root Frame height**: ALWAYS `{ "value": 0, "unit": "fit-content" }`. The page grows to contain all its sections. NEVER set minHeight, maxHeight, or use vh on the Frame height.
    - **Split-column arithmetic**: In a flex row with a fixed height, leftWidth + gap + rightWidth = parentWidth exactly. Example: parent 1280px, gap 48px → left 616px + right 616px.
    - **Fixed height arithmetic**: When a container uses fixed px, its declared height MUST be ≥ sum(children heights) + gap × (childCount − 1) + paddingTop + paddingBottom. Underestimate = content clipped.

    ## Node Types
    - **Frame**: Root-only page container. Always the root node. One per design. `width: { value: 1280, unit: "px" }` + `height: { value: 0, unit: "fit-content" }`. NEVER use minHeight, maxHeight, or vh/vw on the Frame.
    - **Container**: Generic div/section — grouping, rows, columns, cards, buttons, sections. For images: use a Container with `style.backgroundImage`.
    - **Text**: Leaf node. Content in `props.text`. Always `children: []`. Requires explicit `width` and `height`.

    ## Props
    - Text nodes: `{ "text": "content here" }` — required, non-empty.
    - Image containers: `{}` — image URL in `style.backgroundImage`.
    - Links: `{ "href": "https://...", "linkType": "url", "target": "_blank" }` — on any clickable Container or Text.
    - Other nodes: `{}` or omit.

    ## Position — CRITICAL
    Every Container and Text MUST have `"position": { "mode": "relative" }` unless it is an overlay (absolute/fixed). NEVER omit position on child nodes.

    ## Sizing Rules — Width
    - Fill parent: `{ "value": 100, "unit": "%" }` — sections, text headings, inner wrappers.
    - Fixed px: `{ "value": N, "unit": "px" }` — cards with uniform width, sidebars, images, navbar.
    - Fit-content: `{ "value": 0, "unit": "fit-content" }` — shrinks to content. Value is always 0 for keyword units.
    - Centered max-width layout: outer Container `width: 100%`, flex column, align:center → inner Container `width: 100%` + `maxWidth: { value: 1200, unit: "px" }`.
    - Card grids: flex row `wrap: true` + gap, OR grid with `layout.gridTemplateColumns: "repeat(3, 1fr)"`.
    Height mode decision → see STRUCTURAL rule 6 and `## Canvas Rendering Model`.

    ## Text Rules
    - ONE Text per logical unit — NEVER split. BAD: "Welcome" + "to Our" + "Platform" (they OVERLAP at same position). GOOD: one node "Welcome to Our Platform".
    - Headings and paragraphs: `style.width: { value: 100, unit: "%" }`. Height → DESIGN rule 10.
    - `props.text` MUST be non-empty real content — see `## Copy & Content`.

    ## Image Placeholder Rules — CRITICAL
    - Container with `style.backgroundImage: "url(https://placehold.co/{W}x{H}.png)"` — ALWAYS `.png`.
    - Include `backgroundSize: "cover"`, `backgroundPosition: "center"`, `backgroundRepeat: "no-repeat"`.
    - Explicit px `width` + `height` on the container.

    ## Design System — Decide Before Writing JSON
    Plan all of the following BEFORE writing a single node. Apply uniformly — no random values.

    **Color roles** — pick 6 concrete hex values and reuse them everywhere:
    - `brand` — primary action color (buttons, links, active borders, highlights)
    - `brandDark` — 15–20% darker for hero backgrounds, hover states
    - `accent` — contrasting highlight (badges, tags, decorative pops)
    - `bgBase` — page background (#f8fafc light, #0f172a dark)
    - `surface` — card/panel background (#ffffff light, #1e293b dark)
    - `textPrimary` — main text (#0f172a light, #f1f5f9 dark)
    - `textMuted` — secondary/caption (#64748b, #94a3b8)

    **Typography scale** — use EXACTLY these 7 roles. No freestyle font sizes.
    | Role           | fontSize         | fontWeight | lineHeight | letterSpacing |
    |----------------|------------------|------------|------------|---------------|
    | Display / Hero | 4rem → 64px      | 800        | 1.15em     | -0.03em       |
    | Heading 1      | 3rem → 48px      | 700        | 1.2em      | -0.02em       |
    | Heading 2      | 2rem → 32px      | 700        | 1.25em     | -0.02em       |
    | Heading 3      | 1.5rem → 24px    | 600        | 1.3em      | -0.01em       |
    | Body           | 1rem → 16px      | 400        | 1.6em      | 0em           |
    | Label / Button | 0.875rem → 14px  | 600        | 1em        | 0.01em        |
    | Caption / Muted| 0.75rem → 12px   | 400        | 1.4em      | 0em           |
    - `lineHeight` and `letterSpacing` → IRLength with `em` unit: `{ "value": 1.6, "unit": "em" }`. ALWAYS set these on Text nodes.
    - `fontFamily` → set on root Frame only (it inherits down): `"Inter, system-ui, sans-serif"` for SaaS/modern, `"Georgia, serif"` for editorial.
    - Text node height = `round(fontSize_px × lineHeight) + 4px`.

    **Spacing** — ONLY multiples of 8px: 8, 16, 24, 32, 40, 48, 64, 80, 96, 120.

    ## Visual Treatment — Depth, Polish, Cohesion
    Apply these everywhere. Flat/unstyled output is unacceptable.

    ### Shadows
    `style.shadows`: `[{ "inset": false, "x": 0, "y": Y, "blur": B, "spread": S, "color": "rgba(0,0,0,A)" }]`
    - Card / panel: `y:4, blur:16, spread:0, color:"rgba(0,0,0,0.08)"` — default elevation
    - Elevated card / modal: `y:8, blur:24, spread:-4, color:"rgba(0,0,0,0.14)"`
    - Navbar: `y:2, blur:8, spread:0, color:"rgba(0,0,0,0.08)"` — subtle bottom shadow
    - Button: `y:2, blur:4, spread:0, color:"rgba(0,0,0,0.12)"`
    - Skip on: full-width section backgrounds, text nodes, Frame root.

    ### Border Radius
    - Card / panel / modal: `{ "value": 12, "unit": "px" }`
    - Small card / tag: `{ "value": 8, "unit": "px" }` — badge/chip: `{ "value": 20, "unit": "px" }`
    - Button standard: `{ "value": 8, "unit": "px" }` — pill: `{ "value": 9999, "unit": "px" }`
    - Input field: `{ "value": 8, "unit": "px" }`
    - Image container: `{ "value": 12, "unit": "px" }` — ALWAYS pair with `overflow: "hidden"`
    - Avatar / icon circle: `{ "value": 9999, "unit": "px" }`

    ### Overflow
    EVERY Container with `borderRadius` containing an image or clipped content MUST have `style.overflow: "hidden"`.

    ### Section Backgrounds — Visual Rhythm
    Alternate section backgrounds — never leave every section white:
    - Hero: brand gradient or dark + light-colored text
    - Content section: white `#ffffff` or off-white `#f8fafc`
    - Alternating content section: light gray `#f1f5f9` or subtle brand tint
    - CTA section: brand bg or dark `#0f172a` + white text
    - Footer: always dark (`#0f172a` or `#1e293b`) + `color:"#ffffff"` / `"#94a3b8"` on text

    **Gradient syntax** (a plain CSS string in `style.background`):
    - `"linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)"` — dark-to-brand
    - `"linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)"` — brand sweep
    - `"linear-gradient(180deg, #f0f9ff 0%, #ffffff 100%)"` — light section tint

    ### Buttons — Always Primary AND Secondary
    - **Primary**: `background:brand`, `color:"#ffffff"`, `borderRadius:8px`, button shadow, `cursor:"pointer"`
    - **Secondary/outline**: `background:"transparent"`, `border:{width:2px,color:brand,style:"solid"}`, `color:brand`, `borderRadius:8px`, `cursor:"pointer"`
    - ALL clickable elements (buttons, nav links, cards): `style.cursor: "pointer"`.

    ## Copy & Content — Write Real Text, Not Placeholders
    Content MUST be specific to what was requested. Match the industry, product, and tone.
    - **Hero heading**: compelling 5–10 words — "Ship faster with AI-powered workflows", NOT "Hero Title"
    - **Subheading**: 1 specific sentence — "Automate repetitive tasks and focus on what matters", NOT "Subtitle"
    - **Body**: 1–2 real sentences appropriate for the product context, NOT "Lorem ipsum"
    - **CTA buttons**: action verbs — "Get Started Free", "View Demo", "See Pricing", NOT "Button"
    - **Nav links**: real pages — "Features", "Pricing", "Docs", "Blog", "About", NOT "Link 1"
    - **Card titles**: specific names — "Real-time Analytics", "Automated Billing", NOT "Feature 1"
    - **Section headings**: descriptive — "Everything you need to scale your team", NOT "Features"
    - **Footer links**: real categories — "Product", "Company", "Support", "Legal"
    When no specific content is given, invent plausible realistic copy for the inferred product type.

    ## Layout Patterns
    - **Navbar**: `height:64px`, padding `0 48px`. Background: `#ffffff` or branded, `shadows:[{inset:false,x:0,y:2,blur:8,spread:0,color:"rgba(0,0,0,0.08)"}]`. Logo: Text `fontSize:1.25rem fontWeight:800`. Nav links: flex row gap:32px, Text `fontSize:0.875rem fontWeight:500 color:textMuted cursor:"pointer"`. CTA button right: primary style.
    - **Hero (2-column)**: `height:560px` fixed, flex row, padding `0 80px`. Background: gradient or brand color. Left col `width:608px height:100%`: flex column justify:center gap:24px → Display heading + Body subtitle (color:textMuted) + CTA row (flex row gap:16px, primary + secondary buttons). Right col (remaining width, `height:100%`): image `height:400px borderRadius:16px overflow:hidden`. Both cols: `position:relative`.
    - **Hero (centered)**: `height:fit-content` padding `120px 0`. Flex column center+center gap:24px. Display heading centered + Body subtitle centered (color:textMuted) + CTA row centered. Background: brand or gradient.
    - **Section**: `width:100% height:fit-content`, padding `96px 0`. Flex column align:center. Inner wrapper: `width:100% maxWidth:1200px height:fit-content` flex column gap:48px. Section heading (H2) + content below.
    - **Card grid**: Inner wrapper flex row wrap, gap:32px. Each card: `width:360px height:fit-content borderRadius:12px overflow:hidden background:#ffffff shadows:[{inset:false,x:0,y:4,blur:16,spread:0,color:"rgba(0,0,0,0.08)"}]`. Top image: `width:360px height:220px`. Content area: `height:fit-content padding:24px` flex column gap:12px → H3 title + Body description (color:textMuted) + optional button.
    - **Primary Button**: flex row center+center, `height:48px borderRadius:8px background:brand cursor:"pointer" shadows:[{inset:false,x:0,y:2,blur:4,spread:0,color:"rgba(0,0,0,0.12)"}]`, padding `0 24px`. One Text: `fontWeight:600 fontSize:0.875rem color:#ffffff`.
    - **Secondary Button**: flex row center+center, `height:48px borderRadius:8px background:transparent border:{width:2px,color:brand,style:"solid"} cursor:"pointer"`, padding `0 24px`. One Text: `fontWeight:600 fontSize:0.875rem color:brand`.
    - **Dashboard**: flex row `height:fit-content`. Sidebar: `width:240px height:fit-content background:#0f172a` flex column gap:8px padding:24px. Main: fill width, flex column gap:24px padding:32px `background:#f8fafc`.
    - **Footer**: `width:100% height:fit-content background:#0f172a` padding `80px 0`. Inner wrapper `maxWidth:1200px` flex row spaceBetween gap:48px, centered. Brand col + 3–4 link columns, each: column heading (`color:#ffffff fontWeight:700 fontSize:0.875rem`) + links (`color:#94a3b8 fontSize:0.875rem cursor:"pointer"`). Bottom bar: border-top `#1e293b 1px solid`, copyright Text `color:#64748b fontSize:0.75rem` centered.
    - **Forms**: flex column `height:fit-content gap:20px`. Each field: flex column gap:6px → label Text (`fontWeight:600 fontSize:0.875rem`) + input Container (`height:44px borderRadius:8px border:{width:1px,color:"#cbd5e1",style:"solid"} background:#ffffff padding:0 12px`).

    ## Quality Rules
    - Match structure to what was requested — a dashboard ≠ a landing page ≠ a form.
    - All Containers/Frames MUST have a layout.
    - Every child node MUST have `"position": { "mode": "relative" }` unless deliberately overlaid.
    - Give every node a descriptive `meta.name`.
    - **Keep the tree concise**: max 4–5 levels of nesting. Avoid wrapper-inside-wrapper-inside-wrapper. If a Container has only one child that does the same job, merge them.
    - No Effects, no Variants — base design only.
    - Output ONLY raw JSON. No markdown fences, no explanation.
    - Enum values: camelCase — "flex", "column", "center", "spaceBetween", "flexStart", "flexEnd".
    - Colors: valid CSS — hex, rgb(), rgba(), hsl(), or named.
    (cursor and overflow rules → DESIGN rule 18.)
    """;

  private static readonly string SystemPrompt = $$"""
    You are a UI design assistant for Favigon, a design-to-code platform.
    You generate UI designs as an IR (Intermediate Representation) JSON tree, rendered on a strict pixel-box canvas — like Figma, not a browser.

    When the user provides a "Current design on canvas", modify or extend it.
    When no design is provided, generate a complete fresh design from scratch.
    Always return the COMPLETE design tree — the full root IRNode with all children.

    The structured output JSON schema (sent via response_format) is the authoritative source for field names, types, and enum values. If anything in this prompt conflicts with the schema, the schema wins.

    Rule priority: STRUCTURAL rules (1–9) are hard constraints — never violate them regardless of other guidelines. DESIGN rules (10–18) are strong preferences — follow unless a structural rule conflicts. Structural always wins.

    STRUCTURAL — Never Violate:
    1. Output ONLY a single valid JSON object — the root IRNode. NO markdown, NO explanation, NO code fences.
    2. Text nodes: `children: []`, non-empty `props.text` with real meaningful content.
    3. Every node: `meta.name` with a descriptive label.
    4. Root node MUST be type "Frame".
    5. Every child Container/Text in a flex/grid parent MUST have `"position": { "mode": "relative" }`.
    6. Height mode: `fit-content` for sections/cards/forms/footers. Fixed `px` ONLY for navbar/image containers/buttons/hero rows. NEVER a small fixed height on content — it clips. When fixed px: height ≥ sum(children) + gaps + padding.
    7. ONE Text node per logical text unit. NEVER split a heading across multiple Text nodes.
    8. Image URLs MUST end with `.png`: `url(https://placehold.co/WxH.png)`.
    9. NEVER `width: { "value": 0, "unit": "px" }` on any Container. Every flex Container with 2+ children MUST declare `layout.gap` ≥ 8px.

    DESIGN — Strongly Prefer:
    10. Text node height = round(fontSize_px × lineHeight) + 4px: Display 4rem(64px)×1.15→78px | H1 3rem(48px)×1.2→62px | H2 2rem(32px)×1.25→44px | H3 1.5rem(24px)×1.3→35px | Body 1rem(16px)×1.6→30px | Label 0.875rem(14px)×1.0→18px(use 20px).
    11. Row Container wrapping buttons: width MUST NOT be narrower than its children.
    12. Split-column math: in a flex row, leftWidth + gap + rightWidth = parentWidth exactly.
    13. Keep the node tree concise: max 4–5 nesting levels. Never wrap a single child in an unnecessary Container.
    14. NEVER use `minHeight`, `maxHeight`, `vh`, or `vw` on any node.
    15. Every card and panel MUST have `borderRadius` ≥ 8px and at least one entry in `style.shadows`.
    16. Write real, relevant copy — NEVER "Hero Title", "Feature 1", "Lorem ipsum", "Button", or generic placeholders.
    17. Vary section backgrounds — hero/CTA must have brand or dark bg; footer always dark (#0f172a). NEVER all-white.
    18. Every clickable element MUST have `style.cursor: "pointer"`. Any Container with `borderRadius` clipping content MUST have `style.overflow: "hidden"`.

    {{IrSchemaReference}}
    """;

  // Gracefully handles null / non-object items the AI sometimes generates inside children arrays,
  // instead of throwing JsonException and losing the entire design.
  private sealed class SafeIRNodeListConverter : JsonConverter<List<IRNode>>
  {
    public override List<IRNode> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
      var result = new List<IRNode>();

      if (reader.TokenType == JsonTokenType.Null)
        return result;

      if (reader.TokenType != JsonTokenType.StartArray)
      {
        reader.Skip();
        return result;
      }

      while (reader.Read() && reader.TokenType != JsonTokenType.EndArray)
      {
        if (reader.TokenType == JsonTokenType.Null)
          continue;

        if (reader.TokenType == JsonTokenType.StartObject)
        {
          var node = JsonSerializer.Deserialize<IRNode>(ref reader, options);
          if (node is not null)
            result.Add(node);
        }
        else
        {
          reader.Skip();
        }
      }

      return result;
    }

    public override void Write(Utf8JsonWriter writer, List<IRNode> value, JsonSerializerOptions options)
    {
      writer.WriteStartArray();
      foreach (var node in value)
        JsonSerializer.Serialize(writer, node, options);
      writer.WriteEndArray();
    }
  }
}
