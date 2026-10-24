/**
 * tests/integration/auth.test.js
 *
 * Auth Module — Integration Tests
 * Covers: register, login, refresh (rotation), logout, JWT edge cases
 */

const request = require('supertest');
const app = require('../../src/app');
const { makeUser } = require('../helpers/factories');

describe('Auth Module', () => {
  // ── Register ────────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user and return tokens', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        name: 'New User',
        email: 'newuser@test.com',
        password: 'Password123!'
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('newuser@test.com');
      expect(res.body.data.user.role).toBe('customer');
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      // Passwords must never appear in responses
      expect(res.body.data.user.password).toBeUndefined();
      expect(res.body.data.user.password_hash).toBeUndefined();
    });

    it('should fail with 409 for duplicate email', async () => {
      await makeUser(app, { email: 'dupe@test.com' });
      const res = await request(app).post('/api/v1/auth/register').send({
        name: 'Duplicate',
        email: 'dupe@test.com',
        password: 'Password123!'
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_EMAIL');
    });

    it('should fail with 400 for invalid email format', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        name: 'Test', email: 'not-an-email', password: 'Password123!'
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should fail with 400 for short password', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        name: 'Test', email: 'test@test.com', password: 'short'
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should fail with 400 for malformed JSON body (missing all fields)', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ── Login ───────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await makeUser(app, { email: 'login@test.com', password: 'Password123!' });
    });

    it('should login successfully with correct credentials', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'login@test.com', password: 'Password123!'
      });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });

    it('should fail with 401 for wrong password', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'login@test.com', password: 'WrongPassword!'
      });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should fail with 401 for non-existent email', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'ghost@test.com', password: 'Password123!'
      });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  // ── Protected Routes — JWT edge cases ──────────────────────

  describe('Protected routes — JWT edge cases', () => {
    it('should return 401 for missing Authorization header', async () => {
      const res = await request(app).post('/api/v1/products').send({
        name: 'Test', category: 'electronics', price: 10, stock: 5
      });
      expect(res.status).toBe(401);
    });

    it('should return 401 for malformed Bearer token', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', 'Bearer this.is.not.a.real.jwt')
        .send({ name: 'Test', category: 'electronics', price: 10, stock: 5 });
      expect(res.status).toBe(401);
    });

    it('should return 401 for an expired JWT token', async () => {
      // Sign a token that expired 1 second ago
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign(
        { id: 'fake-id', email: 'x@x.com', role: 'customer' },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: -1 } // already expired
      );
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ name: 'Test', category: 'electronics', price: 10, stock: 5 });
      expect(res.status).toBe(401);
    });
  });

  // ── Refresh Token ───────────────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    let refreshToken;

    beforeEach(async () => {
      const user = await makeUser(app);
      refreshToken = user.refreshToken;
    });

    it('should return new tokens (rotation)', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(refreshToken);
    });

    it('should invalidate old refresh token after rotation', async () => {
      await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
      const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
      expect(res.status).toBe(401);
    });

    it('should fail with 401 for invalid refresh token string', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken: 'invalid-token-string'
      });
      expect(res.status).toBe(401);
    });
  });

  // ── Logout ──────────────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    let refreshToken;

    beforeEach(async () => {
      const user = await makeUser(app);
      refreshToken = user.refreshToken;
    });

    it('should logout successfully', async () => {
      const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should invalidate refresh token after logout', async () => {
      await request(app).post('/api/v1/auth/logout').send({ refreshToken });
      const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
      expect(res.status).toBe(401);
    });

    it('should be idempotent — double logout returns 200', async () => {
      await request(app).post('/api/v1/auth/logout').send({ refreshToken });
      const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
      expect(res.status).toBe(200);
    });
  });
});
