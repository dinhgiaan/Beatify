import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { Linking, Vibration, Alert } from 'react-native';
import {
  type Track,
  type Album,
  type UpdateTrack,
  type UserState,
  mergeUserStates,
  interleaveTracksByArtist,
} from '@music-app/shared';
import { MusicApiClient } from '../services/api/musicApiClient';
import { parseMobileprovisionExpiration } from '../utils/mobileprovision';

export interface LibraryContextValue {
  tracks: Track[];
  setTracks: React.Dispatch<React.SetStateAction<Track[]>>;
  originalTracks: Track[];
  setOriginalTracks: React.Dispatch<React.SetStateAction<Track[]>>;
  albums: Album[];
  userState: UserState;
  serverUrl: string;
  setServerUrl: (url: string) => void;
  serverToken: string;
  setServerToken: (token: string) => void;
  isSyncing: boolean;
  syncStatus: string | null;
  setSyncStatus: (status: string | null) => void;
  expirationDate: string | null;
  lastSyncTime: string | null;
  currentEtag: string | null;
  lastSyncError: string | null;
  syncLibrary: (options?: { silent?: boolean; force?: boolean }) => Promise<void>;
  clearLibraryCache: () => Promise<void>;
  updateUserState: (updater: (prev: UserState) => UserState) => Promise<void>;
  toggleFavorite: (trackId: string) => Promise<void>;
  fetchLyrics: (trackId: string) => Promise<string | null>;
  saveTrack: (trackId: string, updates: UpdateTrack) => Promise<void>;
  deleteTrack: (trackId: string, onDeleted?: (trackId: string, remaining: Track[]) => Promise<void> | void) => Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

const CONFIG_FILE = `${FileSystem.documentDirectory || ''}beatify_server_config.json`;
const USER_STATE_FILE = `${FileSystem.documentDirectory || ''}beatify_user_state.json`;
const LIBRARY_CACHE_FILE = `${FileSystem.documentDirectory || ''}beatify_library_cache.json`;

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [originalTracks, setOriginalTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [userState, setUserState] = useState<UserState>({
    version: 1,
    updatedAt: new Date().toISOString(),
    playlists: [],
    favoriteIds: [],
  });

  const [serverUrl, setServerUrl] = useState<string>(
    process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8787'
  );
  const [serverToken, setServerToken] = useState<string>(
    process.env.EXPO_PUBLIC_API_TOKEN || ''
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [expirationDate, setExpirationDate] = useState<string | null>('Đang kiểm tra...');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [currentEtag, setCurrentEtag] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  const saveLibraryCache = async (payload: {
    etag: string | null;
    lastSyncTime: string;
    data: { version: number; generatedAt: string; tracks: Track[]; albums: Album[] };
  }) => {
    try {
      const tmpPath = `${LIBRARY_CACHE_FILE}.tmp`;
      await FileSystem.writeAsStringAsync(tmpPath, JSON.stringify(payload));
      try {
        await FileSystem.moveAsync({ from: tmpPath, to: LIBRARY_CACHE_FILE });
      } catch {
        await FileSystem.deleteAsync(LIBRARY_CACHE_FILE, { idempotent: true });
        await FileSystem.moveAsync({ from: tmpPath, to: LIBRARY_CACHE_FILE });
      }
    } catch (err) {
      console.warn('Lỗi ghi cache thư viện:', err);
    }
  };

  const syncLibraryInternal = useCallback(
    async (params: {
      url: string;
      token: string;
      etag: string | null;
      silent: boolean;
      force: boolean;
    }) => {
      const { url, token, etag, silent, force } = params;
      setIsSyncing(true);
      if (!silent) setSyncStatus('Đang kiểm tra bài mới từ Cloudflare R2...');

      try {
        const client = new MusicApiClient({ baseUrl: url, token });
        const etagToSend = force ? null : etag;
        const result = await client.fetchLibraryWithETag(etagToSend);

        const nowIso = new Date().toISOString();
        setLastSyncTime(nowIso);
        setLastSyncError(null);

        if (result.notModified) {
          setSyncStatus('Thư viện đã là mới nhất (304 Not Modified)');
          try {
            const cacheInfo = await FileSystem.getInfoAsync(LIBRARY_CACHE_FILE);
            if (cacheInfo.exists) {
              const raw = await FileSystem.readAsStringAsync(LIBRARY_CACHE_FILE);
              const parsed = JSON.parse(raw);
              parsed.lastSyncTime = nowIso;
              await saveLibraryCache(parsed);
            }
          } catch {
            // Bỏ qua lỗi cập nhật timestamp cache
          }
        } else if (result.data) {
          const balanced = interleaveTracksByArtist(result.data.tracks);
          setTracks(balanced);
          setOriginalTracks(balanced);
          setAlbums(result.data.albums || []);
          setCurrentEtag(result.etag || null);
          setSyncStatus(`Đã đồng bộ ${result.data.tracks.length} bài hát từ Cloudflare!`);

          await saveLibraryCache({
            etag: result.etag || null,
            lastSyncTime: nowIso,
            data: {
              version: result.data.version,
              generatedAt: result.data.generatedAt,
              tracks: balanced,
              albums: result.data.albums || [],
            },
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLastSyncError(msg);
        setSyncStatus(`Lỗi đồng bộ: ${msg}`);
        if (!silent) {
          Alert.alert('Lỗi đồng bộ Cloudflare', msg);
        }
      } finally {
        setIsSyncing(false);
      }
    },
    []
  );

  // 1. Tự động nạp bộ nhớ đệm thư viện từ beatify_library_cache.json (Zero Flash) & cấu hình server
  useEffect(() => {
    async function loadSavedData() {
      let loadedEtag: string | null = null;
      let loadedUrl: string | null = null;
      let loadedToken: string | null = null;

      // Nạp cache thư viện trước tiên
      try {
        const cacheInfo = await FileSystem.getInfoAsync(LIBRARY_CACHE_FILE);
        if (cacheInfo.exists) {
          const raw = await FileSystem.readAsStringAsync(LIBRARY_CACHE_FILE);
          const parsed = JSON.parse(raw);
          if (parsed && parsed.data && Array.isArray(parsed.data.tracks)) {
            setTracks(parsed.data.tracks);
            setOriginalTracks(parsed.data.tracks);
            setAlbums(parsed.data.albums || []);
            if (parsed.etag) {
              loadedEtag = parsed.etag;
              setCurrentEtag(parsed.etag);
            }
            if (parsed.lastSyncTime) setLastSyncTime(parsed.lastSyncTime);
          }
        }
      } catch (err) {
        console.warn('Lỗi nạp cache thư viện:', err);
      }

      // Nạp cấu hình server
      try {
        const info = await FileSystem.getInfoAsync(CONFIG_FILE);
        if (info.exists) {
          const raw = await FileSystem.readAsStringAsync(CONFIG_FILE);
          const data = JSON.parse(raw);
          if (data.serverUrl) {
            loadedUrl = data.serverUrl;
            setServerUrl(data.serverUrl);
          }
          if (data.serverToken !== undefined) {
            loadedToken = data.serverToken;
            setServerToken(data.serverToken);
          }
        }
      } catch (err) {
        console.warn('Lỗi đọc cấu hình server đã lưu:', err);
      }

      // Kích hoạt đồng bộ ngầm ETag nếu có URL
      const targetUrl = (loadedUrl || process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8787').trim().replace(/\/+$/, '');
      const targetToken = (loadedToken ?? process.env.EXPO_PUBLIC_API_TOKEN ?? '').trim();
      if (targetUrl) {
        syncLibraryInternal({
          url: targetUrl,
          token: targetToken,
          etag: loadedEtag,
          silent: true,
          force: false,
        }).catch(() => {});
      }
    }

    loadSavedData();
  }, [syncLibraryInternal]);

  // 2. Tự động nạp UserState (Playlists & Favorites) từ local cache và đồng bộ từ server
  useEffect(() => {
    async function loadUserState() {
      let localState: UserState = {
        version: 1,
        updatedAt: new Date(0).toISOString(),
        playlists: [],
        favoriteIds: [],
      };

      try {
        const info = await FileSystem.getInfoAsync(USER_STATE_FILE);
        if (info.exists) {
          const raw = await FileSystem.readAsStringAsync(USER_STATE_FILE);
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.playlists) && Array.isArray(parsed.favoriteIds)) {
            localState = parsed;
            setUserState(parsed);
          }
        }
      } catch (err) {
        console.warn('Lỗi đọc user state từ máy:', err);
      }

      const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
      const cleanToken = serverToken.trim();
      if (cleanUrl) {
        try {
          const client = new MusicApiClient({ baseUrl: cleanUrl, token: cleanToken });
          const remoteState = await client.fetchUserState();
          if (remoteState) {
            const merged = mergeUserStates(localState, remoteState);
            setUserState(merged);
            await FileSystem.writeAsStringAsync(USER_STATE_FILE, JSON.stringify(merged, null, 2));

            if (JSON.stringify(merged) !== JSON.stringify(remoteState)) {
              await client.saveUserState(merged).catch((e) => {
                console.warn('Lỗi tự động đẩy merged state lên server:', e);
              });
            }
          }
        } catch (err) {
          console.warn('Không thể đồng bộ UserState từ server:', err);
        }
      }
    }
    loadUserState();
  }, [serverUrl, serverToken]);

  // 3. Đọc ngày hết hạn từ file embedded.mobileprovision trong bundle ứng dụng
  useEffect(() => {
    async function loadProvisionExpiration() {
      try {
        const bundleDir = FileSystem.bundleDirectory;
        if (!bundleDir) {
          setExpirationDate('Không tìm thấy bundleDirectory (Dev/Sim)');
          return;
        }

        const profilePath = `${bundleDir}embedded.mobileprovision`;
        const fileInfo = await FileSystem.getInfoAsync(profilePath);
        if (!fileInfo.exists) {
          setExpirationDate('Chưa có embedded.mobileprovision (Simulator hoặc chưa build IPA)');
          return;
        }

        const base64Data = await FileSystem.readAsStringAsync(profilePath, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const date = parseMobileprovisionExpiration(base64Data);
        if (date) {
          setExpirationDate(date.toLocaleString('vi-VN'));
        } else {
          setExpirationDate('Không bóc tách được ExpirationDate từ file');
        }
      } catch (err) {
        setExpirationDate(`Lỗi đọc file: ${String(err)}`);
      }
    }

    loadProvisionExpiration();
  }, []);

  // 4. Lắng nghe Deep Link khi quét mã QR: beatify://connect?api=...&token=... (Đăng ký ĐÚNG 1 LẦN)
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      try {
        if (!event.url) return;
        const rawUrl = event.url;
        if (rawUrl.includes('connect?') || rawUrl.includes('api=')) {
          const queryString = rawUrl.split('?')[1];
          if (!queryString) return;
          const params = new URLSearchParams(queryString);
          const newApiUrl = params.get('api');
          const newToken = params.get('token') || '';

          if (newApiUrl) {
            const cleanUrl = decodeURIComponent(newApiUrl).trim().replace(/\/+$/, '');
            const cleanToken = decodeURIComponent(newToken).trim();
            setServerUrl(cleanUrl);
            setServerToken(cleanToken);

            // Lưu vĩnh viễn cấu hình vào ổ đĩa điện thoại
            FileSystem.writeAsStringAsync(
              CONFIG_FILE,
              JSON.stringify({ serverUrl: cleanUrl, serverToken: cleanToken })
            ).catch((e) => console.warn('Lỗi ghi file cấu hình server:', e));

            Vibration.vibrate([0, 80, 50, 80]);
            Alert.alert(
              'Kết nối thành công! 🎉',
              `Đã nhận cấu hình máy chủ từ mã QR của Beatify Dashboard:\n\nServer: ${cleanUrl}\n\nĐang tự động đồng bộ thư viện nhạc...`
            );

            // Tự động tải thư viện ngay
            try {
              setIsSyncing(true);
              setSyncStatus('Đang tải danh sách bài hát...');
              const client = new MusicApiClient({ baseUrl: cleanUrl, token: cleanToken });
              const lib = await client.fetchLibrary();
              setTracks(lib.tracks);
              setOriginalTracks(lib.tracks);
              setAlbums(lib.albums || []);
              setSyncStatus(`Đã đồng bộ ${lib.tracks.length} bài hát từ Cloudflare!`);
            } catch (syncErr) {
              setSyncStatus(`Lỗi tải nhạc: ${String(syncErr)}`);
            } finally {
              setIsSyncing(false);
            }
          }
        }
      } catch (err) {
        console.warn('Lỗi xử lý Deep Link:', err);
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => {
      subscription.remove();
    };
  }, []);

  // 5. Cập nhật UserState (lưu local + đồng bộ Cloudflare R2)
  const updateUserState = useCallback(async (updater: (prev: UserState) => UserState) => {
    let nextState: UserState | null = null;
    setUserState((prev) => {
      nextState = updater(prev);
      nextState.updatedAt = new Date().toISOString();
      return nextState;
    });

    if (nextState) {
      const stateToSave = nextState;
      try {
        await FileSystem.writeAsStringAsync(USER_STATE_FILE, JSON.stringify(stateToSave, null, 2));
      } catch (err) {
        console.warn('Lỗi ghi UserState local:', err);
      }

      const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
      const cleanToken = serverToken.trim();
      if (cleanUrl) {
        try {
          const client = new MusicApiClient({ baseUrl: cleanUrl, token: cleanToken });
          await client.saveUserState(stateToSave);
          setSyncStatus('Đã đồng bộ danh sách phát & yêu thích lên Cloudflare R2!');
        } catch (err) {
          console.warn('Lỗi đồng bộ UserState lên Cloudflare:', err);
        }
      }
    }
  }, [serverUrl, serverToken]);

  // 6. Toggle Favorite
  const toggleFavorite = useCallback(async (trackId: string) => {
    Vibration.vibrate(10);
    await updateUserState((prev) => {
      const isFav = prev.favoriteIds.includes(trackId);
      return {
        ...prev,
        favoriteIds: isFav
          ? prev.favoriteIds.filter((id) => id !== trackId)
          : [...prev.favoriteIds, trackId],
      };
    });
  }, [updateUserState]);

  // 7. Tải lyrics từ Cloudflare R2
  const fetchLyrics = useCallback(async (trackId: string): Promise<string | null> => {
    const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
    const cleanToken = serverToken.trim();
    if (!cleanUrl) return null;
    try {
      const client = new MusicApiClient({ baseUrl: cleanUrl, token: cleanToken });
      return await client.fetchLyrics(trackId);
    } catch (err) {
      console.warn('Lỗi tải lyrics từ máy chủ:', err);
      return null;
    }
  }, [serverUrl, serverToken]);

  // 8. Đồng bộ thư viện với Cloudflare R2 (hỗ trợ ETag & Force refresh)
  const syncLibrary = useCallback(
    async (options?: { silent?: boolean; force?: boolean }) => {
      const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
      const cleanToken = serverToken.trim();
      if (!cleanUrl) {
        if (!options?.silent) {
          Alert.alert('Chưa nhập Server URL', 'Vui lòng nhập địa chỉ Worker hoặc quét mã QR từ Dashboard');
        }
        return;
      }

      FileSystem.writeAsStringAsync(
        CONFIG_FILE,
        JSON.stringify({ serverUrl: cleanUrl, serverToken: cleanToken })
      ).catch(() => {});

      await syncLibraryInternal({
        url: cleanUrl,
        token: cleanToken,
        etag: currentEtag,
        silent: options?.silent ?? false,
        force: options?.force ?? false,
      });
    },
    [serverUrl, serverToken, currentEtag, syncLibraryInternal]
  );

  // 8b. Xóa bộ nhớ đệm thư viện và tải lại từ đầu
  const clearLibraryCache = useCallback(async () => {
    try {
      await FileSystem.deleteAsync(LIBRARY_CACHE_FILE, { idempotent: true });
      setCurrentEtag(null);
      setLastSyncTime(null);
      setLastSyncError(null);
      await syncLibrary({ silent: false, force: true });
    } catch (err) {
      console.warn('Lỗi xóa cache thư viện:', err);
    }
  }, [syncLibrary]);

  // 9. Lưu thông tin chỉnh sửa bài hát
  const saveTrack = useCallback(async (trackId: string, updates: UpdateTrack) => {
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id === trackId) {
          return {
            ...t,
            ...(updates.title !== undefined ? { title: updates.title } : {}),
            ...(updates.artist !== undefined ? { artist: updates.artist } : {}),
            ...(updates.album !== undefined ? { album: updates.album } : {}),
            ...(updates.year !== undefined ? { year: updates.year } : {}),
          };
        }
        return t;
      })
    );

    setOriginalTracks((prev) =>
      prev.map((t) => {
        if (t.id === trackId) {
          return {
            ...t,
            ...(updates.title !== undefined ? { title: updates.title } : {}),
            ...(updates.artist !== undefined ? { artist: updates.artist } : {}),
            ...(updates.album !== undefined ? { album: updates.album } : {}),
            ...(updates.year !== undefined ? { year: updates.year } : {}),
          };
        }
        return t;
      })
    );

    const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
    const cleanToken = serverToken.trim();
    if (cleanUrl && !trackId.startsWith('custom-')) {
      try {
        const client = new MusicApiClient({ baseUrl: cleanUrl, token: cleanToken });
        await client.updateTrack(trackId, updates);
        setSyncStatus(`Đã lưu và đồng bộ "${updates.title || 'bài hát'}" lên Cloudflare R2!`);
      } catch (err) {
        console.warn('Lỗi đồng bộ Cloudflare:', err);
        setSyncStatus(`Lưu cục bộ thành công (Đồng bộ Cloudflare thất bại: ${String(err)})`);
      }
    } else {
      setSyncStatus(`Đã cập nhật bài hát "${updates.title || ''}" trên app`);
    }
  }, [serverUrl, serverToken]);

  // 10. Xóa bài hát
  const deleteTrack = useCallback(async (
    trackId: string,
    onDeleted?: (deletedId: string, remaining: Track[]) => Promise<void> | void
  ) => {
    let remainingTracks: Track[] = [];
    setTracks((prev) => {
      remainingTracks = prev.filter((t) => t.id !== trackId);
      return remainingTracks;
    });

    setOriginalTracks((prev) => prev.filter((t) => t.id !== trackId));

    if (onDeleted) {
      await onDeleted(trackId, remainingTracks);
    }

    const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
    const cleanToken = serverToken.trim();
    if (cleanUrl && !trackId.startsWith('custom-')) {
      try {
        const client = new MusicApiClient({ baseUrl: cleanUrl, token: cleanToken });
        await client.deleteTrack(trackId);
        setSyncStatus(`Đã chuyển bài hát vào thùng rác trên Cloudflare R2!`);
      } catch (err) {
        console.warn('Lỗi xóa trên Cloudflare:', err);
        setSyncStatus(`Đã xóa khỏi app (Đồng bộ Cloudflare thất bại: ${String(err)})`);
      }
    } else {
      setSyncStatus('Đã xóa bài hát khỏi danh sách phát');
    }
  }, [serverUrl, serverToken]);

  return (
    <LibraryContext.Provider
      value={{
        tracks,
        setTracks,
        originalTracks,
        setOriginalTracks,
        albums,
        userState,
        serverUrl,
        setServerUrl,
        serverToken,
        setServerToken,
        isSyncing,
        syncStatus,
        setSyncStatus,
        expirationDate,
        lastSyncTime,
        currentEtag,
        lastSyncError,
        syncLibrary,
        clearLibraryCache,
        updateUserState,
        toggleFavorite,
        fetchLyrics,
        saveTrack,
        deleteTrack,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary phải được sử dụng bên trong LibraryProvider');
  }
  return context;
}
