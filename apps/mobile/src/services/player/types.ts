import type { Track } from '@music-app/shared';

export type RepeatMode = 'off' | 'track' | 'queue';

export interface PlayerState {
  isPlaying: boolean;
  isBuffering: boolean;
  activeTrackId: string | null;
  positionSec: number;
  durationSec: number;
  bufferedSec: number | null;
}

/**
 * Giao diện trừu tượng độc lập với thư viện audio
 * Đảm bảo nguyên tắc Dependency Inversion: UI và State chỉ nói chuyện qua IPlayerService
 */
export interface IPlayerService {
  setup(): Promise<void>;
  playQueue(tracks: Track[], startIndex: number): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  skipToIndex(index: number): Promise<void>;
  seekTo(seconds: number): Promise<void>;
  setRepeatMode(mode: RepeatMode): Promise<void>;
  getQueue(): Promise<Track[]>;
  updateLockScreenTimer?(timerText: string | null): void;
  subscribe(listener: (state: PlayerState) => void): () => void;
}
