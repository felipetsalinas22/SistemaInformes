export class ApiError extends Error {
  constructor(status, message, code = 'ERROR', details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) { return new ApiError(400, message, 'VALIDATION_ERROR', details); }
  static unauthorized(message = 'Debe iniciar sesión.') { return new ApiError(401, message, 'UNAUTHORIZED'); }
  static forbidden(message = 'No tiene permiso para realizar esta acción.') { return new ApiError(403, message, 'FORBIDDEN'); }
  static notFound(message = 'El recurso solicitado no existe.') { return new ApiError(404, message, 'NOT_FOUND'); }
  static conflict(message) { return new ApiError(409, message, 'CONFLICT'); }
  static tooMany(message = 'Demasiados intentos. Intente nuevamente más tarde.') { return new ApiError(429, message, 'TOO_MANY_REQUESTS'); }
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw ApiError.badRequest('Identificador inválido.');
  return id;
}
