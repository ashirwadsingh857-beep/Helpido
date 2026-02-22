const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    address: { type: String, required: true },
    otp: { type: String, default: null },
    otpExpiry: { type: Date, default: null }
});

module.exports = mongoose.model('User', userSchema);