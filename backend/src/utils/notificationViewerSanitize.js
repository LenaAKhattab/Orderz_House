const { isStaffRole, joinDisplayName } = require("./orderViewerSanitize");

const SENSITIVE_METADATA_KEY_RE = /(userid|user_id|accountid|account_id|email|phone|createdby|assignedto|freelancerid|clientid)/i;

/** Never expose human-readable order numbers to non-staff via notification metadata. */
const ORDER_NUMBER_METADATA_KEYS = new Set(["orderCode", "orderNumber", "internalOrderCode", "order_reference", "orderRef"]);

function stripNotificationMetadata(meta) {
  if (!meta || typeof meta !== "object") return {};
  const out = { ...meta };
  for (const key of Object.keys(out)) {
    if (SENSITIVE_METADATA_KEY_RE.test(key)) delete out[key];
  }
  return out;
}

function stripOrderNumberMetadata(meta) {
  if (!meta || typeof meta !== "object") return {};
  const out = { ...meta };
  for (const k of ORDER_NUMBER_METADATA_KEYS) delete out[k];
  return out;
}

/** Non-staff API: no actor user/account ids; metadata redacted; actor is display-only. */
function sanitizeNotificationForViewer(mapped, viewerRole) {
  if (!mapped || typeof mapped !== "object") return mapped;
  if (isStaffRole(viewerRole)) return { ...mapped, metadata: mapped.metadata && typeof mapped.metadata === "object" ? { ...mapped.metadata } : {} };
  const out = { ...mapped };
  delete out.actorUserId;
  const meta0 = stripNotificationMetadata(mapped.metadata);
  out.metadata = stripOrderNumberMetadata(meta0);
  if (out.actor) {
    const a = out.actor;
    const displayName = a.fullName || joinDisplayName([a.firstName, a.fatherName, a.familyName]) || null;
    out.actor = { displayName };
  }
  return out;
}

module.exports = {
  stripNotificationMetadata,
  sanitizeNotificationForViewer,
};
