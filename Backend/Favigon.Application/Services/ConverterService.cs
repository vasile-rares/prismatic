using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Exceptions;
using Favigon.Application.Interfaces;
using Favigon.Converter.Abstractions;
using Favigon.Converter.Models;

namespace Favigon.Application.Services;

public class ConverterService(IConverterEngine converterEngine) : IConverterService
{
  public ConverterResponse Generate(IRNode root, string framework)
  {
    var errors = converterEngine.GetValidationErrors(root, skipLayoutMath: true);
    if (errors.Count > 0)
      throw new BusinessRuleException($"IR validation failed:\n{string.Join("\n", errors)}");

    var output = converterEngine.GenerateSinglePage(root, framework);
    return new ConverterResponse
    {
      Framework = framework,
      IsValid = true,
      Html = output.Html,
      Css = output.Css
    };
  }

  public ConverterResponse GenerateResponsive(List<ConverterPageInput> pages, string framework)
  {
    if (pages.Count == 0)
      throw new ArgumentException("At least one page is required.");

    var sorted = pages.OrderByDescending(p => p.ViewportWidth).ToList();

    foreach (var page in sorted)
    {
      var pageErrors = converterEngine.GetValidationErrors(page.Ir, skipLayoutMath: true);
      if (pageErrors.Count > 0)
        throw new BusinessRuleException($"IR validation failed for page '{page.PageName}':\n{string.Join("\n", pageErrors)}");
    }

    var sortedInput = sorted
      .Select(p => (p.Ir, p.ViewportWidth, string.IsNullOrWhiteSpace(p.PageName) ? $"{p.ViewportWidth}px" : $"{p.PageName} \u2013 {p.ViewportWidth}px"))
      .ToList();

    var (html, css) = converterEngine.GenerateResponsiveOutput(sortedInput, framework);

    return new ConverterResponse { Framework = framework, IsValid = true, Html = html, Css = css };
  }

  public bool Validate(IRNode root) => converterEngine.GetValidationErrors(root, skipLayoutMath: true).Count == 0;

  public MultiPageConverterResponse GenerateMultiPage(List<ConverterPageInput> pages, string framework)
  {
    if (pages.Count == 0)
      throw new ArgumentException("At least one page is required.");

    foreach (var page in pages)
    {
      var pageErrors = converterEngine.GetValidationErrors(page.Ir, skipLayoutMath: true);
      if (pageErrors.Count > 0)
        throw new BusinessRuleException($"IR validation failed for page '{page.PageName}':\n{string.Join("\n", pageErrors)}");
    }

    var entries = pages.Select(p => (p.PageName, p.ViewportWidth, p.Ir));
    var files = converterEngine.GenerateMultiPage(entries, framework);

    return new MultiPageConverterResponse
    {
      Framework = framework,
      IsValid = true,
      Files = files.Select(f => new GeneratedFileDto { Path = f.Path, Content = f.Content }).ToList()
    };
  }
}
