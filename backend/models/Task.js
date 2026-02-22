// backend/models/Task.js
const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    reward: { type: Number, required: true },
    requesterPhone: { type: String, required: true }, // The person asking for help
    status: { type: String, default: 'open' }, // 'open' or 'accepted'
    helperPhone: { type: String, default: null }, // The person who clicked "I can help"
    isPrioritized: { type: Boolean, default: false }, // NEW: Tracks priority status
    location: {
        type: { type: String, default: 'Point' },
        coordinates: [Number] // [longitude, latitude]
    }
}, { timestamps: true });

taskSchema.index({ location: "2dsphere" }); // This allows "radius" searching

module.exports = mongoose.model('Task', taskSchema);