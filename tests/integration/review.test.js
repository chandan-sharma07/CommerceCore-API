/**
 * tests/integration/review.test.js
 *
 * Reviews Module — Integration Tests
 * Covers: add, duplicate check, avg rating, pagination, ownership,
 *         non-existent product, malformed input
 */

const request = require('supertest');
const app = require('../../src/app');
const Product = require('../../src/models/mongo/Product');
const Review = require('../../src/models/mongo/Review');
const { makeAdmin, makeUser, makeProduct } = require('../helpers/factories');

describe('Reviews Module', () => {
  let user1Token, user2Token;
  let adminToken;
  let productId;

  beforeAll(async () => {
    const admin = await makeAdmin(app);
    adminToken = admin.token;

    const user1 = await makeUser(app);
    user1Token = user1.token;

    const user2 = await makeUser(app);
    user2Token = user2.token;
  });

  // Each test gets a fresh product + empty reviews
  beforeEach(async () => {
    await Review.deleteMany({});
    await Product.deleteMany({});
    const product = await makeProduct(app, adminToken, { stock: 10, price: 99.99 });
    productId = product._id;
  });

  // ── Add Review ──────────────────────────────────────────────

  describe('POST /api/v1/reviews', () => {
    it('should create a review successfully', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: productId, rating: 4, comment: 'Great product!' });

      expect(res.status).toBe(201);
      expect(res.body.data.rating).toBe(4);
      expect(res.body.data.comment).toBe('Great product!');
    });

    it('should return 409 for duplicate review on the same product', async () => {
      await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: productId, rating: 4, comment: 'First review' });

      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: productId, rating: 5, comment: 'Duplicate' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_REVIEW');
    });

    it('should update product averageRating after two reviews', async () => {
      await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: productId, rating: 4, comment: 'Good' });

      await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ product_id: productId, rating: 2, comment: 'Average' });

      const productRes = await request(app).get(`/api/v1/products/${productId}`);
      expect(productRes.body.data.averageRating).toBe(3);   // (4+2)/2
      expect(productRes.body.data.reviewCount).toBe(2);
    });

    it('should return 400 for rating out of range (0)', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: productId, rating: 0, comment: 'Invalid' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for rating out of range (6)', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: productId, rating: 6, comment: 'Invalid' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for malformed body (missing fields)', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .send({ product_id: productId, rating: 5, comment: 'No auth' });
      expect(res.status).toBe(401);
    });

    it('should return 404 for reviewing a non-existent product', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: '507f1f77bcf86cd799439011', rating: 5, comment: 'Ghost' });
      expect(res.status).toBe(404);
    });
  });

  // ── List Reviews (Public) ───────────────────────────────────

  describe('GET /api/v1/reviews/product/:productId', () => {
    it('should return paginated reviews for a product', async () => {
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
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
    });

    it('should be accessible without authentication', async () => {
      const res = await request(app).get(`/api/v1/reviews/product/${productId}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  // ── Update Review (Ownership) ───────────────────────────────

  describe('PUT /api/v1/reviews/:id', () => {
    let reviewId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ product_id: productId, rating: 4, comment: 'Original' });
      reviewId = res.body.data._id;
    });

    it('should update own review successfully', async () => {
      const res = await request(app)
        .put(`/api/v1/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ rating: 5, comment: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.data.rating).toBe(5);
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
      await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ product_id: productId, rating: 2, comment: 'Meh' });

      // avg: (4+2)/2 = 3 → after user1 updates to 5: (5+2)/2 = 3.5
      await request(app)
        .put(`/api/v1/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ rating: 5 });

      const productRes = await request(app).get(`/api/v1/products/${productId}`);
      expect(productRes.body.data.averageRating).toBe(3.5);
    });

    it('should return 404 for updating a non-existent review', async () => {
      const res = await request(app)
        .put('/api/v1/reviews/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ rating: 3 });
      expect(res.status).toBe(404);
    });
  });

  // ── Delete Review (Ownership) ───────────────────────────────

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
