const { body } = require("express-validator");
const {
  TITLE_MAX,
  URL_MAX,
  PHONE_MAX,
  EMAIL_MAX,
  LOCATION_MAX,
  HOURS_TEXT_MAX,
  HELPER_TEXT_MAX,
  CONTACT_CENTER_URL_MAX,
  normalizeStoreHttpsUrl,
  normalizePhoneLike,
  normalizeEmail,
  normalizeLocation,
  normalizeHoursText,
  normalizeHelperText,
  normalizeContactCenterUrl,
  normalizeTitle,
  GOOGLE_PLAY_HOSTS,
  APP_STORE_HOSTS,
} = require("../services/websiteFooterAppDownloadsService");

const updateFooterAppDownloadsValidators = [
  body("titleAr")
    .exists({ checkFalsy: true })
    .withMessage("عنوان القسم مطلوب.")
    .bail()
    .isString()
    .withMessage("عنوان القسم غير صالح.")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("عنوان القسم مطلوب.")
    .isLength({ max: TITLE_MAX })
    .withMessage("عنوان القسم طويل جداً."),
  body("titleEn")
    .optional()
    .isString()
    .withMessage("Section title is invalid.")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Section title is required.")
    .isLength({ max: TITLE_MAX })
    .withMessage("Section title is too long."),
  body("googlePlayUrl")
    .exists({ checkFalsy: true })
    .withMessage("رابط Google Play مطلوب.")
    .bail()
    .isString()
    .withMessage("رابط Google Play غير صالح.")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("رابط Google Play مطلوب.")
    .isLength({ max: URL_MAX })
    .withMessage("رابط Google Play طويل جداً.")
    .custom((value) => {
      normalizeStoreHttpsUrl(value, {
        label: "رابط Google Play",
        allowedHosts: GOOGLE_PLAY_HOSTS,
      });
      return true;
    }),
  body("appStoreUrl")
    .exists({ checkFalsy: true })
    .withMessage("رابط App Store مطلوب.")
    .bail()
    .isString()
    .withMessage("رابط App Store غير صالح.")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("رابط App Store مطلوب.")
    .isLength({ max: URL_MAX })
    .withMessage("رابط App Store طويل جداً.")
    .custom((value) => {
      normalizeStoreHttpsUrl(value, {
        label: "رابط App Store",
        allowedHosts: APP_STORE_HOSTS,
      });
      return true;
    }),
  body("visible").optional().isBoolean().withMessage("قيمة الظهور غير صالحة."),
  body("titleVisible").optional().isBoolean().withMessage("قيمة ظهور العنوان غير صالحة."),
  body("googlePlayVisible").optional().isBoolean().withMessage("قيمة ظهور Google Play غير صالحة."),
  body("appStoreVisible").optional().isBoolean().withMessage("قيمة ظهور App Store غير صالحة."),
];

const updateFooterContactValidators = [
  body("phone")
    .exists({ checkFalsy: true })
    .withMessage("رقم الهاتف مطلوب.")
    .bail()
    .isString()
    .withMessage("رقم الهاتف غير صالح.")
    .bail()
    .isLength({ max: PHONE_MAX })
    .withMessage("رقم الهاتف طويل جداً.")
    .custom((value) => {
      normalizePhoneLike(value, "رقم الهاتف");
      return true;
    }),
  body("email")
    .exists({ checkFalsy: true })
    .withMessage("البريد الإلكتروني مطلوب.")
    .bail()
    .isString()
    .withMessage("البريد الإلكتروني غير صالح.")
    .bail()
    .isLength({ max: EMAIL_MAX })
    .withMessage("البريد الإلكتروني طويل جداً.")
    .custom((value) => {
      normalizeEmail(value);
      return true;
    }),
  body("whatsapp")
    .exists({ checkFalsy: true })
    .withMessage("رقم واتساب مطلوب.")
    .bail()
    .isString()
    .withMessage("رقم واتساب غير صالح.")
    .bail()
    .isLength({ max: PHONE_MAX })
    .withMessage("رقم واتساب طويل جداً.")
    .custom((value) => {
      normalizePhoneLike(value, "رقم واتساب");
      return true;
    }),
  body("location")
    .exists({ checkFalsy: true })
    .withMessage("الموقع مطلوب.")
    .bail()
    .isString()
    .withMessage("الموقع غير صالح.")
    .bail()
    .isLength({ max: LOCATION_MAX })
    .withMessage("الموقع طويل جداً.")
    .custom((value) => {
      normalizeLocation(value);
      return true;
    }),
  body("visible").optional().isBoolean().withMessage("قيمة الظهور غير صالحة."),
  body("phoneVisible").optional().isBoolean().withMessage("قيمة ظهور الهاتف غير صالحة."),
  body("emailVisible").optional().isBoolean().withMessage("قيمة ظهور البريد غير صالحة."),
  body("whatsappVisible").optional().isBoolean().withMessage("قيمة ظهور واتساب غير صالحة."),
  body("locationVisible").optional().isBoolean().withMessage("قيمة ظهور الموقع غير صالحة."),
];

const updateFooterWorkingHoursValidators = [
  body("title")
    .exists({ checkFalsy: true })
    .withMessage("عنوان القسم مطلوب.")
    .bail()
    .isString()
    .withMessage("عنوان القسم غير صالح.")
    .bail()
    .isLength({ max: TITLE_MAX })
    .withMessage("عنوان القسم طويل جداً.")
    .custom((value) => {
      normalizeTitle(value, "عنوان القسم");
      return true;
    }),
  body("text")
    .exists({ checkFalsy: true })
    .withMessage("نص ساعات العمل مطلوب.")
    .bail()
    .isString()
    .withMessage("نص ساعات العمل غير صالح.")
    .bail()
    .isLength({ max: HOURS_TEXT_MAX })
    .withMessage("نص ساعات العمل طويل جداً.")
    .custom((value) => {
      normalizeHoursText(value);
      return true;
    }),
  body("visible").optional().isBoolean().withMessage("قيمة الظهور غير صالحة."),
  body("titleVisible").optional().isBoolean().withMessage("قيمة ظهور العنوان غير صالحة."),
  body("textVisible").optional().isBoolean().withMessage("قيمة ظهور النص غير صالحة."),
];

const updateFooterContactCenterValidators = [
  body("helperText")
    .exists({ checkFalsy: true })
    .withMessage("النص التوضيحي مطلوب.")
    .bail()
    .isString()
    .withMessage("النص التوضيحي غير صالح.")
    .bail()
    .isLength({ max: HELPER_TEXT_MAX })
    .withMessage("النص التوضيحي طويل جداً.")
    .custom((value) => {
      normalizeHelperText(value);
      return true;
    }),
  body("buttonText")
    .exists({ checkFalsy: true })
    .withMessage("نص الزر مطلوب.")
    .bail()
    .isString()
    .withMessage("نص الزر غير صالح.")
    .bail()
    .isLength({ max: TITLE_MAX })
    .withMessage("نص الزر طويل جداً.")
    .custom((value) => {
      normalizeTitle(value, "نص الزر");
      return true;
    }),
  body("url")
    .optional()
    .isString()
    .withMessage("رابط مركز التواصل غير صالح.")
    .bail()
    .isLength({ max: CONTACT_CENTER_URL_MAX })
    .withMessage("رابط مركز التواصل طويل جداً.")
    .custom((value) => {
      if (value === undefined || value === null || String(value).trim() === "") return true;
      normalizeContactCenterUrl(value);
      return true;
    }),
  body("visible").optional().isBoolean().withMessage("قيمة الظهور غير صالحة."),
  body("helperTextVisible").optional().isBoolean().withMessage("قيمة ظهور النص التوضيحي غير صالحة."),
  body("buttonVisible").optional().isBoolean().withMessage("قيمة ظهور الزر غير صالحة."),
];

module.exports = {
  updateFooterAppDownloadsValidators,
  updateFooterContactValidators,
  updateFooterWorkingHoursValidators,
  updateFooterContactCenterValidators,
};
