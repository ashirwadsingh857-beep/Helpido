const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    userPhone: { type: String, required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    purpose: { type: String, enum: ['topup', 'task_escrow', 'task_reward', 'platform_fee', 'payout'], required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
    referenceId: { type: String, required: true }, // Razorpay Payment ID or Task ID
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', transactionSchema);
