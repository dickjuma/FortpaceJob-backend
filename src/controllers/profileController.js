const {
  uploadAvatar,
  uploadCoverPhoto,
  uploadPortfolioFile,
  uploadVideo,
} = require("../config/cloudinary");
const {
  getMyProfile,
  updateMyProfile: updateMyProfileUtil,
  sanitizeProfileInput,
} = require("../utils/profileStore");
const { prisma } = require("../config/db");
const { checkProfileCompletion } = require("../utils/profileCompletion");

const persistProfileUpdate = async (req, res, input) => {
  const updatedProfile = await updateMyProfileUtil(req.user.id, sanitizeProfileInput(input));
  const { isComplete, missingFields } = checkProfileCompletion(updatedProfile);

  await prisma.user.update({
    where: { id: Number(req.user.id) },
    data: {
      lastProfileUpdate: new Date(),
      reminderSent: false,
      profileCompleted: isComplete,
    },
  });

  return res.json({
    success: true,
    message: "Profile updated.",
    user: updatedProfile,
    completeness: isComplete ? "Complete" : "Incomplete",
    missingFields,
  });
};

exports.getMyProfile = async (req, res, next) => {
  try {
    const profile = await getMyProfile(req.user.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: "Profile not found." });
    }
    return res.json({ success: true, user: profile });
  } catch (error) {
    next(error);
  }
};

exports.updateMyProfile = async (req, res, next) => {
  try {
    return persistProfileUpdate(req, res, req.body);
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    return persistProfileUpdate(req, res, req.body);
  } catch (error) {
    next(error);
  }
};

exports.getMissingFields = async (req, res, next) => {
  try {
    const profile = await getMyProfile(req.user.id);
    const { missingFields } = checkProfileCompletion(profile);
    return res.json({ success: true, missing: missingFields });
  } catch (error) {
    next(error);
  }
};

exports.uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Avatar file is required." });
    }
    const uploaded = await uploadAvatar(req.file.buffer);
    const updated = await updateMyProfileUtil(req.user.id, {
      avatar: uploaded.secure_url,
      avatarPublicId: uploaded.public_id,
      avatarFileName: req.file.originalname || uploaded.original_filename || "",
    });
    return res.json({ success: true, message: "Avatar uploaded.", user: updated });
  } catch (error) {
    next(error);
  }
};

exports.uploadCoverPhoto = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Cover photo file is required." });
    }
    const uploaded = await uploadCoverPhoto(req.file.buffer);
    const updated = await updateMyProfileUtil(req.user.id, {
      coverPhoto: uploaded.secure_url,
      coverPhotoPublicId: uploaded.public_id,
      coverPhotoFileName: req.file.originalname || uploaded.original_filename || "",
    });
    return res.json({ success: true, message: "Cover photo updated.", user: updated });
  } catch (error) {
    next(error);
  }
};

exports.uploadCompanyLogo = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Company logo file is required." });
    }
    const uploaded = await uploadAvatar(req.file.buffer);
    const updated = await updateMyProfileUtil(req.user.id, {
      companyLogo: uploaded.secure_url,
      companyLogoPublicId: uploaded.public_id,
      companyLogoFileName: req.file.originalname || uploaded.original_filename || "",
    });
    return res.json({ success: true, message: "Company logo uploaded.", user: updated });
  } catch (error) {
    next(error);
  }
};

exports.uploadIntroVideo = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Intro video file is required." });
    }
    const uploaded = await uploadVideo(req.file.buffer);
    const profile = await getMyProfile(req.user.id);
    const videos = Array.isArray(profile?.portfolioVideos) ? profile.portfolioVideos : [];
    const updated = await updateMyProfileUtil(req.user.id, {
      introVideo: uploaded.secure_url,
      introVideoPublicId: uploaded.public_id,
      introVideoFileName: req.file.originalname || uploaded.original_filename || "",
      portfolioVideos: [...videos, uploaded.secure_url],
    });
    return res.json({ success: true, message: "Intro video uploaded.", user: updated });
  } catch (error) {
    next(error);
  }
};

exports.uploadPortfolio = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "Portfolio files are required." });
    }
    const uploaded = await Promise.all(
      req.files.map((file) => uploadPortfolioFile(file.buffer, file.mimetype))
    );
    const urls = uploaded.map((item) => item.secure_url);
    const fileNames = req.files.map((file, index) => file.originalname || uploaded[index]?.original_filename || "");
    const profile = await getMyProfile(req.user.id);
    const current = Array.isArray(profile?.portfolio) ? profile.portfolio : [];
    const currentNames = Array.isArray(profile?.portfolioFileNames) ? profile.portfolioFileNames : [];
    const updated = await updateMyProfileUtil(req.user.id, {
      portfolio: [...current, ...urls],
      portfolioFileNames: [...currentNames, ...fileNames],
    });
    return res.json({ success: true, message: "Portfolio uploaded.", user: updated });
  } catch (error) {
    next(error);
  }
};
