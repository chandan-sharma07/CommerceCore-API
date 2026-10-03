const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Product name is required'], trim: true },
  description: { type: String, trim: true },
  category: { type: String, required: [true, 'Category is required'], trim: true, index: true },
  price: { type: Number, required: [true, 'Price is required'], min: [0, 'Price cannot be negative'] },
  stock: { type: Number, required: true, min: [0, 'Stock cannot be negative'], default: 0 },
  attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
  averageRating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

productSchema.index({ category: 1, price: 1 });

/**
 * Product Mongoose Model
 */
module.exports = mongoose.model('Product', productSchema);
