const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    // ... existing fields ...
    title: { type: String, required: true },
    description: { type: String, required: true },
    postedBy: { type: String, required: true },
    reward: { type: Number, required: true },
    status: { type: String, default: 'open' },
    helperPhone: { type: String, default: null },
    isPrioritized: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    
   
    lastActivity: { type: Date, default: Date.now } 
});

module.exports = mongoose.model('Task', taskSchema);