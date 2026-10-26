const winston = require('winston');
const { AsyncLocalStorage } = require('async_hooks');
const { combine, timestamp, errors, json, colorize, printf } = winston.format;

// ── AsyncLocalStorage for request-scoped context ──────────────
// Every incoming request runs inside asyncLocalStorage.run({ requestId }),
// so any logger call anywhere in the call stack automatically picks up the ID.
const asyncLocalStorage = new AsyncLocalStorage();

// ── Custom Formats ────────────────────────────────────────────

/**
 * Injects requestId from AsyncLocalStorage into every log entry.
 */
const requestIdFormat = winston.format((info) => {
  const store = asyncLocalStorage.getStore();
  if (store && store.requestId) {
    info.requestId = store.requestId;
  }
  return info;
});

/**
 * Dev-friendly readable console format.
 * Example: 18:30:45 info: [a1b2c3d4] Server running on port 3000
 */
const devFormat = printf(({ level, message, timestamp, requestId, stack, ...meta }) => {
  const rid = requestId ? `[${requestId.substring(0, 8)}] ` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const stackStr = stack ? `\n${stack}` : '';
  return `${timestamp} ${level}: ${rid}${message}${metaStr}${stackStr}`;
});

// ── Log Level ─────────────────────────────────────────────────

const getLogLevel = () => {
  try {
    const config = require('../config/index');
    return config.logLevel || 'info';
  } catch (err) {
    return process.env.LOG_LEVEL || 'info';
  }
};

// ── Transports ────────────────────────────────────────────────

const transports = [
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production'
      ? combine(timestamp(), requestIdFormat(), errors({ stack: true }), json())
      : combine(
          colorize(),
          timestamp({ format: 'HH:mm:ss' }),
          requestIdFormat(),
          errors({ stack: true }),
          devFormat
        )
  })
];

// Production: persist error + combined logs to files
// if (process.env.NODE_ENV === 'production') {
//   transports.push(
//     new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
//     new winston.transports.File({ filename: 'logs/combined.log' })
//   );
// }

// ── Logger Instance ───────────────────────────────────────────

const logger = winston.createLogger({
  level: getLogLevel(),
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    requestIdFormat(),
    errors({ stack: true }),
    json()
  ),
  transports,
  // Log uncaught exceptions and unhandled rejections via Winston
  exceptionHandlers: [
    new winston.transports.Console()
  ],
  rejectionHandlers: [
    new winston.transports.Console()
  ],
  exitOnError: false // let server.js handle graceful shutdown
});

// ── Morgan Stream ─────────────────────────────────────────────

const morganStream = {
  write: (message) => logger.http(message.trim())
};

module.exports = {
  logger,
  morganStream,
  asyncLocalStorage
};
