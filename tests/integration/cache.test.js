/**
 * tests/integration/cache.test.js
 *
 * Redis Caching — Integration Tests
 * Covers: X-Cache HIT/MISS headers, cache invalidation on CUD, graceful fallback
 */

const request = require('supertest');
const app = require('../../src/app');
const Product = require('../../src/models/mongo/Product');
const { redisClient } = require('../../src/config/redis');
const { makeAdmin } = require('../helpers/factories');

describe('Product Caching (Redis)', () => {
  let adminToken;

  beforeAll(async () => {
    const admin = await makeAdmin(app);
    adminToken = admin.token;
  });

  beforeEach(async () => {
    // Seed 5 products directly for list endpoint tests
    const products = Array.from({ length: 5 }, (_, i) => ({
      name: `Cache Product ${i + 1}`,
      description: `Cached item number ${i + 1}`,
      category: 'electronics',
      price: 10 * (i + 1),
      stock: 100
    }));
    await Product.insertMany(products);
  });

  // ── X-Cache HIT / MISS ──────────────────────────────────────

  describe('X-Cache header', () => {
    it('should return X-Cache: MISS on first request (DB fetch)', async () => {
      const res = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('MISS');
      expect(res.body.meta.cache).toBe('MISS');
      expect(res.body.data).toHaveLength(5);
    });

    it('should return X-Cache: HIT on second identical request (from Redis)', async () => {
      const res1 = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res1.headers['x-cache']).toBe('MISS');

      const res2 = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res2.headers['x-cache']).toBe('HIT');
      expect(res2.body.meta.cache).toBe('HIT');
      expect(res2.body.data).toHaveLength(5);
    });

    it('should cache different queries separately', async () => {
      const resA = await request(app).get('/api/v1/products?page=1&limit=3');
      expect(resA.headers['x-cache']).toBe('MISS');

      const resB = await request(app).get('/api/v1/products?page=2&limit=3');
      expect(resB.headers['x-cache']).toBe('MISS');  // different cache key

      const resA2 = await request(app).get('/api/v1/products?page=1&limit=3');
      expect(resA2.headers['x-cache']).toBe('HIT');
    });
  });

  // ── Cache Invalidation ──────────────────────────────────────

  describe('Cache invalidation', () => {
    it('should invalidate list cache after product update', async () => {
      const res1 = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res1.headers['x-cache']).toBe('MISS');

      const res2 = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res2.headers['x-cache']).toBe('HIT');

      const productId = res1.body.data[0]._id;
      await request(app)
        .put(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: 999 });

      const res3 = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res3.headers['x-cache']).toBe('MISS');
    });

    it('should invalidate list cache after product create', async () => {
      await request(app).get('/api/v1/products?page=1&limit=10');
      const warm = await request(app).get('/api/v1/products?page=1&limit=10');
      expect(warm.headers['x-cache']).toBe('HIT');

      await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Item', category: 'electronics', price: 50, stock: 10 });

      const afterCreate = await request(app).get('/api/v1/products?page=1&limit=10');
      expect(afterCreate.headers['x-cache']).toBe('MISS');
      expect(afterCreate.body.meta.total).toBe(6); // 5 seeded + 1 new
    });

    it('should invalidate list cache after product delete', async () => {
      await request(app).get('/api/v1/products?page=1&limit=5');
      const warm = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(warm.headers['x-cache']).toBe('HIT');

      const productId = warm.body.data[0]._id;
      await request(app)
        .delete(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      const afterDelete = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(afterDelete.headers['x-cache']).toBe('MISS');
      expect(afterDelete.body.meta.total).toBe(4);
    });
  });

  // ── Graceful Degradation ────────────────────────────────────

  describe('Redis graceful fallback', () => {
    it('should serve from DB when Redis cache is cleared (simulated failure)', async () => {
      const res1 = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res1.headers['x-cache']).toBe('MISS');

      // Simulate cache loss (e.g. Redis restart)
      await redisClient.flushdb();

      const res2 = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res2.status).toBe(200);
      expect(res2.headers['x-cache']).toBe('MISS'); // rebuilt from DB
      expect(res2.body.data).toHaveLength(5);
    });
  });
});
