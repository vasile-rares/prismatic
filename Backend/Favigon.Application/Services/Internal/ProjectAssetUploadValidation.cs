using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Requests.Assets;
using Favigon.Application.Validators;

namespace Favigon.Application.Services.Internal;

internal static class ProjectAssetUploadValidation
{
  private const int MaxThumbnailSizeBytes = 5 * 1024 * 1024;
  private const long MaxImageSizeBytes = 10 * 1024 * 1024;

  private static readonly HashSet<string> AllowedThumbnailContentTypes = new(StringComparer.OrdinalIgnoreCase)
  {
    "image/jpeg",
    "image/png",
    "image/webp"
  };

  private static readonly HashSet<string> AllowedImageContentTypes = new(StringComparer.OrdinalIgnoreCase)
  {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/avif"
  };

  public static void ValidateThumbnail(ProjectImageUploadRequest request)
  {
    ImageUploadValidator.Validate(new ImageUploadRequest(
      Content: request.Content,
      FileName: request.FileName,
      ContentType: request.ContentType,
      Length: request.Length,
      MaxBytes: MaxThumbnailSizeBytes,
      AllowedTypes: AllowedThumbnailContentTypes,
      AssetLabel: "Thumbnail file",
      UnsupportedFormatMessage: "Only JPEG, PNG, and WebP thumbnails are supported."));
  }

  public static void ValidateImage(ProjectImageUploadRequest request)
  {
    ImageUploadValidator.Validate(new ImageUploadRequest(
      Content: request.Content,
      FileName: request.FileName,
      ContentType: request.ContentType,
      Length: request.Length,
      MaxBytes: MaxImageSizeBytes,
      AllowedTypes: AllowedImageContentTypes,
      AssetLabel: "Image file",
      UnsupportedFormatMessage: "Only PNG, JPEG, WebP, GIF, and AVIF images are supported."));
  }
}
