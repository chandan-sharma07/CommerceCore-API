/**
 * tests/integration/product.test.js
 *
 * Products Module — Integration Tests
 * Covers: CRUD, auth/access control, pagination, filtering, sorting,
 *         text search, 404 for non-existent, malformed ID
 */

const request = require('supertest');
const app = require('../../src/app');
const Product = require('../../src/models/mongo/Product');
const { makeAdmin, makeUser, makeProduct } = require('../helpers/factories');

describe('Products Module', () => {
  let adminToken;
  let customerToken;

  beforeAll(async () => {
    const admin = await makeAdmin(app);
    adminToken = admin.token;

    const customer = await makeUser(app);
    customerToken = customer.token;
  });

  // Clean products after each test (users persist from beforeAll)
  afterEach(async () => {
    await Product.deleteMany({});
  });

  const sampleProduct = {
    name: 'Wireless Mouse',
    description: 'Ergonomic wireless mouse with USB receiver',
    category: 'electronics',
    price: 29.99,
    stock: 150,
    attributes: { warranty: '2 years', color: 'black' }
  };

  // ── Access Control ──────────────────────────────────────────

  describe('Access Control', () => {
    it('should return 403 when a customer tries to create a product', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(sampleProduct);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 401 when no token is provided', async () => {
      const res = await request(app).post('/api/v1/products').send(sampleProduct);
      expect(res.status).toBe(401);
    });
  });

  // ── Create ──────────────────────────────────────────────────

  describe('POST /api/v1/products (admin)', () => {
    it('should create a product successfully', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(sampleProduct);
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe(sampleProduct.name);
      expect(res.body.data.averageRating).toBe(0);
      expect(res.body.data.reviewCount).toBe(0);
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'No name or category' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for negative price', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...sampleProduct, price: -10 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for malformed request body (empty object)', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ── Update ──────────────────────────────────────────────────

  describe('PUT /api/v1/products/:id (admin)', () => {
    it('should update a product successfully', async () => {
      const product = await makeProduct(app, adminToken);
      const res = await request(app)
        .put(`/api/v1/products/${product._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: 24.99, stock: 200 });
      expect(res.status).toBe(200);
      expect(res.body.data.price).toBe(24.99);
      expect(res.body.data.stock).toBe(200);
      expect(res.body.data.name).toBe(product.name);
    });

    it('should return 404 for updating non-existent product', async () => {
      const res = await request(app)
        .put('/api/v1/products/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: 50 });
      expect(res.status).toBe(404);
    });
  });

  // ── Delete ──────────────────────────────────────────────────

  describe('DELETE /api/v1/products/:id (admin)', () => {
    it('should delete a product successfully', async () => {
      const product = await makeProduct(app, adminToken);
      const res = await request(app)
        .delete(`/api/v1/products/${product._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      // Confirm it's gone
      const getRes = await request(app).get(`/api/v1/products/${product._id}`);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 for deleting non-existent product', async () => {
      const res = await request(app)
        .delete('/api/v1/products/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  // ── List / Pagination / Filters ─────────────────────────────

  describe('GET /api/v1/products (public)', () => {
    beforeEach(async () => {
      const products = [];
      for (let i = 1; i <= 10; i++) {
        products.push({
          name: `Electronics Item ${i}`,
          description: `Electronic gadget number ${i}`,
          category: 'electronics',
          price: 10 * i,
          stock: 100
        });
      }
      for (let i = 1; i <= 5; i++) {
        products.push({
          name: `Clothing Item ${i}`,
          description: `Fashion clothing number ${i}`,
          category: 'clothing',
          price: 20 * i,
          stock: 50
        });
      }
      await Product.insertMany(products);
    });

    it('should return paginated results with correct metadata', async () => {
      const res = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(5);
      expect(res.body.meta.total).toBe(15);
      expect(res.body.meta.totalPages).toBe(3);
      expect(res.body.meta.hasNextPage).toBe(true);
    });

    it('should return hasNextPage=false on last page', async () => {
      const res = await request(app).get('/api/v1/products?page=3&limit=5');
      expect(res.status).toBe(200);
      expect(res.body.meta.hasNextPage).toBe(false);
    });

    it('should filter by category', async () => {
      const res = await request(app).get('/api/v1/products?category=clothing');
      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBe(5);
      res.body.data.forEach((p) => expect(p.category).toBe('clothing'));
    });

    it('should filter by price range', async () => {
      const res = await request(app).get('/api/v1/products?minPrice=30&maxPrice=60');
      res.body.data.forEach((p) => {
        expect(p.price).toBeGreaterThanOrEqual(30);
        expect(p.price).toBeLessThanOrEqual(60);
      });
    });

    it('should sort by price ascending', async () => {
      const res = await request(app).get('/api/v1/products?sort=price_asc&limit=15');
      const prices = res.body.data.map((p) => p.price);
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
      }
    });

    it('should return results for text search', async () => {
      const res = await request(app).get('/api/v1/products?search=gadget');
      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBeGreaterThan(0);
      res.body.data.forEach((p) => expect(p.category).toBe('electronics'));
    });
  });

  // ── Get Single ──────────────────────────────────────────────

  describe('GET /api/v1/products/:id (public)', () => {
    it('should return a product with averageRating and reviewCount', async () => {
      const product = await makeProduct(app, adminToken);
      const res = await request(app).get(`/api/v1/products/${product._id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.averageRating).toBe(0);
      expect(res.body.data.reviewCount).toBe(0);
    });

    it('should return 404 for non-existent product ID', async () => {
      const res = await request(app).get('/api/v1/products/507f1f77bcf86cd799439011');
      expect(res.status).toBe(404);
    });

    it('should return 400 for malformed (non-ObjectId) product ID', async () => {
      const res = await request(app).get('/api/v1/products/not-a-valid-id');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
