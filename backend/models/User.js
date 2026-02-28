const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    address: { type: String, required: true },
    otp: { type: String, default: null },
    otpExpiry: { type: Date, default: null },
    availability: { type: String, default: 'free' }, // <-- ADDED MISSING COMMA HERE
    helpsCount: { type: Number, default: 0 }
});

module.exports = mongoose.model('User', userSchema);