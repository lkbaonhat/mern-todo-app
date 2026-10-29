import userModel from "../models/userModel.js";
import { sendMail, resetPasswordUrl, escapeHtml } from "../services/mail.js"
import crypto from "crypto"
import bcrypt from "bcrypt"
import dotenv from "dotenv"
dotenv.config()

// Route to handle "forgot password" request
const forgotPassword = async (req, res, next) => {
    try {
    const { email } = req.body;
    
    // Check if email exists in the database
    const user = await userModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetToken = resetToken;
    await user.save();
    
    // Only report success after the SMTP server accepts the reset email.
    try {
        const resetUrl = resetPasswordUrl(resetToken);
        await sendMail({
            to: email,
            subject: "Reset Password",
            text: `Reset your password: ${resetUrl}`,
            html: `<h1>Reset Password</h1><p><a href="${escapeHtml(resetUrl)}">Reset your password</a></p>`
        });
    } catch {
        console.error("Password reset email could not be submitted");
        return res.status(503).json({ message: "Unable to send the reset email. Please try again later." });
    }
    
    res.status(200).json({ message: 'A link to reset your password has been sent to your email.' });
    } catch (error) { next(error); }
  };
  
//  Route to handle password reset request
const resetPassword = async (req, res) => {
    const { token, password } = req.body;
    
    // Verify reset token
    const user = await userModel.findOne({ resetToken:token });
    if (!user) {
      return res.status(400).json({ message: 'Invalid token' });
    }
    
    // Update password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.resetToken = null;
    await user.save();
    
    res.status(200).json({ message: 'Password reset successful' });
  };
 export {forgotPassword, resetPassword}
  
