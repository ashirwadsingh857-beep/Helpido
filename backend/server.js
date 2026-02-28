const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const Message = require("./models/Message.js");

// --- NEW: WEBSOCKET IMPORTS ---
const http = require("http");
const { Server } = require("socket.io");

const Task = require("./models/Task.js");
const User = require("./models/User.js");

const app = express();
app.use(express.json());
app.use(cors());

// --- WEBSOCKET SETUP ---
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// --- UPGRADED WEBSOCKET CHAT LOGIC ---
io.on('connection', (socket) => {
    console.log('A user connected to the live feed');

    // 1. User joins a personal room based on their phone number
    socket.on('registerPhone', (phone) => {
        socket.join(phone);
    });

    socket.on('joinChat', (taskId) => {
        socket.join(taskId);
    });

    // 2. Save message, update active chat, and send private notification
    socket.on('sendMessage', async (data) => {
        try {
            const newMsg = new Message({
                taskId: data.taskId,
                senderPhone: data.senderPhone,
                text: data.text
            });
            await newMsg.save();
            
            // Updates the screen for anyone actively looking at the chat
            io.to(data.taskId).emit('receiveMessage', newMsg); 
            
            // Sends a private push notification ONLY to the person receiving the text
            if (data.targetPhone) {
                io.to(data.targetPhone).emit('notifyMessage', newMsg);
            }
        } catch(err) { console.error("Message save error", err); }
    });

    socket.on('typing', (data) => {
        socket.to(data.taskId).emit('userTyping', data);
    });

    socket.on('stopTyping', (data) => {
        socket.to(data.taskId).emit('userStoppedTyping', data);
    });
});

// --- NEW API ROUTE: Get Chat History ---
// Add this right above your /* ---------------- AUTH ROUTES ---------------- */
app.get('/api/chat/:taskId', async (req, res) => {
    try {
        const messages = await Message.find({ taskId: req.params.taskId }).sort({ createdAt: 1 });
        res.json(messages);
    } catch(err) { res.status(500).json({ message: "Error fetching chat" }); }
});

app.use(express.static(path.join(__dirname, '../frontend')));

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("MongoDB Connected");
        try { await mongoose.connection.collection('users').dropIndex('email_1'); } catch (e) {}
    })
    .catch((err) => console.error("Mongo Error:", err));

/* ---------------- AUTH ROUTES ---------------- */
app.post('/api/signup', async (req, res) => {
    const { phone, name, address } = req.body;
    try {
        const existingUser = await User.findOne({ phone });
        if (existingUser) return res.status(400).json({ message: "Phone number is already registered!" });
        const newUser = new User({ phone, name, address });
        await newUser.save();
        res.status(201).json({ message: "Account created! You can now login." });
    } catch (err) {
        res.status(400).json({ message: `DB Error: ${err.message}` });
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
    } catch (err) { res.status(500).json({ message: "Server error" }); }
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
    } catch (err) { res.status(500).json({ message: "Verification error" }); }
});

/* ---------------- PROFILE & STATUS ROUTES ---------------- */
app.get('/api/users/:phone', async (req, res) => {
    try {
        const user = await User.findOne({ phone: req.params.phone }).select('-otp -otpExpiry');
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(user);
    } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post('/api/users/status', async (req, res) => {
    const { phone, availability } = req.body;
    try {
        await User.updateOne({ phone }, { $set: { availability } });
        io.emit('refreshFeed'); // Broadcast status change
        res.json({ message: "Status updated" });
    } catch (err) { res.status(500).json({ message: "Error updating status" }); }
});

/* ---------------- TASK ROUTES ---------------- */
app.post('/api/tasks', async (req, res) => {
    const { title, description, postedBy, reward } = req.body;
    try {
        const newTask = new Task({ title, description, postedBy, reward });
        await newTask.save();
        io.emit('refreshFeed'); // Broadcast new task
        io.emit('newTask', newTask);
        res.status(201).json(newTask);
    } catch (err) { res.status(500).json({ message: "Failed to post task" }); }
});

app.get("/api/tasks", async (req, res) => {
    try {
        const tasks = await Task.find({ status: 'open' }).sort({ createdAt: -1 }).lean();
        const phones = [...new Set(tasks.map(t => t.postedBy))];
        const users = await User.find({ phone: { $in: phones } }, 'phone availability');
        const userStatusMap = {};
        users.forEach(u => { userStatusMap[u.phone] = u.availability || 'free'; });

        const tasksWithStatus = tasks.map(task => ({
            ...task,
            posterStatus: userStatusMap[task.postedBy] || 'free'
        }));
        res.json(tasksWithStatus);
    } catch (err) { res.status(500).json({ message: "Failed to fetch tasks" }); }
});

app.post("/api/tasks/accept", async (req, res) => {
    const { taskId, helperPhone } = req.body;
    try {
        const task = await Task.findById(taskId);
        if (task.postedBy === helperPhone) return res.status(400).json({ message: "Cannot accept your own task!" });
        task.status = 'accepted'; 
        task.helperPhone = helperPhone; 
        await task.save();
        
        // Tell all other phones exactly WHICH task to animate off screen
        io.emit('taskRemoved', taskId); 
        res.json({ message: "Task accepted!" });
    } catch (err) { res.status(500).json({ message: "Error accepting task" }); }
});

app.get("/api/tasks/my-tasks", async (req, res) => {
    const phone = req.query.phone;
    try {
        const myRequests = await Task.find({ postedBy: phone }).sort({ createdAt: -1 });
        const myJobs = await Task.find({ helperPhone: phone }).sort({ createdAt: -1 });
        res.json({ myRequests, myJobs });
    } catch (err) { res.status(500).json({ message: "Error fetching tasks" }); }
});

app.delete('/api/tasks/:id', async (req, res) => {
    try {
        const task = await Task.findByIdAndDelete(req.params.id);
        if (!task) return res.status(404).json({ message: "Task not found" });

        // --- NEW: Shred all chat messages linked to this dead task ---
        await Message.deleteMany({ taskId: req.params.id });

        io.emit('taskRemoved', req.params.id);
        res.json({ message: "Task and associated chats wiped successfully" });
    } catch (err) {
        console.error("Delete error:", err);
        res.status(500).json({ message: "Error deleting task" });
    }
});

// --- DROP A TASK (Helper cancels) ---
// --- DROP / CANCEL A TASK ---
app.post('/api/tasks/cancel', async (req, res) => {
    try {
        const { taskId } = req.body;
        const task = await Task.findById(taskId);

        if (!task) return res.status(404).json({ message: 'Task not found' });

        // Reset the task to open and wipe the helper data
        task.status = 'open';
        task.helperPhone = null;
        task.isPrioritized = false; // Strip priority if it is dropped
        await task.save();

        // SECURITY: Instantly wipe the chat history tied to this task
        if (typeof Chat !== 'undefined') {
            await Chat.deleteMany({ taskId: taskId });
        }

        // Tell all active users to refresh their feeds so the task reappears
        io.emit('refreshFeed'); 

        res.json({ message: 'Task dropped, chat wiped, and returned to public feed.' });
    } catch (error) {
        console.error("Drop Error:", error);
        res.status(500).json({ message: 'Server error dropping task.' });
    }
});
app.post("/api/tasks/prioritize", async (req, res) => {
    const { taskId } = req.body;
    try {
        const task = await Task.findById(taskId);
        task.isPrioritized = !task.isPrioritized; 
        await task.save();
        io.emit('refreshFeed'); // Broadcast priority change
        res.json({ message: "Priority updated" });
    } catch (err) { res.status(500).json({ message: "Error updating priority" }); }
});

// --- IRONCLAD FRONTEND ROUTING ---
const frontendPath = path.join(__dirname, '../frontend');
app.get('/dashboard.html', (req, res) => { res.sendFile(path.join(frontendPath, 'dashboard.html')); });
app.get('/', (req, res) => { res.sendFile(path.join(frontendPath, 'index.html')); });
app.use((req, res) => { res.sendFile(path.join(frontendPath, 'index.html')); });

// NEW: Use `server.listen` instead of `app.listen` to activate WebSockets
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Live Server running on port ${PORT}`));

// --- MARK TASK AS DONE (Wipe from DB & Notify Helper) ---
// --- MARK TASK AS DONE (Wipe from DB & Notify Helper) ---
app.post('/api/tasks/complete', async (req, res) => {
    try {
        const { taskId, helperPhone } = req.body;
        
        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ message: "Task not found" });

        const taskTitle = task.title;

        // 1. Give the helper their +1 point!
        await User.findOneAndUpdate(
            { phone: helperPhone },
            { $inc: { helpsCount: 1 } },
            { new: true, setDefaultsOnInsert: true }
        );

        // 2. Completely wipe the task and its associated chats from the database
        await Task.findByIdAndDelete(taskId);
        await Message.deleteMany({ taskId: taskId });

        // 3. Tell ALL phones to instantly remove this card from their UI
        io.emit('taskRemoved', taskId);

        // 4. Send a direct, private Push Notification to the Helper's phone
        io.to(helperPhone).emit('taskCompletedNotification', {
            title: 'Task Completed! 🎉',
            desc: `The poster marked "${taskTitle}" as done. +1 Help Point!`
        });

        res.json({ message: "Task completely wiped and helper notified!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not complete task" });
    }
});