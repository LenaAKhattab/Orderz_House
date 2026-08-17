/**
 * Hero wallpaper is applied once via CSS on `.home-public-layout`.
 * Do not create a second Image() / preload request for the same file.
 */
export function useHeroWallpaperReady(enabled = true) {
  return Boolean(enabled);
}
