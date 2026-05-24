import { useEffect, useState } from "react";

/** Preloads the public hero wallpaper and signals when it is safe to fade in. */
export function useHeroWallpaperReady(enabled = true) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return undefined;
    }

    let cancelled = false;
    const img = new Image();
    img.decoding = "async";

    const finish = () => {
      if (!cancelled) setReady(true);
    };

    img.onload = finish;
    img.onerror = finish;
    img.src = "/hero/background.webp";

    if (img.complete) finish();

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [enabled]);

  return ready;
}
