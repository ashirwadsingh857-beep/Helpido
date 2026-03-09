const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);

const sendOTP = async (email, otp) => {
    try {
        console.log(`Sending OTP via Resend to ${email}...`);

        const { data, error } = await resend.emails.send({
            from: 'Helpido <onboarding@resend.dev>',
            to: email,
            subject: 'Your Helpido Verification Code',
            html: `
                <div style="background-color: #f4f7f6; padding: 40px 10px; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; text-align: center;">
                    <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 15px 35px rgba(0,0,0,0.05); border: 1px solid #e0e0e0;">
                        
                        <!-- Artistic Header -->
                        <div style="background: linear-gradient(135deg, #FF5722 0%, #FF9800 100%); padding: 40px 20px; position: relative;">
                            <img src="https://helpido.onrender.com/asset/512.png" alt="Helpido Logo" style="width: 80px; height: 80px; border-radius: 18px; box-shadow: 0 8px 20px rgba(0,0,0,0.15); margin-bottom: 15px; border: 3px solid #ffffff;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">Helpido</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0; font-size: 14px; font-weight: 500;">Real-time help, exactly where you stand.</p>
                        </div>

                        <!-- Content Body -->
                        <div style="padding: 45px 35px; color: #2d3436;">
                            <h2 style="margin: 0 0 15px; font-size: 22px; font-weight: 700; color: #1e272e;">Verification Code</h2>
                            <p style="font-size: 16px; color: #636e72; line-height: 1.6; margin-bottom: 30px;">
                                Someone is trying to log in to your Helpido account. Use the unique code below to complete the verification.
                            </p>

                            <!-- Unique OTP Display -->
                            <div style="background: #fff8f6; border: 2px solid #ffede8; border-radius: 16px; padding: 25px; display: inline-block;">
                                <div style="font-size: 42px; font-weight: 900; color: #FF5722; letter-spacing: 12px; margin-left: 12px;">${otp}</div>
                            </div>

                            <p style="margin-top: 35px; font-size: 13px; color: #b2bec3; line-height: 1.5;">
                                This code is valid for 10 minutes.<br>
                                If you didn't request this, you can safely ignore this email.
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
