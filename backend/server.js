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

/* --- AUTH ROUTES --- */
app.post('/api/signup', async (req, res) => {
    const { phone, name } = req.body;
    try {
        const newUser = new User({ phone, name });
        await newUser.save();
        res.status(201).json({ message: "Account created! Now login." });
    } catch (err) {
        res.status(400).json({ message: "Phone number already registered." });
    }
});

app.post('/api/login/step1', async (req, res) => {
    const { phone } = req.body;
    try {
        const user = await User.findOne({ phone });
        if (!user) return res.status(404).json({ message: "User not found!" });

        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        await User.updateOne({ phone }, { $set: { otp } });

        // OTP sent back for Developer Bypass
        res.json({ message: "OTP generated", otp });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

app.post('/api/login/step2', async (req, res) => {
    const { phone, otp } = req.body;
    try {
        const user = await User.findOne({ phone });
        if (user && user.otp === otp) {
            await User.updateOne({ phone }, { $set: { otp: null } });
            res.json({ message: "Success!", userId: user._id, name: user.name });
        } else {
            res.status(401).json({ message: "Invalid OTP" });
        }
    } catch (err) {
        res.status(500).json({ message: "Verification error" });
    }
});

/* --- TASK ROUTES --- */
app.post('/api/tasks', async (req, res) => {
    const { title, description, postedBy, lat, lng, reward } = req.body;
    try {
        const newTask = new Task({ title, description, postedBy, lat, lng, reward });
        await newTask.save();
        res.status(201).json(newTask);
    } catch (err) {
        res.status(500).json({ message: "Failed to post task" });
    }
});

app.get("/api/tasks", async (req, res) => {
    try {
        const tasks = await Task.find({ status: 'open' }).sort({ createdAt: -1 });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch tasks" });
    }
});

app.post("/api/tasks/accept", async (req, res) => {
    const { taskId, helperPhone } = req.body;
    try {
        const task = await Task.findById(taskId);
        if (!task || task.status !== 'open') {
            return res.status(400).json({ message: "Task no longer available" });
        }
        
        if (task.postedBy === helperPhone) {
            return res.status(400).json({ message: "You cannot accept your own request!" });
        }

        task.status = 'accepted';
        task.helperPhone = helperPhone;
        await task.save();

        res.json({ message: "You have accepted this task!" });
    } catch (err) {
        res.status(500).json({ message: "Failed to accept task" });
    }
});

app.post("/api/tasks/cancel", async (req, res) => {
    const { taskId } = req.body;
    try {
        const task = await Task.findById(taskId);
        if (task) {
            task.status = 'open';
            task.helperPhone = null;
            task.isPrioritized = false;
            await task.save();
        }
        res.json({ message: "Task removed from your list" });
    } catch (err) {
        res.status(500).json({ message: "Failed to remove task" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));