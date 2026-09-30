const request = require('supertest');
const app = require('../../src/app');
const { User } = require('../../src/models/mysql');
const Product = require('../../src/models/mongo/Product');
const bcrypt = require('bcryptjs');

describe('Products Module', () => {
  let adminToken;
  let customerToken;

  beforeAll(async () => {
    // Create admin user directly with hashed password
    const hash = await bcrypt.hash('AdminPass123!', 12);
    await User.create({ name: 'Admin', email: 'admin@test.com', password_hash: hash, role: 'admin' });
    const adminLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@test.com', password: 'AdminPass123!'
    });
    adminToken = adminLogin.body.data.accessToken;

    // Create customer user via register
    const customerReg = await request(app).post('/api/v1/auth/register').send({
      name: 'Customer', email: 'customer@test.com', password: 'CustPass123!'
    });
    customerToken = customerReg.body.data.accessToken;
  });

  // Clean up products after each test
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

  // ΓöÇΓöÇ Access Control ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  describe('Access Control', () => {
    it('should return 403 when a customer tries to create a product', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(sampleProduct);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 401 when no token is provided for create', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .send(sampleProduct);
      expect(res.status).toBe(401);
    });
  });

  // ΓöÇΓöÇ Admin CRUD ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  describe('POST /api/v1/products (admin)', () => {
    it('should create a product successfully', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(sampleProduct);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe(sampleProduct.name);
      expect(res.body.data.category).toBe('electronics');
      expect(res.body.data.price).toBe(29.99);
      expect(res.body.data.attributes.warranty).toBe('2 years');
      expect(res.body.data.averageRating).toBe(0);
    });

    it('should fail with validation error for missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'No name or category' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should fail with validation error for negative price', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...sampleProduct, price: -10 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /api/v1/products/:id (admin)', () => {
    it('should update a product successfully', async () => {
      const created = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(sampleProduct);
      const id = created.body.data._id;

      const res = await request(app)
        .put(`/api/v1/products/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: 24.99, stock: 200 });
      expect(res.status).toBe(200);
      expect(res.body.data.price).toBe(24.99);
      expect(res.body.data.stock).toBe(200);
      expect(res.body.data.name).toBe(sampleProduct.name); // unchanged
    });
  });

  describe('DELETE /api/v1/products/:id (admin)', () => {
    it('should delete a product successfully', async () => {
      const created = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(sampleProduct);
      const id = created.body.data._id;

      const res = await request(app)
        .delete(`/api/v1/products/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify it's gone
      const getRes = await request(app).get(`/api/v1/products/${id}`);
      expect(getRes.status).toBe(404);
    });
  });

  // ΓöÇΓöÇ Public List & Pagination ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  describe('GET /api/v1/products (public)', () => {
    beforeEach(async () => {
      // Seed 15 products across categories
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
          stock: 50,
          attributes: { size: 'M' }
        });
      }
      await Product.insertMany(products);
    });

    it('should return paginated results with correct metadata', async () => {
      const res = await request(app).get('/api/v1/products?page=1&limit=5');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(5);
      expect(res.body.meta.total).toBe(15);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.totalPages).toBe(3);
      expect(res.body.meta.hasNextPage).toBe(true);
    });

    it('should return hasNextPage=false on last page', async () => {
      const res = await request(app).get('/api/v1/products?page=3&limit=5');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(5);
      expect(res.body.meta.hasNextPage).toBe(false);
    });

    it('should filter by category', async () => {
      const res = await request(app).get('/api/v1/products?category=clothing');
      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBe(5);
      res.body.data.forEach((p) => {
        expect(p.category).toBe('clothing');
      });
    });

    it('should filter by price range', async () => {
      const res = await request(app).get('/api/v1/products?minPrice=30&maxPrice=60');
      expect(res.status).toBe(200);
      res.body.data.forEach((p) => {
        expect(p.price).toBeGreaterThanOrEqual(30);
        expect(p.price).toBeLessThanOrEqual(60);
      });
    });

    it('should sort by price ascending', async () => {
      const res = await request(app).get('/api/v1/products?sort=price_asc&limit=15');
      expect(res.status).toBe(200);
      const prices = res.body.data.map((p) => p.price);
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
      }
    });

    it('should return results for text search', async () => {
      const res = await request(app).get('/api/v1/products?search=gadget');
      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBeGreaterThan(0);
      // All results should be electronics (which have 'gadget' in description)
      res.body.data.forEach((p) => {
        expect(p.category).toBe('electronics');
      });
    });
  });

  // ΓöÇΓöÇ Get Single Product ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  describe('GET /api/v1/products/:id (public)', () => {
    it('should return a product with averageRating field', async () => {
      const created = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(sampleProduct);
      const id = created.body.data._id;

      const res = await request(app).get(`/api/v1/products/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe(sampleProduct.name);
      expect(res.body.data.averageRating).toBe(0);
      expect(res.body.data.reviewCount).toBe(0);
    });

    it('should return 404 for non-existent product', async () => {
      const res = await request(app).get('/api/v1/products/507f1f77bcf86cd799439011');
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid product ID format', async () => {
      const res = await request(app).get('/api/v1/products/not-a-valid-id');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
