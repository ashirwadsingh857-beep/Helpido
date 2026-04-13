const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    userPhone: { type: String, required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    purpose: { type: String, enum: ['topup', 'task_escrow', 'task_reward', 'platform_fee', 'payout', 'refund'], required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
    referenceId: { type: String, required: true }, // Razorpay Payment ID, Task ID, or Payment Link ID
    description: { type: String, default: '' }, // Optional detailed description
    paymentMethod: { type: String, enum: ['card', 'netbanking', 'upi', 'wallet'], default: 'wallet' }, // Payment method used
    createdAt: { type: Date, default: Date.now }
});

// Create index for faster queries
transactionSchema.index({ userPhone: 1, createdAt: -1 });
transactionSchema.index({ referenceId: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
