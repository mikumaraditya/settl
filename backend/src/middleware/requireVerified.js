import User from "../models/User.js";

// App data must only be accessible after the account email has been verified.
// Keep this separate from `protect` so verification and resend endpoints can
// still authenticate an unverified user.
const requireVerified = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("isEmailVerified");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: "Please verify your email address before using Settl.",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

export default requireVerified;
