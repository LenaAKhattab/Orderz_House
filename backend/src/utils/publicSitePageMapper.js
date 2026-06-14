function mapPageRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    menuLabel: row.menu_label,
    content: row.content,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    isPublished: row.is_published,
    showInMobileMenu: row.show_in_mobile_menu,
    showInFooter: row.show_in_footer,
    sortOrder: row.sort_order,
    isSystem: row.is_system,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPublicListRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    menuLabel: row.menu_label,
    sortOrder: row.sort_order,
    showInMobileMenu: row.show_in_mobile_menu,
    showInFooter: row.show_in_footer,
  };
}

function mapPublicDetailRow(row) {
  return {
    slug: row.slug,
    title: row.title,
    menuLabel: row.menu_label,
    content: row.content,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
  };
}

module.exports = {
  mapPageRow,
  mapPublicListRow,
  mapPublicDetailRow,
};
