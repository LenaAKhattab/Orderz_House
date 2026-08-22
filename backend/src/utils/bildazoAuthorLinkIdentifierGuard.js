/**
 * Shared Bildazo writer identifier duplicate guard (avoids service circular imports).
 */
const { createAppError } = require("./AppError");
const { BILDAZO_AUTHOR_LINK_ERROR_CODES } = require("../constants/bildazoAuthorLink");

async function assertBildazoWriterIdentifierAvailableForFreelancer(
  { excludeFreelancerUserId = null, excludeLinkId = null, bildazoUserId, bildazoPublicId, bildazoProfileUrl },
  db,
) {
  const uid = excludeFreelancerUserId != null ? Number(excludeFreelancerUserId) : null;
  const linkId = excludeLinkId != null ? Number(excludeLinkId) : null;
  const params = [
    uid && Number.isInteger(uid) ? uid : null,
    linkId && Number.isInteger(linkId) ? linkId : null,
    bildazoUserId || null,
    bildazoPublicId || null,
    bildazoProfileUrl || null,
  ];
  const { rows } = await db.query(
    `SELECT id, freelancer_user_id FROM freelancer_bildazo_author_links
      WHERE status = 'linked'
        AND ($1::bigint IS NULL OR freelancer_user_id <> $1)
        AND ($2::bigint IS NULL OR id <> $2)
        AND (
          ($3::text IS NOT NULL AND bildazo_user_id = $3)
          OR ($4::text IS NOT NULL AND bildazo_public_id = $4)
          OR ($5::text IS NOT NULL AND bildazo_profile_url = $5)
        )
      LIMIT 1`,
    params,
  );
  if (rows[0]) {
    throw createAppError("معرّف Bildazo هذا مرتبط بمستقل آخر.", 409, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_IDENTIFIER_IN_USE,
    });
  }
}

module.exports = {
  assertBildazoWriterIdentifierAvailableForFreelancer,
};
