using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Helpers;
using Favigon.Application.Interfaces;
using Favigon.Application.Options;
using Favigon.Converter.Models;
using Favigon.Converter.Schema;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Favigon.Application.Services;

public sealed class AiPipelineService(
    IAiClient aiClient,
    IOptions<AiSchemaOptions> schemaOptions,
    IMemoryCache cache,
    ILogger<AiPipelineService> logger) : IAiPipelineService
{
  private readonly string? _irSchema = IrSchemaLoader.GetAiSchema(schemaOptions.Value.FilePath);
  private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(10);

  private static string BuildCacheKey(AiPipelineRequest r)
  {
    var raw = $"pipeline|{r.Prompt}|{r.ViewportWidth}|{r.Model ?? ""}|{r.StopAfterPhase}";
    return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));
  }

  public async Task<AiPipelineResponse> RunPipelineAsync(
      AiPipelineRequest request,
      CancellationToken ct = default)
  {
    var key = BuildCacheKey(request);
    if (cache.TryGetValue(key, out AiPipelineResponse? cached))
    {
      logger.LogDebug("[Cache HIT] pipeline key={Key}", key[..8]);
      return cached!;
    }

    // Phase 1: intent
    logger.LogInformation("[Pipeline] Phase 1 — analyzing intent for: {Prompt}", request.Prompt[..Math.Min(request.Prompt.Length, 80)]);

    var (blueprint, intentError) = await Phase1IntentAsync(request, ct);
    if (blueprint is null)
      return Fail(intentError ?? "Intent analysis failed.");

    if (request.StopAfterPhase == 1)
    {
      var r = new AiPipelineResponse { Success = true, Intent = blueprint };
      cache.Set(key, r, CacheTtl);
      return r;
    }

    // Phase 2: structure
    logger.LogInformation("[Pipeline] Phase 2 — building structure ({Sections} sections)", blueprint.Sections.Count);

    var (structure, structureError) = await Phase2StructureAsync(request, blueprint, ct);
    if (structure is null)
      return Fail(structureError ?? "Structure generation failed.");

    if (request.StopAfterPhase == 2)
    {
      var r = new AiPipelineResponse { Success = true, Intent = blueprint, Structure = structure };
      cache.Set(key, r, CacheTtl);
      return r;
    }

    // Phase 3: style
    logger.LogInformation("[Pipeline] Phase 3 — applying design system ({Mood} mood)", blueprint.ColorMood);

    var (styledIr, styleError) = await Phase3StyleAsync(request, blueprint, structure, ct);
    if (styledIr is null)
      return Fail(styleError ?? "Style application failed.");

    logger.LogInformation("[Pipeline] Complete — 3-phase pipeline finished successfully.");
    var result = new AiPipelineResponse
    {
      Success = true,
      Intent = blueprint,
      Structure = structure,
      Ir = styledIr
    };
    cache.Set(key, result, CacheTtl);
    return result;
  }

  public async IAsyncEnumerable<AiStreamEvent> RunPipelineStreamingAsync(
      AiPipelineRequest request,
      [EnumeratorCancellation] CancellationToken ct = default)
  {

    yield return PhaseStart(1, "Analyzing your request...");

    var (blueprint, intentError) = await Phase1IntentAsync(request, ct);
    if (blueprint is null)
    {
      yield return new AiStreamEvent("error", intentError ?? "Intent analysis failed.");
      yield break;
    }

    yield return PhaseComplete(1, JsonSerializer.Serialize(blueprint, AiIrHelper.JsonOptions));

    if (request.StopAfterPhase == 1)
    {
      yield return new AiStreamEvent("result", JsonSerializer.Serialize(
          new AiPipelineResponse { Success = true, Intent = blueprint },
          AiIrHelper.JsonOptions));
      yield break;
    }


    yield return PhaseStart(2, "Building page structure...");

    var (structure, structureError) = await Phase2StructureAsync(request, blueprint, ct);
    if (structure is null)
    {
      yield return new AiStreamEvent("error", structureError ?? "Structure generation failed.");
      yield break;
    }

    yield return PhaseComplete(2, JsonSerializer.Serialize(structure, AiIrHelper.JsonOptions));

    if (request.StopAfterPhase == 2)
    {
      yield return new AiStreamEvent("result", JsonSerializer.Serialize(
          new AiPipelineResponse { Success = true, Intent = blueprint, Structure = structure },
          AiIrHelper.JsonOptions));
      yield break;
    }


    yield return PhaseStart(3, "Applying design system...");

    var (styledIr, styleError) = await Phase3StyleAsync(request, blueprint, structure, ct);
    if (styledIr is null)
    {
      yield return new AiStreamEvent("error", styleError ?? "Style application failed.");
      yield break;
    }

    yield return PhaseComplete(3, null);

    yield return new AiStreamEvent("result", JsonSerializer.Serialize(
        new AiPipelineResponse { Success = true, Intent = blueprint, Structure = structure, Ir = styledIr },
        AiIrHelper.JsonOptions));
  }

  private static AiStreamEvent PhaseStart(int phase, string label) =>
      new("phase_start", JsonSerializer.Serialize(new { phase, label }));

  private static AiStreamEvent PhaseComplete(int phase, string? data) =>
      new("phase_complete", JsonSerializer.Serialize(new { phase, data }));

  private static AiPipelineResponse Fail(string message) =>
      new() { Success = false, Message = message };

  // Phase 1: intent

  private const string IntentSchema = """
    {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "title": "IntentBlueprint",
      "type": "object",
      "required": ["pageType", "colorMood", "brandPersonality", "targetAudience", "primaryCta", "sections"],
      "properties": {
        "pageType": {
          "type": "string",
          "enum": ["landing", "dashboard", "auth", "blog", "portfolio", "ecommerce", "docs", "other"]
        },
        "colorMood": {
          "type": "string",
          "enum": ["professional", "playful", "minimal", "bold", "elegant", "dark", "vibrant"]
        },
        "brandPersonality": { "type": "string" },
        "targetAudience": { "type": "string" },
        "primaryCta": { "type": "string" },
        "sections": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name", "purpose", "layoutHint", "order"],
            "properties": {
              "name": { "type": "string" },
              "purpose": { "type": "string" },
              "layoutHint": {
                "type": "string",
                "enum": [
                  "horizontal-bar",
                  "full-width-centered",
                  "two-column-split",
                  "card-grid-2",
                  "card-grid-3",
                  "card-grid-4",
                  "single-column",
                  "multi-column-footer",
                  "dashboard-sidebar",
                  "form-centered",
                  "testimonial-row"
                ]
              },
              "order": { "type": "integer", "minimum": 1 }
            }
          },
          "minItems": 2,
          "maxItems": 8
        }
      },
      "additionalProperties": false
    }
    """;

  private const string IntentSystemPrompt = """
    You are a UX strategist for Favigon, a design-to-code platform.

    Analyze the user's UI request and produce a structured IntentBlueprint.
    This is a PLANNING step only — zero design decisions.

    Your blueprint defines:
    - pageType: classify the page category.
    - colorMood: the visual mood that fits the brand.
    - brandPersonality: one sentence describing the product/brand based on the request.
    - targetAudience: who this page is for (one sentence).
    - primaryCta: the main call-to-action button text.
    - sections: ordered list (1-based "order") of sections the page needs, each with:
        - name: section name (Navbar, Hero, Features, Benefits, Pricing, Testimonials, FAQ, CTA, Footer, etc.)
        - purpose: one sentence why this section is on the page
        - layoutHint: the layout pattern that suits this section (must be one of the allowed enum values)
        - order: position in the page (1-based, ascending)

    Section rules:
    - Every page MUST start with a Navbar (horizontal-bar) and end with a Footer (multi-column-footer).
    - Special layouts: Dashboard → dashboard-sidebar body. Auth → form-centered.
    - For all other pages (landing, marketing, product, etc.): DO NOT follow a fixed template.
      Think about what genuinely serves this specific product and audience:
        • What does the visitor need to understand first? (Hero)
        • What builds trust? (Testimonials, Social Proof, Case Studies)
        • What drives conversion? (CTA, Pricing, Free Trial)
        • What differentiates the product? (Features, Benefits, How It Works, Comparison)
      Mix section types creatively — not every page needs Features + CTA. Use Pricing, FAQ,
      How It Works, Benefits, Testimonials, or Social Proof when they fit the product.
    - Hero layout: two-column-split when the product has a visual/screenshot/demo;
      full-width-centered for bold value-proposition-first statements.
    - Max 8 sections. Include only sections that genuinely earn their place.

    Output ONLY valid JSON — no explanation, no markdown, no code fences.
    """;

  private async Task<(IntentBlueprint? blueprint, string? error)> Phase1IntentAsync(
      AiPipelineRequest request,
      CancellationToken ct)
  {
    for (var attempt = 1; attempt <= 2; attempt++)
    {
      string raw;
      try
      {
        raw = await aiClient.ChatCompletionAsync(IntentSystemPrompt, request.Prompt, request.Model, null, ct);
      }
      catch (Exception ex)
      {
        logger.LogError(ex, "[Phase 1] AI call failed (attempt {Attempt}) for prompt: {Prompt}", attempt, request.Prompt);
        return (null, "AI service is temporarily unavailable.");
      }

      logger.LogInformation("[Phase 1] Raw response attempt {Attempt} ({Length} chars): {Raw}",
          attempt, raw.Length, raw[..Math.Min(raw.Length, 800)]);

      var json = AiIrHelper.ExtractJson(raw);

      IntentBlueprint? blueprint;
      try
      {
        blueprint = JsonSerializer.Deserialize<IntentBlueprint>(json, AiIrHelper.JsonOptions);
      }
      catch (JsonException ex)
      {
        logger.LogError(ex, "[Phase 1] Failed to parse blueprint JSON (attempt {Attempt}): {Json}", attempt, json[..Math.Min(json.Length, 500)]);
        if (attempt == 2) return (null, "AI returned an invalid intent blueprint.");
        continue;
      }

      if (blueprint is null || blueprint.Sections.Count == 0)
      {
        logger.LogError("[Phase 1] Blueprint empty or missing sections (attempt {Attempt}). Raw: {Raw}", attempt, raw[..Math.Min(raw.Length, 800)]);
        if (attempt == 2) return (null, "AI returned an empty intent blueprint.");
        continue;
      }

      logger.LogInformation("[Phase 1] Blueprint OK: {PageType}, {Mood}, {Count} sections",
          blueprint.PageType, blueprint.ColorMood, blueprint.Sections.Count);

      return (blueprint, null);
    }

    return (null, "AI returned an empty intent blueprint.");
  }

  // Phase 2: structure

  private const string StructureSystemPrompt = $$"""
    You are a layout engineer for Favigon, a design-to-code platform.
    You receive a page IntentBlueprint and build the complete IRNode structural tree.

    OBJECTIVE: Correct node hierarchy, layout, and sizing. NO visual decoration.

    ── WHAT TO SET (REQUIRED) ─────────────────────────────────────────────────────────────────
    • Node hierarchy: Frame → sections → containers → leaf nodes. Max 4–5 levels deep.
    • layout on every Container/Frame: mode, direction, align, justify, gap, wrap.
    • style.width on every node: "%" for full-width, "px" for fixed, "fit-content" where needed.
    • style.height on every node: use the correct mode (see height rules below).
    • style.padding on sections and container groups: multiples of 8px only.
    • Typography on Text nodes ONLY — use EXACTLY these roles, no other values:
        Display/Hero: fontSize 64px fontWeight 800 lineHeight {value:1.15,unit:"em"} letterSpacing {value:-0.03,unit:"em"}
        Heading 1:    fontSize 48px fontWeight 700 lineHeight {value:1.2,unit:"em"}  letterSpacing {value:-0.02,unit:"em"}
        Heading 2:    fontSize 32px fontWeight 700 lineHeight {value:1.25,unit:"em"} letterSpacing {value:-0.02,unit:"em"}
        Heading 3:    fontSize 24px fontWeight 600 lineHeight {value:1.3,unit:"em"}  letterSpacing {value:-0.01,unit:"em"}
        Body:         fontSize 16px fontWeight 400 lineHeight {value:1.6,unit:"em"}  letterSpacing {value:0,unit:"em"}
        Label/Button: fontSize 14px fontWeight 600 lineHeight {value:1,unit:"em"}    letterSpacing {value:0.01,unit:"em"}
        Caption:      fontSize 12px fontWeight 400 lineHeight {value:1.4,unit:"em"}  letterSpacing {value:0,unit:"em"}
    • Text node height: ALWAYS {value:0,unit:"fit-content"} — NEVER use fixed px for Text nodes.
    • style.color on Text nodes: "#0f172a" primary, "#64748b" muted, "#ffffff" on dark bg.
    • position.mode: "relative" on ALL child nodes — never omit.
    • meta.name: a descriptive label that clearly identifies the node type and role.
      Use names like "Hero Section", "Primary CTA Button", "Feature Card", "Nav Logo" — these
      are used by Phase 3 (style) to identify node roles and apply correct visual treatment.
    • props.text: write copy that is specific to THIS product, brand voice, and target audience.
      Headlines must reflect the brand personality — avoid generic filler phrases like "Discover" or "Empower".
      Use the brand name, domain vocabulary, and the primary CTA from the blueprint.
      Every section’s text should feel written for this product, not copy-pasted from a generic template.
    • id: set to "1" on all nodes — will be reassigned automatically.

    ── WHAT NOT TO SET (FORBIDDEN — STYLE PHASE HANDLES THIS) ─────────────────────────
    ✗ Grouping/wrapper containers (button groups, nav link wrappers, card grid wrappers, footer column wrappers): set background: "transparent" — do NOT omit it.
    ✗ Only card-like containers (padded, visually isolated, with shadow) may use background: "#ffffff".
    ✗ NO shadows.
    ✗ NO borderRadius.
    ✗ NO overflow.
    ✗ NO cursor.
    ✗ NO gradients.
    ✗ NO backgroundImage (image placeholders are allowed).
    ✗ NO fontFamily — set only on Frame in Phase 3.
    ✗ NO border.
    ✗ NO maxWidth, minWidth, maxHeight, or minHeight — use section padding for horizontal spacing instead.

    ── HEIGHT RULES ────────────────────────────────────────────────────────────────────
    • Text nodes: ALWAYS {value:0,unit:"fit-content"}. NEVER calculate or guess a pixel height.
      DO NOT use 20px, 24px, 36px, or any fixed value for text — this breaks layout.
    • fit-content {value:0,unit:"fit-content"}: sections, cards, forms, footers, any container with variable content.
    • Fixed px {value:N,unit:"px"}: navbar (64px), button (48px), image containers, hero rows (480–640px).
    • 100% fill: ONLY when parent has fixed px height. NEVER inside a fit-content parent.
    • Root Frame: ALWAYS fit-content. NEVER minHeight, maxHeight, vh, vw.

    ── LAYOUT PATTERNS (from IntentBlueprint layoutHint) ────────────────────────────────────
    horizontal-bar: flex row, height 64px, padding {left:48px,right:48px}, align:center, justify:spaceBetween.
    full-width-centered: flex column, align:center, justify:center, padding {top:96px,bottom:96px,left:0,right:0}.
    two-column-split: height fixed (480–640px), flex row, gap:48px, padding {left:80px,right:80px}. Left col width=(viewportWidth-160-gap)/2, height:100%. Right col: remaining width, height:100%.
    card-grid-3: section flex column align:center gap:48px padding:{top:96px,right:80px,bottom:96px,left:80px}. Card grid wrapper: flex row wrap gap:32px width:100%. Card width:360px.
    card-grid-2: same layout but 2 cards, width:576px each.
    card-grid-4: same layout but 4 cards, width:264px each.
    single-column: flex column, align:center, gap:32px, padding:{top:80px,right:80px,bottom:80px,left:80px}.
    multi-column-footer: flex row, justify:spaceBetween, padding:{top:80px,right:80px,bottom:80px,left:80px}. No inner wrapper needed.
    dashboard-sidebar: flex row, height:fit-content. Sidebar width:240px. Main: fill remaining width.
    form-centered: flex column, align:center, padding:80px 0. Form card width:480px.
    testimonial-row: flex row, gap:32px, padding:80px 0. Testimonial card width:360px.

    ── STRUCTURAL RULES ────────────────────────────────────────────────────────────────────
    1. Root node MUST be type "Frame". Width 1280px (or requested viewport). Height fit-content.
    2. Every node needs meta.name, id, type, props, children.
    3. Text nodes: children:[], non-empty props.text.
    4. Every child of a flex/grid parent: position.mode "relative".
    5. No Container with width 0px. Every multi-child flex Container has layout.gap ≥ 8px.
    6. Split-column math: leftWidth + gap + rightWidth = parentWidth exactly.
    7. ONE Text node per logical text unit. NEVER split a heading across multiple nodes.
    8. Image placeholder: Container with style.backgroundImage "url(https://placehold.co/WxH.png)", backgroundSize:"cover", backgroundPosition:"center", backgroundRepeat:"no-repeat", explicit px width+height.
    9. Output ONLY raw JSON — no markdown, no explanation, no code fences.

    {{AiDesignService.IrSchemaReference}}
    """;

  private async Task<(IRNode? structure, string? error)> Phase2StructureAsync(
      AiPipelineRequest request,
      IntentBlueprint blueprint,
      CancellationToken ct)
  {
    var userMessage = BuildStructureUserMessage(request, blueprint);

    string raw;
    try
    {
      raw = await aiClient.ChatCompletionAsync(StructureSystemPrompt, userMessage, request.Model, _irSchema, ct);
    }
    catch (Exception ex)
    {
      logger.LogError(ex, "[Phase 2] AI call failed");
      return (null, "AI service is temporarily unavailable.");
    }

    var (ir, validationErrors) = AiIrHelper.TryParseIr(raw, "Phase2-structure", logger);

    if (ir is null && validationErrors is not null && !validationErrors.StartsWith("AI returned"))
    {
      logger.LogInformation("[Phase 2] Attempting self-repair ({Errors})", validationErrors[..Math.Min(validationErrors.Length, 200)]);
      try
      {
        var brokenJson = AiIrHelper.ExtractJson(raw);
        var truncated = brokenJson.Length > 3000 ? brokenJson[..3000] + "... (truncated)" : brokenJson;
        var repairRaw = await aiClient.ChatCompletionAsync(RepairSystemPrompt,
            $"Validation errors:\n{validationErrors}\n\nOriginal request: {request.Prompt}\nBroken output (fix this):\n{truncated}",
            request.Model, _irSchema, ct);
        var (repaired, _) = AiIrHelper.TryParseIr(repairRaw, "Phase2-repair", logger);
        if (repaired is not null)
          ir = repaired;
      }
      catch (Exception ex)
      {
        logger.LogWarning(ex, "[Phase 2] Self-repair failed");
      }
    }

    if (ir is null)
      return (null, "AI returned an invalid page structure. Please try rephrasing.");

    logger.LogInformation("[Phase 2] Structure generated: {NodeCount} nodes", CountNodes(ir));
    return (ir, null);
  }

  private static string BuildStructureUserMessage(AiPipelineRequest request, IntentBlueprint blueprint)
  {
    var sb = new StringBuilder();
    sb.AppendLine("User request:");
    sb.AppendLine(request.Prompt);
    sb.AppendLine();
    sb.AppendLine($"Target viewport width: {request.ViewportWidth}px.");
    sb.AppendLine();
    sb.AppendLine("Page blueprint (build the structure for EXACTLY these sections, in this order):");

    foreach (var section in blueprint.Sections.OrderBy(s => s.Order))
      sb.AppendLine($"  {section.Order}. {section.Name} ({section.LayoutHint}) — {section.Purpose}");

    sb.AppendLine();
    sb.AppendLine($"Page type: {blueprint.PageType}");
    sb.AppendLine($"Brand: {blueprint.BrandPersonality}");
    sb.AppendLine($"Target audience: {blueprint.TargetAudience}");
    sb.AppendLine($"Color mood: {blueprint.ColorMood}");
    sb.AppendLine($"Primary CTA text: \"{blueprint.PrimaryCta}\"");

    if (request.ExistingIr is not null)
    {
      sb.AppendLine();
      sb.AppendLine("Current design on canvas (modify or extend it as needed):");
      sb.AppendLine(JsonSerializer.Serialize(request.ExistingIr, AiIrHelper.JsonOptions));
    }

    return sb.ToString();
  }

  private static int CountNodes(IRNode node)
  {
    var count = 1;
    foreach (var child in node.Children)
      count += CountNodes(child);
    return count;
  }

  // Phase 3: style

  private const string StyleSystemPrompt = $$"""
    You are a design system engineer for Favigon, a design-to-code platform.

    You receive a complete structural IRNode tree (layout and sizing are already correct)
    and a page IntentBlueprint (mood, brand personality, sections).

    YOUR ONLY JOB: Apply the full visual design system to the existing structure.

    ── IMMUTABLE — NEVER CHANGE ──────────────────────────────────────────────────────────────
    ✗ id, type, meta, props, children (count, order, content)
    ✗ layout (mode, direction, align, justify, gap, wrap, gridTemplate*)
    ✗ position
    ✗ style.width, style.height, style.maxWidth, style.minWidth
    ✗ style.padding, style.margin
    ✗ style.fontSize, style.fontWeight, style.lineHeight, style.letterSpacing

    ── WHAT YOU MODIFY (STYLE ONLY) ────────────────────────────────────────────────────────
    ✓ style.background (colors, gradients on sections and frame)
    ✓ style.color (text color on nodes where it is wrong for the new background)
    ✓ style.shadows (add elevation to cards, navbar, buttons)
    ✓ style.borderRadius (cards, buttons, images, inputs)
    ✓ style.overflow — containers WITH borderRadius: set "hidden" to clip content properly.
      Containers WITHOUT borderRadius (flat wrappers, grid wrappers, sections): set "visible" so child shadows are not clipped.
    ✓ style.cursor (add "pointer" on all clickable elements)
    ✓ style.border (add 2px border on secondary/outline buttons and form inputs)
    ✓ style.fontFamily — set ONLY on the root Frame node.

    ── STEP 1: DERIVE COLOR ROLES FROM BLUEPRINT ──────────────────────────────────────────
    Based on colorMood and pageType from the blueprint, choose 7 concrete hex values:
      brand       — primary action color (buttons, links, highlights)
      brandDark   — 15–20% darker than brand (hero backgrounds, hover)
      accent      — contrasting highlight
      bgBase      — page background (#f8fafc light / #0f172a dark)
      surface     — card/panel background (#ffffff light / #1e293b dark)
      textPrimary — main text (#0f172a light / #f1f5f9 dark)
      textMuted   — secondary text (#64748b / #94a3b8)

    Color palette by mood (use as guidance, adjust for context):
      professional: brand=#2563eb brandDark=#1d4ed8 accent=#7c3aed bgBase=#f8fafc surface=#ffffff textPrimary=#0f172a textMuted=#64748b
      minimal:      brand=#18181b brandDark=#09090b accent=#2563eb bgBase=#ffffff surface=#f9fafb textPrimary=#18181b textMuted=#71717a
      bold:         brand=#dc2626 brandDark=#b91c1c accent=#f97316 bgBase=#0f172a surface=#1e293b textPrimary=#f1f5f9 textMuted=#94a3b8
      playful:      brand=#7c3aed brandDark=#6d28d9 accent=#f59e0b bgBase=#faf5ff surface=#ffffff textPrimary=#1e1b4b textMuted=#6b7280
      elegant:      brand=#854d0e brandDark=#713f12 accent=#a21caf bgBase=#fffbeb surface=#ffffff textPrimary=#1c1917 textMuted=#78716c
      dark:         brand=#3b82f6 brandDark=#2563eb accent=#8b5cf6 bgBase=#0f172a surface=#1e293b textPrimary=#f1f5f9 textMuted=#94a3b8
      vibrant:      brand=#06b6d4 brandDark=#0891b2 accent=#f43f5e bgBase=#0f172a surface=#1e293b textPrimary=#f1f5f9 textMuted=#94a3b8

    ── STEP 2: APPLY BY NODE ROLE (use meta.name to identify) ──────────────────────────

    NAVBAR (meta.name contains "Navbar" or "Navigation" or "Header"):
      background: surface or "#ffffff". Shadow: [{inset:false,x:0,y:2,blur:8,spread:0,color:"rgba(0,0,0,0.08)"}].
      Nav link text: color textMuted. Logo text: color textPrimary.

    HERO (meta.name contains "Hero" or "Banner" or "Jumbotron"):
      background: "linear-gradient(135deg, <brandDark> 0%, <brand> 100%)" or dark gradient.
      All Text inside: color "#ffffff".

    FEATURES / BENEFITS section (contains "Features" or "Benefits"):
      background: bgBase (#f8fafc) or alternate with "#ffffff".

    PRICING section: background: bgBase or light brand tint.

    TESTIMONIALS / SOCIAL PROOF: background: "#ffffff" or light surface.

    CTA section (contains "CTA" or "Call to Action"):
      background: brand or "linear-gradient(135deg, <brand> 0%, <brandDark> 100%)" or "#0f172a".
      All Text inside: color "#ffffff".

    FOOTER (contains "Footer"):
      background: "#0f172a". All text: color "#94a3b8". Footer links: color "#94a3b8" cursor "pointer".
      Section headings inside footer: color "#ffffff".

    CARD containers (meta.name contains "Card" or "Panel"):
      background: surface (#ffffff). borderRadius: {value:12,unit:"px"}.
      shadows: [{inset:false,x:0,y:4,blur:16,spread:0,color:"rgba(0,0,0,0.08)"}].

    PRIMARY BUTTON (meta.name contains "Primary" and "Button" or "CTA"):
      On light/white section backgrounds: background: brand, color "#ffffff" on text.
      On gradient or dark section backgrounds (Hero, CTA with gradient, dark sections): background: "#ffffff", color: brand on text.
      borderRadius: {value:8,unit:"px"}. shadows: [{inset:false,x:0,y:2,blur:4,spread:0,color:"rgba(0,0,0,0.12)"}]. cursor: "pointer".

    SECONDARY / OUTLINE BUTTON (meta.name contains "Secondary" or "Outline"):
      background: "transparent". borderRadius: {value:8,unit:"px"}. cursor: "pointer".
      On light sections (Features, Pricing, Auth, white/light bg): border-color: brand, text color: brand.
      On dark/colored sections (Hero gradient, CTA gradient, dark Footer): border-color: "#ffffff", text color: "#ffffff".

    IMAGE CONTAINERS (meta.name contains "Image" or "Thumbnail" or "Cover"):
      borderRadius: {value:12,unit:"px"}. overflow: "hidden".

    FORM INPUT containers (meta.name contains "Input" or "Field"):
      background: "#ffffff". border: {width:{value:1,unit:"px"},color:"#cbd5e1",style:"solid"}.
      borderRadius: {value:8,unit:"px"}.

    ICON CIRCLES / AVATARS (meta.name contains "Avatar" or "Icon"):
      borderRadius: {value:9999,unit:"px"}.

    ALL CLICKABLE ELEMENTS (buttons, nav links, cards with links):
      cursor: "pointer" — always set on the outer container.

    ── ROOT FRAME ────────────────────────────────────────────────────────────────
    • background: bgBase.
    • fontFamily: "Inter, system-ui, sans-serif" for professional/minimal/bold/playful/dark/vibrant.
               "Georgia, serif" for elegant.

    ── OUTPUT ───────────────────────────────────────────────────────────────────
    Return the COMPLETE IRNode with all style properties applied.
    Do NOT add, remove, or reorder nodes.
    Output ONLY raw JSON — no markdown, no explanation, no code fences.

    {{AiDesignService.IrSchemaReference}}
    """;

  private async Task<(IRNode? styledIr, string? error)> Phase3StyleAsync(
      AiPipelineRequest request,
      IntentBlueprint blueprint,
      IRNode structure,
      CancellationToken ct)
  {
    var userMessage = new StringBuilder()
      .AppendLine("IntentBlueprint:")
      .AppendLine(JsonSerializer.Serialize(blueprint, AiIrHelper.JsonOptions))
      .AppendLine()
      .AppendLine("Structural tree — apply style to this (DO NOT change layout, sizing, or hierarchy):")
      .AppendLine(JsonSerializer.Serialize(structure, AiIrHelper.JsonOptions))
      .ToString();

    string raw;
    try
    {
      raw = await aiClient.ChatCompletionAsync(StyleSystemPrompt, userMessage, request.Model, _irSchema, ct);
    }
    catch (Exception ex)
    {
      logger.LogError(ex, "[Phase 3] AI call failed");
      return (null, "AI service is temporarily unavailable.");
    }

    var (ir, validationErrors) = AiIrHelper.TryParseIr(raw, "Phase3-style", logger);

    if (ir is null && validationErrors is not null && !validationErrors.StartsWith("AI returned"))
    {
      logger.LogInformation("[Phase 3] Attempting self-repair ({Errors})", validationErrors[..Math.Min(validationErrors.Length, 200)]);
      try
      {
        var brokenJson = AiIrHelper.ExtractJson(raw);
        var truncated = brokenJson.Length > 3000 ? brokenJson[..3000] + "... (truncated)" : brokenJson;
        var repairRaw = await aiClient.ChatCompletionAsync(RepairSystemPrompt,
            $"Validation errors:\n{validationErrors}\n\nOriginal request: {request.Prompt}\nBroken output (fix this):\n{truncated}",
            request.Model, _irSchema, ct);
        var (repaired, _) = AiIrHelper.TryParseIr(repairRaw, "Phase3-repair", logger);
        if (repaired is not null)
          ir = repaired;
      }
      catch (Exception ex)
      {
        logger.LogWarning(ex, "[Phase 3] Self-repair failed");
      }
    }

    if (ir is null)
      return (null, "AI could not apply the design system. Please try again.");

    logger.LogInformation("[Phase 3] Style applied successfully.");
    return (ir, null);
  }

  private const string RepairSystemPrompt =
    "You are a JSON repair assistant. Fix the listed validation errors in the IR design JSON. " +
    "Return ONLY the corrected complete JSON object — no explanation, no markdown, no code fences.";
}
