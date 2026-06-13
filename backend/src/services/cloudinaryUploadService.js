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

const COURSE_DOC_IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"]);

/**
 * PDFs and office docs must use raw delivery — "auto" often stores PDFs as image and breaks open/download.
 */
function resolveCourseDocumentResourceType(mimetype, originalname) {
  const mt = String(mimetype || "").toLowerCase();
  const ext = path.extname(String(originalname || "")).toLowerCase();
  if (mt.startsWith("image/") || COURSE_DOC_IMAGE_EXT.has(ext)) return "image";
  return "raw";
}

/**
 * public_id must NOT end with .pdf — Cloudinary blocks CDN delivery for raw assets whose
 * delivery URL contains a .pdf suffix (account PDF/ZIP delivery restriction).
 */
function buildCourseDocumentPublicId(originalname) {
  const ext = path.extname(String(originalname || "")).toLowerCase();
  const base = toSafeBase(path.basename(String(originalname || "file"), ext));
  return `${Date.now()}-${base}`.replace(/\s+/g, "_");
}

function uploadCourseDocumentBuffer({ buffer, mimetype, originalname, courseId, purpose = "test" }) {
  const cloudinary = getCloudinary();
  const resourceType = resolveCourseDocumentResourceType(mimetype, originalname);
  const folder = `orderz/courses/${String(courseId)}/${String(purpose || "test")}`;
  const publicId = buildCourseDocumentPublicId(originalname);

  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType,
        folder,
        public_id: publicId,
        overwrite: false,
        use_filename: false,
      },
      (err, result) => {
        if (err) {
          console.error("[cloudinary] course document upload failed", {
            courseId,
            purpose,
            resourceType,
            mimetype,
            originalname,
            message: err.message,
          });
          return reject(err);
        }
        if (!result?.secure_url) {
          console.error("[cloudinary] course document upload missing secure_url", { courseId, purpose, result });
          return reject(new Error("Cloudinary upload returned no secure_url."));
        }
        console.info("[cloudinary] course document uploaded", {
          courseId,
          purpose,
          folder,
          publicId: result.public_id,
          resourceType: result.resource_type,
          bytes: result.bytes,
          format: result.format,
          secureUrl: result.secure_url,
        });
        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          url: result.url || result.secure_url,
          bytes: Number(result.bytes || 0),
          format: result.format || null,
          resourceType: result.resource_type || resourceType,
          mimetype,
          originalname,
        });
      },
    );
    upload.on("error", (streamErr) => {
      console.error("[cloudinary] course document upload stream error", {
        courseId,
        purpose,
        message: streamErr?.message,
      });
      reject(streamErr);
    });
    upload.end(buffer);
  });
}

async function destroyByPublicId(publicId, resourceType = "auto") {
  if (!publicId) return;
  const cloudinary = getCloudinary();
  try {
    await cloudinary.uploader.destroy(String(publicId), { resource_type: resourceType, invalidate: true });
  } catch {
    // Best-effort cleanup only.
  }
}

function uploadWebsiteContentImageBuffer({ buffer, mimetype, originalname, userId, purpose = "content" }) {
  const cloudinary = getCloudinary();
  const ext = path.extname(String(originalname || ""));
  const base = toSafeBase(path.basename(String(originalname || "image"), ext));
  const uid = String(userId || "admin").replace(/\s+/g, "");
  const folder = `orderz/website/${String(purpose || "content")}`;
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

module.exports = {
  uploadBuffer,
  uploadAvatarBuffer,
  uploadAdPromoImageBuffer,
  uploadCourseDocumentBuffer,
  uploadWebsiteContentImageBuffer,
  destroyByPublicId,
};
