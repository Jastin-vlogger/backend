const mongoose = require('mongoose');
const User = require('../models/auth.model'); // your Mongoose user model

async function createFirstAdmin() {
  const adminExists = await User.findOne({ role: 'Admin' });

  if (!adminExists) {
    const admin = new User({
      name: 'Admin User',          // change as needed
      email: 'software@royalhorizon.group', // change as needed
      password: 'Horizon@123', // hash this in production
      role: 'Admin',
    });

    await admin.save();
    console.log('✅ First admin user created');
  } else {
    console.log('Admin already exists, skipping creation');
  }
}

module.exports = {
  createFirstAdmin,
};

