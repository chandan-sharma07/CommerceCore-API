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
      description: [
        'Production-grade e-commerce REST API built to demonstrate real backend depth.',
        '',
        '**Key Features:**',
        '- JWT auth with refresh-token rotation',
        '- MySQL (Sequelize) + MongoDB (Mongoose) polyglot persistence',
        '- Redis caching with pattern-based cache invalidation',
        '- ACID-safe order transactions with cross-DB stock consistency',
        '- Race-condition-safe stock reservation via MongoDB atomic CAS',
        '- Idempotency keys on order placement',
        '',
        '**How to authenticate:** Click **Authorize** → paste your `accessToken` as `Bearer <token>`.'
      ].join('\n')
    },
    servers: [
      { url: '/api/v1', description: 'Current server' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Paste your access token (obtained from /auth/login or /auth/register)'
        }
      },
      schemas: {
        AuthResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    email: { type: 'string' },
                    role: { type: 'string', enum: ['customer', 'admin'] }
                  }
                },
                accessToken: { type: 'string', description: 'Short-lived JWT (15m default)' },
                refreshToken: { type: 'string', description: 'Long-lived opaque token (7d default)' }
              }
            }
          }
        },
        Product: {
          type: 'object',
          properties: {
            _id: { type: 'string', description: 'MongoDB ObjectId' },
            name: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number' },
            stock: { type: 'integer' },
            category: { type: 'string', enum: ['electronics', 'clothing', 'books', 'home', 'sports', 'toys', 'food', 'beauty', 'other'] },
            imageUrl: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        ProductInput: {
          type: 'object',
          required: ['name', 'price', 'stock', 'category'],
          properties: {
            name: { type: 'string', example: 'Wireless Headphones' },
            description: { type: 'string', example: 'Over-ear noise cancelling headphones' },
            price: { type: 'number', example: 79.99 },
            stock: { type: 'integer', example: 50 },
            category: { type: 'string', enum: ['electronics', 'clothing', 'books', 'home', 'sports', 'toys', 'food', 'beauty', 'other'], example: 'electronics' },
            imageUrl: { type: 'string', example: 'https://example.com/image.jpg' }
          }
        },
        Review: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            productId: { type: 'string' },
            userId: { type: 'string' },
            userName: { type: 'string' },
            rating: { type: 'integer', minimum: 1, maximum: 5 },
            comment: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        ReviewInput: {
          type: 'object',
          required: ['productId', 'rating'],
          properties: {
            productId: { type: 'string', example: '64f1a2b3c4d5e6f7a8b9c0d1' },
            rating: { type: 'integer', minimum: 1, maximum: 5, example: 4 },
            comment: { type: 'string', example: 'Great product, fast delivery!' }
          }
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'paid', 'failed', 'stock_sync_failed'] },
            total_amount: { type: 'number' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  product_id: { type: 'string' },
                  quantity: { type: 'integer' },
                  price_at_purchase: { type: 'number' }
                }
              }
            },
            payment: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'success', 'failed'] }
              }
            },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNextPage: { type: 'boolean' }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string', example: 'Invalid input data' },
                requestId: { type: 'string' }
              }
            }
          }
        }
      }
    }
  },
  apis: ['./src/modules/**/*.routes.js', './src/routes/**/*.js']
});

// Swagger UI at /api/v1/docs (mounted BEFORE the v1 rate limiter below)
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'CommerceCore API Docs',
  swaggerOptions: {
    persistAuthorization: true  // keeps token across page refreshes
  }
}));

// ── Rate limiting ─────────────────────────────────────────────
// Auth routes get strict limit (5/15min) — applied BEFORE general limiter
app.use('/api/v1/auth', authLimiter);

// ── API routes (with general rate limit: 100/15min) ───────────
app.use('/api/v1', generalLimiter, v1Router);

// ── 404 + error handler ───────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
