const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // ─── Identity ─────────────────────────────────────────────────────────────
    role: {
      type: String,
      enum: ["freelancer", "client", "admin"],
      required: true,
    },
    name: { type: String, trim: true },           // freelancer full name
    companyName: { type: String, trim: true },     // client company name
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    password: { type: String, required: true, select: false },
    avatar: { type: String, default: "" },         // Cloudinary URL
    companyLogo: { type: String, default: "" },

    // ─── Freelancer Profile ───────────────────────────────────────────────────
    bio: { type: String, maxlength: 1000 },
    skills: [{ type: String }],
    hourlyRate: { type: Number, default: 10 },
    currency: { type: String, default: "USD" },
    serviceMode: {
      type: String,
      enum: ["Fully online", "Physical on-site", "Hybrid (online + on-site)", ""],
      default: "",
    },
    physicalCategory: { type: String, default: "" },
    serviceArea: { type: String, default: "" },
    portfolio: [{ type: String }],          // Cloudinary URLs
    portfolioVideos: [{ type: String }],    // Cloudinary video URLs
    introVideo: { type: String, default: "" },

    // ─── Client Profile ───────────────────────────────────────────────────────
    companyDescription: { type: String, maxlength: 2000 },
    industry: { type: String, default: "" },
    budget: { type: Number, default: 0 },
    hiringCapacity: { type: Number, default: 1 },

    // ─── Common ───────────────────────────────────────────────────────────────
    country: { type: String, default: "" },
    languages: [{ type: String }],
    isVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isBanned: { type: Boolean, default: false },

    // ─── Performance / Badges ─────────────────────────────────────────────────
    level: {
      type: String,
      enum: ["New Seller", "Level 1", "Level 2", "Top Rated", "Pro"],
      default: "New Seller",
    },
    badges: [{ type: String }],
    totalEarnings: { type: Number, default: 0 },
    completedOrders: { type: Number, default: 0 },
    cancelledOrders: { type: Number, default: 0 },
    avgResponseTime: { type: Number, default: 0 }, // hours
    avgRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },

    // ─── Auth ─────────────────────────────────────────────────────────────────
    refreshToken: { type: String, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
userSchema.index({ email: 1 });
userSchema.index({ phoneNumber: 1 });
userSchema.index({ role: 1 });
userSchema.index({ skills: 1 });
userSchema.index({ country: 1 });
userSchema.index({ serviceMode: 1 });
userSchema.index({ avgRating: -1 });

// ─── Pre-save: hash password ──────────────────────────────────────────────────
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ─── Instance method: compare password ───────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ─── Virtual: displayName ─────────────────────────────────────────────────────
userSchema.virtual("displayName").get(function () {
  return this.role === "client" ? this.companyName : this.name;
});

module.exports = mongoose.model("User", userSchema);

