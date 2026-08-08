import {
  FOOTER_APP_DOWNLOAD_FALLBACKS,
  coalesceFooterAppText,
  coalesceFooterVisible,
  mergeFooterAppDownloads,
} from "./footerAppDownloads";
import {
  LOGIN_PROBLEMS_SUGGESTIONS_INTENT,
  canRoleAccessPath,
  getDashboardPath,
  getProblemsSuggestionsPathForRole,
} from "./authRoutes";

export const FOOTER_CONTACT_FALLBACKS = Object.freeze({
  phone: "+971 522857808",
  email: "info@orderzhouse.com",
  whatsapp: "+971 522857808",
  location: "الإمارات العربية المتحدة، دبي",
  visible: true,
  phoneVisible: true,
  emailVisible: true,
  whatsappVisible: true,
  locationVisible: true,
});

export const FOOTER_WORKING_HOURS_FALLBACKS = Object.freeze({
  title: "ساعات العمل",
  text: "نعمل على مدار الساعة لخدمتك",
  visible: true,
  titleVisible: true,
  textVisible: true,
});

export const FOOTER_CONTACT_CENTER_FALLBACKS = Object.freeze({
  visible: true,
  helperText: "للاقتراحات والشكاوى",
  helperTextVisible: true,
  buttonText: "مركز التواصل",
  buttonVisible: true,
});

/** Prior default copy — remapped on merge so stored legacy defaults update without a DB write. */
const FOOTER_CONTACT_CENTER_HELPER_LEGACY = "للاقتراحات والشكاوى اضغط هنا";

export {
  FOOTER_APP_DOWNLOAD_FALLBACKS,
  coalesceFooterAppText,
  coalesceFooterVisible,
  mergeFooterAppDownloads,
};

function coalesceContactCenterHelperText(raw) {
  const helper = coalesceFooterAppText(raw, FOOTER_CONTACT_CENTER_FALLBACKS.helperText);
  return helper === FOOTER_CONTACT_CENTER_HELPER_LEGACY
    ? FOOTER_CONTACT_CENTER_FALLBACKS.helperText
    : helper;
}

/**
 * @param {object|null|undefined} settings
 */
export function mergeFooterSettings(settings) {
  const contact = settings?.contact || {};
  const workingHours = settings?.workingHours || {};
  const contactCenter = settings?.contactCenter || {};
  const appDownload = settings?.appDownload || settings || {};

  return {
    contact: {
      phone: coalesceFooterAppText(contact.phone, FOOTER_CONTACT_FALLBACKS.phone),
      email: coalesceFooterAppText(contact.email, FOOTER_CONTACT_FALLBACKS.email),
      whatsapp: coalesceFooterAppText(contact.whatsapp, FOOTER_CONTACT_FALLBACKS.whatsapp),
      location: coalesceFooterAppText(contact.location, FOOTER_CONTACT_FALLBACKS.location),
      visible: coalesceFooterVisible(contact.visible, true),
      phoneVisible: coalesceFooterVisible(contact.phoneVisible, true),
      emailVisible: coalesceFooterVisible(contact.emailVisible, true),
      whatsappVisible: coalesceFooterVisible(contact.whatsappVisible, true),
      locationVisible: coalesceFooterVisible(contact.locationVisible, true),
    },
    workingHours: {
      title: coalesceFooterAppText(workingHours.title, FOOTER_WORKING_HOURS_FALLBACKS.title),
      text: coalesceFooterAppText(workingHours.text, FOOTER_WORKING_HOURS_FALLBACKS.text),
      visible: coalesceFooterVisible(workingHours.visible, true),
      titleVisible: coalesceFooterVisible(workingHours.titleVisible, true),
      textVisible: coalesceFooterVisible(workingHours.textVisible, true),
    },
    contactCenter: {
      visible: coalesceFooterVisible(contactCenter.visible, true),
      helperText: coalesceContactCenterHelperText(contactCenter.helperText),
      helperTextVisible: coalesceFooterVisible(contactCenter.helperTextVisible, true),
      buttonText: coalesceFooterAppText(
        contactCenter.buttonText,
        FOOTER_CONTACT_CENTER_FALLBACKS.buttonText,
      ),
      buttonVisible: coalesceFooterVisible(contactCenter.buttonVisible, true),
    },
    appDownload: mergeFooterAppDownloads(appDownload),
    updatedAt: settings?.updatedAt ?? null,
  };
}

/**
 * Contact items that should appear in the public footer.
 * @param {ReturnType<typeof mergeFooterSettings>["contact"]} contact
 */
export function getVisibleFooterContactItems(contact) {
  if (!coalesceFooterVisible(contact?.visible, true)) return [];
  const items = [];
  if (coalesceFooterVisible(contact?.phoneVisible, true)) items.push("phone");
  if (coalesceFooterVisible(contact?.emailVisible, true)) items.push("email");
  if (coalesceFooterVisible(contact?.whatsappVisible, true)) items.push("whatsapp");
  if (coalesceFooterVisible(contact?.locationVisible, true)) items.push("location");
  return items;
}

/**
 * Whether working-hours block should render (section + at least one child).
 * @param {ReturnType<typeof mergeFooterSettings>["workingHours"]} workingHours
 */
export function shouldRenderFooterWorkingHours(workingHours) {
  if (!coalesceFooterVisible(workingHours?.visible, true)) return false;
  return (
    coalesceFooterVisible(workingHours?.titleVisible, true) ||
    coalesceFooterVisible(workingHours?.textVisible, true)
  );
}

/**
 * Whether Contact Center block should render (section + at least one child).
 * @param {ReturnType<typeof mergeFooterSettings>["contactCenter"]} contactCenter
 */
export function shouldRenderFooterContactCenter(contactCenter) {
  if (!coalesceFooterVisible(contactCenter?.visible, true)) return false;
  return (
    coalesceFooterVisible(contactCenter?.helperTextVisible, true) ||
    coalesceFooterVisible(contactCenter?.buttonVisible, true)
  );
}

/**
 * Whether the contact+hours+center panel column should render.
 * @param {ReturnType<typeof mergeFooterSettings>["contact"]} contact
 * @param {ReturnType<typeof mergeFooterSettings>["workingHours"]} workingHours
 * @param {ReturnType<typeof mergeFooterSettings>["contactCenter"]} [contactCenter]
 */
export function shouldRenderFooterContactPanel(contact, workingHours, contactCenter) {
  return (
    getVisibleFooterContactItems(contact).length > 0 ||
    shouldRenderFooterWorkingHours(workingHours) ||
    shouldRenderFooterContactCenter(contactCenter)
  );
}

/**
 * Fixed Contact Center CTA destination (Problems & Suggestions workflow).
 * Returns pending while auth is hydrating — do not treat as logged-out.
 *
 * @param {{ role?: string, primaryRole?: string }|null|undefined} user
 * @param {boolean} authLoading
 * @returns {{ kind: 'pending' } | { kind: 'login', to: string, state: object } | { kind: 'internal', to: string } | { kind: 'dashboard', to: string }}
 */
export function resolveFooterContactCenterDestination(user, authLoading = false) {
  if (authLoading) {
    return { kind: "pending" };
  }

  const role = user?.primaryRole || user?.role;
  if (role) {
    const feedbackPath = getProblemsSuggestionsPathForRole(role);
    if (feedbackPath && canRoleAccessPath(feedbackPath, role)) {
      return { kind: "internal", to: feedbackPath };
    }
    return { kind: "dashboard", to: getDashboardPath(role) };
  }

  return {
    kind: "login",
    to: "/login",
    state: { [LOGIN_PROBLEMS_SUGGESTIONS_INTENT]: true },
  };
}

/**
 * @param {string} phoneLike
 */
export function buildFooterWhatsAppHref(phoneLike) {
  const digits = String(phoneLike || "").replace(/\D/g, "");
  if (!digits) {
    return `https://wa.me/${FOOTER_CONTACT_FALLBACKS.whatsapp.replace(/\D/g, "")}`;
  }
  return `https://wa.me/${digits}`;
}

/**
 * @param {string} phoneLike
 */
export function buildFooterTelHref(phoneLike) {
  const compact = String(phoneLike || "").replace(/[^\d+]/g, "");
  return compact ? `tel:${compact}` : `tel:${FOOTER_CONTACT_FALLBACKS.phone.replace(/[^\d+]/g, "")}`;
}
