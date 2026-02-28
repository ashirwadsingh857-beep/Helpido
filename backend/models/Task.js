
const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    postedBy: { type: String, required: true }, 
    reward: { type: Number, required: true },
    status: { type: String, default: 'open' }, 
    helperPhone: { type: String, default: null }, 
    isPrioritized: { type: Boolean, default: false } 
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
