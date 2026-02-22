const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const Task = require("./models/Task.js");
const User = require("./models/User.js");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend')));

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch((err) => console.error("Mongo Error:", err));

/* --- 1. SIGNUP ROUTE (Name, Address, Phone) --- */
app.post('/api/signup', async (req, res) => {
    const { phone, name, address } = req.body; 
    try {
        const newUser = new User({ phone, name, address });
        await newUser.save();
        res.status(201).json({ message: "Account created! You can now login." });
    } catch (err) {
        res.status(400).json({ message: "Phone number already registered." });
    }
});

/* --- 2. LOGIN ROUTE (Phone Only) --- */
app.post('/api/login/step1', async (req, res) => {
    const { phone } = req.body;
    try {
        const user = await User.findOne({ phone });
        if (!user) return res.status(404).json({ message: "User not found! Please sign up." });

        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        await User.updateOne({ phone }, { $set: { otp } });

        // DEVELOPER BYPASS: Send OTP back in the response
        res.json({ message: "OTP generated", otp }); 
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

/* --- 3. VERIFY OTP --- */
app.post('/api/login/step2', async (req, res) => {
    const { phone, otp } = req.body;
    try {
        const user = await User.findOne({ phone });
        if (user && user.otp === otp) {
            await User.updateOne({ phone }, { $set: { otp: null } });
            res.json({ message: "Success!", userId: user._id });
        } else {
            res.status(401).json({ message: "Invalid OTP" });
        }
    } catch (err) {
        res.status(500).json({ message: "Verification error" });
    }
});

// ... (Keep all your existing Task routes below this) ...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));