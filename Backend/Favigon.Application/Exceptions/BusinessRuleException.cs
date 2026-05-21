using System.Net;

namespace Favigon.Application.Exceptions;

public sealed class BusinessRuleException(string message)
  : AppException(message, (int)HttpStatusCode.UnprocessableEntity);
