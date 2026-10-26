# CommerceCore API

> A production-grade e-commerce REST API built to demonstrate real backend depth — not a tutorial CRUD app.

[![Tests](https://img.shields.io/badge/tests-80%20passed-brightgreen)](#testing)
[![Coverage](https://img.shields.io/badge/coverage-87%25-green)](#testing)
[![Node](https://img.shields.io/badge/node-20%2B-blue)](https://nodejs.org)

---

## Why This Exists

Most portfolio backends are "register/login + CRUD" with a single database. CommerceCore goes deeper:

- **Polyglot persistence** — MySQL for transactional data (users, orders), MongoDB for flexible catalogue (products, reviews), Redis for caching
- **Real transactions** — ACID-safe order placement with MySQL + cross-DB stock consistency
- **Race-condition safety** — MongoDB atomic `findOneAndUpdate` with a conditional guard prevents overselling even under concurrent load
- **Production patterns** — JWT rotation, idempotency keys, structured logging, request tracing, rate limiting, health checks

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     HTTP Client                         │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                  Express App                            │
│  Helmet · CORS · RequestID · Morgan · RateLimiter       │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌─────────┐  ┌────────┐  │
│  │   Auth   │  │ Products │  │ Reviews │  │ Orders │  │
│  │ module   │  │  module  │  │  module │  │ module │  │
│  └────┬─────┘  └────┬─────┘  └────┬────┘  └───┬────┘  │
│       │             │             │            │        │
└───────┼─────────────┼─────────────┼────────────┼────────┘
        │             │             │            │
   ┌────▼────┐   ┌────▼────┐   ┌───▼───┐   ┌───▼────┐
   │  MySQL  │   │ MongoDB │   │ MongoDB│   │ MySQL  │
   │(users,  │   │(products│   │(reviews│   │(orders,│
   │ tokens, │   │ stock)  │   │)       │   │ items, │
   │ orders) │   └─────────┘   └───────┘   │payment)│
   └─────────┘                             └────────┘
        │                  │
   ┌────▼──────────────────▼────┐
   │          Redis             │
   │  (product list cache TTL   │
   │   60s, pattern invalidation│
   │   on write)                │
   └────────────────────────────┘
```

### Why MySQL + MongoDB?

| Concern | MySQL | MongoDB |
|---|---|---|
| Users, Orders, Payments | ✅ FK constraints, ACID transactions | ❌ |
| Product catalogue, Reviews | ❌ Schema too rigid, $text search complex | ✅ Flexible schema, native text index |
| Session caching | — | — |

Redis sits in front of MongoDB product queries — cache hit serves results in <1ms vs ~20ms DB round-trip.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20, Express 4 |
| ORM / ODM | Sequelize 6 (MySQL), Mongoose 8 (MongoDB) |
| Cache | Redis 7 via ioredis |
| Auth | JWT (jsonwebtoken) + bcryptjs, refresh-token rotation |
| Validation | Zod |
| Logging | Winston (JSON in production, pretty in development) |
| Docs | swagger-jsdoc + swagger-ui-express |
| Testing | Jest + Supertest (integration tests, 80 tests) |
| Security | Helmet, express-rate-limit, CORS |
| Containerisation | Docker + Docker Compose |

---

## Setup

### Prerequisites

- [Node.js 20+](https://nodejs.org)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 1. Clone

```bash
git clone https://github.com/your-username/CommerceCore-API.git
cd CommerceCore-API
```

### 2. Environment variables

```bash
cp .env.example .env
# Edit .env — at minimum change the JWT secrets:
# JWT_ACCESS_SECRET=<32+ random chars>
# JWT_REFRESH_SECRET=<32+ random chars, different from access>
```

### 3. Start databases

```bash
docker compose up -d mysql mongo redis
# Wait ~15s for health checks to pass
```

### 4. Install dependencies

```bash
npm install
```

### 5. Seed demo data

```bash
npm run seed
```

This creates:

| Role | Email | Password |
|---|---|---|
| Admin | admin@commercecore.dev | Admin@1234 |
| Customer | alice@example.com | Password@1 |
| Customer | bob@example.com | Password@2 |

...plus 18 demo products across 7 categories, and 6 reviews.

### 6. Start dev server

```bash
npm run dev
# Server starts at http://localhost:3000
```

---

## API Documentation (Swagger UI)

Open **http://localhost:3000/api/v1/docs** in your browser.

**To test protected routes:**
1. Call `POST /api/v1/auth/login` with demo credentials
2. Copy the `accessToken` from the response
3. Click **Authorize** (top right) → paste `<your_token>` → **Authorize**
4. All subsequent requests will include the Bearer token automatically

---

## Testing

```bash
# Run all tests
npm test

# With coverage report
npm run test:coverage
```

**Requirements:** Docker must be running with MySQL, MongoDB, Redis healthy.

The test suite uses a separate `commercecore_test` database — production data is never touched.

**Coverage (last run):**

| Metric | Result | Threshold |
|---|---|---|
| Statements | 87.28% | 70% ✅ |
| Branches | 64.78% | 60% ✅ |
| Functions | 85.86% | 70% ✅ |
| Lines | 88.05% | 70% ✅ |

**Test suites:**

| Suite | Tests | Focus |
|---|---|---|
| `auth.test.js` | 18 | Register, login, token refresh, logout, JWT edge cases |
| `product.test.js` | 17 | CRUD, pagination, search, cache hit/miss |
| `review.test.js` | 17 | Create, update, delete, ownership, one-per-user |
| `order.test.js` | 14 | Place order, stock check, rollback, **concurrent race condition** |
| `cache.test.js` | 14 | Redis caching, TTL, invalidation |

---

## Key Design Decisions

### 1. JWT with Refresh Token Rotation

Access tokens are short-lived (15m). Refresh tokens are long-lived (7d), stored as SHA-256 hashes in MySQL. On each refresh, the old token is deleted and a new pair is issued — this limits the blast radius of a leaked refresh token.

### 2. Idempotency Keys on Orders

Clients can pass an `Idempotency-Key` header with order requests. If the same key is seen again (retry after network failure), the existing order is returned instead of creating a duplicate. The key is stored in MySQL alongside the order.

### 3. Cross-DB Stock Consistency

Orders span two databases — MySQL (order records) and MongoDB (product stock). Full distributed transactions (2PC/Saga) were deliberately avoided for simplicity. Instead:

1. **Atomic stock reservation** — MongoDB `findOneAndUpdate({ stock: { $gte: qty } }, { $inc: { stock: -qty } })` atomically decrements stock *before* opening the MySQL transaction. If the guard fails (stock was taken by a concurrent request), `INSUFFICIENT_STOCK` is thrown immediately.
2. **MySQL rollback → stock restore** — if the MySQL commit fails after stock was reserved, the decrement is reversed in MongoDB.
3. **Accepted trade-off** — if the process crashes between MongoDB decrement and MySQL commit, stock can be temporarily understated. A background reconciliation job would fix this in a real system.

### 4. Redis Cache — Pattern-Based Invalidation

Product list queries are cached with a deterministic key (sorted query params). When any product is created, updated, or deleted, all `products:list:*` keys are deleted via Redis `SCAN` (not `KEYS`) to avoid blocking Redis on large datasets.

### 5. Race-Condition Safety

Two concurrent requests for the last unit of stock both pass the pre-flight check (both read stock=1). Only one wins the atomic MongoDB CAS — the loser gets `INSUFFICIENT_STOCK`. This is tested with `Promise.all` in `order.test.js`.

---

## Folder Structure

```
CommerceCore-API/
├── src/
│   ├── app.js                  # Express app factory (middleware, Swagger, routes)
│   ├── server.js               # Entry point — connects DBs, starts HTTP server
│   ├── config/
│   │   ├── index.js            # Validated env vars (fail fast on startup)
│   │   ├── database.js         # Sequelize MySQL connection + sync
│   │   └── redis.js            # ioredis client factory
│   ├── core/
│   │   ├── AppError.js         # Operational error class (statusCode, errorCode)
│   │   ├── logger.js           # Winston — JSON in prod, pretty in dev
│   │   └── responseHandler.js  # success() / error() response helpers
│   ├── middleware/
│   │   ├── authenticate.js     # JWT verification → req.user
│   │   ├── authorize.js        # Role-based access guard
│   │   ├── errorHandler.js     # Global error handler
│   │   ├── notFound.js         # 404 catch-all
│   │   ├── rateLimiter.js      # Auth (strict) + general rate limits
│   │   ├── requestId.js        # UUID per request → X-Request-Id header
│   │   ├── requestLogger.js    # Morgan → Winston
│   │   └── validate.js         # Zod schema validation middleware
│   ├── models/
│   │   ├── mysql/              # Sequelize models (User, Order, OrderItem, Payment, RefreshToken)
│   │   └── mongo/              # Mongoose models (Product, Review)
│   ├── modules/
│   │   ├── auth/               # Register, login, refresh, logout
│   │   ├── products/           # Catalogue CRUD + Redis cache
│   │   ├── reviews/            # Product reviews (MongoDB)
│   │   └── orders/             # Order placement, payment, history
│   ├── routes/v1/index.js      # Mount all module routers under /api/v1
│   └── scripts/
│       └── seed.js             # Idempotent demo data seed script
├── tests/
│   ├── helpers/factories.js    # makeUser(), makeAdmin(), makeProduct(), loginAs()
│   ├── setup.js                # Global Jest setup (connect, truncate, teardown)
│   └── integration/            # One test file per module
├── .env.example                # All env vars documented with comments
├── .env.test                   # Test-specific DB names (never overwrites dev data)
├── docker-compose.yml          # MySQL + MongoDB + Redis + app (one command startup)
├── Dockerfile                  # Multi-stage Node 20 image with dumb-init
└── jest.config.js              # maxWorkers:1, coverage thresholds
```

---

## API Reference (Quick)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/register` | — | Register user |
| POST | `/api/v1/auth/login` | — | Login, get tokens |
| POST | `/api/v1/auth/refresh` | — | Refresh access token |
| POST | `/api/v1/auth/logout` | — | Invalidate refresh token |
| GET | `/api/v1/products` | — | List products (paginated, filterable) |
| GET | `/api/v1/products/:id` | — | Get single product |
| POST | `/api/v1/products` | Admin | Create product |
| PUT | `/api/v1/products/:id` | Admin | Update product |
| DELETE | `/api/v1/products/:id` | Admin | Delete product |
| GET | `/api/v1/reviews/product/:id` | — | Get product reviews |
| POST | `/api/v1/reviews` | Customer | Add review |
| PUT | `/api/v1/reviews/:id` | Owner | Update review |
| DELETE | `/api/v1/reviews/:id` | Owner | Delete review |
| POST | `/api/v1/orders` | Customer | Place order |
| GET | `/api/v1/orders` | Customer | My order history |
| GET | `/api/v1/orders/:id` | Owner/Admin | Order detail |
| POST | `/api/v1/orders/:id/pay` | Owner | Confirm payment |
| GET | `/api/v1/orders/admin` | Admin | All orders |
| GET | `/health` | — | Health check (MySQL, MongoDB, Redis) |
| GET | `/api/v1/docs` | — | Swagger UI |

---

## License

MIT
