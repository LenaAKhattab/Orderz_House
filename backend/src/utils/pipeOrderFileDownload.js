const fs = require("node:fs");

/**
 * Stream a prepared order file to the response, or redirect for remote URLs.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 * @param {{ redirectUrl?: string, absPath?: string, downloadName?: string, mimeType?: string }} out
 */
function pipeOrderFileToResponse(req, res, next, out) {
  if (!out) return next(new Error("Missing file payload."));
  if (out.redirectUrl) return res.redirect(302, out.redirectUrl);
  if (!out.absPath) {
    const err = new Error("الملف غير متاح.");
    err.statusCode = 404;
    return next(err);
  }
  const inline = String(req.query.disposition || "").toLowerCase() === "inline";
  const cdType = inline ? "inline" : "attachment";
  const utf8Name = String(out.downloadName || "file");
  const encoded = encodeURIComponent(utf8Name);
  res.setHeader("Content-Type", out.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `${cdType}; filename*=UTF-8''${encoded}`);
  const stream = fs.createReadStream(out.absPath);
  stream.on("error", (e) => {
    if (!res.headersSent) return next(e);
  });
  return stream.pipe(res);
}

module.exports = { pipeOrderFileToResponse };
