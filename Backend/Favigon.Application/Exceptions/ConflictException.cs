using System.Net;

namespace Favigon.Application.Exceptions;

public sealed class ConflictException(string message)
  : AppException(message, (int)HttpStatusCode.Conflict);
