import { useState, useCallback, useMemo, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  buildHomeSections,
  getTimeOfDay,
  getTimeOfDayGreeting,
  type HomeSection,
  type HomeContext,
  type ListeningRecord,
} from '@music-app/shared';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { statsStorage } from '../services/stats/statsStorage';
import { recordHomeMetrics, isHomeDebug } from '../services/stats/homeMetrics';

export interface HomeGreetingData {
  title: string;
  subtitle: string;
}

export interface UseHomeSectionsResult {
  sections: HomeSection[];
  greeting: HomeGreetingData;
  isLoading: boolean;
  hasLoadedOnce: boolean;
  recordCount: number;
  reload: () => Promise<void>;
}

/**
 * Hook quản lý và dựng các section cho Trang chủ (Home screen)
 * - Tự động tải lại lịch sử nghe (ListeningRecord) khi màn hình focus
 * - A1: records và now được lưu đồng thời trong cùng một state object, không gọi Date.now() trong render hay useMemo
 * - A3: Lấy recentTrackIds trực tiếp từ PlayerContext trong RAM, không đọc đĩa lặp lại
 * - C1 & C3: Đo hiệu năng bằng performance.now(), ghi metrics và xử lý defer qua InteractionManager nếu > 100ms
 */
export function useHomeSections(): UseHomeSectionsResult {
  const { tracks, albums, userState } = useLibrary();
  const { recentTrackIds } = usePlayer();

  // Mốc thời gian ban đầu khi mount (khởi tạo 1 lần duy nhất trong ref)
  const initialMountNowRef = useRef(Date.now());

  // A1: now và records được lưu đồng bộ cùng một state object
  const [homeData, setHomeData] = useState<{ records: ListeningRecord[]; now: number }>({
    records: [],
    now: initialMountNowRef.current,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const lastCalculationTimeRef = useRef<number>(0);

  // Hàm tải dữ liệu lịch sử nghe
  const loadData = useCallback(async () => {
    // Chỉ bật loading ở lần đầu tiên để tránh chớp giật (flash) skeleton khi quay lại tab
    if (!hasLoadedOnce) {
      setIsLoading(true);
    }

    try {
      // A3: Không đọc file recentTracks từ đĩa vì đã có recentTrackIds trong PlayerContext
      const loadedRecords = await statsStorage.loadListeningRecords();
      const currentNow = Date.now();

      // C3: Nếu lần tính toán trước vượt 100ms hoặc khối lượng lớn (> 5000 bản ghi), hoãn commit qua InteractionManager
      const isHeavy = lastCalculationTimeRef.current > 100 || loadedRecords.length > 5000;

      if (isHeavy) {
        InteractionManager.runAfterInteractions(() => {
          setHomeData({ records: loadedRecords, now: currentNow });
          setIsLoading(false);
          setHasLoadedOnce(true);
        });
      } else {
        setHomeData({ records: loadedRecords, now: currentNow });
        setIsLoading(false);
        setHasLoadedOnce(true);
      }
    } catch (err) {
      console.warn('[useHomeSections] Lỗi khi nạp dữ liệu thống kê:', err);
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
}, [hasLoadedOnce]);

// Tự động cập nhật dữ liệu mỗi khi người dùng quay lại tab Trang chủ
useFocusEffect(
  useCallback(() => {
    loadData();
  }, [loadData])
);

// Danh sách ID bài hát yêu thích
const favoriteIds = useMemo(() => {
  return userState.favoriteIds || [];
}, [userState.favoriteIds]);

// Thông điệp chào theo khung giờ trong ngày (thuần túy phụ thuộc vào homeData.now)
const greeting = useMemo(() => {
  const timeOfDay = getTimeOfDay(homeData.now);
  return getTimeOfDayGreeting(timeOfDay);
  }, [homeData.now]);

// Tính toán danh sách section của Trang chủ (A1: phụ thuộc trực tiếp vào homeData.records và homeData.now)
const sections = useMemo(() => {
  if (!tracks || tracks.length === 0) return [];

  const ctx: HomeContext = {
    tracks,
    albums,
    records: homeData.records,
    favoriteIds,
    recentTrackIds: recentTrackIds || [],
    now: homeData.now,
  };

// C1: Bọc buildHomeSections bằng performance.now()
const t0 = performance.now();
const result = buildHomeSections(ctx);
const elapsed = performance.now() - t0;

lastCalculationTimeRef.current = elapsed;
recordHomeMetrics({
  lastElapsedMs: elapsed,
  sectionCount: result.length,
  recordCount: homeData.records.length,
  timestamp: homeData.now,
});

if (__DEV__ || isHomeDebug()) {
  console.log(
    `[useHomeSections] Dựng ${result.length} sections (${homeData.records.length} records, ${tracks.length} tracks) mất ${elapsed.toFixed(1)}ms`
  );
}

return result;
  }, [tracks, albums, homeData.records, favoriteIds, recentTrackIds, homeData.now]);

const reload = useCallback(async () => {
  setIsLoading(true);
  await loadData();
}, [loadData]);

return {
  sections,
  greeting,
  isLoading,
  hasLoadedOnce,
  recordCount: homeData.records.length,
  reload,
};
}
