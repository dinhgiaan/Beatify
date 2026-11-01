import * as FileSystem from 'expo-file-system/legacy';
import {
  type ListeningRecord,
  type UserProfile,
  type FullReplayReport,
  DEFAULT_USER_PROFILE,
  ListeningRecordSchema,
  computeFullReplay,
} from '@music-app/shared';

const STATS_FILE = `${FileSystem.documentDirectory || ''}beatify_listening_stats.json`;
const PROFILE_FILE = `${FileSystem.documentDirectory || ''}beatify_user_profile.json`;

// Hằng số giới hạn cấu hình
const STATS_MAX_RECORDS = 10000;
const MAX_PENDING_RECORDS = 100;
const MAX_LOAD_RETRIES = 3;

export class StatsStorageService {
  private cachedRecords: ListeningRecord[] | null = null;
  private cachedProfile: UserProfile | null = null;

  // Cờ riêng biệt kiểm soát trạng thái load và chặn ghi
  private loadSucceeded = false;
  private loadPromise: Promise<ListeningRecord[]> | null = null;
  private writeBlocked = false;
  private writeChain: Promise<void> = Promise.resolve();

  // Nhánh atomic write gần nhất đã thực thi (hiển thị trên Debug screen)
  private lastWriteBranch = 'Chưa ghi';
  // Thông điệp lỗi của lần moveAsync đầu tiên khi rơi vào fallback (nếu có)
  private lastMoveError: string | null = null;
  // Trạng thái khôi phục từ .tmp tách biệt hoàn toàn với nhánh ghi
  private lastRecoveryStatus = 'Không có khôi phục';
  // Bộ đếm số lượng tác vụ ghi đang xếp hàng hoặc đang thực thi trong writeChain
  private pendingWriteCount = 0;

  // Buffer RAM tạm thời khi load chưa thành công.
  // GHI CHÚ: Buffer này chỉ nằm trong bộ nhớ RAM, không bền vững nếu app bị kill trước khi load thành công.
  private pendingOnError: ListeningRecord[] = [];
  private loadRetryCount = 0;

  getLastWriteBranch(): string {
    return this.lastWriteBranch;
  }

  getLastMoveError(): string | null {
    return this.lastMoveError;
  }

  getLastRecoveryStatus(): string {
    return this.lastRecoveryStatus;
  }

  getWriteQueueStatus(): string {
    return this.pendingWriteCount > 0
      ? `Đang ghi (${this.pendingWriteCount} tác vụ)...`
      : 'Đã ghi xong (hàng đợi rỗng)';
  }

  async loadUserProfile(): Promise<UserProfile> {
    if (this.cachedProfile) return this.cachedProfile;

    try {
      const info = await FileSystem.getInfoAsync(PROFILE_FILE);
      if (info.exists) {
        const text = await FileSystem.readAsStringAsync(PROFILE_FILE);
        const data = JSON.parse(text) as UserProfile;
        // B4: Migration guard chuyển đổi avatarEmoji cũ sang avatarKey
        const avatarKey =
          data.avatarKey ||
          (data.avatarEmoji === '🎧' ? 'headphones' : data.avatarEmoji) ||
          'headphones';
        this.cachedProfile = {
          ...DEFAULT_USER_PROFILE,
          ...data,
          avatarKey,
          avatarEmoji: avatarKey,
        };
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

  // Single-flight: chia sẻ promise đang chạy, retry nếu lần trước thất bại
  async loadListeningRecords(): Promise<ListeningRecord[]> {
    if (this.loadSucceeded && this.cachedRecords !== null) {
      return this.cachedRecords;
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this._doLoad().finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }

  private async _doLoad(): Promise<ListeningRecord[]> {
    const tmpPath = `${STATS_FILE}.tmp`;

    // Ngăn chặn vòng lặp I/O vô hạn trong phiên nếu file liên tục lỗi
    if (this.loadRetryCount >= MAX_LOAD_RETRIES) {
      this.writeBlocked = true;
      return this.cachedRecords ?? [];
    }

    // Bước 1: Kiểm tra file chính — lỗi tại đây là I/O hệ thống
    let info: { exists: boolean };
    try {
      info = await FileSystem.getInfoAsync(STATS_FILE);
    } catch (err) {
      console.warn('Lỗi I/O kiểm tra stats:', err);
      this.writeBlocked = true;
      this.loadRetryCount++;
      return this.cachedRecords ?? [];
    }

    // Nếu file chính chưa tồn tại (mới cài hoặc crash giữa delete-move)
    if (!info.exists) {
      let recovered: ListeningRecord[] | null;
      try {
        recovered = await this._tryRecoverFromTmp(tmpPath);
      } catch (tmpIoErr) {
        console.warn('Lỗi I/O đọc file .tmp stats:', tmpIoErr);
        this.writeBlocked = true;
        this.loadRetryCount++;
        return this.cachedRecords ?? [];
      }
      this._onLoadSuccess(recovered ?? []);
      return this.cachedRecords ?? [];
    }

    // Bước 2: Đọc file chính
    let text: string;
    try {
      text = await FileSystem.readAsStringAsync(STATS_FILE);
    } catch (ioErr) {
      console.warn('Lỗi I/O đọc stats:', ioErr);
      this.writeBlocked = true;
      this.loadRetryCount++;
      return this.cachedRecords ?? [];
    }

    // Bước 3: Parse JSON
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      await this._handleCorruptFile(tmpPath);
      return this.cachedRecords ?? [];
    }

    // Bước 4: Validate mảng dữ liệu
    if (!Array.isArray(data)) {
      await this._handleCorruptFile(tmpPath);
      return this.cachedRecords ?? [];
    }

    const validRecords: ListeningRecord[] = [];
    for (const item of data) {
      const parsed = ListeningRecordSchema.safeParse(item);
      if (parsed.success) {
        validRecords.push(parsed.data);
      }
    }

    // Nếu mảng có phần tử nhưng tất cả đều sai cấu trúc -> file hỏng
    if (validRecords.length === 0 && data.length > 0) {
      await this._handleCorruptFile(tmpPath);
      return this.cachedRecords ?? [];
    }

    // Nếu có một số bản ghi bị loại (schema không khớp), sao lưu file gốc để phòng ngừa mất dữ liệu âm thầm
    if (validRecords.length < data.length && validRecords.length > 0) {
      console.warn(`[statsStorage] Phát hiện ${data.length - validRecords.length} bản ghi không khớp schema. Sao lưu bản gốc (.partial)...`);
      try {
        const partialPath = `${STATS_FILE}.partial-${Date.now()}`;
        await FileSystem.copyAsync({ from: STATS_FILE, to: partialPath });
        console.log(`[statsStorage] Đã sao lưu bản gốc vào ${partialPath}`);
        await this._pruneOldPartials();
      } catch (backupErr) {
        console.error('Lỗi sao lưu file partial stats — CHẶN GHI để tránh xóa mất dữ liệu gốc không khớp schema:', backupErr);
        this.writeBlocked = true;
        this.loadRetryCount++;
        return this.cachedRecords ?? [];
      }
    }

    // Đọc thành công
    this.loadRetryCount = 0;
    this._onLoadSuccess(validRecords);
    return this.cachedRecords ?? [];
  }

  // Xử lý file hỏng: Đổi tên bảo tồn và thử cứu dữ liệu từ .tmp hợp lệ
  private async _handleCorruptFile(tmpPath: string): Promise<void> {
    const renamed = await this._renameCorrupt();
    if (!renamed) {
      this.loadRetryCount++;
      this.writeBlocked = true;
      return;
    }

    // Sau khi đổi tên file hỏng, thử khôi phục từ .tmp hợp lệ nếu có
    let recovered: ListeningRecord[] | null;
    try {
      recovered = await this._tryRecoverFromTmp(tmpPath);
    } catch (tmpIoErr) {
      console.warn('Lỗi I/O đọc .tmp sau khi đổi tên file hỏng:', tmpIoErr);
      this.writeBlocked = true;
      this.loadRetryCount++;
      return;
    }
    this._onLoadSuccess(recovered ?? []);
  }

  private async _renameCorrupt(): Promise<boolean> {
    const corruptPath = `${STATS_FILE}.corrupt-${Date.now()}`;
    try {
      await FileSystem.moveAsync({ from: STATS_FILE, to: corruptPath });
      return true;
    } catch {
      console.warn('Không thể đổi tên file hỏng — giữ nguyên file để tránh ghi đè.');
      return false;
    }
  }

  // Giới hạn số lượng bản sao lưu .partial tối đa 3 bản gần nhất, tránh tích tụ rác đĩa
  private async _pruneOldPartials(): Promise<void> {
    try {
      const dir = FileSystem.documentDirectory;
      if (!dir) return;
      const files = await FileSystem.readDirectoryAsync(dir);
      const partialFiles = files
        .filter((f) => f.includes('beatify_listening_stats.json.partial-') || f.includes('.tmp.partial-'))
        .sort();
      if (partialFiles.length > 3) {
        const toDelete = partialFiles.slice(0, partialFiles.length - 3);
        for (const f of toDelete) {
          await FileSystem.deleteAsync(`${dir}${f}`, { idempotent: true });
        }
      }
    } catch {
      // bỏ qua lỗi dọn dẹp phụ
    }
  }

  private _onLoadSuccess(fileData: ListeningRecord[]): void {
    const hasPending = this.pendingOnError.length > 0;
    const merged = [...fileData, ...this.pendingOnError];
    if (merged.length > STATS_MAX_RECORDS) {
      merged.splice(0, merged.length - STATS_MAX_RECORDS);
    }
    this.cachedRecords = merged;
    this.pendingOnError = [];
    this.loadSucceeded = true;
    this.writeBlocked = false;
    this.loadRetryCount = 0;

    // Ghi ngay nếu có bản ghi pending cần lưu bền vững
    if (hasPending && this.cachedRecords.length > 0) {
      const snapshot = [...this.cachedRecords];
      this.pendingWriteCount++;
      this.writeChain = this.writeChain
        .then(() => this._doWrite(snapshot))
        .finally(() => {
          this.pendingWriteCount = Math.max(0, this.pendingWriteCount - 1);
        });
    }
  }

  private async _tryRecoverFromTmp(tmpPath: string): Promise<ListeningRecord[] | null> {
    // getInfoAsync có thể ném lỗi I/O -> throw để caller bắt và kích hoạt cơ chế retry I/O
    const tmpInfo = await FileSystem.getInfoAsync(tmpPath);
    if (!tmpInfo.exists) return null;

    // readAsStringAsync có thể ném lỗi I/O -> throw để caller bắt
    const text = await FileSystem.readAsStringAsync(tmpPath);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      // Dọn dẹp .tmp nếu hỏng cú pháp JSON
      try {
        await FileSystem.deleteAsync(tmpPath, { idempotent: true });
      } catch {
        // bỏ qua
      }
      return null;
    }
    if (!Array.isArray(data)) {
      try {
        await FileSystem.deleteAsync(tmpPath, { idempotent: true });
      } catch {
        // bỏ qua
      }
      return null;
    }

    const validRecords: ListeningRecord[] = [];
    for (const item of data) {
      const parsed = ListeningRecordSchema.safeParse(item);
      if (parsed.success) {
        validRecords.push(parsed.data);
      }
    }

    if (validRecords.length === 0 && data.length > 0) {
      try {
        await FileSystem.deleteAsync(tmpPath, { idempotent: true });
      } catch {
        // bỏ qua
      }
      return null;
    }

    // Nếu có một số bản ghi bị loại trong .tmp, sao lưu file .tmp gốc
    if (validRecords.length < data.length && validRecords.length > 0) {
      console.warn(`[statsStorage:tmp_recovery] Phát hiện ${data.length - validRecords.length} bản ghi không khớp schema trong .tmp. Sao lưu .tmp (.partial)...`);
      try {
        const partialPath = `${tmpPath}.partial-${Date.now()}`;
        await FileSystem.copyAsync({ from: tmpPath, to: partialPath });
        await this._pruneOldPartials();
      } catch (backupErr) {
        console.error('Lỗi sao lưu file partial tmp stats — throw lỗi I/O để kích hoạt cơ chế retry an toàn:', backupErr);
        throw backupErr;
      }
    }

    // Đã parse mảng dữ liệu hợp lệ vào RAM thành công.
    // Thử hoàn tất di chuyển .tmp sang file chính.
    try {
      await FileSystem.moveAsync({ from: tmpPath, to: STATS_FILE });
      this.lastRecoveryStatus = 'Khôi phục từ .tmp thành công';
      console.log('[statsStorage:tmp_recovery] Đã khôi phục stats từ .tmp và chuyển thành file chính.');
    } catch (moveErr) {
      // NGUYÊN TẮC: Lỗi move không được làm mất dữ liệu đã đọc vào RAM!
      this.lastRecoveryStatus = 'Khôi phục từ .tmp (move thất bại, giữ RAM)';
      console.warn('[statsStorage:tmp_recovery] Đã đọc được dữ liệu từ .tmp vào RAM, nhưng moveAsync sang file chính thất bại:', moveErr);
    }

    return validRecords;
  }

  async recordTrackListen(record: Omit<ListeningRecord, 'timestamp'>): Promise<void> {
    try {
      const fullRecord: ListeningRecord = {
        ...record,
        timestamp: Date.now(),
      };

      await this.loadListeningRecords();

      if (!this.loadSucceeded) {
        // Buffer vào RAM có trần
        this.pendingOnError.push(fullRecord);
        if (this.pendingOnError.length > MAX_PENDING_RECORDS) {
          this.pendingOnError.shift(); // Drop bản ghi cũ nhất khi quá tải
        }
        console.warn('Stats buffered trong RAM do load chưa thành công.');
        return;
      }

      const current = this.cachedRecords ?? [];
      current.push(fullRecord);
      if (current.length > STATS_MAX_RECORDS) {
        current.splice(0, current.length - STATS_MAX_RECORDS);
      }
      this.cachedRecords = current;

      if (this.writeBlocked) {
        console.warn('Ghi stats bị chặn (writeBlocked).');
        return;
      }

      // Snapshot độc lập tại thời điểm schedule
      const snapshot = [...current];
      this.pendingWriteCount++;
      this.writeChain = this.writeChain
        .then(() => this._doWrite(snapshot))
        .finally(() => {
          this.pendingWriteCount = Math.max(0, this.pendingWriteCount - 1);
        });
    } catch (err) {
      console.warn('Lỗi ghi stats (bỏ qua):', err);
    }
  }

  /**
   * Cập nhật thời lượng nghe thực tế cho bài hát vừa nghe xong (khi chuyển bài hoặc nghe hết bài)
   * Giúp thống kê tổng thời gian nghe (totalMinutes) trong Replay/Profile chính xác 100%.
   */
  async updateLastTrackListenedSec(trackId: string, actualListenedSec: number): Promise<void> {
    try {
      if (!this.cachedRecords || this.cachedRecords.length === 0) return;
      const roundedSec = Math.round(actualListenedSec);
      if (roundedSec <= 0) return;

      const lastRecord = this.cachedRecords[this.cachedRecords.length - 1];
      if (lastRecord && lastRecord.trackId === trackId && roundedSec > lastRecord.listenedSec) {
        lastRecord.listenedSec = roundedSec;

        if (this.writeBlocked) return;

        const snapshot = [...this.cachedRecords];
        this.pendingWriteCount++;
        this.writeChain = this.writeChain
          .then(() => this._doWrite(snapshot))
          .finally(() => {
            this.pendingWriteCount = Math.max(0, this.pendingWriteCount - 1);
          });
      }
    } catch (err) {
      console.warn('Lỗi cập nhật thời lượng nghe thực tế:', err);
    }
  }

  private async _doWrite(records: ListeningRecord[]): Promise<void> {
    if (this.writeBlocked) return;
    const tmpPath = `${STATS_FILE}.tmp`;
    let mainFileDeleted = false;

    try {
      // Bước 1: Ghi vào .tmp (file chính vẫn nguyên vẹn)
      try {
        await FileSystem.writeAsStringAsync(tmpPath, JSON.stringify(records));
      } catch (writeErr) {
        console.warn('Lỗi ghi file .tmp stats:', writeErr);
        try {
          await FileSystem.deleteAsync(tmpPath, { idempotent: true });
        } catch {
          // bỏ qua
        }
        return;
      }

      // Kiểm tra file chính có tồn tại trước khi move không (phân biệt tạo mới vs overwrite vs không xác định do lỗi I/O)
      let destState: 'exists' | 'not_exists' | 'unknown' = 'unknown';
      try {
        const prevDestInfo = await FileSystem.getInfoAsync(STATS_FILE);
        destState = prevDestInfo.exists ? 'exists' : 'not_exists';
      } catch {
        destState = 'unknown';
      }

      // Bước 2: Di chuyển .tmp vào file chính
      try {
        await FileSystem.moveAsync({ from: tmpPath, to: STATS_FILE });
        this.lastMoveError = null;
        if (destState === 'exists') {
          this.lastWriteBranch = 'moveAsync trực tiếp (overwrite)';
        } else if (destState === 'not_exists') {
          this.lastWriteBranch = 'moveAsync trực tiếp (tạo mới)';
        } else {
          this.lastWriteBranch = 'moveAsync trực tiếp (đích không xác định do lỗi I/O check)';
        }
        console.log(`[statsStorage:atomic_write] Thành công qua ${this.lastWriteBranch}.`);
      } catch (moveErr) {
        this.lastMoveError = (moveErr as Error)?.message || String(moveErr);
        // Chỉ chạy fallback delete + move khi xác nhận file đích đang tồn tại
        const destInfo = await FileSystem.getInfoAsync(STATS_FILE).catch(() => ({ exists: false }));
        if (destInfo.exists) {
          console.warn(`[statsStorage:atomic_write] moveAsync trực tiếp thất bại (${this.lastMoveError}), file đích đang tồn tại -> Chạy fallback deleteAsync + moveAsync.`);
          await FileSystem.deleteAsync(STATS_FILE, { idempotent: true });
          mainFileDeleted = true;
          await FileSystem.moveAsync({ from: tmpPath, to: STATS_FILE });
          this.lastWriteBranch = 'fallback (delete + move)';
          console.log('[statsStorage:atomic_write] Thành công qua fallback delete + move.');
        } else {
          throw moveErr;
        }
      }
    } catch (err) {
      console.warn('Lỗi atomic write stats:', err);
      // NGUYÊN TẮC BẢO TOÀN DỮ LIỆU:
      // Chỉ dọn .tmp nếu file chính CHƯA bị xóa (file chính vẫn còn bản dữ liệu cũ).
      // Nếu file chính ĐÃ bị xóa, TUYỆT ĐỐI KHÔNG xóa .tmp vì .tmp là bản dữ liệu duy nhất
      // còn sót lại để _tryRecoverFromTmp khôi phục ở lần load tiếp theo!
      if (!mainFileDeleted) {
        try {
          await FileSystem.deleteAsync(tmpPath, { idempotent: true });
        } catch {
          // bỏ qua
        }
      }
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
    this.pendingOnError = [];
    this.loadSucceeded = true;
    this.writeBlocked = false;
    this.loadRetryCount = 0;
    const snapshot: ListeningRecord[] = [];
    this.pendingWriteCount++;
    this.writeChain = this.writeChain
      .then(() => this._doWrite(snapshot))
      .finally(() => {
        this.pendingWriteCount = Math.max(0, this.pendingWriteCount - 1);
      });
  }
}

export const statsStorage = new StatsStorageService();

