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

    // PAYMENT SYSTEM
    platformFee: { type: Number, default: 0 },
    totalBudget: { type: Number, default: 0 },
    escrowStatus: { type: String, enum: ['none', 'locked', 'released', 'refunded', 'disputed'], default: 'none' },

    // Optional compressed Base64 image attached to the task
    imageData: { type: String, default: null },

    // NEW: Geospatial Location Data for Radius Filtering
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] } // Format: [longitude, latitude]
    },
    // NEW: Robust Auto-Deletion Persistence
    completedAt: { type: Date, default: null },

    // NEW: Task Type and Destination for Rides
    taskType: { type: String, enum: ['help', 'ride'], default: 'help' },
    destination: {
        name: { type: String, default: null },
        location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], default: [0, 0] } // Format: [longitude, latitude]
        }
    }
}, { timestamps: true });

// CRITICAL: Tasks expire 10 minutes after completedAt is set
taskSchema.index({ completedAt: 1 }, { expireAfterSeconds: 600 });

// CRITICAL: This index allows MongoDB to calculate distances between tasks and users
taskSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Task', taskSchema);