const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
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
app.post("/api/signup", async (req, res) => {
    const { name, address, phone } = req.body;

    if (!name || !phone || !address) {
        return res.status(400).json({ message: "Missing fields" });
    }

    try {
        const exists = await User.findOne({ phone });
        if (exists) {
            return res.status(400).json({ message: "Phone already registered. Please login." });
        }

        const user = new User({ name, address, phone });
        await user.save();

        res.status(201).json({ message: "Account created successfully!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Signup failed" });
    }
});

/* ---------------- LOGIN -> GENERATE OTP ---------------- */
app.post("/api/login", async (req, res) => {
    const { phone } = req.body;

    try {
        const user = await User.findOne({ phone });

        if (!user) {
            return res.status(404).json({ message: "User not found. Please sign up." });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
        const hashedOtp = await bcrypt.hash(otp, 10);

        user.otp = hashedOtp;
        user.otpExpiry = Date.now() + 5 * 60 * 1000; // 5 mins
        await user.save();

        // Replace console.log("OTP for", phone, "is", otp); with this:
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: 'ashirwadrakeshsingh@gmail.com', // Since we don't have user emails yet, we send all OTPs to you for now
            subject: 'Helpido Login OTP',
            text: `Your OTP for Helpido login is: ${otp}. This code will expire in 5 minutes.`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log("Email error:", error);
            } else {
                console.log("OTP Email sent: " + info.response);
            }
        });

        res.json({ message: "OTP sent to your phone" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Login failed" });
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

        if (Date.now() > user.otpExpiry) {
            return res.status(400).json({ message: "OTP expired" });
        }

        const match = await bcrypt.compare(otp, user.otp);

        if (!match) {
            return res.status(400).json({ message: "Wrong OTP" });
        }

        // Clear OTP after successful login
        user.otp = null;
        user.otpExpiry = null;
        await user.save();

        res.json({ message: "Login successful!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "OTP verification failed" });
    }
});
/* ---------------- TASKS ROUTES ---------------- */

// 1. Create a new help request
app.post("/api/tasks", async (req, res) => {
    const { title, description, reward, requesterPhone, location } = req.body;
    try {
        const newTask = new Task({ title, description, reward, requesterPhone, location });
        await newTask.save();
        res.status(201).json({ message: "Task posted successfully!" });
    } catch (err) {
        res.status(500).json({ message: "Failed to post task" });
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
        if (task.requesterPhone === helperPhone) {
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
        const myRequests = await Task.find({ requesterPhone: phone }).sort({ createdAt: -1 });
        
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
    try {
        const tasks = await Task.find({
            location: {
                $near: {
                    $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
                    $maxDistance: radius * 1000 // Convert km to meters
                }
            },
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