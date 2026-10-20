process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.MYSQL_HOST = 'localhost';
process.env.MYSQL_PORT = '3306';
process.env.MYSQL_USER = 'commerce_user';
process.env.MYSQL_PASSWORD = 'commerce_pass';
process.env.MYSQL_DATABASE = 'commercecore_test';
process.env.MONGO_URI = 'mongodb://localhost:27017/commercecore_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';
process.env.LOG_LEVEL = 'error';
process.env.CORS_ORIGIN = '*';

const { sequelize } = require('../src/models/mysql');
const { connectMySQL } = require('../src/config/database');
const mongoose = require('mongoose');
const { redisClient, connectRedis } = require('../src/config/redis');

beforeAll(async () => {
  await connectMySQL();
  await mongoose.connect(process.env.MONGO_URI);
  // Connect Redis (ioredis with lazyConnect)
  if (redisClient.status === 'wait') {
    await connectRedis();
  }
  
  if (mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }

  // Recreate MongoDB indexes (dropDatabase destroys them, e.g. text index for $text search)
  const Product = require('../src/models/mongo/Product');
  const Review = require('../src/models/mongo/Review');
  await Product.ensureIndexes();
  await Review.ensureIndexes();
});

afterEach(async () => {
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  await sequelize.truncate({ cascade: true, force: true });
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  
  if (mongoose.connection.db) {
    const collections = await mongoose.connection.db.collections();
    for (let collection of collections) {
      await collection.deleteMany({});
    }
  }

  // Flush Redis to prevent cached data leaking between tests
  try {
    if (redisClient.status === 'ready') {
      await redisClient.flushdb();
    }
  } catch (err) {
    // Ignore if Redis is unavailable
  }
});

afterAll(async () => {
  await sequelize.close();
  await mongoose.connection.close();
  await redisClient.quit();
});
