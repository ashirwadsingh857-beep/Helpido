const { Resend } = require('resend');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const resend = new Resend(process.env.RESEND_API_KEY);

const testMail = async () => {
    console.log(`Attempting to send test email via Resend...`);
    try {
        const { data, error } = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: 'ashirwadsingh857@gmail.com', // Sending to the user's email
            subject: 'Helpido Resend Test',
            text: 'If you see this, your Resend API Key is working correctly!'
        });

        if (error) {
            console.error('❌ Resend Error:', error);
        } else {
            console.log('✅ Success! Email sent with ID:', data.id);
        }
    } catch (error) {
        console.error('❌ Fatal Error:', error.message);
    }
};

testMail();
