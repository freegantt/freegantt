// Must trigger: B10 raf-single-owner (requestAnimationFrame called outside frame-scheduler.ts)
export function scheduleFrame(cb: () => void): number {
  return requestAnimationFrame(cb);
}
