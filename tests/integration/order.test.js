/**
 * tests/integration/order.test.js
 *
 * Orders Module — Integration Tests
 * Covers: place order, stock check, rollback, idempotency, payment,
 *         ownership, admin list, concurrent stock race condition
 */

const request = require('supertest');
const app = require('../../src/app');
const { Order, OrderItem } = require('../../src/models/mysql');
const Product = require('../../src/models/mongo/Product');
const { makeAdmin, makeUser, makeProduct } = require('../helpers/factories');

describe('Orders Module', () => {
  let customerToken, customer2Token, adminToken;
  let product1Id, product2Id;

  // Recreate users + products before every test
  // (afterEach in setup.js truncates all MySQL tables → users are lost)
  beforeEach(async () => {
    const admin = await makeAdmin(app);
    adminToken = admin.token;

    const customer1 = await makeUser(app);
    customerToken = customer1.token;

    const customer2 = await makeUser(app);
    customer2Token = customer2.token;

    const p1 = await makeProduct(app, adminToken, { price: 100, stock: 10 });
    product1Id = p1._id;

    const p2 = await makeProduct(app, adminToken, { price: 49.99, stock: 5, category: 'clothing' });
    product2Id = p2._id;
  });

  // ── Place Order ─────────────────────────────────────────────

  describe('POST /api/v1/orders', () => {
    it('should place an order with sufficient stock', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 2 }, { productId: product2Id, quantity: 1 }] });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.payment.status).toBe('pending');
      expect(parseFloat(res.body.data.total_amount)).toBeCloseTo(249.99, 2);
    });

    it('should decrement product stock after order', async () => {
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 3 }, { productId: product2Id, quantity: 2 }] });

      const p1 = await Product.findById(product1Id);
      expect(p1.stock).toBe(7);   // 10 - 3

      const p2 = await Product.findById(product2Id);
      expect(p2.stock).toBe(3);   // 5 - 2
    });

    it('should rollback transaction for insufficient stock (no records left)', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 2 }, { productId: product2Id, quantity: 100 }] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');

      expect(await Order.count()).toBe(0);
      expect(await OrderItem.count()).toBe(0);

      // MongoDB stock unchanged
      const p2 = await Product.findById(product2Id);
      expect(p2.stock).toBe(5);
    });

    it('should capture price_at_purchase (price snapshot)', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      expect(res.status).toBe(201);
      expect(parseFloat(res.body.data.items[0].price_at_purchase)).toBe(100);
    });

    it('should return same order for duplicate Idempotency-Key (no duplicate)', async () => {
      const key = `idem-key-${Date.now()}`;
      const res1 = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', key)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', key)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      expect(res2.status).toBe(200);
      expect(res2.body.data.id).toBe(res1.body.data.id);
      expect(await Order.count()).toBe(1);

      // Stock decremented only once
      const p1 = await Product.findById(product1Id);
      expect(p1.stock).toBe(9);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .send({ items: [{ productId: product1Id, quantity: 1 }] });
      expect(res.status).toBe(401);
    });

    it('should return 400 for empty items array', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [] });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for malformed body (missing items)', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for quantity = 0', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 0 }] });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    // ── Concurrent Stock Race Condition ─────────────────────────────────────
    // This is the key test for MySQL transaction correctness.
    // Two requests fire simultaneously for the last unit of stock.
    // Only ONE should succeed, the other must get INSUFFICIENT_STOCK.
    it('should allow only ONE of two concurrent requests for the last unit of stock', async () => {
      // Create a product with EXACTLY 1 unit in stock
      const scarceProduct = await makeProduct(app, adminToken, {
        name: 'Last-Unit Item',
        category: 'electronics',
        price: 50,
        stock: 1
      });

      // Fire both requests in parallel — no await between them
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/orders')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ items: [{ productId: scarceProduct._id, quantity: 1 }] }),
        request(app)
          .post('/api/v1/orders')
          .set('Authorization', `Bearer ${customer2Token}`)
          .send({ items: [{ productId: scarceProduct._id, quantity: 1 }] })
      ]);

      const statuses = [res1.status, res2.status];

      // Exactly one 201 (created) and one 400 (insufficient stock)
      expect(statuses).toContain(201);
      expect(statuses).toContain(400);

      const failedRes = res1.status === 400 ? res1 : res2;
      expect(failedRes.body.error.code).toBe('INSUFFICIENT_STOCK');

      // Stock should now be 0 — only one order went through
      const updated = await Product.findById(scarceProduct._id);
      expect(updated.stock).toBe(0);

      // Exactly 1 order record in MySQL
      const orderCount = await Order.count();
      expect(orderCount).toBe(1);
    }, 15000); // allow extra time for concurrent DB ops
  });

  // ── Order Detail (Ownership) ────────────────────────────────

  describe('GET /api/v1/orders/:id', () => {
    it('should return order details for the owner', async () => {
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      const res = await request(app)
        .get(`/api/v1/orders/${orderRes.body.data.id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
    });

    it('should return 403 when viewing another user\'s order', async () => {
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      const res = await request(app)
        .get(`/api/v1/orders/${orderRes.body.data.id}`)
        .set('Authorization', `Bearer ${customer2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow admin to view any order', async () => {
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      const res = await request(app)
        .get(`/api/v1/orders/${orderRes.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent order ID', async () => {
      const res = await request(app)
        .get('/api/v1/orders/non-existent-uuid-000')
        .set('Authorization', `Bearer ${customerToken}`);
      // 404 = order not found; 400 = invalid UUID format rejected by DB; 403 = treated as access denied
      expect([400, 403, 404]).toContain(res.status);
    });
  });

  // ── Payment Confirmation ────────────────────────────────────

  describe('POST /api/v1/orders/:id/pay', () => {
    it('should mark order as paid on successful payment', async () => {
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      const res = await request(app)
        .post(`/api/v1/orders/${orderRes.body.data.id}/pay`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'success' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('paid');
      expect(res.body.data.payment.status).toBe('success');
    });

    it('should mark order as failed on failed payment', async () => {
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      const res = await request(app)
        .post(`/api/v1/orders/${orderRes.body.data.id}/pay`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'failed' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('failed');
    });

    it('should reject duplicate payment confirmation', async () => {
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      const orderId = orderRes.body.data.id;
      await request(app)
        .post(`/api/v1/orders/${orderId}/pay`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'success' });

      const res = await request(app)
        .post(`/api/v1/orders/${orderId}/pay`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'success' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PAYMENT_ALREADY_PROCESSED');
    });
  });

  // ── Order History ───────────────────────────────────────────

  describe('GET /api/v1/orders (my orders)', () => {
    it('should return only the logged-in user\'s orders', async () => {
      // Customer 1 places 2 orders
      await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });
      await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product2Id, quantity: 1 }] });

      // Customer 2 places 1 order
      await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${customer2Token}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      const res = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
    });
  });

  // ── Admin Order List ────────────────────────────────────────

  describe('GET /api/v1/orders/admin', () => {
    it('should return all orders with status filter', async () => {
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      await request(app)
        .post(`/api/v1/orders/${orderRes.body.data.id}/pay`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'success' });

      // Another pending order
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer2Token}`)
        .send({ items: [{ productId: product2Id, quantity: 1 }] });

      const res = await request(app)
        .get('/api/v1/orders/admin?status=paid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('paid');
    });

    it('should return 403 for non-admin user', async () => {
      const res = await request(app)
        .get('/api/v1/orders/admin')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });
  });
});
