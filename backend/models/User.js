const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    phone: { 
        type: String, 
        required: true, 
        unique: true 
    },
    email: { 
        type: String, 
        required: true, 
        unique: true 
    },
    name: { 
        type: String,
        required: true
    },
    address: { 
        type: String,
        required: true
    },
    otp: { 
        type: String, // Storing the hashed OTP
        default: null
    },
    otpExpiry: { 
        type: Number, // Storing Date.now() timestamp
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);