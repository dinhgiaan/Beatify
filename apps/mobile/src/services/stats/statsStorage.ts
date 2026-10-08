import * as FileSystem from 'expo-file-system/legacy';
import {
  type ListeningRecord,
  type UserProfile,
  type FullReplayReport,
  DEFAULT_USER_PROFILE,
  computeFullReplay,
} from '@music-app/shared';

const STATS_FILE = `${FileSystem.documentDirectory || ''}beatify_listening_stats.json`;
const PROFILE_FILE = `${FileSystem.documentDirectory || ''}beatify_user_profile.json`;

class StatsStorageService {
  private cachedRecords: ListeningRecord[] | null = null;
  private cachedProfile: UserProfile | null = null;

  async loadUserProfile(): Promise<UserProfile> {
    if (this.cachedProfile) return this.cachedProfile;

    try {
      const info = await FileSystem.getInfoAsync(PROFILE_FILE);
      if (info.exists) {
        const text = await FileSystem.readAsStringAsync(PROFILE_FILE);
        const data = JSON.parse(text) as UserProfile;
        this.cachedProfile = { ...DEFAULT_USER_PROFILE, ...data };
        return this.cachedProfile;
      }
    } catch (err) {
      console.warn('Lỗi đọc profile cục bộ:', err);
    }

    this.cachedProfile = { ...DEFAULT_USER_PROFILE };
    return this.cachedProfile;
  }

  async saveUserProfile(profile: UserProfile): Promise<void> {
    this.cachedProfile = profile;
    try {
      await FileSystem.writeAsStringAsync(PROFILE_FILE, JSON.stringify(profile));
    } catch (err) {
      console.warn('Lỗi lưu profile cục bộ:', err);
    }
  }

  async loadListeningRecords(): Promise<ListeningRecord[]> {
    if (this.cachedRecords) return this.cachedRecords;

    try {
      const info = await FileSystem.getInfoAsync(STATS_FILE);
      if (info.exists) {
        const text = await FileSystem.readAsStringAsync(STATS_FILE);
        const data = JSON.parse(text) as ListeningRecord[];
        if (Array.isArray(data)) {
          this.cachedRecords = data;
          return this.cachedRecords;
        }
      }
    } catch (err) {
      console.warn('Lỗi đọc stats cục bộ:', err);
    }

    this.cachedRecords = [];
    return this.cachedRecords;
  }

  async recordTrackListen(record: Omit<ListeningRecord, 'timestamp'>): Promise<void> {
    const fullRecord: ListeningRecord = {
      ...record,
      timestamp: Date.now(),
    };

    const records = await this.loadListeningRecords();
    records.push(fullRecord);
    // Giữ tối đa 10.000 lượt nghe gần nhất để tối ưu hiệu năng và bộ nhớ
    if (records.length > 10000) {
      records.splice(0, records.length - 10000);
    }
    this.cachedRecords = records;

    try {
      await FileSystem.writeAsStringAsync(STATS_FILE, JSON.stringify(records));
    } catch (err) {
      console.warn('Lỗi ghi stats:', err);
    }
  }

  async getReplayReport(): Promise<FullReplayReport> {
    const [records, profile] = await Promise.all([
      this.loadListeningRecords(),
      this.loadUserProfile(),
    ]);

    return computeFullReplay(records, profile);
  }

  async clearStats(): Promise<void> {
    this.cachedRecords = [];
    try {
      await FileSystem.writeAsStringAsync(STATS_FILE, JSON.stringify([]));
    } catch (err) {
      console.warn('Lỗi xóa stats:', err);
    }
  }
}

export const statsStorage = new StatsStorageService();
