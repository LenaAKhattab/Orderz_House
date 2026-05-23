const path = require("node:path");
const fs = require("node:fs/promises");
const categoriesService = require("../services/categoriesService");

const listCategories = async (req, res, next) => {
  try {
    const categories = await categoriesService.listCategories();
    return res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error) {
    return next(error);
  }
};

const getCategoryImage = async (req, res, next) => {
  try {
    const row = await categoriesService.getCategoryImageBySlug(req.params.slug);
    if (!row) {
      return res.status(404).json({ success: false, message: "Category image not found." });
    }

    if (row.image_data) {
      res.set("Content-Type", row.image_mime || "image/jpeg");
      res.set("Cache-Control", "public, max-age=86400, immutable");
      return res.send(row.image_data);
    }

    const staticPath = String(row.image_url || "").replace(/^\/images\//, "");
    if (staticPath && staticPath !== row.image_url) {
      const filePath = path.join(__dirname, "..", "..", "images", staticPath);
      try {
        const buffer = await fs.readFile(filePath);
        res.set("Content-Type", "image/jpeg");
        res.set("Cache-Control", "public, max-age=86400");
        return res.send(buffer);
      } catch {
        /* fall through */
      }
    }

    return res.status(404).json({ success: false, message: "Category image not found." });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listCategories,
  getCategoryImage,
};

