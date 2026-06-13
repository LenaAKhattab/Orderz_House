const websiteFaqService = require("../services/websiteFaqService");

async function listFaqItems(req, res, next) {
  try {
    const items = await websiteFaqService.listAllFaqItems();
    return res.json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
}

async function createFaqItem(req, res, next) {
  try {
    const item = await websiteFaqService.createFaqItem({
      question: req.body.question,
      answer: req.body.answer,
    });
    return res.status(201).json({ success: true, data: { item } });
  } catch (err) {
    return next(err);
  }
}

async function updateFaqItem(req, res, next) {
  try {
    const item = await websiteFaqService.updateFaqItem(Number(req.params.id), {
      question: req.body.question,
      answer: req.body.answer,
    });
    if (!item) {
      return res.status(404).json({ success: false, message: "السؤال غير موجود." });
    }
    return res.json({ success: true, data: { item } });
  } catch (err) {
    return next(err);
  }
}

async function deleteFaqItem(req, res, next) {
  try {
    const deleted = await websiteFaqService.deleteFaqItem(Number(req.params.id));
    if (!deleted) {
      return res.status(404).json({ success: false, message: "السؤال غير موجود." });
    }
    return res.json({ success: true, data: { ok: true } });
  } catch (err) {
    return next(err);
  }
}

async function reorderFaqItems(req, res, next) {
  try {
    const items = await websiteFaqService.reorderFaqItems(req.body.orderedIds);
    return res.json({ success: true, data: { items } });
  } catch (err) {
    if (err.message === "INVALID_FAQ_REORDER") {
      return res.status(400).json({ success: false, message: "ترتيب الأسئلة غير صالح." });
    }
    return next(err);
  }
}

module.exports = {
  listFaqItems,
  createFaqItem,
  updateFaqItem,
  deleteFaqItem,
  reorderFaqItems,
};
