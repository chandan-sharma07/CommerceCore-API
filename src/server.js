const config = require('./config');
const { logger } = require('./core/logger');
const { connectMySQL, connectMongoDB } = require('./config/database');
const { connectRedis, redisClient } = require('./config/redis');
const app = require('./app');

let server;

async function startServer() {
  try {
    await connectMySQL();
    await connectMongoDB();
    await connectRedis();

    server = app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

// ── Graceful Shutdown ─────────────────────────────────────────
// Closes HTTP server first (stops accepting new requests), then drains
// all DB/cache connections before exiting. Force-kills after 10s if
// something hangs.
const shutdown = async (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  // Stop accepting new HTTP connections
  if (server) {
    server.close(() => logger.info('HTTP server closed'));
  }

  // Close all data connections
  try {
    const { sequelize } = require('./config/database');
    await sequelize.close();
    logger.info('MySQL connection closed');
  } catch (err) {
    logger.error('Error closing MySQL:', err.message);
  }

  try {
    const mongoose = require('mongoose');
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (err) {
    logger.error('Error closing MongoDB:', err.message);
  }

  try {
    await redisClient.quit();
    logger.info('Redis connection closed');
  } catch (err) {
    logger.error('Error closing Redis:', err.message);
  }

  logger.info('All connections closed. Exiting.');
  process.exit(0);
};

// Force exit after 10s if graceful shutdown hangs
const forceExit = () => setTimeout(() => {
  logger.error('Graceful shutdown timed out. Forcing exit.');
  process.exit(1);
}, 10000).unref();

// ── Process Event Handlers ────────────────────────────────────

process.on('SIGTERM', () => { forceExit(); shutdown('SIGTERM'); });
process.on('SIGINT', () => { forceExit(); shutdown('SIGINT'); });

// Uncaught exceptions: log full stack via Winston, then graceful shutdown
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION — shutting down...', { error: err.message, stack: err.stack });
  forceExit();
  shutdown('UNCAUGHT_EXCEPTION');
});

// Unhandled promise rejections: log but don't crash
// (Node 15+ would crash by default — we override to log + continue)
process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED REJECTION:', { reason: reason?.message || reason, stack: reason?.stack });
});

startServer();
