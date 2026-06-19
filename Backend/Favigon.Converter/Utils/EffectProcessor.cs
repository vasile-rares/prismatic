using System.Globalization;
using Favigon.Converter.Models;

namespace Favigon.Converter.Utils;

internal static class EffectProcessor
{
  internal static void Apply(
    IRNode node,
    EmitContext ctx,
    Dictionary<string, string> cssProps,
    string targetClass)
  {
    if (node.Effects is not { Count: > 0 } effects)
      return;

    var statePseudoProps = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
    var stateTransforms = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
    var stateTransitionSources = new Dictionary<string, IREffect>(StringComparer.OrdinalIgnoreCase);

    var byTrigger = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

    foreach (var effect in effects)
    {
      var trigger = effect.Trigger ?? "onLoad";
      if (TryResolveStatePseudoClass(trigger, out var statePseudoClass))
      {
        stateTransitionSources[statePseudoClass] = effect;

        if (!statePseudoProps.TryGetValue(statePseudoClass, out var pseudoProps))
          statePseudoProps[statePseudoClass] = pseudoProps = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        if (TryBuildStateTransform(effect, out var stateEffectTransform))
        {
          if (!stateTransforms.TryGetValue(statePseudoClass, out var transforms))
            stateTransforms[statePseudoClass] = transforms = [];
          transforms.Add(stateEffectTransform);
        }

        if (effect.Opacity is double opacity && Math.Abs(opacity - 1d) > 0.0001d)
          pseudoProps["opacity"] = opacity.ToString("0.###", CultureInfo.InvariantCulture);

        if (!string.IsNullOrWhiteSpace(effect.Fill))
          pseudoProps["background"] = effect.Fill;

        if (!string.IsNullOrWhiteSpace(effect.Shadow))
          pseudoProps["box-shadow"] = effect.Shadow;

        continue;
      }

      if (!AnimationPresets.TryBuild(effect, out var keyframeName, out var keyframeBody))
        continue;

      ctx.Styles.AddKeyframes(keyframeName, keyframeBody);

      var iterations = trigger == "loop" ? "infinite" : effect.Iterations;
      var animationDuration = AnimationPresets.GetAnimationDuration(effect);
      var animationDelay = AnimationPresets.GetAnimationDelay(effect);
      var animationDirection = AnimationPresets.GetAnimationDirection(effect);
      var animValue = $"{keyframeName} {animationDuration}ms {effect.Easing} {animationDelay} {iterations} {animationDirection} {effect.FillMode}";

      if (!byTrigger.TryGetValue(trigger, out var list))
        byTrigger[trigger] = list = [];
      list.Add(animValue);
    }

    foreach (var (pseudoClass, pseudoProps) in statePseudoProps)
    {
      if (stateTransforms.TryGetValue(pseudoClass, out var transforms) && transforms.Count > 0)
      {
        var stateTransform = string.Join(' ', transforms);
        var combinedTransform = cssProps.TryGetValue("transform", out var baseTransform) && !string.IsNullOrWhiteSpace(baseTransform)
          ? $"{baseTransform} {stateTransform}".Trim()
          : stateTransform;
        pseudoProps["-webkit-transform"] = combinedTransform;
        pseudoProps["transform"] = combinedTransform;
      }

      if (pseudoProps.Count == 0)
        continue;

      ctx.Styles.AddPseudo(targetClass, pseudoClass, pseudoProps);

      if (stateTransitionSources.TryGetValue(pseudoClass, out var transitionSource))
      {
        var transitionDelay = transitionSource.Delay > 0 ? $" {transitionSource.Delay}ms" : string.Empty;
        cssProps["transition"] = $"all {transitionSource.Duration}ms {transitionSource.Easing}{transitionDelay}";
        cssProps["-webkit-transition"] = cssProps["transition"];
      }
    }

    foreach (var (trigger, animations) in byTrigger)
    {
      var combined = string.Join(", ", animations);
      var pseudoClass = trigger switch
      {
        "hover" => "hover",
        "click" => "active",
        "focus" => "focus",
        _ => null
      };

      if (pseudoClass is not null)
        ctx.Styles.AddPseudo(targetClass, pseudoClass, new Dictionary<string, string>
        {
          ["-webkit-animation"] = combined,
          ["animation"] = combined
        });
      else
      {
        cssProps["-webkit-animation"] = combined;
        cssProps["animation"] = combined;
      }
    }
  }

  private static bool TryResolveStatePseudoClass(string trigger, out string pseudoClass)
  {
    switch (trigger.ToLowerInvariant())
    {
      case "hover":
        pseudoClass = "hover";
        return true;
      case "click":
        pseudoClass = "active";
        return true;
      default:
        pseudoClass = string.Empty;
        return false;
    }
  }

  private static bool TryBuildStateTransform(IREffect effect, out string transform)
  {
    transform = string.Empty;
    var transforms = new List<string>();

    var offsetX = effect.OffsetX ?? 0d;
    var offsetY = effect.OffsetY ?? 0d;
    var scale = effect.Scale ?? 1d;
    var rotate = effect.Rotate ?? 0d;
    var skewX = effect.SkewX ?? 0d;
    var skewY = effect.SkewY ?? 0d;

    if (Math.Abs(offsetX) > 0.0001d || Math.Abs(offsetY) > 0.0001d)
      transforms.Add($"translate({offsetX.ToString("0.###", CultureInfo.InvariantCulture)}px, {offsetY.ToString("0.###", CultureInfo.InvariantCulture)}px)");

    if (Math.Abs(scale - 1d) > 0.0001d)
      transforms.Add($"scale({scale.ToString("0.###", CultureInfo.InvariantCulture)})");

    if (Math.Abs(rotate) > 0.0001d)
    {
      var rotationValue = rotate.ToString("0.###", CultureInfo.InvariantCulture);
      transforms.Add(string.Equals(effect.RotationMode, "3d", StringComparison.OrdinalIgnoreCase)
        ? $"rotateY({rotationValue}deg)"
        : $"rotate({rotationValue}deg)");
    }

    if (Math.Abs(skewX) > 0.0001d || Math.Abs(skewY) > 0.0001d)
      transforms.Add($"skew({skewX.ToString("0.###", CultureInfo.InvariantCulture)}deg, {skewY.ToString("0.###", CultureInfo.InvariantCulture)}deg)");

    if (transforms.Count == 0)
      return false;

    transform = string.Join(' ', transforms);
    return true;
  }
}
