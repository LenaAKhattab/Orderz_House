/**
 * Built-in promo visual assets (served from /public/Ads).
 * @typedef {{
 *   key: string;
 *   label: string;
 *   url: string;
 *   thumbUrl: string;
 *   bannerUrl?: string;
 *   presentation?: "default" | "corner";
 *   corner?: "top-start" | "top-end" | "bottom-start" | "bottom-end";
 *   blendScreen?: boolean;
 * }} AdVisualAsset
 */

/** @type {readonly AdVisualAsset[]} */
export const AD_VISUAL_ASSETS = Object.freeze([
  {
    key: "handshake",
    label: "مصافحة / شراكة",
    url: "/Ads/ad-handshake.png",
    thumbUrl: "/Ads/ad-handshake.png",
  },
  {
    key: "gold_confetti",
    label: "احتفال ذهبي",
    url: "/Ads/ad-gold-confetti.png",
    thumbUrl: "/Ads/ad-gold-confetti.png",
    blendScreen: true,
  },
  {
    key: "smiley_face",
    label: "وجه مبتسم",
    url: "/Ads/ad-smiley-face.png",
    thumbUrl: "/Ads/ad-smiley-face.png",
    blendScreen: true,
  },
  {
    key: "red_gift",
    label: "صندوق هدية أحمر",
    url: "/Ads/ad-red-gift.png",
    thumbUrl: "/Ads/ad-red-gift.png",
  },
  {
    key: "gold_gifts",
    label: "هدايا ذهبية",
    url: "/Ads/ad-gold-gifts.png",
    thumbUrl: "/Ads/ad-gold-gifts.png",
  },
]);

export const AD_ASSET_KEYS = AD_VISUAL_ASSETS.map((a) => a.key);

/**
 * @param {string | null | undefined} key
 * @returns {AdVisualAsset | null}
 */
export function getAdVisualAsset(key) {
  const k = key != null ? String(key).trim() : "";
  if (!k) return null;
  if (k === "red_ribbon") return AD_VISUAL_ASSETS.find((a) => a.key === "gold_confetti") || null;
  return AD_VISUAL_ASSETS.find((a) => a.key === k) || null;
}

/**
 * @param {string | null | undefined} key
 * @returns {string | null}
 */
export function resolveAdAssetUrl(key) {
  const asset = getAdVisualAsset(key);
  return asset ? asset.url : null;
}

/**
 * URL used on the live banner (same asset file; corner layout is CSS-only).
 * @param {string | null | undefined} key
 * @returns {string | null}
 */
export function resolveAdAssetBannerUrl(key) {
  return resolveAdAssetUrl(key);
}

/**
 * @param {string | null | undefined} key
 * @returns {boolean}
 */
export function isCornerAdAsset(key) {
  const asset = getAdVisualAsset(key);
  return asset?.presentation === "corner";
}
