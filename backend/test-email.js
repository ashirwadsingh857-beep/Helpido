const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const testMail = async () => {
    console.log(`Attempting to send test email from: ${process.env.EMAIL_USER}`);
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER, // Send to yourself
            subject: 'Helpido Email Test',
            text: 'If you see this, your Gmail App Password is working correctly!'
        });
        console.log('✅ Success! Your email configuration is correct.');
    } catch (error) {
        console.error('❌ Error sending test email:');
        console.error(error.message);
        if (error.message.includes('Invalid login')) {
            console.log('\nTip: Double-check your App Password. It should be 16 characters long and have no spaces.');
        }
    }
};

testMail();
