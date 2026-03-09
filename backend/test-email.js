const { Resend } = require('resend');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const resend = new Resend(process.env.RESEND_API_KEY);

const testMail = async () => {
    console.log(`Attempting to send test email via Resend...`);
    try {
        const { data, error } = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: 'ashirwadsingh857@gmail.com',
            subject: 'Helpido Artistic Test',
            html: `
                <div style="background-color: #f4f7f6; padding: 40px 10px; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; text-align: center;">
                    <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 15px 35px rgba(0,0,0,0.05); border: 1px solid #e0e0e0;">
                        <div style="background: linear-gradient(135deg, #FF5722 0%, #FF9800 100%); padding: 60px 20px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 38px; font-weight: 800; letter-spacing: -1.5px;">Helpido</h1>
                        </div>
                        <div style="padding: 40px 30px; text-align: center;">
                            <h2 style="color: #1e272e;">Artistic Email Test</h2>
                            <p style="color: #636e72;">Text-based logo test (No more massive image files!)</p>
                            <div style="font-size: 48px; font-weight: 900; color: #FF5722; letter-spacing: 12px;">1234</div>
                        </div>
                    </div>
                </div>
            `
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
