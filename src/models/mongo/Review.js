const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  user_id: { type: String, required: true, comment: 'MySQL UUID reference' },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true }
}, {
  timestamps: true
});

reviewSchema.index({ product_id: 1, user_id: 1 }, { unique: true });

/**
 * Review Mongoose Model
 */
module.exports = mongoose.model('Review', reviewSchema);
