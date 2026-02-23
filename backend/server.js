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

// --- THE CLOUD MAP (Fixes the Bounce) ---
// This tells Render to serve files if they are in the same folder...
// app.use(express.static(__dirname));  // Commented out to avoid conflicts
// ...OR if they are in a 'frontend' folder one level up.
app.use(express.static(path.join(__dirname, '../frontend')));

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch((err) => console.error("Mongo Error:", err));

/* ---------------- AUTH ROUTES ---------------- */
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

app.post('/api/login/step1', async (req, res) => {
    const { phone } = req.body;
    try {
        const user = await User.findOne({ phone });
        if (!user) return res.status(404).json({ message: "User not found! Please sign up." });

        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        await User.updateOne({ phone }, { $set: { otp } });
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
            res.json({ message: "Success!", userId: user._id });
        } else {
            res.status(401).json({ message: "Invalid OTP" });
        }
    } catch (err) {
        res.status(500).json({ message: "Verification error" });
    }
});

/* ---------------- PROFILE ROUTE ---------------- */
app.get('/api/users/:phone', async (req, res) => {
    try {
        const user = await User.findOne({ phone: req.params.phone }).select('-otp -otpExpiry');
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

/* ---------------- TASK ROUTES ---------------- */
app.post('/api/tasks', async (req, res) => {
    const { title, description, postedBy, reward } = req.body;
    try {
        const newTask = new Task({ title, description, postedBy, reward });
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
        if (task.postedBy === helperPhone) {
            return res.status(400).json({ message: "Cannot accept your own task!" });
        }
        task.status = 'accepted'; 
        task.helperPhone = helperPhone; 
        await task.save();
        res.json({ message: "Task accepted!" });
    } catch (err) {
        res.status(500).json({ message: "Error accepting task" });
    }
});

app.get("/api/tasks/my-tasks", async (req, res) => {
    const phone = req.query.phone;
    try {
        const myRequests = await Task.find({ postedBy: phone }).sort({ createdAt: -1 });
        const myJobs = await Task.find({ helperPhone: phone }).sort({ createdAt: -1 });
        res.json({ myRequests, myJobs });
    } catch (err) {
        res.status(500).json({ message: "Error fetching your tasks" });
    }
});

app.delete("/api/tasks/:id", async (req, res) => {
    try {
        await Task.findByIdAndDelete(req.params.id);
        res.json({ message: "Task deleted" });
    } catch (err) {
        res.status(500).json({ message: "Error deleting task" });
    }
});

app.post("/api/tasks/cancel", async (req, res) => {
    const { taskId } = req.body;
    try {
        const task = await Task.findById(taskId);
        task.status = 'open'; 
        task.helperPhone = null; 
        task.isPrioritized = false; 
        await task.save();
        res.json({ message: "Task returned to public feed" });
    } catch (err) {
        res.status(500).json({ message: "Error removing task" });
    }
});

app.post("/api/tasks/prioritize", async (req, res) => {
    const { taskId } = req.body;
    try {
        const task = await Task.findById(taskId);
        task.isPrioritized = !task.isPrioritized; 
        await task.save();
        res.json({ message: "Priority updated" });
    } catch (err) {
        res.status(500).json({ message: "Error updating priority" });
    }
});


// --- IRONCLAD FRONTEND ROUTING ---
// 1. Tell Express where the frontend folder is
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// 2. Explicitly serve the Dashboard
app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(frontendPath, 'dashboard.html'));
});

// 3. Explicitly serve the Login page for the root domain
app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// 4. Catch-All: Bypassing Express 5's strict path parser entirely
app.use((req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));