// 触觉反馈：H5 走 navigator.vibrate，App 走 uni.vibrateShort/Long
// L = 12ms 按键反馈, M = 25ms 中等, H = 60ms 强烈

const DURATIONS = { L: 12, M: 25, H: 60 };

export function vibrate(mode = 'L') {
  const ms = DURATIONS[mode] || 12;

  // #ifdef APP-PLUS
  if (mode === 'H') {
    uni.vibrateLong();
  } else {
    uni.vibrateShort({ type: mode === 'M' ? 'medium' : 'light' });
  }
  // #endif

  // #ifdef H5
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(ms);
  }
  // #endif
}
