const User = require('../models/auth.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const logAudit = require('../core/utils/auditLogger');

// Helper to generate JWT
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
};

// ========================
// LOGIN
// ========================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    // console.log(email,"email");
    // console.log(password,"password");
    // Check user exists
    const user = await User.findOne({ email });
    // console.log(user,"user");
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid email or password' });

    // Check if active
    if (!user.isActive) return res.status(403).json({ message: 'User is inactive' });

    // Generate token
    const token = generateToken(user);

    // Audit log
    await logAudit({
      userId: user._id,
      module: "Auth",
      entity: "User",
      entityId: user._id,
      action: "Login",
      before: {},
      after: { email: user.email, role: user.role },
      remarks: "User logged in"
    });

    res.json({
      message: "Login successful",
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, mustChangePassword: !!user.mustChangePassword }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// ========================
// CREATE USER (Admin only)
// ========================
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Check if email exists
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already exists" });

    // Create user
    const user = await User.create({ name, email, password, role });

    // Audit log
    await logAudit({
      userId: req.user._id, // Admin creating user
      module: "Auth",
      entity: "User",
      entityId: user._id,
      action: "Created",
      before: {},
      after: { name: user.name, email: user.email, role: user.role },
      remarks: "Admin created new user"
    });

    res.status(201).json({ message: "User created", user: { id: user._id, name:user.name, email:user.email, role:user.role } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    user.mustChangePassword = false;
    await user.save();

    await logAudit({
      userId: user._id,
      module: 'Auth',
      entity: 'User',
      entityId: user._id,
      action: 'Password Changed',
      before: {},
      after: { email: user.email },
      remarks: 'User changed account password',
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
