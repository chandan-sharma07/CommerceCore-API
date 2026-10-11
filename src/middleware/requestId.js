const { v4: uuidv4 } = require('uuid');
const { asyncLocalStorage } = require('../core/logger');

/**
 * Assigns a unique request ID to every incoming request.
 * - Reuses X-Request-Id from client if present (useful for distributed tracing)
 * - Sets req.id for downstream middleware/controllers
 * - Sets X-Request-Id response header for client-side correlation
 * - Wraps all downstream handlers in AsyncLocalStorage so Winston
 *   automatically includes the request ID in every log entry
 */
module.exports = (req, res, next) => {
  const id = req.headers['x-request-id'] || uuidv4();
  req.id = id;
  res.set('X-Request-Id', id);
  asyncLocalStorage.run({ requestId: id }, () => next());
};
