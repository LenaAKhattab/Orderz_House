const ROLES = Object.freeze({
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  CLIENT: "client",
  FREELANCER: "freelancer",
});

/** Public signup may only assign these roles (see auth service). */
const PUBLIC_SIGNUP_ROLES = Object.freeze([ROLES.CLIENT, ROLES.FREELANCER]);

/** Allowed freelancer profile categories (slugs). */
const FREELANCER_CATEGORY_SLUGS = Object.freeze([
  "design",
  "content_writing",
  "development",
]);

module.exports = {
  ROLES,
  PUBLIC_SIGNUP_ROLES,
  FREELANCER_CATEGORY_SLUGS,
};
