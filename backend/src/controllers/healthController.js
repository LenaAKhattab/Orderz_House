const { getHealthStatus } = require("../services/healthService");

const healthCheck = async (req, res, next) => {
  try {
    const payload = await getHealthStatus();
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  healthCheck,
};
