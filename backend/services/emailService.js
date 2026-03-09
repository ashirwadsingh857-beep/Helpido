require('dotenv').config();

const sendOTP = async (email, otp) => {
    try {
        console.log(`Sending OTP via Brevo to ${email}...`);

        const BREVO_API_KEY = process.env.BREVO_API_KEY?.trim();
        const SENDER_EMAIL = process.env.SENDER_EMAIL?.trim() || 'onboarding@resend.dev';
        const SENDER_NAME = 'Helpido';

        if (!BREVO_API_KEY) {
            throw new Error('BREVO_API_KEY is missing in environment variables');
        }

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': BREVO_API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: {
                    name: SENDER_NAME,
                    email: SENDER_EMAIL
                },
                to: [
                    {
                        email: email
                    }
                ],
                subject: 'Your Helpido Verification Code',
                htmlContent: `
                <div style="background-color: #f4f7f6; padding: 40px 10px; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; text-align: center;">
                    <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.08); border: 1px solid #e1e8e7;">
                        
                        <!-- Artistic Minimalist Header -->
                        <div style="background: linear-gradient(135deg, #FF5722 0%, #FF9800 100%); padding: 60px 20px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 38px; font-weight: 800; letter-spacing: -1.5px;">Helpido</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 15px; font-weight: 500; letter-spacing: 0.5px;">Real-time help, exactly where you stand.</p>
                        </div>

                        <!-- Content Body -->
                        <div style="padding: 50px 40px; color: #2d3436;">
                            <div style="text-transform: uppercase; color: #FF5722; font-size: 13px; font-weight: 700; letter-spacing: 2px; margin-bottom: 10px;">Security Core</div>
                            <h2 style="margin: 0 0 20px; font-size: 24px; font-weight: 800; color: #1e272e;">Verification Code</h2>
                            <p style="font-size: 16px; color: #636e72; line-height: 1.7; margin-bottom: 35px;">
                                Someone is trying to sign in to your Helpido account. Please use the secure authorization code below.
                            </p>

                            <!-- Unique OTP Display -->
                            <div style="background: #fff9f7; border: 2px solid #ffede8; border-radius: 20px; padding: 30px; display: inline-block; min-width: 200px;">
                                <div style="font-size: 48px; font-weight: 900; color: #FF5722; letter-spacing: 14px; margin-left: 14px;">${otp}</div>
                            </div>

                            <p style="margin-top: 40px; font-size: 13px; color: #bdc3c7; line-height: 1.6;">
                                This secure code is valid for 10 minutes.<br>
                                Didn't request this? Please ignore this message.
                            </p>
                        </div>

                        <!-- Footer -->
                        <div style="background: #fafafa; padding: 25px; border-top: 1px solid #f0f0f0;">
                            <p style="margin: 0; font-size: 12px; color: #bdc3c7;">
                                &copy; 2026 Helpido App. All rights reserved.<br>
                                Focused on privacy and speed.
                            </p>
                        </div>
                    </div>
                </div>
            `
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Brevo API Error:', data);
            throw new Error(data.message || 'Failed to send email via Brevo');
        }

        console.log(`OTP successfully sent via Brevo: ${data.messageId}`);
        return true;
    } catch (error) {
        console.error('Fatal Email Error (Brevo):', error.message);
        throw error;
    }
};

module.exports = { sendOTP };
