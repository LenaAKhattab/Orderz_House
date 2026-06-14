const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mapPageRow } = require("../src/utils/publicSitePageMapper");

test("mapPageRow maps database columns to camelCase", () => {
  const mapped = mapPageRow({
    id: 1,
    slug: "privacy-policy",
    title: "بيان الخصوصية",
    menu_label: "بيان الخصوصية",
    content: "محتوى",
    meta_title: null,
    meta_description: "وصف",
    is_published: true,
    show_in_mobile_menu: true,
    show_in_footer: false,
    sort_order: 30,
    is_system: true,
    updated_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });

  assert.equal(mapped.slug, "privacy-policy");
  assert.equal(mapped.menuLabel, "بيان الخصوصية");
  assert.equal(mapped.isPublished, true);
  assert.equal(mapped.showInFooter, false);
  assert.equal(mapped.isSystem, true);
});
