const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const Message = require("./models/Message.js");

// --- NEW: WEB PUSH SETUP ---
const webpush = require("web-push");

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    // Failsafe: Automatically add 'mailto:' if it's missing from your environment variables
    let vapidEmail = process.env.VAPID_EMAIL || 'mailto:test@test.com';
    if (!vapidEmail.startsWith('mailto:') && !vapidEmail.startsWith('http')) {
        vapidEmail = 'mailto:' + vapidEmail;
    }

    webpush.setVapidDetails(
        vapidEmail,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
} else {
    console.warn("⚠️ VAPID keys are missing! Push notifications will not work.");
}
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
            // Sends an IN-APP pop-up if they have the app open
            if (data.targetPhone) {
                io.to(data.targetPhone).emit('notifyMessage', newMsg);

                // --- NEW: FIRE NATIVE ANDROID PUSH NOTIFICATION ---
                try {
                    const targetUser = await User.findOne({ phone: data.targetPhone });
                    // Check if they have a subscription AND haven't muted chat messages
                    if (targetUser && targetUser.pushSubscription && targetUser.notifyChatMessages !== false) {
                        const senderUser = await User.findOne({ phone: data.senderPhone });
                        const senderName = senderUser ? senderUser.name.split(' ')[0] : 'Someone';

                        // Create the text that will show on the lock screen
                        const payload = JSON.stringify({
                            title: `New message from ${senderName}`,
                            desc: data.text,
                            // NEW: Hidden data to tell the app exactly which chat to open
                            type: 'chat',
                            taskId: data.taskId,
                            senderPhone: data.senderPhone
                        });

                        // Send it to Google's push servers!
                        await webpush.sendNotification(targetUser.pushSubscription, payload);
                    }
                } catch (pushErr) {
                    console.error("Native push failed (maybe user revoked permission):", pushErr.statusCode);
                }
            }
        } catch (err) { console.error("Message save error", err); }
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
    } catch (err) { res.status(500).json({ message: "Error fetching chat" }); }
});

app.use(express.static(path.join(__dirname, '../frontend')));

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("MongoDB Connected");
        try { await mongoose.connection.collection('users').dropIndex('email_1'); } catch (e) { }
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

// --- NEW ROUTE: Save Android Push Subscription ---
app.post('/api/subscribe', async (req, res) => {
    const { phone, subscription } = req.body;
    try {
        await User.findOneAndUpdate(
            { phone: phone },
            { $set: { pushSubscription: subscription } }
        );
        res.status(201).json({ message: "Device registered for push notifications!" });
    } catch (err) {
        console.error("Subscription Error:", err);
        res.status(500).json({ error: "Failed to save push subscription." });
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

// --- NEW ROUTE: Update Notification Preferences ---
// --- NEW ROUTE: Update User's Real-Time Location ---
app.post('/api/users/location', async (req, res) => {
    const { phone, lat, lng } = req.body;
    try {
        await User.updateOne(
            { phone },
            { 
                $set: { 
                    location: {
                        type: 'Point',
                        coordinates: [parseFloat(lng), parseFloat(lat)] // [Longitude, Latitude]
                    }
                } 
            }
        );
        res.json({ message: "Location synced" });
    } catch (err) {
        res.status(500).json({ message: "Error updating location" });
    }
});
/* ---------------- TASK ROUTES ---------------- */
app.post('/api/tasks', async (req, res) => {
    // Extract the new lat and lng from the request
    const { title, description, postedBy, reward, lat, lng } = req.body;
    
    try {
        // --- NEW: ASSEMBLE GEOJSON LOCATION ---
        const newTask = new Task({ 
            title, 
            description, 
            postedBy, 
            reward,
            location: {
                type: 'Point',
                // CRITICAL: MongoDB requires [Longitude, Latitude] order
                coordinates: [parseFloat(lng), parseFloat(lat)] 
            }
        });
        
        await newTask.save();
        
        // ... (Keep your existing io.emit and web-push notification logic below this line) ...
        io.emit('refreshFeed'); // Broadcast new task
        io.emit('newTask', newTask);

        // --- NEW: SEND PUSH NOTIFICATION TO ALL OTHER SUBSCRIBED USERS ---
        try {
            const posterUser = await User.findOne({ phone: postedBy });
            const posterName = posterUser ? posterUser.name.split(' ')[0] : 'Someone';

            // Find all users EXCEPT the poster who have a push subscription AND haven't muted New Tasks
           // --- NEW: GEOSPATIAL PUSH NOTIFICATIONS ---
            // Draw a 5km (5000 meters) circle around the new task
            const notificationRadius = 5000; 

            // Find all users EXCEPT the poster who have notifications ON, 
            // AND are physically standing within 5km of the task!
            const subscribedUsers = await User.find({ 
                phone: { $ne: postedBy }, 
                pushSubscription: { $ne: null },
                notifyNewTasks: { $ne: false },
                location: {
                    $near: {
                        $geometry: {
                            type: "Point",
                            coordinates: [parseFloat(lng), parseFloat(lat)]
                        },
                        $maxDistance: notificationRadius
                    }
                }
            });

            const payload = JSON.stringify({
                title: `New Task Near You 📍`,
                desc: `${posterName} needs help: "${title}" for ₹${reward}`
            });

            // Fire off notifications to everyone in the background
            const pushPromises = subscribedUsers.map(user => {
                return webpush.sendNotification(user.pushSubscription, payload).catch(e => {
                    // Fail silently for individual expired subscriptions
                });
            });

            // We don't use 'await' here so the task posts instantly without waiting for Google's servers
            Promise.all(pushPromises);

        } catch (pushErr) {
            console.error("New task broadcast failed:", pushErr);
        }

        res.status(201).json(newTask);
    } catch (err) { res.status(500).json({ message: "Failed to post task" }); }
});
app.get("/api/tasks", async (req, res) => {
    try {
        const { lat, lng, radius } = req.query;
        let query = { status: 'open' };

        // --- NEW: GEOSPATIAL MATH ---
        // If the phone sent its GPS location, apply the Radius Filter
        if (lat && lng && radius && lat !== 'null' && lng !== 'null') {
            const radiusInMeters = parseFloat(radius) * 1000;
            query.location = {
                $near: {
                    $geometry: {
                        type: "Point",
                        // CRITICAL: MongoDB always requires [Longitude, Latitude] order!
                        coordinates: [parseFloat(lng), parseFloat(lat)] 
                    },
                    $maxDistance: radiusInMeters
                }
            };
        }

        // If using $near, MongoDB automatically sorts by closest distance. 
        // Otherwise, we fallback to sorting by newest first.
        let tasks;
        if (query.location) {
            tasks = await Task.find(query).lean(); 
        } else {
            tasks = await Task.find(query).sort({ createdAt: -1 }).lean();
        }

        const phones = [...new Set(tasks.map(t => t.postedBy))];
        const users = await User.find({ phone: { $in: phones } }, 'phone availability');
        const userStatusMap = {};
        users.forEach(u => { userStatusMap[u.phone] = u.availability || 'free'; });

        const tasksWithStatus = tasks.map(task => ({
            ...task,
            posterStatus: userStatusMap[task.postedBy] || 'free'
        }));
        res.json(tasksWithStatus);
    } catch (err) { 
        console.error("Geospatial fetch error:", err);
        res.status(500).json({ message: "Failed to fetch tasks" }); 
    }
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

        // --- NEW: SEND PUSH NOTIFICATION TO POSTER ---
        try {
            const posterUser = await User.findOne({ phone: task.postedBy });
            const helperUser = await User.findOne({ phone: helperPhone });
            const helperName = helperUser ? helperUser.name.split(' ')[0] : 'Someone';

            if (posterUser && posterUser.pushSubscription) {
                const payload = JSON.stringify({
                    title: 'Task Accepted! 🤝',
                    desc: `${helperName} accepted your task: "${task.title}". Tap to chat!`
                });
                // Send it to Google's push servers!
                await webpush.sendNotification(posterUser.pushSubscription, payload);
            }
        } catch (pushErr) {
            console.error("Task accept push failed:", pushErr.statusCode);
        }

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