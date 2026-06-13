const websitePageService = require("../services/websitePageService");
const { uploadWebsiteContentImageBuffer } = require("../services/cloudinaryUploadService");

async function listPages(req, res, next) {
  try {
    const pages = await websitePageService.listAllPages();
    return res.json({ success: true, data: { pages } });
  } catch (err) {
    return next(err);
  }
}

async function getPage(req, res, next) {
  try {
    const data = await websitePageService.getPageBySlug(req.params.slug, { includeInactiveBlocks: true });
    if (!data) {
      return res.status(404).json({ success: false, message: "الصفحة غير موجودة." });
    }
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function updatePage(req, res, next) {
  try {
    const page = await websitePageService.updatePageBySlug(req.params.slug, {
      title: req.body.title,
      isActive: req.body.isActive,
    });
    if (!page) {
      return res.status(404).json({ success: false, message: "الصفحة غير موجودة." });
    }
    return res.json({ success: true, data: { page } });
  } catch (err) {
    return next(err);
  }
}

async function createBlock(req, res, next) {
  try {
    const block = await websitePageService.createPageBlock(req.params.slug, {
      blockType: req.body.blockType,
      title: req.body.title,
      body: req.body.body,
      imageUrl: req.body.imageUrl,
    });
    if (!block) {
      return res.status(404).json({ success: false, message: "الصفحة غير موجودة." });
    }
    return res.status(201).json({ success: true, data: { block } });
  } catch (err) {
    if (err.message === "INVALID_BLOCK_TYPE") {
      return res.status(400).json({ success: false, message: "نوع المحتوى غير صالح." });
    }
    return next(err);
  }
}

async function updateBlock(req, res, next) {
  try {
    const block = await websitePageService.updatePageBlock(req.params.slug, Number(req.params.blockId), {
      blockType: req.body.blockType,
      title: req.body.title,
      body: req.body.body,
      imageUrl: req.body.imageUrl,
      isActive: req.body.isActive,
    });
    if (!block) {
      return res.status(404).json({ success: false, message: "المحتوى غير موجود." });
    }
    return res.json({ success: true, data: { block } });
  } catch (err) {
    if (err.message === "INVALID_BLOCK_TYPE") {
      return res.status(400).json({ success: false, message: "نوع المحتوى غير صالح." });
    }
    return next(err);
  }
}

async function deleteBlock(req, res, next) {
  try {
    const deleted = await websitePageService.deletePageBlock(req.params.slug, Number(req.params.blockId));
    if (!deleted) {
      return res.status(404).json({ success: false, message: "المحتوى غير موجود." });
    }
    return res.json({ success: true, data: { ok: true } });
  } catch (err) {
    return next(err);
  }
}

async function reorderBlocks(req, res, next) {
  try {
    const blocks = await websitePageService.reorderPageBlocks(req.params.slug, req.body.orderedIds);
    if (!blocks) {
      return res.status(404).json({ success: false, message: "الصفحة غير موجودة." });
    }
    return res.json({ success: true, data: { blocks } });
  } catch (err) {
    if (err.message === "INVALID_BLOCK_REORDER") {
      return res.status(400).json({ success: false, message: "ترتيب المحتوى غير صالح." });
    }
    return next(err);
  }
}

async function uploadImage(req, res, next) {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: "اختر صورة للرفع." });
    }
    const result = await uploadWebsiteContentImageBuffer({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
      userId: req.user?.id,
      purpose: "how-it-works",
    });
    return res.json({
      success: true,
      data: { url: result.secureUrl || result.url },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listPages,
  getPage,
  updatePage,
  createBlock,
  updateBlock,
  deleteBlock,
  reorderBlocks,
  uploadImage,
};
