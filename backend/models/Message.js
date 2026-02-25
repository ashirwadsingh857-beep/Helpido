const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
    taskId: { type: String, required: true },
    senderPhone: { type: String, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Message", messageSchema);