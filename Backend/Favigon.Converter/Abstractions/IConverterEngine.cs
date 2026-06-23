using Favigon.Converter.Models;

namespace Favigon.Converter.Abstractions;

public record GeneratedFile(string Path, string Content);

public interface IConverterEngine
{
  (string Html, string Css) GenerateSinglePage(IRNode root, string framework);
  List<GeneratedFile> GenerateMultiPage(IEnumerable<(string PageName, int ViewportWidth, IRNode Ir)> pages, string framework);
  (string Html, string Css) GenerateResponsiveOutput(IReadOnlyList<(IRNode Ir, int ViewportWidth, string Label)> sortedDescending, string framework);
  bool Validate(IRNode root);
  IReadOnlyList<string> GetValidationErrors(IRNode root, bool skipLayoutMath = false);
}
