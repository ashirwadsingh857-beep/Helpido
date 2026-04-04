const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const Message = require("./models/Message.js");
const emailService = require("./services/emailService.js");

// --- NEW: WEB PUSH SETUP ---
const webpush = require("web-push");
const admin = require("firebase-admin");

// --- NEW: FIREBASE ADMIN SETUP ---
let firebaseServiceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        firebaseServiceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (err) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT env var:", err);
    }
}




if (!firebaseServiceAccount) {
    try {
        firebaseServiceAccount = require("./helpido-1610f-firebase-adminsdk-fbsvc-d0e05ccb04.json");
    } catch (err) {
        console.warn("⚠️ Firebase service account JSON not found. Pushes might fail if env var is also missing.");
    }
}

if (firebaseServiceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(firebaseServiceAccount)
    });
} else {
    console.error("❌ Firebase Admin could not be initialized: No credentials found.");
}

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

// --- NEW: RATE LIMITING FOR PING ROUTE ---
const rateLimit = require("express-rate-limit");

const pingLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 5, // Limit each IP to 5 pings per minute
    message: "Too many pings, please slow down."
});


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

    socket.on('joinChat', (data) => {
        // data can be { taskId, viewerPhone } or just a taskId string (legacy)
        const taskId = typeof data === 'string' ? data : data.taskId;
        const viewerPhone = typeof data === 'object' ? data.viewerPhone : null;
        socket.join(taskId);
        // Auto-mark seen when user opens the chat
        if (viewerPhone && taskId) {
            socket.emit('triggerMarkSeen', { taskId, viewerPhone });
        }
    });

    // 2. Save message, update active chat, and send private notification
    socket.on('sendMessage', async (data) => {
        try {
            const newMsg = new Message({
                taskId: data.taskId,
                senderPhone: data.senderPhone,
                text: data.text,
                seenBy: []
            });
            await newMsg.save();

            // Updates the screen for anyone actively looking at the chat
            io.to(data.taskId).emit('receiveMessage', newMsg);

            // Sends a private push notification ONLY to the person receiving the text
            // Sends an IN-APP pop-up if they have the app open
            if (data.targetPhone) {
                io.to(data.targetPhone).emit('notifyMessage', newMsg);

                // --- NEW: FIRE NATIVE ANDROID/IOS PUSH NOTIFICATION ---
                try {
                    const targetUser = await User.findOne({ phone: data.targetPhone });
                    // Check if they have a subscription OR an FCM token AND haven't muted chat messages
                    if (targetUser && targetUser.notifyChatMessages !== false) {
                        const senderUser = await User.findOne({ phone: data.senderPhone });
                        const senderName = senderUser ? senderUser.name.split(' ')[0] : 'Someone';

                        const payloadData = {
                            title: `New message from ${senderName}`,
                            body: data.text,
                            type: 'chat',
                            taskId: data.taskId,
                            senderPhone: data.senderPhone
                        };

                        // 1. Send via Web Push if subscription exists
                        if (targetUser.pushSubscription) {
                            const payload = JSON.stringify({
                                title: payloadData.title,
                                desc: payloadData.body,
                                type: payloadData.type,
                                taskId: payloadData.taskId,
                                senderPhone: payloadData.senderPhone
                            });
                            await webpush.sendNotification(targetUser.pushSubscription, payload);
                        }

                        // 2. Send via FCM if token exists
                        if (targetUser.fcmToken) {
                            const message = {
                                data: {
                                    title: payloadData.title || '',
                                    body: payloadData.body || '',
                                    type: payloadData.type,
                                    taskId: payloadData.taskId,
                                    senderPhone: payloadData.senderPhone,
                                    click_action: 'FLUTTER_NOTIFICATION_CLICK'
                                },
                                token: targetUser.fcmToken,
                            };
                            await admin.messaging().send(message);
                        }
                    }
                } catch (pushErr) {
                    console.error("Native push failed:", pushErr);
                }
            }
        } catch (err) { console.error("Message save error", err); }
    });

    // --- MARK SEEN ---
    socket.on('markSeen', async ({ taskId, viewerPhone }) => {
        try {
            // Add viewerPhone to seenBy on all messages they didn't send
            await Message.updateMany(
                { taskId, senderPhone: { $ne: viewerPhone }, seenBy: { $ne: viewerPhone } },
                { $push: { seenBy: viewerPhone } }
            );
            // Tell the whole chat room (sender sees their ticks go blue)
            io.to(taskId).emit('messagesSeen', { taskId, seenBy: viewerPhone });
        } catch (err) { console.error('markSeen error:', err); }
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
app.post('/api/signup', async (req, res) => {
    const { phone, name, address, email } = req.body;
    try {
        const existingUser = await User.findOne({ phone });

        // If user exists and already has a VALID email, block re-registration
        if (existingUser && existingUser.email && existingUser.email.includes('@')) {
            console.warn(`Signup block: User ${phone} already has a valid email: ${existingUser.email}`);
            return res.status(400).json({ message: "Phone number is already registered with an email!" });
        }

        const existingEmail = await User.findOne({ email });
        if (existingEmail && (!existingUser || existingEmail._id.toString() !== existingUser._id.toString())) {
            return res.status(400).json({ message: "This email is already in use by another account!" });
        }

        if (existingUser) {
            console.log(`Updating existing user ${phone} with new email: ${email}`);
            // Update existing user record (Preserves history, ratings, etc.)
            existingUser.name = name || existingUser.name;
            existingUser.address = address || existingUser.address;
            existingUser.email = email;
            await existingUser.save();
            return res.status(200).json({ message: "Email added successfully! You can now login." });
        }

        // Standard new user creation
        const newUser = new User({ phone, name, address, email });
        await newUser.save();
        res.status(201).json({ message: "Account created! You can now login." });
    } catch (err) {
        res.status(400).json({ message: `DB Error: ${err.message}` });
    }
});

app.get('/api/chat/:taskId', async (req, res) => {
    try {
        const messages = await Message.find({ taskId: req.params.taskId }).sort({ createdAt: 1 });
        res.json(messages);
    } catch (err) { res.status(500).json({ message: "Error fetching chat" }); }
});

// --- NEW ROUTE: Send Chat Message via REST (for headless flutter background actions) ---
app.post('/api/chat/send', async (req, res) => {
    const data = req.body;
    try {
        const newMsg = new Message({
            taskId: data.taskId,
            senderPhone: data.senderPhone,
            text: data.text,
            seenBy: []
        });
        await newMsg.save();

        // If targetPhone wasn't sent by the headless background worker, determine it from the task
        if (!data.targetPhone && data.taskId) {
            const task = await Task.findById(data.taskId);
            if (task) {
                if (data.senderPhone === task.helperPhone) {
                    data.targetPhone = task.postedBy;
                } else if (data.senderPhone === task.postedBy) {
                    data.targetPhone = task.helperPhone;
                }
            }
        }

        io.to(data.taskId).emit('receiveMessage', newMsg);

        if (data.targetPhone) {
            io.to(data.targetPhone).emit('notifyMessage', newMsg);
            try {
                const targetUser = await User.findOne({ phone: data.targetPhone });
                if (targetUser && targetUser.notifyChatMessages !== false) {
                    const senderUser = await User.findOne({ phone: data.senderPhone });
                    const senderName = senderUser ? senderUser.name.split(' ')[0] : 'Someone';

                    const payloadData = {
                        title: `New message from ${senderName}`,
                        body: data.text,
                        type: 'chat',
                        taskId: data.taskId,
                        senderPhone: data.senderPhone
                    };

                    if (targetUser.pushSubscription) {
                        const payload = JSON.stringify({
                            title: payloadData.title,
                            desc: payloadData.body,
                            type: payloadData.type,
                            taskId: payloadData.taskId,
                            senderPhone: payloadData.senderPhone
                        });
                        await webpush.sendNotification(targetUser.pushSubscription, payload);
                    }

                    if (targetUser.fcmToken) {
                        const message = {
                            data: {
                                title: payloadData.title || '',
                                body: payloadData.body || '',
                                type: payloadData.type,
                                taskId: payloadData.taskId,
                                senderPhone: payloadData.senderPhone,
                                click_action: 'FLUTTER_NOTIFICATION_CLICK'
                            },
                            token: targetUser.fcmToken,
                        };
                        await admin.messaging().send(message);
                    }
                }
            } catch (pushErr) {
                console.error("Native push failed:", pushErr);
            }
        }
        res.status(201).json({ message: "Message sent", data: newMsg });
    } catch (err) {
        console.error("REST Message save error", err);
        res.status(500).json({ message: "Error saving message" });
    }
});

app.use(express.static(path.join(__dirname, '../frontend')));

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("MongoDB Connected");
        try { await mongoose.connection.collection('users').dropIndex('email_1'); } catch (e) { }
    })
    .catch((err) => console.error("Mongo Error:", err));


// --- NEW ROUTE: Save Android/iOS Push Subscription or FCM Token ---
app.post('/api/subscribe', async (req, res) => {
    const { phone, subscription, fcmToken } = req.body;
    try {
        const updateData = {};
        if (subscription) updateData.pushSubscription = subscription;
        if (fcmToken) updateData.fcmToken = fcmToken;

        await User.findOneAndUpdate(
            { phone: phone },
            { $set: updateData }
        );
        res.status(201).json({ message: "Device registered for push notifications!" });
    } catch (err) {
        console.error("Subscription Error:", err);
        res.status(500).json({ error: "Failed to save push subscription." });
    }
});

app.post('/api/login/step1', async (req, res) => {
    console.log("--- Login Step 1 Request Received ---");
    const { phone } = req.body;
    console.log(`Phone: ${phone}`);
    try {
        const user = await User.findOne({ phone });
        if (!user) return res.status(404).json({ message: "User not found! Please sign up." });

        if (!user.email) {
            console.error(`User ${phone} has no email registered.`);
            return res.status(400).json({ message: "No email linked to this account. Please re-register or contact support." });
        }

        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        await User.updateOne({ phone }, { $set: { otp } });

        // Send OTP via Email in the background (Don't await it to avoid blocking UI)
        console.log(`Preparing to send OTP to ${user.email}...`);
        emailService.sendOTP(user.email, otp)
            .then(() => console.log(`Background Success: OTP sent to ${user.email}`))
            .catch((emailErr) => console.error("Background Email Service Error:", emailErr));

        res.json({
            message: "OTP sent to your registered email address.",
            otp,
            email: user.email
        });
    } catch (err) {
        console.error("Login Step 1 Error:", err);
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
app.post('/api/users/notifications', async (req, res) => {
    const { phone, type, value } = req.body;
    try {
        if (!phone) return res.status(400).json({ message: "Phone number missing" });

        // Force the value into a strict boolean so Mongoose saves it correctly
        const isEnabled = (value === true || value === 'true');

        const updateField = {};
        updateField[type] = isEnabled;

        const result = await User.updateOne({ phone: phone }, { $set: updateField });

        if (result.modifiedCount > 0 || result.matchedCount > 0) {
            res.json({ message: "Preferences locked in" });
        } else {
            res.status(404).json({ message: "User not found in database" });
        }
    } catch (err) {
        console.error("Notif Update Error:", err);
        res.status(500).json({ message: "Error updating preferences" });
    }
});

// --- NEW ROUTE: Dismiss a Task (Server-side Persistence) ---
app.post('/api/users/dismiss', async (req, res) => {
    const { phone, taskId } = req.body;
    try {
        await User.updateOne(
            { phone },
            { $addToSet: { dismissedTasks: taskId } } // Avoid duplicates
        );
        res.json({ message: "Task dismissed successfully" });
    } catch (err) {
        res.status(500).json({ message: "Error dismissing task" });
    }
});

// --- NEW ROUTE: Restore a Dismissed Task ---
app.post('/api/users/restore', async (req, res) => {
    const { phone, taskId } = req.body;
    try {
        await User.updateOne(
            { phone },
            { $pull: { dismissedTasks: taskId } }
        );
        res.json({ message: "Task restored successfully" });
    } catch (err) {
        res.status(500).json({ message: "Error restoring task" });
    }
});// --- NEW ROUTE: Update User's Real-Time Location ---
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
    const { title, description, postedBy, reward, lat, lng, imageData, taskType, destination } = req.body;

    try {
        const newTask = new Task({
            title,
            description,
            postedBy,
            reward,
            taskType: taskType || 'help',
            destination: destination || null,
            imageData: imageData || null,
            location: {
                type: 'Point',
                // CRITICAL: MongoDB requires [Longitude, Latitude] order
                coordinates: [parseFloat(lng || 0), parseFloat(lat || 0)]
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

            const notificationRadius = 5000;

            const subscribedUsers = await User.find({
                phone: { $ne: postedBy },
                $or: [{ pushSubscription: { $ne: null } }, { fcmToken: { $ne: null } }],
                notifyNewTasks: { $ne: false },
                availability: { $ne: 'busy' },
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

            let payloadData = {
                title: `New Task Near You 📍`,
                body: `${posterName} needs help: "${title}" for ₹${reward}`,
                type: 'task',
                taskId: newTask._id.toString()
            };

            if (taskType === 'ride') {
                payloadData = {
                    title: `New Ride Request 🚗`,
                    body: `${posterName} needs a lift to ${destination?.name || 'Destination'}: "${title}"`,
                    type: 'ride',
                    taskId: newTask._id.toString()
                };
            }

            const pushPromises = subscribedUsers.flatMap(user => {
                const promises = [];
                if (user.pushSubscription) {
                    const payload = JSON.stringify({
                        title: payloadData.title,
                        desc: payloadData.body,
                        type: payloadData.type,
                        taskId: payloadData.taskId
                    });
                    promises.push(webpush.sendNotification(user.pushSubscription, payload).catch(() => { }));
                }
                if (user.fcmToken) {
                    const message = {
                        data: {
                            title: payloadData.title || '',
                            body: payloadData.body || '',
                            type: payloadData.type,
                            taskId: payloadData.taskId,
                            click_action: 'FLUTTER_NOTIFICATION_CLICK'
                        },
                        token: user.fcmToken,
                    };
                    promises.push(admin.messaging().send(message).catch(() => { }));
                }
                return promises;
            });

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

        // --- STRICT HYPERLOCAL BACKEND LOCK ---
        // If the frontend fails to send coordinates, reject the request entirely 
        // to prevent distant tasks from leaking into the feed.
        if (!lat || !lng || lat === 'null' || lng === 'null') {
            return res.json([]);
        }

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

        // --- NEW: SERVER-SIDE DISMISSAL FILTERING ---
        const phone = req.query.phone;
        if (phone) {
            const user = await User.findOne({ phone }, 'dismissedTasks');
            if (user && user.dismissedTasks && user.dismissedTasks.length > 0) {
                query._id = { $nin: user.dismissedTasks };
            }
        }

        // Fetch using the geospatial index (Automatically sorts closest to farthest)
        const tasks = await Task.find(query).lean();

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

            if (posterUser) {
                const payloadData = {
                    title: 'Task Accepted! 🤝',
                    body: `${helperName} accepted your task: "${task.title}". Tap to chat!`,
                    type: 'chat',
                    taskId: task._id.toString(),
                    senderPhone: helperPhone
                };

                if (posterUser.pushSubscription) {
                    const payload = JSON.stringify({
                        title: payloadData.title,
                        desc: payloadData.body,
                        type: payloadData.type,
                        taskId: payloadData.taskId,
                        senderPhone: payloadData.senderPhone
                    });
                    await webpush.sendNotification(posterUser.pushSubscription, payload).catch(() => { });
                }

                if (posterUser.fcmToken) {
                    const message = {
                        data: {
                            title: payloadData.title || '',
                            body: payloadData.body || '',
                            type: payloadData.type,
                            taskId: payloadData.taskId,
                            senderPhone: payloadData.senderPhone,
                            click_action: 'FLUTTER_NOTIFICATION_CLICK'
                        },
                        token: posterUser.fcmToken,
                    };
                    await admin.messaging().send(message).catch(() => { });
                }
            }
        } catch (pushErr) {
            console.error("Task accept push failed:", pushErr);
        }

        res.json({ message: "Task accepted!" });
    } catch (err) { res.status(500).json({ message: "Error accepting task" }); }
});

// --- HELPER SIGNALS TASK IS DONE (Step 1 of 2-sided completion) ---
app.post("/api/tasks/helper-done", async (req, res) => {
    const { taskId, helperPhone } = req.body;
    try {
        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ message: "Task not found" });
        if (task.helperPhone !== helperPhone) return res.status(403).json({ message: "Not authorised" });
        if (task.status !== 'accepted') return res.status(400).json({ message: "Task not in accepted state" });

        task.helperMarkedDone = true;
        await task.save();

        // Fetch names for notification copy
        const helperUser = await User.findOne({ phone: helperPhone });
        const helperName = helperUser ? helperUser.name.split(' ')[0] : 'Your helper';

        // 1. Real-time socket push to poster's personal room
        io.to(task.postedBy).emit('helperMarkedDone', {
            taskId,
            taskTitle: task.title,
            helperName
        });

        // 2. Web push and Native push to poster
        try {
            const posterUser = await User.findOne({ phone: task.postedBy });
            if (posterUser) {
                const payloadData = {
                    title: `✅ ${helperName} says they're done!`,
                    body: `"${task.title}" is ready for your review — confirm & rate to close it out.`,
                    type: 'task',
                    taskId: task._id.toString()
                };

                if (posterUser.pushSubscription) {
                    const payload = JSON.stringify({
                        title: payloadData.title,
                        desc: payloadData.body,
                        type: payloadData.type,
                        taskId: payloadData.taskId
                    });
                    await webpush.sendNotification(posterUser.pushSubscription, payload).catch(() => { });
                }

                if (posterUser.fcmToken) {
                    const message = {
                        data: {
                            title: payloadData.title || '',
                            body: payloadData.body || '',
                            type: payloadData.type,
                            taskId: payloadData.taskId,
                            click_action: 'FLUTTER_NOTIFICATION_CLICK'
                        },
                        token: posterUser.fcmToken,
                    };
                    await admin.messaging().send(message).catch(() => { });
                }
            }
        } catch (pushErr) {
            console.error("helper-done push failed:", pushErr);
        }

        res.json({ message: "Helper marked done, poster notified." });
    } catch (err) {
        console.error("helper-done error:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// --- MARK TASK DONE + SUBMIT RATING ---
app.post("/api/tasks/complete", async (req, res) => {
    const { taskId, ratedBy, rating } = req.body;

    // Validate rating range
    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    try {
        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ message: "Task not found" });
        if (task.postedBy !== ratedBy) return res.status(403).json({ message: "Only the poster can mark this done" });

        // FIX: Allow completion if it is 'accepted' OR already 'completed' (avoids repeat-click errors)
        if (task.status !== 'accepted' && task.status !== 'completed') {
            return res.status(400).json({ message: "Task is not in a valid state for completion" });
        }

        const helperPhone = task.helperPhone;

        // Mark task as completed
        task.status = 'completed';
        task.completedAt = new Date(); // Triggers 10-minute TTL auto-delete
        await task.save();

        // 3. Set expiration for messages as well
        const tenMinsFromNow = new Date(Date.now() + 10 * 60 * 1000);
        await Message.updateMany({ taskId }, { $set: { expiresAt: tenMinsFromNow } });

        // Save rating to helper's User doc (prevent duplicate rating on same task)
        const helper = await User.findOne({ phone: helperPhone });
        if (helper) {
            const alreadyRated = helper.ratings && helper.ratings.some(r => r.taskId === taskId);
            if (!alreadyRated) {
                helper.ratings = helper.ratings || [];
                helper.ratings.push({ taskId, rating: Number(rating), ratedBy });
                // Recalculate average
                const total = helper.ratings.reduce((sum, r) => sum + r.rating, 0);
                helper.averageRating = Math.round((total / helper.ratings.length) * 10) / 10;
                await helper.save();
            }
        }

        // 1. Notify helper via Socket.io (in-app, instant)
        const posterUserForNotif = await User.findOne({ phone: ratedBy });
        const posterFirstName = posterUserForNotif ? posterUserForNotif.name.split(' ')[0] : 'The poster';
        const starEmoji = '⭐'.repeat(Number(rating));

        io.to(helperPhone).emit('taskCompleted', {
            taskId,
            taskTitle: task.title,
            rating: Number(rating),
            posterName: posterFirstName,
            newAverage: helper ? helper.averageRating : null
        });

        // 1b. Immediately remove the task card from the POSTER's screen only
        io.to(ratedBy).emit('posterTaskDone', { taskId });

        // 2. Send web and native push to helper if subscribed
        try {
            if (helper) {
                const payloadData = {
                    title: `${starEmoji} ${posterFirstName} confirmed you're done!`,
                    body: `"${task.title}" is officially closed. You earned ${rating} stars — great work!`,
                    type: 'task',
                    taskId: task._id.toString()
                };

                if (helper.pushSubscription) {
                    const pushPayload = JSON.stringify({
                        title: payloadData.title,
                        desc: payloadData.body,
                        type: payloadData.type,
                        taskId: payloadData.taskId
                    });
                    await webpush.sendNotification(helper.pushSubscription, pushPayload).catch(() => { });
                }

                if (helper.fcmToken) {
                    const message = {
                        data: {
                            title: payloadData.title || '',
                            body: payloadData.body || '',
                            type: payloadData.type,
                            taskId: payloadData.taskId,
                            click_action: 'FLUTTER_NOTIFICATION_CLICK'
                        },
                        token: helper.fcmToken,
                    };
                    await admin.messaging().send(message).catch(() => { });
                }
            }
        } catch (pushErr) {
            console.error("Completion push failed:", pushErr);
        }

        // 4. Also notify the helper's client to remove the card after 10 mins
        setTimeout(() => {
            io.to(helperPhone).emit('helperTaskRemoved', { taskId });
        }, 10 * 60 * 1000);

        res.json({ message: "Task completed and rating saved!", averageRating: helper ? helper.averageRating : null });
    } catch (err) {
        console.error("Complete task error:", err);
        res.status(500).json({ message: "Server error completing task" });
    }
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
        await Message.deleteMany({ taskId: taskId });

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

// Apply the limiter specifically to this route
app.get('/ping', pingLimiter, (req, res) => {
    res.status(200).send('Helpido is awake!');
});