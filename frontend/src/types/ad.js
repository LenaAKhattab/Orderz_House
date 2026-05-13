/**
 * @typedef {Object} AdTextBlock
 * @property {string} id
 * @property {string} content
 * @property {string} [color]
 * @property {string} [fontSize]
 * @property {string} [fontWeight]
 * @property {"top"|"middle"|"bottom"} [position]
 */

/**
 * @typedef {Object} AdImage
 * @property {string} id
 * @property {string} url
 * @property {string} [alt]
 * @property {"top"|"bottom"|"left"|"right"|"background"} [position]
 * @property {"cover"|"contain"} [objectFit]
 */

/**
 * @typedef {Object} Ad
 * @property {string} id
 * @property {string} title
 * @property {string|null} [subtitle]
 * @property {string|null} [description]
 * @property {string|null} [badgeText]
 * @property {string|null} [badgeColor]
 * @property {AdTextBlock[]} texts
 * @property {AdImage[]} images
 * @property {string|null} [ctaText]
 * @property {string|null} [ctaUrl]
 * @property {string|null} [secondaryCtaText]
 * @property {string|null} [secondaryCtaUrl]
 * @property {boolean} openInNewTab
 * @property {string|null} [backgroundColor]
 * @property {string|null} [gradientFrom]
 * @property {string|null} [gradientTo]
 * @property {string|null} [titleColor]
 * @property {string|null} [textColor]
 * @property {string|null} [buttonColor]
 * @property {string|null} [buttonTextColor]
 * @property {string|null} [borderColor]
 * @property {"image_top"|"image_background"|"text_only"|"split"|"minimal_banner"|"carousel"} layoutType
 * @property {"right"|"center"|"left"} textAlign
 * @property {"top"|"bottom"|"left"|"right"|"background"} imagePosition
 * @property {"bottom"|"inline"|"overlay"} buttonPosition
 * @property {boolean} isActive
 * @property {boolean} isSticky
 * @property {boolean} isClickableCard
 * @property {boolean} [isFeatured]
 * @property {"purple"|"green"|"orange"|"blue"|null} [themePreset]
 * @property {"home_right_panel"|"home_after_hero"|"services_page"|"global_sidebar"} placement
 * @property {number} sortOrder
 * @property {string|null} [startDate]
 * @property {string|null} [endDate]
 * @property {number} [impressionCount]
 * @property {number} [clickCount]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

export {};
