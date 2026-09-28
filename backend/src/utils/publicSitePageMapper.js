function mapPageRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    menuLabel: row.menu_label,
    content: row.content,
    titleEn: row.title_en || null,
    menuLabelEn: row.menu_label_en || null,
    contentEn: row.content_en || null,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    metaTitleEn: row.meta_title_en || null,
    metaDescriptionEn: row.meta_description_en || null,
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
    titleEn: row.title_en || null,
    menuLabelEn: row.menu_label_en || null,
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
    titleEn: row.title_en || null,
    menuLabelEn: row.menu_label_en || null,
    contentEn: row.content_en || null,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    metaTitleEn: row.meta_title_en || null,
    metaDescriptionEn: row.meta_description_en || null,
  };
}

module.exports = {
  mapPageRow,
  mapPublicListRow,
  mapPublicDetailRow,
};
