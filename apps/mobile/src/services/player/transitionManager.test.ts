import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Track } from '@music-app/shared';
import {
  evaluateTransitionCompatibility,
  getTransitionCuePoints,
  calculateRealtimeFadeVolume,
} from '@music-app/shared';
import { TransitionManager } from './transitionManager';

// Mock TrackPlayer
vi.mock('@rntp/player', () => ({
  default: {
    setVolume: vi.fn(),
    skipToIndex: vi.fn(),
    seekTo: vi.fn(),
    preload: vi.fn(),
  },
}));

// Mock transitionPreferences
vi.mock('./transitionPreferences', () => ({
  loadTransitionSettings: vi.fn().mockResolvedValue({
    enabled: true,
    durationSec: 4,
    safeMode: false,
  }),
  saveTransitionSettings: vi.fn().mockResolvedValue({}),
  appendTransitionLog: vi.fn().mockResolvedValue({}),
  DEFAULT_TRANSITION_SETTINGS: {
    enabled: true,
    durationSec: 4,
    safeMode: false,
  },
}));

// Mock react-native AppState
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
  },
}));

describe('TransitionManager & Smart Transition Engine', () => {
  const trackA: Track = {
    id: 'track-1',
    title: 'Intro Beat',
    artist: 'Producer A',
    duration: 180,
    file: 'music/track-1.mp3',
    storage: 'r2',
    bpm: 120,
    key: '8A',
    introEnd: 5,
    outroStart: 172,
    replayGain: -3.0,
  };

  const trackB: Track = {
    id: 'track-2',
    title: 'Outro Drop',
    artist: 'Producer B',
    duration: 200,
    file: 'music/track-2.mp3',
    storage: 'r2',
    bpm: 124,
    key: '8A',
    introEnd: 6,
    outroStart: 192,
    replayGain: -1.5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tính toán cue points chính xác dựa trên metadata', () => {
    const cue = getTransitionCuePoints(trackA, trackB, 4);
    expect(cue.fadeStartSec).toBe(172);
    expect(cue.cutSec).toBe(176);
    expect(cue.nextStartSec).toBe(6);
    expect(cue.actualFadeDurationSec).toBe(4);
  });

  it('tính toán độ tương thích hài âm Camelot', () => {
    const compat = evaluateTransitionCompatibility(trackA, trackB, 4);
    expect(compat.relation).toBe('same');
    expect(compat.isHarmonic).toBe(true);
    expect(compat.isTempoMatched).toBe(true);
  });

  it('tính toán volume thời gian thực chuẩn theo Equal-Power', () => {
    const baseVolume = 0.7079; // ~ -3dB
    const startMs = 1000;
    const durationSec = 4;

    // Lúc bắt đầu: 100% volume
    const volStart = calculateRealtimeFadeVolume(baseVolume, startMs, durationSec, 1000, true);
    expect(volStart).toBe(0.7079);

    // Sau 2s (nửa chặng): ~ 70.7% của base
    const volMid = calculateRealtimeFadeVolume(baseVolume, startMs, durationSec, 3000, true);
    expect(volMid).toBeCloseTo(baseVolume * 0.7071, 3);

    // Sau khi kết thúc: 0
    const volEnd = calculateRealtimeFadeVolume(baseVolume, startMs, durationSec, 5000, true);
    expect(volEnd).toBe(0);
  });

  it('quản lý hàng đợi và cập nhật settings thành công', () => {
    const manager = new TransitionManager();
    manager.updateSettings({ enabled: true, durationSec: 5, safeMode: true });

    const settings = manager.getSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.durationSec).toBe(5);
    expect(settings.safeMode).toBe(true);

    manager.updateQueue([trackA, trackB], 'track-1');
  });

  it('phục hồi volume gốc của bài hiện tại khi restoreBaseVolume được gọi', async () => {
    const TrackPlayer = (await import('@rntp/player')).default;
    const manager = new TransitionManager();
    manager.updateQueue([trackA, trackB], 'track-1');

    manager.restoreBaseVolume('test_reason');
    // Với trackA replayGain = -3.0 dB: volume ≈ 0.7079
    expect(TrackPlayer.setVolume).toHaveBeenCalled();
  });
});

