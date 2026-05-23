/**
 * Loads backend/images/categories/*.jpg into categories.image_data
 * and sets image_url to the API image route.
 *
 * Usage: node scripts/seedCategoryImagesToDb.js
 */
require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env") });

const fs = require("node:fs");
const path = require("node:path");
const { pool } = require("../src/config/db");

const SLUG_TO_FILE = {
  programming: "programming.jpg",
  design: "design.jpg",
  "content-writing": "contentwriting.jpg",
};

async function main() {
  const dir = path.join(__dirname, "..", "images", "categories");

  for (const [slug, filename] of Object.entries(SLUG_TO_FILE)) {
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing image file: ${filePath}`);
    }

    const buffer = fs.readFileSync(filePath);
    const imageUrl = `/api/categories/images/${slug}`;

    const { rowCount } = await pool.query(
      `UPDATE categories
       SET image_data = $1,
           image_mime = 'image/jpeg',
           image_url = $2,
           updated_at = NOW()
       WHERE slug = $3`,
      [buffer, imageUrl, slug],
    );

    if (rowCount === 0) {
      console.warn(`WARN: no category row for slug "${slug}"`);
    } else {
      console.log(`OK ${slug}: ${buffer.length} bytes -> ${imageUrl}`);
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
