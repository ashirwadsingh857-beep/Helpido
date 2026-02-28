const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    address: { type: String, required: true },
    otp: { type: String, default: null },
    otpExpiry: { type: Date, default: null },
    availability: { type: String, default: 'free' },
    // NEW: Stores the specific Android device ID for push notifications
    pushSubscription: { type: Object, default: null } 
});

module.exports = mongoose.model('User', userSchema);