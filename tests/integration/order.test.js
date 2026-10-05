const request = require('supertest');
const app = require('../../src/app');
const { User, Order, OrderItem, Payment } = require('../../src/models/mysql');
const Product = require('../../src/models/mongo/Product');
const bcrypt = require('bcryptjs');

describe('Orders Module', () => {
  let customerToken, customer2Token, adminToken;
  let customerId, customer2Id;
  let product1Id, product2Id;

  // ── Fresh users + products before EVERY test ──────────────
  // (setup.js afterEach truncates all MySQL tables, so users must be recreated)
  beforeEach(async () => {
    // Customer 1
    const cust1 = await request(app).post('/api/v1/auth/register').send({
      name: 'Order Customer 1', email: 'ordercust1@test.com', password: 'Password123!'
    });
    customerToken = cust1.body.data.accessToken;
    customerId = cust1.body.data.user.id;

    // Customer 2
    const cust2 = await request(app).post('/api/v1/auth/register').send({
      name: 'Order Customer 2', email: 'ordercust2@test.com', password: 'Password123!'
    });
    customer2Token = cust2.body.data.accessToken;
    customer2Id = cust2.body.data.user.id;

    // Admin
    const hash = await bcrypt.hash('AdminPass123!', 12);
    await User.create({ name: 'Order Admin', email: 'orderadmin@test.com', password_hash: hash, role: 'admin' });
    const adminLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'orderadmin@test.com', password: 'AdminPass123!'
    });
    adminToken = adminLogin.body.data.accessToken;

    // Products (created via API so routes + validation are exercised)
    const p1 = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Order Product 1', category: 'electronics', price: 100, stock: 10 });
    product1Id = p1.body.data._id;

    const p2 = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Order Product 2', category: 'clothing', price: 49.99, stock: 5 });
    product2Id = p2.body.data._id;
  });

  // ── Place Order ─────────────────────────────────────────────

  describe('POST /api/v1/orders', () => {
    it('should place an order successfully with sufficient stock', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [
            { productId: product1Id, quantity: 2 },
            { productId: product2Id, quantity: 1 }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.payment).toBeDefined();
      expect(res.body.data.payment.status).toBe('pending');

      // total = (100 * 2) + (49.99 * 1) = 249.99
      expect(parseFloat(res.body.data.total_amount)).toBeCloseTo(249.99, 2);
    });

    it('should correctly decrement product stock after order', async () => {
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [
            { productId: product1Id, quantity: 3 },
            { productId: product2Id, quantity: 2 }
          ]
        });

      // Verify MongoDB stock was decremented
      const p1 = await Product.findById(product1Id);
      expect(p1.stock).toBe(7);   // was 10, ordered 3

      const p2 = await Product.findById(product2Id);
      expect(p2.stock).toBe(3);   // was 5, ordered 2
    });

    it('should fail with insufficient stock and leave no records in DB (transaction rollback)', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [
            { productId: product1Id, quantity: 2 },    // stock: 10 — OK
            { productId: product2Id, quantity: 100 }    // stock: 5  — NOT OK
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(res.body.error.message).toContain('Order Product 2');

      // Directly verify NO order or order_item records were created
      const orderCount = await Order.count();
      expect(orderCount).toBe(0);

      const itemCount = await OrderItem.count();
      expect(itemCount).toBe(0);

      // Stock should remain unchanged
      const p2 = await Product.findById(product2Id);
      expect(p2.stock).toBe(5);
    });

    it('should return the same order for the same Idempotency-Key (no duplicate)', async () => {
      const key = 'unique-idempotency-key-abc-123';

      const res1 = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', key)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      expect(res1.status).toBe(201);
      const orderId = res1.body.data.id;

      // Second request with same key
      const res2 = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', key)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      expect(res2.status).toBe(200);            // 200, not 201 — existing returned
      expect(res2.body.data.id).toBe(orderId);   // same order

      // Only ONE order in the database
      const orderCount = await Order.count();
      expect(orderCount).toBe(1);

      // Stock decremented only ONCE
      const p1 = await Product.findById(product1Id);
      expect(p1.stock).toBe(9);  // 10 - 1 = 9, not 10 - 2
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .send({ items: [{ productId: product1Id, quantity: 1 }] });
      expect(res.status).toBe(401);
    });

    it('should return validation error for empty items array', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return validation error for non-positive quantity', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 0 }] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should capture price_at_purchase from current product price', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      expect(res.status).toBe(201);
      const item = res.body.data.items[0];
      expect(parseFloat(item.price_at_purchase)).toBe(100);
    });
  });

  // ── Order Detail (Ownership) ────────────────────────────────

  describe('GET /api/v1/orders/:id', () => {
    it('should return order with items for the owner', async () => {
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      const orderId = orderRes.body.data.id;

      const res = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(orderId);
      expect(res.body.data.items).toHaveLength(1);
    });

    it('should return 403 when viewing another user\'s order', async () => {
      // Customer 1 places an order
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      const orderId = orderRes.body.data.id;

      // Customer 2 tries to view it
      const res = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${customer2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow admin to view any order', async () => {
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      const orderId = orderRes.body.data.id;

      const res = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(orderId);
    });
  });

  // ── Payment Confirmation ────────────────────────────────────

  describe('POST /api/v1/orders/:id/pay', () => {
    it('should update order to paid and payment to success', async () => {
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      const orderId = orderRes.body.data.id;

      const res = await request(app)
        .post(`/api/v1/orders/${orderId}/pay`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'success' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('paid');
      expect(res.body.data.payment.status).toBe('success');
    });

    it('should update order to failed when payment fails', async () => {
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      const orderId = orderRes.body.data.id;

      const res = await request(app)
        .post(`/api/v1/orders/${orderId}/pay`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'failed' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('failed');
      expect(res.body.data.payment.status).toBe('failed');
    });

    it('should reject duplicate payment confirmation', async () => {
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      const orderId = orderRes.body.data.id;

      // First payment
      await request(app)
        .post(`/api/v1/orders/${orderId}/pay`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'success' });

      // Try again
      const res = await request(app)
        .post(`/api/v1/orders/${orderId}/pay`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'success' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PAYMENT_ALREADY_PROCESSED');
    });
  });

  // ── Order History (User) ────────────────────────────────────

  describe('GET /api/v1/orders', () => {
    it('should return only the logged-in user\'s orders', async () => {
      // Customer 1 places 2 orders
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product2Id, quantity: 1 }] });

      // Customer 2 places 1 order
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer2Token}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      // Customer 1 should see only their 2 orders
      const res = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
    });
  });

  // ── Admin List ──────────────────────────────────────────────

  describe('GET /api/v1/orders/admin', () => {
    it('should return all orders for admin with status filter', async () => {
      // Place an order and pay it
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ items: [{ productId: product1Id, quantity: 1 }] });

      await request(app)
        .post(`/api/v1/orders/${orderRes.body.data.id}/pay`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'success' });

      // Place another order (stays pending)
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer2Token}`)
        .send({ items: [{ productId: product2Id, quantity: 1 }] });

      // Admin filters by status=paid
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
