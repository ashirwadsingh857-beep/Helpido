const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    address: { type: String, required: true },
    otp: { type: String, default: null },
    otpExpiry: { type: Date, default: null },
    availability: { type: String, default: 'free' },
    pushSubscription: { type: Object, default: null },
    fcmToken: { type: String, default: null },
    notifyNewTasks: { type: Boolean, default: true },
    notifyChatMessages: { type: Boolean, default: true },
    walletBalance: { type: Number, default: 0 },

    // --- RATING SYSTEM ---
    ratings: [{
        taskId: { type: String, required: true },
        rating: { type: Number, required: true, min: 1, max: 5 },
        ratedBy: { type: String, required: true } // phone of the poster who rated
    }],
    averageRating: { type: Number, default: null },

    // Geospatial Location Data for Radius Filtering
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] } // Format: [longitude, latitude]
    },

    // --- TASK DISMISSAL SYSTEM ---
    dismissedTasks: [{ type: String }] // Array of Task IDs that user has dismissed
});

// CRITICAL: This index allows MongoDB to perform high-speed radius math!
userSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('User', userSchema);
