// Test script to check Task model
const mongoose = require('mongoose');
const Task = require('./models/Task.js');
require('dotenv').config();

async function test() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const testTask = new Task({
            title: "Test Task",
            description: "Testing",
            postedBy: "1234567890",
            lat: 18.7394,
            lng: 73.4312,
            reward: 50
        });

        console.log("Task object:", testTask);
        await testTask.save();
        console.log("Task saved successfully");

        await mongoose.disconnect();
    } catch (err) {
        console.error("Error:", err);
    }
}

test();