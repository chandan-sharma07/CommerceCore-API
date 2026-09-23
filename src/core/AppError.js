/**
 * Standardized application error class.
 */
class AppError extends Error {
  /**
   * Creates an AppError.
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {string} errorCode - Application specific error code
   * @param {boolean} isOperational - Indicates if the error is operational (expected) or a bug
   */
  constructor(message, statusCode, errorCode = 'INTERNAL_ERROR', isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    this.status = statusCode >= 400 && statusCode < 500 ? 'fail' : 'error';
    
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
