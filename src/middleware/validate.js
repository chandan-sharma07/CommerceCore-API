const AppError = require('../core/AppError');

/**
 * Middleware to validate request data against a Zod schema
 * @param {Object} schema - Zod schema
 * @param {string} source - Request property to validate (e.g., 'body', 'query', 'params')
 * @returns {Function} Express middleware function
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const parsedData = schema.parse(req[source]);
      req[source] = parsedData;
      next();
    } catch (err) {
      if (err.name === 'ZodError') {
        const details = err.errors.map((e) => ({ field: e.path.join('.'), message: e.message }));
        const appError = new AppError('Validation Error', 400, 'VALIDATION_ERROR', true);
        appError.details = details;
        next(appError);
      } else {
        next(err);
      }
    }
  };
};

module.exports = validate;
