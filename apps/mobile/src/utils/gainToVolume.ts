/**
 * Đổi giá trị ReplayGain (dB) sang hệ số volume tuyến tính từ 0 đến 1.
 * Không khuếch đại vượt quá 1 (chặn ở 1 để tránh méo tiếng clipping).
 */
export function gainToVolume(gainDb: number | undefined): number {
  if (gainDb === undefined) return 1;
  return Math.min(1, Math.max(0, Math.pow(10, gainDb / 20)));
}
