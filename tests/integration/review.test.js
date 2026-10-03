const request = require('supertest');
const app = require('../../src/app');
const { User } = require('../../src/models/mysql');
const Product = require('../../src/models/mongo/Product');
const Review = require('../../src/models/mongo/Review');
const bcrypt = require('bcryptjs');

describe('Reviews Module', () => {
  let user1Token, user2Token;
  let adminToken;
  let productId;

  beforeAll(async () => {
    // Create two customer users via register
    const user1Reg = await request(app).post('/api/v1/auth/register').send({
      name: 'Reviewer One', email: 'reviewer1@test.com', password: 'Password123!'
    });
    user1Token = user1Reg.body.data.accessToken;

    const user2Reg = await request(app).post('/api/v1/auth/register').send({
      name: 'Reviewer Two', email: 'reviewer2@test.com', password: 'Password123!'
    });
    user2Token = user2Reg.body.data.accessToken;

    // Create admin user and login to get token
    const hash = await bcrypt.hash('AdminPass123!', 12);
    await User.create({ name: 'Review Admin', email: 'reviewadmin@test.com', password_hash: hash, role: 'admin' });
    const adminLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'reviewadmin@test.com', password: 'AdminPass123!'
    });
    adminToken = adminLogin.body.data.accessToken;
  });

  // Each test gets a fresh product and clean reviews
  beforeEach(async () => {
    await Review.deleteMany({});
    await Product.deleteMany({});

    const productRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Review Test Product', category: 'electronics', price: 99.99, stock: 10 });
    productId = productRes.body.data._id;
  });

  // ── Add Review ──────────────────────────────────────────────

  describe('POST /api/v1/reviews', () => {
    it('should create a review successfully', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: productId, rating: 4, comment: 'Great product!' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rating).toBe(4);
      expect(res.body.data.comment).toBe('Great product!');
      expect(res.body.data.product_id).toBe(productId);
    });

    it('should return 409 for duplicate review on same product', async () => {
      // First review — should succeed
      await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: productId, rating: 4, comment: 'First review' });

      // Second review on same product by same user — should fail
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: productId, rating: 5, comment: 'Duplicate attempt' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DUPLICATE_REVIEW');
    });

    it('should update product averageRating correctly after reviews', async () => {
      // User1 gives rating 4
      await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: productId, rating: 4, comment: 'Good' });

      // User2 gives rating 2
      await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ product_id: productId, rating: 2, comment: 'Average' });

      // Average should be (4 + 2) / 2 = 3.0
      const productRes = await request(app).get(`/api/v1/products/${productId}`);
      expect(productRes.body.data.averageRating).toBe(3);
      expect(productRes.body.data.reviewCount).toBe(2);
    });

    it('should return validation error for rating 0', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: productId, rating: 0, comment: 'Invalid rating' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return validation error for rating 6', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: productId, rating: 6, comment: 'Invalid rating' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .send({ product_id: productId, rating: 5, comment: 'No auth' });

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent product', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: '507f1f77bcf86cd799439011', rating: 5, comment: 'Ghost product' });

      expect(res.status).toBe(404);
    });
  });

  // ── Get Reviews (Public + Pagination) ───────────────────────

  describe('GET /api/v1/reviews/product/:productId', () => {
    it('should return paginated reviews for a product', async () => {
      // Add two reviews
      await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: productId, rating: 5, comment: 'Excellent!' });

      await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ product_id: productId, rating: 3, comment: 'Decent' });

      const res = await request(app).get(`/api/v1/reviews/product/${productId}?page=1&limit=10`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
      expect(res.body.meta.page).toBe(1);
    });

    it('should work without authentication (public)', async () => {
      const res = await request(app).get(`/api/v1/reviews/product/${productId}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  // ── Update Review (Ownership) ──────────────────────────────

  describe('PUT /api/v1/reviews/:id', () => {
    let reviewId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: productId, rating: 4, comment: 'Original review' });
      reviewId = res.body.data._id;
    });

    it('should update own review successfully', async () => {
      const res = await request(app)
        .put(`/api/v1/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ rating: 5, comment: 'Updated review' });

      expect(res.status).toBe(200);
      expect(res.body.data.rating).toBe(5);
      expect(res.body.data.comment).toBe('Updated review');
    });

    it('should return 403 when updating another user\'s review', async () => {
      const res = await request(app)
        .put(`/api/v1/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ rating: 1 });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should recalculate averageRating after update', async () => {
      // Add a second review from user2
      await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ product_id: productId, rating: 2, comment: 'Meh' });

      // Current avg = (4 + 2) / 2 = 3
      // Now user1 updates their rating from 4 to 5 → new avg = (5 + 2) / 2 = 3.5
      await request(app)
        .put(`/api/v1/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ rating: 5 });

      const productRes = await request(app).get(`/api/v1/products/${productId}`);
      expect(productRes.body.data.averageRating).toBe(3.5);
      expect(productRes.body.data.reviewCount).toBe(2);
    });
  });

  // ── Delete Review (Ownership) ──────────────────────────────

  describe('DELETE /api/v1/reviews/:id', () => {
    let reviewId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: productId, rating: 4, comment: 'To be deleted' });
      reviewId = res.body.data._id;
    });

    it('should delete own review successfully', async () => {
      const res = await request(app)
        .delete(`/api/v1/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 403 when deleting another user\'s review', async () => {
      const res = await request(app)
        .delete(`/api/v1/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reset averageRating to 0 after last review is deleted', async () => {
      await request(app)
        .delete(`/api/v1/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      const productRes = await request(app).get(`/api/v1/products/${productId}`);
      expect(productRes.body.data.averageRating).toBe(0);
      expect(productRes.body.data.reviewCount).toBe(0);
    });
  });
});
