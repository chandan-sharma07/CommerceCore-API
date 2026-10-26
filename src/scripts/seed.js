/**
 * src/scripts/seed.js
 *
 * Idempotent seed script — safe to run multiple times.
 * Clears existing seed data first, then inserts fresh demo data.
 *
 * Usage:  npm run seed
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const mongoose = require('mongoose');
const { sequelize, User } = require('../models/mysql');
const Product = require('../models/mongo/Product');
const Review = require('../models/mongo/Review');
const { connectMySQL } = require('../config/database');
const { logger } = require('../core/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Seed Data
// ─────────────────────────────────────────────────────────────────────────────

const SEED_USERS = [
  {
    name: 'Admin User',
    email: 'admin@commercecore.dev',
    password: 'Admin@1234',
    role: 'admin'
  },
  {
    name: 'Alice Johnson',
    email: 'alice@example.com',
    password: 'Password@1',
    role: 'customer'
  },
  {
    name: 'Bob Williams',
    email: 'bob@example.com',
    password: 'Password@2',
    role: 'customer'
  }
];

const SEED_PRODUCTS = [
  // Electronics
  {
    name: 'Sony WH-1000XM5 Headphones',
    description: 'Industry-leading noise cancelling wireless headphones with 30h battery life and multipoint connection.',
    price: 279.99,
    stock: 45,
    category: 'electronics',
    imageUrl: 'https://example.com/images/sony-wh1000xm5.jpg'
  },
  {
    name: 'Apple AirPods Pro (2nd Gen)',
    description: 'Active Noise Cancellation, Adaptive Transparency, and Personalized Spatial Audio with dynamic head tracking.',
    price: 249.00,
    stock: 60,
    category: 'electronics',
    imageUrl: 'https://example.com/images/airpods-pro.jpg'
  },
  {
    name: 'Logitech MX Master 3S Mouse',
    description: 'Advanced wireless mouse with ultra-fast MagSpeed scrolling, 8K DPI sensor, and quiet clicks.',
    price: 99.99,
    stock: 120,
    category: 'electronics',
    imageUrl: 'https://example.com/images/mx-master-3s.jpg'
  },
  {
    name: 'Samsung 27" 4K Monitor',
    description: '27-inch IPS 4K UHD monitor with HDR10, 60Hz refresh rate, and USB-C connectivity.',
    price: 399.99,
    stock: 30,
    category: 'electronics',
    imageUrl: 'https://example.com/images/samsung-4k-monitor.jpg'
  },
  {
    name: 'Mechanical Keyboard TKL RGB',
    description: 'Tenkeyless mechanical keyboard with Cherry MX Red switches, per-key RGB, and PBT keycaps.',
    price: 129.99,
    stock: 85,
    category: 'electronics',
    imageUrl: 'https://example.com/images/mech-keyboard.jpg'
  },
  // Clothing
  {
    name: 'Classic Fit Oxford Shirt',
    description: 'Premium 100% cotton Oxford shirt, wrinkle-resistant, available in multiple colours.',
    price: 49.99,
    stock: 200,
    category: 'clothing',
    imageUrl: 'https://example.com/images/oxford-shirt.jpg'
  },
  {
    name: 'Slim-Fit Chino Trousers',
    description: 'Stretch-cotton chino trousers in modern slim fit. Machine washable.',
    price: 59.99,
    stock: 150,
    category: 'clothing',
    imageUrl: 'https://example.com/images/chino-trousers.jpg'
  },
  {
    name: 'Merino Wool Crew-Neck Sweater',
    description: 'Lightweight 100% merino wool sweater, naturally odour-resistant and temperature-regulating.',
    price: 89.99,
    stock: 75,
    category: 'clothing',
    imageUrl: 'https://example.com/images/merino-sweater.jpg'
  },
  // Books
  {
    name: 'Designing Data-Intensive Applications',
    description: 'By Martin Kleppmann. The definitive guide to the principles of modern data systems.',
    price: 44.99,
    stock: 300,
    category: 'books',
    imageUrl: 'https://example.com/images/ddia.jpg'
  },
  {
    name: 'Clean Code',
    description: 'By Robert C. Martin. A handbook of agile software craftsmanship.',
    price: 34.99,
    stock: 250,
    category: 'books',
    imageUrl: 'https://example.com/images/clean-code.jpg'
  },
  {
    name: 'The Pragmatic Programmer',
    description: 'By David Thomas & Andrew Hunt. 20th anniversary edition.',
    price: 39.99,
    stock: 180,
    category: 'books',
    imageUrl: 'https://example.com/images/pragmatic-programmer.jpg'
  },
  // Home
  {
    name: 'Fellow Stagg EKG Kettle',
    description: 'Variable temperature electric pour-over kettle with precision control and 1L capacity.',
    price: 165.00,
    stock: 40,
    category: 'home',
    imageUrl: 'https://example.com/images/fellow-kettle.jpg'
  },
  {
    name: 'Hario V60 Coffee Dripper Kit',
    description: 'Complete pour-over coffee set: V60 ceramic dripper, server, and 40 filters.',
    price: 42.99,
    stock: 95,
    category: 'home',
    imageUrl: 'https://example.com/images/hario-v60.jpg'
  },
  // Sports
  {
    name: 'Yoga Mat Premium 6mm',
    description: 'Non-slip TPE yoga mat, 183x61cm, eco-friendly, includes carrying strap.',
    price: 34.99,
    stock: 110,
    category: 'sports',
    imageUrl: 'https://example.com/images/yoga-mat.jpg'
  },
  {
    name: 'Adjustable Dumbbell Set 2-24kg',
    description: 'Space-saving adjustable dumbbells with 15 weight settings per dumbbell.',
    price: 299.99,
    stock: 25,
    category: 'sports',
    imageUrl: 'https://example.com/images/adjustable-dumbbells.jpg'
  },
  // Beauty
  {
    name: 'CeraVe Moisturising Cream 340g',
    description: '24-hour moisturising face and body cream with ceramides and hyaluronic acid.',
    price: 16.99,
    stock: 400,
    category: 'beauty',
    imageUrl: 'https://example.com/images/cerave-cream.jpg'
  },
  // Toys
  {
    name: 'LEGO Technic Bugatti Bolide',
    description: '905-piece LEGO Technic set. Build a detailed model of the iconic hypercar.',
    price: 59.99,
    stock: 55,
    category: 'toys',
    imageUrl: 'https://example.com/images/lego-bugatti.jpg'
  },
  // Food
  {
    name: 'Specialty Coffee Sampler Pack',
    description: 'Five 100g bags of single-origin specialty coffee — Ethiopia, Colombia, Guatemala, Kenya, and Brazil.',
    price: 39.99,
    stock: 80,
    category: 'food',
    imageUrl: 'https://example.com/images/coffee-sampler.jpg'
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// Seed Logic
// ─────────────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\n🌱  CommerceCore — Seed Script\n');

  // ── Connect ──────────────────────────────────────────────────
  await connectMySQL();
  console.log('✅  MySQL connected');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅  MongoDB connected');

  // ── Idempotency: clear previous seed data ────────────────────
  // Identify seeded users by email pattern and delete them + their tokens
  const seedEmails = SEED_USERS.map(u => u.email);

  console.log('\n🗑   Clearing previous seed data...');

  // MySQL users (cascade deletes refresh tokens via FK)
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  const deletedUsers = await User.destroy({ where: { email: { [Op.in]: seedEmails } }, force: true });
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log(`    Removed ${deletedUsers} MySQL user(s)`);

  // MongoDB products & reviews — delete by seeded product names
  const seedNames = SEED_PRODUCTS.map(p => p.name);
  const deletedProducts = await Product.deleteMany({ name: { $in: seedNames } });
  console.log(`    Removed ${deletedProducts.deletedCount} product(s)`);

  // Reviews belonging to deleted products (clean up by userId via seeded users)
  // We'll clean up after inserting new users to get their IDs

  // ── Seed MySQL users ─────────────────────────────────────────
  console.log('\n👤  Seeding users...');
  const createdUsers = [];

  for (const u of SEED_USERS) {
    const password_hash = await bcrypt.hash(u.password, 12);
    const user = await User.create({ name: u.name, email: u.email, password_hash, role: u.role });
    createdUsers.push(user);
    console.log(`    ✓ ${u.role.padEnd(8)} ${u.email}`);
  }

  const adminUser = createdUsers[0];
  const alice = createdUsers[1];
  const bob = createdUsers[2];

  // ── Seed MongoDB products ─────────────────────────────────────
  console.log('\n📦  Seeding products...');
  const createdProducts = await Product.insertMany(SEED_PRODUCTS);
  console.log(`    ✓ ${createdProducts.length} products inserted`);

  // ── Seed MongoDB reviews ──────────────────────────────────────
  console.log('\n⭐  Seeding reviews...');

  // Delete any lingering reviews from these seed users
  await Review.deleteMany({ user_id: { $in: [alice.id, bob.id, adminUser.id] } });

  const electronics = createdProducts.filter(p => p.category === 'electronics');
  const books = createdProducts.filter(p => p.category === 'books');

  const reviewsToInsert = [
    // Alice reviews electronics
    {
      product_id: electronics[0]._id,
      user_id: alice.id,
      rating: 5,
      comment: 'Absolutely incredible noise cancellation. Best headphones I have ever owned.'
    },
    {
      product_id: electronics[2]._id,
      user_id: alice.id,
      rating: 4,
      comment: 'Comfortable to use all day. The MagSpeed scroll wheel is a game-changer.'
    },
    // Bob reviews books and electronics
    {
      product_id: books[0]._id,
      user_id: bob.id,
      rating: 5,
      comment: 'Essential reading for any backend engineer. Dense but incredibly rewarding.'
    },
    {
      product_id: electronics[0]._id,
      user_id: bob.id,
      rating: 4,
      comment: 'Great headphones. Build quality feels premium. Call quality could be better.'
    },
    {
      product_id: books[1]._id,
      user_id: alice.id,
      rating: 5,
      comment: 'Changed how I think about writing code. A must-read.'
    },
    {
      product_id: electronics[1]._id,
      user_id: bob.id,
      rating: 4,
      comment: 'The adaptive transparency is impressive. Price is steep but worth it.'
    }
  ];

  const createdReviews = await Review.insertMany(reviewsToInsert);
  console.log(`    ✓ ${createdReviews.length} reviews inserted`);

  // ── Summary ───────────────────────────────────────────────────
  console.log('\n✅  Seed complete!\n');
  console.log('─'.repeat(50));
  console.log('Demo credentials:');
  console.log('  Admin:    admin@commercecore.dev  /  Admin@1234');
  console.log('  Customer: alice@example.com       /  Password@1');
  console.log('  Customer: bob@example.com         /  Password@2');
  console.log('─'.repeat(50));
  console.log(`\nSwagger UI → http://localhost:${process.env.PORT || 3000}/api/v1/docs`);
  console.log('');
}

seed()
  .catch((err) => {
    console.error('\n❌  Seed failed:', err.message);
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await sequelize.close();
    await mongoose.connection.close();
    process.exit(0);
  });
