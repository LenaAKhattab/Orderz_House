const { v2: cloudinary } = require("cloudinary");

let configured = false;

function isCloudinaryConfigured() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

function getCloudinary() {
  if (!isCloudinaryConfigured()) {
    const err = new Error("Cloudinary configuration is missing.");
    err.statusCode = 500;
    throw err;
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

module.exports = {
  getCloudinary,
  isCloudinaryConfigured,
};
