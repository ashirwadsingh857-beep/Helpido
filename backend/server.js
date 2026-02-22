const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // Must be false for Port 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    // We keep these to ensure IPv4 and stability
    family: 4, 
    tls: {
        rejectUnauthorized: false
    }
});

// Load .env from the current directory (/backend)
require("dotenv").config({ path: path.join(__dirname, ".env") });

// Import the User model
const Task = require(path.join(__dirname, "models", "Task.js"));
const User = require(path.join(__dirname, "models", "User.js"));

const app = express();
app.use(express.json());
app.use(cors());

// Serve the frontend files to the network
app.use(express.static(path.join(__dirname, '../frontend')));

/* ---------------- DATABASE CONNECTION ---------------- */
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB Connected Successfully"))
    .catch((err) => console.error("Mongo Error:", err));

/* ---------------- SIGNUP ---------------- */
app.post('/api/signup', async (req, res) => {
    const { phone, email, name, address } = req.body;
    try {
        const newUser = new User({ phone, email, name, address });
        await newUser.save();
        res.status(201).json({ message: "User created! Now log in with your phone." });
    } catch (err) {
        res.status(400).json({ message: "Phone or Email already exists!" });
    }
});

/* ---------------- LOGIN -> GENERATE OTP ---------------- */
app.post('/api/login/step1', async (req, res) => {
    const { phone } = req.body;

    try {
        // 1. Find the user by their phone number
        const user = await User.findOne({ phone });
        
        if (!user) {
            return res.status(404).json({ message: "User not found. Please sign up first!" });
        }

        // 2. Generate OTP
        const otp = Math.floor(1000 + Math.random() * 9000);
        user.otp = otp;
        await user.save();

        // 3. Send OTP to the email linked to this phone number
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email, // Sends to the email we found in the database
            subject: 'Helpido Login OTP',
            text: `Your Helpido OTP is: ${otp}`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log("Email error:", error.message);
            } else {
                console.log(`OTP sent to email linked with ${phone}`);
            }
        });

        res.json({ message: "OTP sent to your registered email!" });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

/* ---------------- VERIFY OTP ---------------- */
app.post("/api/verify-otp", async (req, res) => {
    const { phone, otp } = req.body;

    try {
        const user = await User.findOne({ phone });

        if (!user || !user.otp) {
            return res.status(404).json({ message: "Invalid request" });
        }

        if (user.otp !== otp) {
            return res.status(400).json({ message: "Wrong OTP" });
        }

        // Clear OTP after successful login
        user.otp = null;
        await user.save();

        res.json({ message: "Login successful!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "OTP verification failed" });
    }
});
/* ---------------- TASKS ROUTES ---------------- */

// 1. Create a new help request
// Reference point: SIT Lonavala Campus Center
const REF_LAT = 18.7394; 
const REF_LNG = 73.4312;
const MAX_RADIUS_KM = 3.0; // 3km radius

app.post('/api/tasks', async (req, res) => {
    const { title, description, postedBy, lat, lng, reward } = req.body;

    // Convert coordinates to rough distance in KM
    // (1 degree of lat is ~111km, 1 degree of lng is ~111km at the equator)
    const latDiff = (lat - REF_LAT) * 111;
    const lngDiff = (lng - REF_LNG) * 111;
    const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

    if (distance > MAX_RADIUS_KM) {
        return res.status(403).json({ 
            message: `Too far! Helpido is only active within 3km of SIT Lonavala. (You are ${distance.toFixed(2)}km away)` 
        });
    }

    try {
        const newTask = new Task({ title, description, postedBy, lat, lng, reward });
        await newTask.save();
        res.status(201).json(newTask);
    } catch (err) {
        res.status(500).json({ message: "Error saving task" });
    }
});

// 2. Get all open tasks
app.get("/api/tasks", async (req, res) => {
    try {
        // Find tasks that are open and sort by newest first
        const tasks = await Task.find({ status: 'open' }).sort({ createdAt: -1 });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch tasks" });
    }
});

// 3. Accept a task
app.post("/api/tasks/accept", async (req, res) => {
    const { taskId, helperPhone } = req.body;
    try {
        const task = await Task.findById(taskId);
        if (!task || task.status !== 'open') {
            return res.status(400).json({ message: "Task no longer available" });
        }
        
        // Prevent users from accepting their own tasks
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

// 4. Get a user's personal tasks (Requested and Accepted)
app.get("/api/tasks/my-tasks", async (req, res) => {
    const phone = req.query.phone; // We will pass the phone number in the URL

    try {
        // Find tasks I asked for
        const myRequests = await Task.find({ postedBy: phone }).sort({ createdAt: -1 });
        
        // Find tasks I agreed to help with
        const myJobs = await Task.find({ helperPhone: phone }).sort({ createdAt: -1 });
        
        res.json({ myRequests, myJobs });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch your tasks" });
    }
});

// 5. Delete a task completely
app.delete("/api/tasks/:id", async (req, res) => {
    try {
        await Task.findByIdAndDelete(req.params.id);
        res.json({ message: "Task deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: "Failed to delete task" });
    }
});

// 6. Remove (Cancel) an accepted task
app.post("/api/tasks/cancel", async (req, res) => {
    const { taskId } = req.body;
    try {
        const task = await Task.findById(taskId);
        if (task) {
            task.status = 'open'; // Put it back on the market
            task.helperPhone = null; // Remove the helper
            task.isPrioritized = false; // Reset priority
            await task.save();
        }
        res.json({ message: "Task removed from your list" });
    } catch (err) {
        res.status(500).json({ message: "Failed to remove task" });
    }
});

// 7. Toggle Priority
app.post("/api/tasks/prioritize", async (req, res) => {
    const { taskId } = req.body;
    try {
        const task = await Task.findById(taskId);
        if (task) {
            task.isPrioritized = !task.isPrioritized; // Flip between true/false
            await task.save();
        }
        res.json({ message: "Priority updated" });
    } catch (err) {
        res.status(500).json({ message: "Failed to update priority" });
    }
});

// 8. Get nearby tasks
app.get('/api/tasks/nearby', async (req, res) => {
    const { lat, lng, radius } = req.query;
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const radiusKm = parseFloat(radius);

    // Approximate bounding box (rough calculation)
    const latRange = radiusKm / 111; // 1 degree lat ~ 111km
    const lngRange = radiusKm / (111 * Math.cos(userLat * Math.PI / 180)); // Adjust for longitude

    try {
        const tasks = await Task.find({
            lat: { $gte: userLat - latRange, $lte: userLat + latRange },
            lng: { $gte: userLng - lngRange, $lte: userLng + lngRange },
            status: 'open'
        });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch nearby tasks" });
    }
});

/* ---------------- USER PROFILE ROUTE ---------------- */
app.get("/api/users/:phone", async (req, res) => {
    try {
        // Find the user by their phone number (but don't send the OTP data back)
        const user = await User.findOne({ phone: req.params.phone }).select("-otp -otpExpiry");
        if (!user) return res.status(404).json({ message: "User not found" });
        
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch profile" });
    }
});

/* ---------------- START SERVER ---------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});