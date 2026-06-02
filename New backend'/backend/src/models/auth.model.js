const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required:true },
  email: { type: String, required:true, unique:true },
  password: { type: String, required:true },
  role: {
    type: String,
    required: true,
    trim: true,
    default: 'Purchase'
  },
  mustChangePassword: {
    type: Boolean,
    default: false
  },
  isActive: { type: Boolean, default:true }
}, { timestamps: true });

userSchema.pre("save", async function () {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
});

// Compare password
userSchema.methods.comparePassword = async function(password){
  return await bcrypt.compare(password,this.password);
}

module.exports = mongoose.model("User", userSchema);
