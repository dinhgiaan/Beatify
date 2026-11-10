import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { Track } from '@music-app/shared';
import {
  loadOfflineIndex,
  downloadTrackOffline,
  deleteTrackOffline,
  deleteMultipleTracksOffline,
  clearAllOfflineTracks,
  getOfflineTotalSizeBytes,
  getAbsoluteOfflineUri,
  type OfflineIndex,
} from '../services/offline/offlineStorage';
import { useLibrary } from './LibraryContext';

export interface OfflineContextValue {
  offlineIndex: OfflineIndex;
  offlineTracks: Track[];
  totalSizeBytes: number;
  isDownloading: Record<string, boolean>;
  downloadTrack: (track: Track) => Promise<void>;
  deleteOfflineTrack: (trackId: string) => Promise<void>;
  deleteMultipleOfflineTracks: (trackIds: string[]) => Promise<void>;
  clearAllOffline: () => Promise<void>;
  isTrackOffline: (trackId: string) => boolean;
  getOfflineAudioUri: (trackId: string) => string | null;
  getOfflineLyrics: (trackId: string) => Promise<string | null>;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { serverUrl, serverToken, fetchLyrics } = useLibrary();
  const [offlineIndex, setOfflineIndex] = useState<OfflineIndex>({});
  const [isDownloading, setIsDownloading] = useState<Record<string, boolean>>({});

  // Khởi tạo nạp index khi app khởi động
  useEffect(() => {
    let isMounted = true;
    loadOfflineIndex()
      .then((idx) => {
        if (isMounted) setOfflineIndex(idx);
      })
      .catch((err) => {
        console.warn('[OfflineProvider] Lỗi nạp index offline ban đầu:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const totalSizeBytes = useMemo(() => {
    return getOfflineTotalSizeBytes(offlineIndex);
  }, [offlineIndex]);

  // Chuyển đổi các bài hát trong index thành mảng Track để hiển thị & phát lại
  const offlineTracks = useMemo<Track[]>(() => {
    return Object.values(offlineIndex).map((meta): Track => {
      const coverUri = meta.coverRelPath ? getAbsoluteOfflineUri(meta.coverRelPath) : undefined;
      const audioUri = getAbsoluteOfflineUri(meta.audioRelPath);
      return {
        id: meta.trackId,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        duration: meta.duration || 0,
        file: audioUri,
        storage: 'r2',
        cover: coverUri,
      };
    });
  }, [offlineIndex]);

  const isTrackOffline = useCallback(
    (trackId: string): boolean => {
      return Boolean(offlineIndex[trackId]);
    },
    [offlineIndex]
  );

  const getOfflineAudioUri = useCallback(
    (trackId: string): string | null => {
      const meta = offlineIndex[trackId];
      if (!meta) return null;
      return getAbsoluteOfflineUri(meta.audioRelPath);
    },
    [offlineIndex]
  );

  const getOfflineLyrics = useCallback(
    async (trackId: string): Promise<string | null> => {
      const meta = offlineIndex[trackId];
      if (!meta || !meta.lyricsRelPath) return null;
      try {
        const absUri = getAbsoluteOfflineUri(meta.lyricsRelPath);
        const info = await FileSystem.getInfoAsync(absUri);
        if (info.exists) {
          return await FileSystem.readAsStringAsync(absUri);
        }
      } catch (err) {
        console.warn('[OfflineProvider] Lỗi đọc lyrics offline:', err);
      }
      return null;
    },
    [offlineIndex]
  );

  const downloadTrack = useCallback(
    async (track: Track): Promise<void> => {
      if (offlineIndex[track.id]) {
        Alert.alert('Đã tải', 'Bài hát này đã có sẵn trên máy của bạn.');
        return;
      }
      if (isDownloading[track.id]) {
        return;
      }

      setIsDownloading((prev) => ({ ...prev, [track.id]: true }));
      try {
        // Tải lyrics trước (nếu có) để lưu trọn bộ
        let lrcContent: string | null = null;
        try {
          lrcContent = await fetchLyrics(track.id);
        } catch {
          // Bỏ qua lỗi lyrics nếu không có
        }

        const meta = await downloadTrackOffline(track, serverUrl, serverToken, lrcContent);
        setOfflineIndex((prev) => ({ ...prev, [track.id]: meta }));
      } catch (err) {
        console.error('[OfflineProvider] Tải bài hát thất bại:', err);
        Alert.alert('Tải bài hát thất bại', err instanceof Error ? err.message : 'Lỗi kết nối máy chủ');
      } finally {
        setIsDownloading((prev) => {
          const next = { ...prev };
          Reflect.deleteProperty(next, track.id);
          return next;
        });
      }
    },
    [offlineIndex, isDownloading, serverUrl, serverToken, fetchLyrics]
  );

  const deleteOfflineTrack = useCallback(async (trackId: string): Promise<void> => {
    const updated = await deleteTrackOffline(trackId);
    setOfflineIndex(updated);
  }, []);

  const deleteMultipleOfflineTracks = useCallback(async (trackIds: string[]): Promise<void> => {
    const updated = await deleteMultipleTracksOffline(trackIds);
    setOfflineIndex(updated);
  }, []);

  const clearAllOffline = useCallback(async (): Promise<void> => {
    await clearAllOfflineTracks();
    setOfflineIndex({});
  }, []);

  const value = useMemo(
    () => ({
      offlineIndex,
      offlineTracks,
      totalSizeBytes,
      isDownloading,
      downloadTrack,
      deleteOfflineTrack,
      deleteMultipleOfflineTracks,
      clearAllOffline,
      isTrackOffline,
      getOfflineAudioUri,
      getOfflineLyrics,
    }),
    [
      offlineIndex,
      offlineTracks,
      totalSizeBytes,
      isDownloading,
      downloadTrack,
      deleteOfflineTrack,
      deleteMultipleOfflineTracks,
      clearAllOffline,
      isTrackOffline,
      getOfflineAudioUri,
      getOfflineLyrics,
    ]
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineContextValue {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return ctx;
}
