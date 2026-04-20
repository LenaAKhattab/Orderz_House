const authService = require("../services/authService");

const register = async (req, res, next) => {
  try {
    const { user, token } = await authService.registerUser(req.body);
    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { user, token } = await authService.loginUser(email, password);
    return res.status(200).json({
      success: true,
      message: "Signed in successfully.",
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const logout = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Signed out. Clear the token on the client.",
  });
};

const me = async (req, res, next) => {
  try {
    const user = await authService.getPublicUserById(req.user.sub);
    if (!user.isActive) {
      const err = new Error("This account has been disabled.");
      err.statusCode = 403;
      throw err;
    }
    return res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    return next(error);
  }
};

/** Role-guarded probe endpoints — use to verify JWT + authorization on the client or in tests. */
const respondScope = (scope) => (req, res) => {
  return res.status(200).json({
    success: true,
    data: { scope },
  });
};

module.exports = {
  register,
  login,
  logout,
  me,
  respondScope,
};
