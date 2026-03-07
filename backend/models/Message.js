const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
    taskId: { type: String, required: true },
    senderPhone: { type: String, required: true },
    text: { type: String, required: true },
    seenBy: [{ type: String }], // phones of users who have seen this message
    createdAt: { type: Date, default: Date.now },
    // NEW: Messages expire automatically when this is set (by TTL index)
    expiresAt: { type: Date, default: null }
});

messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Message", messageSchema);