import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import { sendVerificationEmail } from "../utils/emailService.js";
import protect from "../middleware/auth.js";

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

// REGISTER
router.post("/register", async (req, res) => {
  const { name, email, password, upiId } = req.body;

  try {
    if (!upiId || !upiId.trim()) {
      return res.status(400).json({ message: "UPI ID is required" });
    }
    const upiRegex = /^[a-zA-Z0-9.\-_]{3,50}@(oksbi|paytm|ybl|barodampay|okaxis|okhdfcbank|okicici|okbizaxis|ibl|axl|upi|apl|rapl|yapl|sbi|hdfcbank|icici|axisbank|yesbank|pnb|cnrb|indianbank|iob|unionbank|uboi|idfcbank|federal|kotak|kmbl|boi|uco|cbin|centralbank|dbs|hsbc|sc|citi|postbank|ippb|airtel|airtelmail|jio|cred|slice|sliceaxis|fi|jupiter|waaxis|wasbi|waicici|wahdfc|bob)$/i;
    if (!upiRegex.test(upiId.trim())) {
      return res.status(400).json({ message: "Invalid UPI ID format. Should be like name@handle with a valid bank handle." });
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!password || !passwordRegex.test(password)) {
      return res.status(400).json({ message: "Password must be at least 8 characters long, and contain at least one uppercase letter, one lowercase letter, one number, and one special character." });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationExpires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      upiId: upiId || "",
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
      isEmailVerified: false,
    });

    // Send verification email (non-blocking — don't fail registration if email fails)
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const verificationUrl = `${frontendUrl}/verify-email?token=${verificationToken}`;
    try {
      await sendVerificationEmail(user.email, user.name, verificationUrl);
    } catch (emailErr) {
      console.error("Verification email failed to send:", emailErr.message);
    }

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      upiId: user.upiId,
      isEmailVerified: user.isEmailVerified,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      upiId: user.upiId,
      isEmailVerified: user.isEmailVerified,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GOOGLE SIGN-IN
router.post("/google", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: "Google ID token is required" });
  }

  // Support Mock Sign-in in development or if GOOGLE_CLIENT_ID is not configured
  const isMockToken = token === "mock-google-token";
  const isGoogleNotConfigured = !process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID === "1013725458908-mockclient.apps.googleusercontent.com";

  if (isMockToken && (isGoogleNotConfigured || process.env.NODE_ENV !== "production")) {
    try {
      const email = "google-demo-user@example.com";
      const name = "Google Demo User";

      let user = await User.findOne({ email });

      if (!user) {
        const randomPassword = crypto.randomBytes(16).toString("hex");
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(randomPassword, salt);

        user = await User.create({
          name,
          email,
          password: hashedPassword,
          upiId: "",
          isEmailVerified: true,
        });
      }

      const appToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

      return res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        upiId: user.upiId,
        isEmailVerified: user.isEmailVerified,
        token: appToken,
        isMock: true,
      });
    } catch (mockError) {
      console.error("Mock Google login error:", mockError);
      return res.status(500).json({ message: "Mock Google login failed" });
    }
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name } = payload;

    if (!email) {
      return res.status(400).json({ message: "Email not provided by Google account" });
    }

    let user = await User.findOne({ email });

    if (!user) {
      const randomPassword = crypto.randomBytes(16).toString("hex");
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(randomPassword, salt);

      user = await User.create({
        name: name || email.split("@")[0],
        email,
        password: hashedPassword,
        upiId: "",
        isEmailVerified: true,
      });
    }

    const appToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      upiId: user.upiId,
      isEmailVerified: user.isEmailVerified,
      token: appToken,
    });
  } catch (error) {
    console.error("Google authentication error:", error);
    res.status(401).json({ message: "Google token verification failed" });
  }
});


// VERIFY EMAIL — GET /api/auth/verify-email?token=...
router.get("/verify-email", async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ message: "Verification token is required" });
  }

  try {
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      // Check if already verified with this token (idempotent — don't fail on second click)
      const alreadyVerified = await User.findOne({ isEmailVerified: true, emailVerificationToken: null })
      // We can't match by token since it's cleared — just return a clean error
      return res.status(400).json({ message: "Invalid or expired verification link" });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();

    // Return full user + JWT so the frontend can auto-login the user
    res.json({
      message: "Email verified successfully",
      _id: user._id,
      name: user.name,
      email: user.email,
      upiId: user.upiId,
      isEmailVerified: true,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// UPDATE PROFILE — PUT /api/auth/profile (protected)
router.put("/profile", protect, async (req, res) => {
  try {
    const { name, upiId } = req.body;

    if (upiId !== undefined && !upiId.trim()) {
      return res.status(400).json({ message: "UPI ID is required" });
    }

    if (upiId && upiId.trim()) {
      const upiRegex = /^[a-zA-Z0-9.\-_]{3,50}@(oksbi|paytm|ybl|barodampay|okaxis|okhdfcbank|okicici|okbizaxis|ibl|axl|upi|apl|rapl|yapl|sbi|hdfcbank|icici|axisbank|yesbank|pnb|cnrb|indianbank|iob|unionbank|uboi|idfcbank|federal|kotak|kmbl|boi|uco|cbin|centralbank|dbs|hsbc|sc|citi|postbank|ippb|airtel|airtelmail|jio|cred|slice|sliceaxis|fi|jupiter|waaxis|wasbi|waicici|wahdfc|bob)$/i;
      if (!upiRegex.test(upiId.trim())) {
        return res.status(400).json({ message: "Invalid UPI ID format. Should be like name@handle with a valid bank handle." });
      }
    }

    const user = await User.findById(req.user.id);

    if (!user) return res.status(404).json({ message: "User not found" });

    if (name  !== undefined) user.name  = name.trim();
    if (upiId !== undefined) user.upiId = upiId.trim();

    await user.save();

    res.json({
      _id:             user._id,
      name:            user.name,
      email:           user.email,
      upiId:           user.upiId,
      isEmailVerified: user.isEmailVerified,
      token:           generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// CHANGE PASSWORD — PUT /api/auth/change-password (protected)
router.put("/change-password", protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: "Both current and new password are required" });

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ message: "New password must be at least 8 characters long, and contain at least one uppercase letter, one lowercase letter, one number, and one special character." });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Current password is incorrect" });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// RESEND VERIFICATION EMAIL — POST /api/auth/resend-verification (protected)
router.post("/resend-verification", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    // Regenerate token + expiry
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationExpires = new Date(Date.now() + 48 * 60 * 60 * 1000);

    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpires = verificationExpires;
    await user.save();

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const verificationUrl = `${frontendUrl}/verify-email?token=${verificationToken}`;
    await sendVerificationEmail(user.email, user.name, verificationUrl);

    res.json({ message: "Verification email resent successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
