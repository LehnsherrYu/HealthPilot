import type { ErrorRequestHandler } from 'express';
import { isSymptomJournalRequest } from '../utils/symptomJournalPrivacy.js';
import { log } from '../config/logging.js';
interface AppError {
  message?: string;
  stack?: string;
  status?: number;
  statusCode?: number;
  code?: string;
  name?: string;
  type?: string;
}
const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  const err: AppError =
    typeof error === 'object' && error !== null ? error : {};
  if (isSymptomJournalRequest(req)) {
    const status =
      err.status === 413 || err.statusCode === 413
        ? 413
        : err.type === 'entity.parse.failed'
          ? 400
          : 500;
    log('error', `Symptom journal request failed (${status}).`);
    res
      .set('Cache-Control', 'no-store')
      .status(status)
      .json({
        error: 'Journal request failed.',
        code: status === 500 ? 'JOURNAL_ERROR' : 'INVALID_REQUEST',
      });
    return;
  }
  log(
    'error',
    `Error caught by centralized handler: ${err.message}`,
    err.stack
  );
  // Default to 500 Internal Server Error
  let statusCode = err.status || err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let code: string | undefined =
    typeof err.code === 'string' ? err.code : undefined;

  if (
    err.name === 'PayloadTooLargeError' ||
    err.type === 'entity.too.large' ||
    statusCode === 413
  ) {
    statusCode = 413;
    code = 'IMAGE_TOO_LARGE';
    message = 'Request payload too large. Please reduce the image size.';
  } else {
    // Handle specific error types if needed (e.g., database errors, validation errors)
    switch (err.name) {
      case 'UnauthorizedError':
        statusCode = 401;
        message = 'Unauthorized: Invalid or missing token.';
        break;
      case 'ForbiddenError':
        statusCode = 403;
        message =
          'Forbidden: You do not have permission to perform this action.';
        break;
      case 'ValidationError':
        statusCode = 400;
        message = err.message || 'Invalid request';
        break;
      default:
        if (err.code === '23505') {
          statusCode = 409;
          message =
            'Conflict: A resource with this unique identifier already exists.';
        }
        break;
    }
  }
  res.status(statusCode).json({
    error: message,
    code,
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined, // Only send stack in development
  });
};
export default errorHandler;
