const notFoundHandler = (req, res) => {
  return res.status(404).json({
    message: `Route not found: ${req.originalUrl}`,
  });
};

module.exports = notFoundHandler;
