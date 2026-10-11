const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const mongoose = require('mongoose');

const config = require('./config');
const { sequelize } = require('./models/mysql');
const { redisClient } = require('./config/redis');
const { logger } = require('./core/logger');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');
const { authLimiter, generalLimiter } = require('./middleware/rateLimiter');
const v1Router = require('./routes/v1');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ── Security headers ──────────────────────────────────────────
app.use(helmet());

// ── CORS — controllable via CORS_ORIGIN env var ───────────────
// Development: '*' (allow all). Production: set to specific origins.
app.use(cors({ origin: config.corsOrigin }));

// ── Compression & parsing ─────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Request ID (must be BEFORE requestLogger so morgan has req.id) ──
app.use(requestId);

// ── Request logging (morgan → Winston) ────────────────────────
app.use(requestLogger);

// ── Health check — MySQL, MongoDB, Redis status ───────────────
app.get('/health', async (req, res) => {
  const services = {
    mysql: 'disconnected',
    mongo: 'disconnected',
    redis: 'disconnected'
  };

  // MySQL
  try {
    await sequelize.authenticate();
    services.mysql = 'connected';
  } catch (err) {
    logger.warn('Health check: MySQL unreachable', { error: err.message });
  }

  // MongoDB
  try {
    services.mongo = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  } catch (err) {
    logger.warn('Health check: MongoDB unreachable', { error: err.message });
  }

  // Redis
  try {
    if (redisClient.status === 'ready') {
      await redisClient.ping();
      services.redis = 'connected';
    }
  } catch (err) {
    logger.warn('Health check: Redis unreachable', { error: err.message });
  }

  const allConnected = Object.values(services).every(v => v === 'connected');
  const status = allConnected ? 'ok' : 'degraded';

  res.status(allConnected ? 200 : 503).json({
    status,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    services
  });
});

// ── Swagger ───────────────────────────────────────────────────
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CommerceCore API',
      version: '1.0.0',
      description: 'Mini e-commerce REST API'
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./src/modules/**/*.routes.js', './src/routes/**/*.js']
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ── Rate limiting ─────────────────────────────────────────────
// Auth routes get strict limit (5/15min) — applied BEFORE general limiter
app.use('/api/v1/auth', authLimiter);

// ── API routes (with general rate limit: 100/15min) ───────────
app.use('/api/v1', generalLimiter, v1Router);

// ── 404 + error handler ───────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
