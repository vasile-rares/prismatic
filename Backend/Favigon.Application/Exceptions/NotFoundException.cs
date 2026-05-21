using System.Net;

namespace Favigon.Application.Exceptions;

public sealed class NotFoundException(string message)
  : AppException(message, (int)HttpStatusCode.NotFound);
