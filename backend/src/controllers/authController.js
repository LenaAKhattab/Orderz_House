const authService = require("../services/authService");
const authOtpService = require("../services/authOtpService");
const notificationService = require("../services/notificationService");
const { createPublicApiError } = require("../utils/publicApiError");
const { setAuthCookie, clearAuthCookie } = require("../utils/authCookie");
const { capture, identify, captureException } = require("../config/posthog");

async function safeNotify(run) {
  try {
    await run();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications]", err?.message || err);
  }
}

const register = async (req, res, next) => {
  try {
    const out = await authService.registerUser(req.body);
    return res.status(201).json({
      success: true,
      message: "تم إنشاء الحساب. راجع بريدك لإدخال رمز التحقق.",
      data: {
        requiresEmailVerification: true,
        email: out.email,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const verifyRegisterOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const userId = await authOtpService.verifyRegistrationOtp(email, otp);
    const { user, token } = await authService.buildAuthResponseForUserId(userId);
    await safeNotify(() =>
      notificationService.createIfNotExists(
        {
          recipientUserId: Number(userId),
          recipientRole: user.primaryRole || user.role,
          actorUserId: null,
          type: "user.registered",
          title: "تم إنشاء حسابك بنجاح",
          message: "مرحباً بك في منصة أوردرز هاوس.",
          entityType: "user",
          entityId: Number(userId),
          link: "/dashboard",
          priority: "medium",
          metadata: { userId: String(userId), role: user.role },
        },
        `user_registered_${String(userId)}`,
      ),
    );
    identify(String(userId), {
      email: user.email,
      role: user.primaryRole || user.role,
    });
    capture(String(userId), "signup_completed", {
      role: user.primaryRole || user.role,
    });
    setAuthCookie(res, token);
    return res.status(200).json({
      success: true,
      message: "تم تأكيد البريد الإلكتروني بنجاح.",
      data: { user, token },
    });
  } catch (error) {
    captureException(error);
    return next(error);
  }
};

const resendRegisterOtp = async (req, res, next) => {
  try {
    await authOtpService.resendRegistrationOtp(req.body.email);
    return res.status(200).json({
      success: true,
      message:
        "إذا كان هناك حساب بانتظار تأكيد البريد الإلكتروني، سيتم إرسال رمز التحقق.",
    });
  } catch (error) {
    return next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    await authOtpService.requestForgotPasswordOtp(req.body.email);
    return res.status(200).json({
      success: true,
      message: "إذا كان البريد الإلكتروني مسجلاً، سيتم إرسال رمز التحقق",
    });
  } catch (error) {
    return next(error);
  }
};

const verifyForgotPasswordOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const { resetToken } = await authOtpService.verifyForgotPasswordOtp(email, otp);
    return res.status(200).json({
      success: true,
      message: "تم التحقق من الرمز. يمكنك تعيين كلمة مرور جديدة.",
      data: { resetToken },
    });
  } catch (error) {
    return next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    await authOtpService.resetPasswordWithToken(email, resetToken, newPassword);
    return res.status(200).json({
      success: true,
      message: "تم تحديث كلمة المرور بنجاح.",
    });
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { user, token } = await authService.loginUser(email, password);
    identify(String(user.id), {
      email: user.email,
      role: user.primaryRole || user.role,
    });
    capture(String(user.id), "user_logged_in", {
      role: user.primaryRole || user.role,
    });
    setAuthCookie(res, token);
    return res.status(200).json({
      success: true,
      message: "تم تسجيل الدخول بنجاح.",
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
  clearAuthCookie(res);
  return res.status(200).json({
    success: true,
    message: "تم تسجيل الخروج.",
  });
};

const me = async (req, res, next) => {
  try {
    const user = await authService.getPublicUserById(req.user.sub);
    if (!user.isActive) {
      throw createPublicApiError("تم تعطيل هذا الحساب.", 403, "ACCOUNT_DISABLED");
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
  verifyRegisterOtp,
  resendRegisterOtp,
  forgotPassword,
  verifyForgotPasswordOtp,
  resetPassword,
  login,
  logout,
  me,
  respondScope,
};
