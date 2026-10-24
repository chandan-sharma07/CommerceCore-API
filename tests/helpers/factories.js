/**
 * tests/helpers/factories.js
 *
 * Test data factories — create common entities with sensible defaults.
 * Used across all test suites to eliminate boilerplate and keep tests DRY.
 *
 * Usage:
 *   const { makeUser, makeAdmin, makeProduct, loginAs } = require('../helpers/factories');
 *   const { token } = await makeAdmin(app);
 *   const product = await makeProduct(app, adminToken);
 */

const request = require('supertest');
const bcrypt = require('bcryptjs');
const { User } = require('../../src/models/mysql');
const Product = require('../../src/models/mongo/Product');

// ── Counter for unique emails ─────────────────────────────────────────────────
let _seq = 0;
const seq = () => ++_seq;

// ── Auth Factories ────────────────────────────────────────────────────────────

/**
 * Register a new customer user via the API and return their token + id.
 * @param {import('express').Application} app
 * @param {Object} [overrides] - Optional field overrides
 * @returns {Promise<{ token: string, id: string, email: string, refreshToken: string }>}
 */
const makeUser = async (app, overrides = {}) => {
  const n = seq();
  const defaults = {
    name: `Test User ${n}`,
    email: `user${n}@test.com`,
    password: 'Password123!'
  };
  const data = { ...defaults, ...overrides };
  const res = await request(app).post('/api/v1/auth/register').send(data);
  if (res.status !== 201) {
    throw new Error(`makeUser failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return {
    token: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
    id: res.body.data.user.id,
    email: data.email,
    password: data.password
  };
};

/**
 * Create an admin user directly in the DB (bypasses register endpoint which
 * only allows 'customer' role), then log in via the API to get a token.
 * @param {import('express').Application} app
 * @param {Object} [overrides] - Optional field overrides
 * @returns {Promise<{ token: string, id: string, email: string }>}
 */
const makeAdmin = async (app, overrides = {}) => {
  const n = seq();
  const defaults = {
    name: `Admin User ${n}`,
    email: `admin${n}@test.com`,
    password: 'AdminPass123!'
  };
  const data = { ...defaults, ...overrides };
  const hash = await bcrypt.hash(data.password, 10); // lower rounds = faster in tests
  const user = await User.create({
    name: data.name,
    email: data.email,
    password_hash: hash,
    role: 'admin'
  });
  const login = await request(app).post('/api/v1/auth/login').send({
    email: data.email,
    password: data.password
  });
  if (login.status !== 200) {
    throw new Error(`makeAdmin login failed (${login.status}): ${JSON.stringify(login.body)}`);
  }
  return {
    token: login.body.data.accessToken,
    id: user.id,
    email: data.email
  };
};

// ── Product Factory ───────────────────────────────────────────────────────────

/**
 * Create a product via the API (admin token required).
 * @param {import('express').Application} app
 * @param {string} adminToken
 * @param {Object} [overrides]
 * @returns {Promise<{ _id: string, name: string, price: number, stock: number }>}
 */
const makeProduct = async (app, adminToken, overrides = {}) => {
  const n = seq();
  const defaults = {
    name: `Test Product ${n}`,
    description: `Description for product ${n}`,
    category: 'electronics',
    price: 99.99,
    stock: 20
  };
  const data = { ...defaults, ...overrides };
  const res = await request(app)
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(data);
  if (res.status !== 201) {
    throw new Error(`makeProduct failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
};

/**
 * Login an existing user by email + password and return their access token.
 * @param {import('express').Application} app
 * @param {string} email
 * @param {string} password
 * @returns {Promise<string>} accessToken
 */
const loginAs = async (app, email, password) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`loginAs failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
};

module.exports = { makeUser, makeAdmin, makeProduct, loginAs };
