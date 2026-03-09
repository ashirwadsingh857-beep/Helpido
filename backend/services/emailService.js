const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);

const sendOTP = async (email, otp) => {
    try {
        console.log(`Sending OTP via Resend to ${email}...`);

        const { data, error } = await resend.emails.send({
            from: 'Helpido <onboarding@resend.dev>', // Use onboarding@resend.dev for free tier/testing
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
        });

        if (error) {
            console.error('Resend Error:', error);
            throw error;
        }

        console.log(`OTP successfully sent via Resend: ${data.id}`);
        return true;
    } catch (error) {
        console.error('Fatal Email Error (Resend):', error.message);
        throw error;
    }
};

module.exports = { sendOTP };
