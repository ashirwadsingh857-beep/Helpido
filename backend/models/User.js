const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    address: { type: String, required: true },
    otp: { type: String, default: null },
    otpExpiry: { type: Date, default: null },
    availability: { type: String, default: 'free' },
    pushSubscription: { type: Object, default: null },
    // NEW: Notification Preferences (Default is ON)
    notifyNewTasks: { type: Boolean, default: true },
    notifyChatMessages: { type: Boolean, default: true }
});

module.exports = mongoose.model('User', userSchema);