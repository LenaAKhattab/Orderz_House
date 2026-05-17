const path = require("node:path");
const { getCloudinary } = require("../config/cloudinary");

function toSafeBase(name) {
  return String(name || "file")
    .replace(/[^\w.\-() ]+/g, "_")
    .trim()
    .slice(0, 80);
}

function uploadAvatarBuffer({ buffer, mimetype, originalname, userId }) {
  const cloudinary = getCloudinary();
  const ext = path.extname(String(originalname || ""));
  const base = toSafeBase(path.basename(String(originalname || "avatar"), ext));
  const uid = String(userId || "me").replace(/\s+/g, "");
  const publicId = `orderz/avatars/${uid}/${Date.now()}-${base}`.replace(/\s+/g, "_");

  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        public_id: publicId,
        overwrite: false,
        use_filename: false,
      },
      (err, result) => {
        if (err || !result) return reject(err || new Error("Cloudinary upload failed."));
        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          url: result.url || result.secure_url,
          bytes: Number(result.bytes || 0),
          format: result.format || null,
          resourceType: result.resource_type || null,
          mimetype,
          originalname,
        });
      },
    );
    upload.on("error", reject);
    upload.end(buffer);
  });
}

function uploadBuffer({ buffer, mimetype, originalname, orderId, purpose }) {
  const cloudinary = getCloudinary();
  const ext = path.extname(String(originalname || ""));
  const base = toSafeBase(path.basename(String(originalname || "file"), ext));
  const publicId = `orderz/orders/${String(orderId)}/${String(purpose || "brief")}/${Date.now()}-${base}`.replace(/\s+/g, "_");

  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        resource_type: "auto",
        folder: `orderz/orders/${String(orderId)}/${String(purpose || "brief")}`,
        public_id: publicId,
        overwrite: false,
        use_filename: false,
      },
      (err, result) => {
        if (err || !result) return reject(err || new Error("Cloudinary upload failed."));
        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          url: result.url || result.secure_url,
          bytes: Number(result.bytes || 0),
          format: result.format || null,
          resourceType: result.resource_type || null,
          mimetype,
          originalname,
        });
      },
    );
    upload.on("error", reject);
    upload.end(buffer);
  });
}

function uploadAdPromoImageBuffer({ buffer, mimetype, originalname, userId, purpose = "promo" }) {
  const cloudinary = getCloudinary();
  const ext = path.extname(String(originalname || ""));
  const base = toSafeBase(path.basename(String(originalname || "ad"), ext));
  const uid = String(userId || "admin").replace(/\s+/g, "");
  const folder = `orderz/ads/${String(purpose || "promo")}`;
  const publicId = `${folder}/${uid}/${Date.now()}-${base}`.replace(/\s+/g, "_");

  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        folder,
        public_id: publicId,
        overwrite: false,
        use_filename: false,
      },
      (err, result) => {
        if (err || !result) return reject(err || new Error("Cloudinary upload failed."));
        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          url: result.url || result.secure_url,
          bytes: Number(result.bytes || 0),
          format: result.format || null,
          resourceType: result.resource_type || null,
          mimetype,
          originalname,
        });
      },
    );
    upload.on("error", reject);
    upload.end(buffer);
  });
}

async function destroyByPublicId(publicId) {
  if (!publicId) return;
  const cloudinary = getCloudinary();
  try {
    await cloudinary.uploader.destroy(String(publicId), { resource_type: "auto", invalidate: true });
  } catch {
    // Best-effort cleanup only.
  }
}

module.exports = {
  uploadBuffer,
  uploadAvatarBuffer,
  uploadAdPromoImageBuffer,
  destroyByPublicId,
};
