/**
 * tests/setup.js — Global Jest test setup
 *
 * Runs once per test *file* (setupFilesAfterEnv).
 * Loads .env.test, connects all three databases, and manages test isolation:
 *   - beforeAll: connect, drop Mongo DB, recreate indexes
 *   - afterEach:  truncate MySQL, wipe Mongo collections, flush Redis DB
 *   - afterAll:   close all connections cleanly
 */

// ── Load .env.test BEFORE any src/ module is required ───────────────────────
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.test') });

// ── Force test environment ────────────────────────────────────────────────────
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // random port — avoids EADDRINUSE across parallel suites

// ── Imports (after env is set) ────────────────────────────────────────────────
const { sequelize } = require('../src/models/mysql');
const { connectMySQL } = require('../src/config/database');
const mongoose = require('mongoose');
const { redisClient, connectRedis } = require('../src/config/redis');
const Product = require('../src/models/mongo/Product');
const Review = require('../src/models/mongo/Review');

// ─────────────────────────────────────────────────────────────────────────────
// SETUP — runs once per test file
// ─────────────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // 1. MySQL: connect + force sync (drops & recreates all tables fresh)
  await connectMySQL();

  // 2. MongoDB: connect then drop the entire test database for a clean slate
  await mongoose.connect(process.env.MONGO_URI);
  if (mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }

  // 3. Recreate Mongoose indexes — dropDatabase destroys them
  //    (e.g. text index on Product.name + description for $text search)
  await Product.ensureIndexes();
  await Review.ensureIndexes();

  // 4. Redis: connect (ioredis lazyConnect)
  if (redisClient.status === 'wait') {
    await connectRedis();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ISOLATION — runs after every individual test
// ─────────────────────────────────────────────────────────────────────────────
afterEach(async () => {
  // MySQL: truncate all tables (disable FK checks to avoid constraint errors)
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  await sequelize.truncate({ cascade: true, force: true });
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

  // MongoDB: delete all documents from every collection (preserves indexes)
  if (mongoose.connection.db) {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((col) => col.deleteMany({})));
  }

  // Redis: flush only this DB index (test uses DB 1, dev uses DB 0)
  try {
    if (redisClient.status === 'ready') {
      await redisClient.flushdb();
    }
  } catch (_) {
    // Redis is optional — ignore if unavailable
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEARDOWN — runs once per test file after all tests finish
// ─────────────────────────────────────────────────────────────────────────────
afterAll(async () => {
  await sequelize.close();
  await mongoose.connection.close();
  try {
    await redisClient.quit();
  } catch (_) {
    // ignore if already closed
  }
});
