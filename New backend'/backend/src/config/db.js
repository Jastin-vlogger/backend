/* eslint-disable no-console */
const mongoose = require('mongoose');


async function databaseConnect(url) {
  try {
    await mongoose.connect(url); // no extra options needed in Mongoose v6+
    console.log('✅ Database connected');
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
    // Don't exit process, let the server stay alive
  }
}

mongoose.connection.on('error', (err) => {
  console.error('Database error occurred:', err);
});

module.exports = {
  databaseConnect,
};
