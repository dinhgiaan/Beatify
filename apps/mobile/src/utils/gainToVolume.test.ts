import { describe, expect, it } from 'vitest';
import { gainToVolume } from './gainToVolume.js';

describe('gainToVolume', () => {
  it('returns 1 when gainDb is undefined', () => {
    expect(gainToVolume(undefined)).toBe(1);
  });

  it('returns 1 when gainDb is 0 dB', () => {
    expect(gainToVolume(0)).toBe(1);
  });

  it('calculates linear factor correctly for negative gain', () => {
    // -6 dB tương đương khoảng 0.501
    const vol = gainToVolume(-6);
    expect(vol).toBeCloseTo(0.501, 2);

    // -20 dB tương đương 0.1
    expect(gainToVolume(-20)).toBeCloseTo(0.1, 2);
  });

  it('clamps positive gain to 1 to avoid audio clipping', () => {
    expect(gainToVolume(3)).toBe(1);
    expect(gainToVolume(10)).toBe(1);
  });
});
