/** Wait for two animation frames so React commit + layout/paint can settle. */
export function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}
