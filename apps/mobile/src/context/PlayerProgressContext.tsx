import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { playerService } from '../services/player/rntpPlayerService';

export interface PlayerProgress {
  positionSec: number;
  durationSec: number;
  bufferedSec: number | null;
  progressPercent: number; // 0..100
}

const defaultProgress: PlayerProgress = {
  positionSec: 0,
  durationSec: 0,
  bufferedSec: null,
  progressPercent: 0,
};

const PlayerProgressContext = createContext<PlayerProgress>(defaultProgress);

export function PlayerProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<PlayerProgress>(defaultProgress);

  useEffect(() => {
    const unsubscribe = playerService.subscribe((state) => {
      const pos = Math.max(0, state.positionSec || 0);
      const dur = Math.max(0, state.durationSec || 0);
      const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;

      setProgress((prev) => {
        // Chỉ re-render nếu vị trí hoặc thời lượng có thay đổi thực tế
        if (
          Math.abs(prev.positionSec - pos) < 0.2 &&
          prev.durationSec === dur &&
          prev.bufferedSec === state.bufferedSec
        ) {
          return prev;
        }
        return {
          positionSec: pos,
          durationSec: dur,
          bufferedSec: state.bufferedSec ?? null,
          progressPercent: pct,
        };
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <PlayerProgressContext.Provider value={progress}>
      {children}
    </PlayerProgressContext.Provider>
  );
}

export function useProgress(): PlayerProgress {
  return useContext(PlayerProgressContext);
}
