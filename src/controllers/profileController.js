const { uploadAvatar, uploadPortfolioFile, uploadVideo } = require("../config/cloudinary");
const { getMyProfile, updateMyProfile: updateMyProfileUtil } = require("../utils/profileStore");

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
    const allowed = [
      "name",
      "companyName",
      "bio",
      "skills",
      "hourlyRate",
      "currency",
      "serviceMode",
      "physicalCategory",
      "serviceArea",
      "companyDescription",
      "industry",
      "budget",
      "hiringCapacity",
      "country",
      "languages",
    ];

    const input = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) input[key] = req.body[key];
    });

    const updated = await updateMyProfileUtil(req.user.id, input);
    return res.json({ success: true, message: "Profile updated.", user: updated });
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
