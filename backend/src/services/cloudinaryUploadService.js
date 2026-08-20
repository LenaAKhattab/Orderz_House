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

/**
 * Phase A11 — KYC ID images. Prefer Cloudinary authenticated assets; fall back to private local disk.
 * Returns fileKey only (never rely on public URLs for KYC).
 */
async function uploadKycIdBuffer({
  buffer,
  mimetype,
  originalname,
  userId,
  side = "front",
} = {}) {
  const fs = require("node:fs");
  const fsp = require("node:fs/promises");
  const uid = String(userId || "me").replace(/\s+/g, "");
  const sideSafe = String(side || "front").replace(/[^\w]+/g, "") || "front";
  const ext = path.extname(String(originalname || "")) || ".jpg";
  const base = toSafeBase(path.basename(String(originalname || sideSafe), ext));

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_URL;
  if (cloudName) {
    try {
      const cloudinary = getCloudinary();
      const folder = `orderz/kyc/${uid}`;
      const publicId = `${folder}/${sideSafe}-${Date.now()}-${base}`.replace(/\s+/g, "_");
      const result = await new Promise((resolve, reject) => {
        const upload = cloudinary.uploader.upload_stream(
          {
            resource_type: "image",
            type: "authenticated",
            folder,
            public_id: publicId,
            overwrite: false,
            use_filename: false,
          },
          (err, res) => {
            if (err || !res) return reject(err || new Error("Cloudinary KYC upload failed."));
            resolve(res);
          },
        );
        upload.on("error", reject);
        upload.end(buffer);
      });
      return {
        fileKey: `cloudinary:${result.public_id}`,
        publicId: result.public_id,
        storage: "cloudinary_authenticated",
        bytes: Number(result.bytes || buffer.length || 0),
        format: result.format || null,
        mimetype,
        originalname,
      };
    } catch (err) {
      // Fall through to local private disk when Cloudinary is misconfigured in non-prod.
      if (String(process.env.NODE_ENV || "").toLowerCase() === "production") throw err;
    }
  }

  const root = path.join(__dirname, "..", "..", "uploads", "kyc", uid);
  await fsp.mkdir(root, { recursive: true });
  const filename = `${sideSafe}-${Date.now()}-${base}${ext}`.replace(/\s+/g, "_");
  const abs = path.join(root, filename);
  await fsp.writeFile(abs, buffer);
  const relKey = path.join("kyc", uid, filename).split(path.sep).join("/");
  return {
    fileKey: `local:${relKey}`,
    publicId: null,
    storage: "local_private",
    bytes: Number(buffer.length || 0),
    format: null,
    mimetype,
    originalname,
    absPath: abs,
  };
}

module.exports = {
  uploadBuffer,
  uploadAvatarBuffer,
  uploadAdPromoImageBuffer,
  uploadCourseDocumentBuffer,
  uploadWebsiteContentImageBuffer,
  uploadKycIdBuffer,
  destroyByPublicId,
};
