const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    postedBy: { type: String, required: true },
    reward: { type: Number, required: true },
    status: { type: String, default: 'open' },
    helperPhone: { type: String, default: null },
    helperMarkedDone: { type: Boolean, default: false },
    isPrioritized: { type: Boolean, default: false },

    // NEW: Geospatial Location Data for Radius Filtering
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] } // Format: [longitude, latitude]
    }
}, { timestamps: true });

// CRITICAL: This index allows MongoDB to calculate distances between tasks and users
taskSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Task', taskSchema);