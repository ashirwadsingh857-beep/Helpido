const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendOTP = async (email, otp) => {
    const mailOptions = {
        from: `"Helpido" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your Helpido Login OTP',
        html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
                <h2 style="color: #FF5722;">Helpido Verification</h2>
                <p>Hello,</p>
                <p>Your 4-digit verification code is:</p>
                <div style="font-size: 24px; font-weight: bold; color: #FF5722; padding: 10px 0;">${otp}</div>
                <p>This code will expire shortly. Do not share it with anyone.</p>
                <p>Best regards,<br>The Helpido Team</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`OTP sent to ${email}`);
        return true;
    } catch (error) {
        console.error('Email sending error:', error);
        throw error;
    }
};

module.exports = { sendOTP };
