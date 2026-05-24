import { useEffect, useRef, useState } from "react";

/**
 * Image with blur-up fade-in — keeps layout stable via width/height attrs on caller side.
 * @param {{
 *   src: string;
 *   alt?: string;
 *   className?: string;
 *   width?: number | string;
 *   height?: number | string;
 *   priority?: boolean;
 *   onLoad?: () => void;
 * }} p
 */
export default function ProgressiveImage({
  src,
  alt = "",
  className = "",
  width,
  height,
  priority = false,
  onLoad,
  ...rest
}) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    setLoaded(false);
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      className={`progressive-img${loaded ? " progressive-img--loaded" : ""}${className ? ` ${className}` : ""}`.trim()}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      {...rest}
    />
  );
}
