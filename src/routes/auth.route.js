const express = require('express');
const router = express.Router();
const authController = require('../controller/auth.controller');
const authMiddleware = require('../core/utils/authMiddleware'); // JWT verification
const authorize = require('../core/utils/authorize'); // role-based access

// =======================
// LOGIN - public
// =======================
router.post('/login', authController.login);

router.post('/change-password', authMiddleware, authController.changePassword);

// =======================
// CREATE USER - Admin only
// =======================
router.post(
  '/create', 
  authMiddleware,            // attach req.user from JWT
  authorize(['Admin']),      // only Admin can create users
  authController.createUser
);

module.exports = router;
