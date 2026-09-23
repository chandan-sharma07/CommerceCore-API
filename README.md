# CommerceCore-API
Backend-only REST API for a mini e-commerce system — Node.js, Express, MySQL &amp; MongoDB, with ACID-safe order transactions, JWT auth, Redis caching, and Docker setup.

## Architecture

```mermaid
flowchart TB
    Client[Client / Postman] -->|HTTPS| API[Express API - /api/v1]

    API --> Auth[Auth Module]
    API --> Products[Products Module]
    API --> Reviews[Reviews Module]
    API --> Orders[Orders Module]

    Auth --> MySQL[(MySQL - users, orders,\norder_items, payments)]
    Orders --> MySQL
    Orders -->|stock check/decrement| MongoDB[(MongoDB - products, reviews)]

    Products --> MongoDB
    Products -->|cache read/write| Redis[(Redis Cache)]
    Reviews --> MongoDB
    Reviews -.->|purchase check| MySQL

    API --> Logger[Winston Logger]

    style MySQL fill:#4479A1,color:#fff
    style MongoDB fill:#47A248,color:#fff
    style Redis fill:#DC382D,color:#fff
```
