const { resolvePublicGeoFromRequest } = require("../utils/publicGeoCountry");

async function getPublicGeo(req, res, next) {
  try {
    const geo = resolvePublicGeoFromRequest(req);
    return res.status(200).json({ success: true, data: geo });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getPublicGeo,
};
