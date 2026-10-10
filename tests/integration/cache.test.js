const request = require('supertest');
const app = require('../../src/app');
const { User } = require('../../src/models/mysql');
const Product = require('../../src/models/mongo/Product');
const { redisClient } = require('../../src/config/redis');
const bcrypt = require('bcryptjs');

describe('Product Caching (Redis)', () => {
  let adminToken;

  beforeAll(async () => {
    const hash = await bcrypt.hash('AdminPass123!', 12);
    await User.create({ name: 'Cache Admin', email: 'cacheadmin@test.com', password_hash: hash, role: 'admin' });
    const adminLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'cacheadmin@test.com', password: 'AdminPass123!'
    });
    adminToken = adminLogin.body.data.accessToken;
  });

  beforeEach(async () => {
    // Seed products for list tests
    const products = [];
    for (let i = 1; i <= 5; i++) {
      products.push({
        name: `Cache Product ${i}`,
        category: 'electronics',
        price: 10 * i,
        stock: 100
      });
    }
    await Product.insertMany(products);
  });

  // ── Cache HIT / MISS ───────────────────────────────────────

  describe('X-Cache header', () => {
    it('should return X-Cache: MISS on first request (DB fetch)', async () => {
      const res = await request(app).get('/api/v1/products?page=1&limit=5');

      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('MISS');
      expect(res.body.meta.cache).toBe('MISS');
      expect(res.body.data).toHaveLength(5);
    });

    it('should return X-Cache: HIT on second identical request (from Redis)', async () => {
      // First request — cache MISS, populates cache
      const res1 = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res1.headers['x-cache']).toBe('MISS');

      // Second request — same query, should be cache HIT
      const res2 = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res2.headers['x-cache']).toBe('HIT');
      expect(res2.body.meta.cache).toBe('HIT');

      // Data should be identical
      expect(res2.body.data).toHaveLength(5);
      expect(res2.body.meta.total).toBe(res1.body.meta.total);
    });

    it('should cache different queries separately', async () => {
      // Query A — page 1
      const resA = await request(app).get('/api/v1/products?page=1&limit=3');
      expect(resA.headers['x-cache']).toBe('MISS');

      // Query B — page 2 (different cache key)
      const resB = await request(app).get('/api/v1/products?page=2&limit=3');
      expect(resB.headers['x-cache']).toBe('MISS');

      // Query A again — should be HIT
      const resA2 = await request(app).get('/api/v1/products?page=1&limit=3');
      expect(resA2.headers['x-cache']).toBe('HIT');
    });
  });

  // ── Cache Invalidation ─────────────────────────────────────

  describe('Cache invalidation', () => {
    it('should invalidate list cache after product update (MISS on next request)', async () => {
      // Populate cache
      const res1 = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res1.headers['x-cache']).toBe('MISS');

      // Confirm cache is warm
      const res2 = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res2.headers['x-cache']).toBe('HIT');

      // Update a product — should invalidate all list cache
      const productId = res1.body.data[0]._id;
      await request(app)
        .put(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: 999 });

      // Same query should now be MISS (cache was cleared)
      const res3 = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res3.headers['x-cache']).toBe('MISS');
    });

    it('should invalidate list cache after product create', async () => {
      // Populate cache
      await request(app).get('/api/v1/products?page=1&limit=10');
      const res1 = await request(app).get('/api/v1/products?page=1&limit=10');
      expect(res1.headers['x-cache']).toBe('HIT');

      // Create a new product
      await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Product', category: 'electronics', price: 50, stock: 10 });

      // Cache should be invalidated
      const res2 = await request(app).get('/api/v1/products?page=1&limit=10');
      expect(res2.headers['x-cache']).toBe('MISS');
      expect(res2.body.meta.total).toBe(6); // 5 seeded + 1 new
    });

    it('should invalidate list cache after product delete', async () => {
      // Populate cache
      await request(app).get('/api/v1/products?page=1&limit=5');
      const res1 = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res1.headers['x-cache']).toBe('HIT');

      // Delete a product
      const productId = res1.body.data[0]._id;
      await request(app)
        .delete(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Cache should be invalidated
      const res2 = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res2.headers['x-cache']).toBe('MISS');
      expect(res2.body.meta.total).toBe(4); // 5 - 1 deleted
    });
  });

  // ── Graceful Degradation ───────────────────────────────────

  describe('Redis failure graceful fallback', () => {
    it('should serve from DB when Redis keys are manually cleared (simulating failure)', async () => {
      // Populate cache
      const res1 = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res1.headers['x-cache']).toBe('MISS');

      // Manually flush Redis to simulate cache loss
      await redisClient.flushdb();

      // Should still work — MISS since cache was flushed, but response is valid
      const res2 = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res2.status).toBe(200);
      expect(res2.headers['x-cache']).toBe('MISS');
      expect(res2.body.data).toHaveLength(5);
    });
  });
});
