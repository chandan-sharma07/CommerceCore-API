const request = require('supertest');
const app = require('../../src/app');
const { User, RefreshToken } = require('../../src/models/mysql');

describe('Auth Module', () => {
  const testUser = { name: 'Test User', email: 'test@example.com', password: 'Password123!' };
  
  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app).post('/api/v1/auth/register').send(testUser);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testUser.email);
      expect(res.body.data.user.name).toBe(testUser.name);
      expect(res.body.data.user.role).toBe('customer');
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      // Password should not be in response
      expect(res.body.data.user.password).toBeUndefined();
      expect(res.body.data.user.password_hash).toBeUndefined();
    });
    
    it('should fail with duplicate email', async () => {
      // Register first
      await request(app).post('/api/v1/auth/register').send(testUser);
      // Try again
      const res = await request(app).post('/api/v1/auth/register').send(testUser);
      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DUPLICATE_EMAIL');
    });
    
    it('should fail with invalid email format', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({ name: 'Test', email: 'not-an-email', password: 'Password123!' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
    
    it('should fail with short password', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({ name: 'Test', email: 'test2@example.com', password: 'short' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
  
  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send(testUser);
    });
    
    it('should login successfully with correct credentials', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({ email: testUser.email, password: testUser.password });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testUser.email);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });
    
    it('should fail with wrong password', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({ email: testUser.email, password: 'WrongPassword123!' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
    
    it('should fail with non-existent email', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({ email: 'nonexistent@example.com', password: 'Password123!' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });
  
  describe('POST /api/v1/auth/refresh', () => {
    let refreshToken;
    
    beforeEach(async () => {
      const res = await request(app).post('/api/v1/auth/register').send(testUser);
      refreshToken = res.body.data.refreshToken;
    });
    
    it('should return new tokens with valid refresh token', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      // New refresh token should be different (rotation)
      expect(res.body.data.refreshToken).not.toBe(refreshToken);
    });
    
    it('should invalidate old refresh token after rotation', async () => {
      // Use the refresh token once
      const res1 = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
      expect(res1.status).toBe(200);
      
      // Try to use the OLD refresh token again — should fail
      const res2 = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
      expect(res2.status).toBe(401);
    });
    
    it('should fail with invalid refresh token', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: 'invalid-token-string' });
      expect(res.status).toBe(401);
    });
  });
  
  describe('POST /api/v1/auth/logout', () => {
    let refreshToken;
    
    beforeEach(async () => {
      const res = await request(app).post('/api/v1/auth/register').send(testUser);
      refreshToken = res.body.data.refreshToken;
    });
    
    it('should logout successfully', async () => {
      const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
    
    it('should invalidate refresh token after logout', async () => {
      // Logout
      await request(app).post('/api/v1/auth/logout').send({ refreshToken });
      
      // Try to use the refresh token — should fail
      const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
      expect(res.status).toBe(401);
    });
    
    it('should handle logout with already-invalid token gracefully', async () => {
      // Logout is idempotent
      await request(app).post('/api/v1/auth/logout').send({ refreshToken });
      const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
      expect(res.status).toBe(200);
    });
  });
});
