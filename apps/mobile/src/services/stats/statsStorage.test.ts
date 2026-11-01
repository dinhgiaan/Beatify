import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ListeningRecord } from '@music-app/shared';

// Mock expo-file-system/legacy trước khi import statsStorage
vi.mock('expo-file-system/legacy', () => {
  return {
    documentDirectory: 'file:///data/user/0/beatify/',
    getInfoAsync: vi.fn(),
    readAsStringAsync: vi.fn(),
    writeAsStringAsync: vi.fn(),
    moveAsync: vi.fn(),
    deleteAsync: vi.fn(),
    copyAsync: vi.fn(),
    readDirectoryAsync: vi.fn().mockResolvedValue([]),
  };
});

import * as FileSystem from 'expo-file-system/legacy';
import { StatsStorageService } from './statsStorage';

const mockFileExists: FileSystem.FileInfo = {
  exists: true,
  uri: 'file:///data/user/0/beatify/stats.json',
  size: 100,
  isDirectory: false,
  modificationTime: 123456789,
};

const mockFileNotExists: FileSystem.FileInfo = {
  exists: false,
  isDirectory: false,
  uri: 'file:///data/user/0/beatify/not_exists.json',
};

describe('Kiểm thử StatsStorageService — B17 Phòng vệ Dữ liệu & Xử lý File Hỏng', () => {
  let service: StatsStorageService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(FileSystem.copyAsync).mockReset().mockResolvedValue();
    vi.mocked(FileSystem.deleteAsync).mockReset().mockResolvedValue();
    vi.mocked(FileSystem.writeAsStringAsync).mockReset().mockResolvedValue();
    vi.mocked(FileSystem.moveAsync).mockReset().mockResolvedValue();
    service = new StatsStorageService();
  });

  it('Nhánh 1: Lỗi I/O thoáng qua rồi thử lại thành công (Buffer RAM + Merge an toàn)', async () => {
    // Lần 1: getInfoAsync báo có file, nhưng readAsStringAsync ném lỗi I/O
    vi.mocked(FileSystem.getInfoAsync).mockResolvedValueOnce(mockFileExists);
    vi.mocked(FileSystem.readAsStringAsync).mockRejectedValueOnce(new Error('Disk I/O failure'));

    // Ghi nhận lượt nghe trong lúc I/O lỗi — bản ghi phải được đưa vào pendingOnError
    await service.recordTrackListen({
      trackId: 'track_1',
      title: 'Bài Hát 1',
      artist: 'Nghệ Sĩ A',
      durationSec: 200,
      listenedSec: 150,
    });

    // Lần 2: I/O phục hồi bình thường, file có sẵn 1 bản ghi cũ
    const existingRecord: ListeningRecord = {
      trackId: 'track_0',
      title: 'Bài Hát Cũ',
      artist: 'Nghệ Sĩ Gốc',
      durationSec: 180,
      listenedSec: 180,
      timestamp: 1000,
    };
    vi.mocked(FileSystem.getInfoAsync).mockResolvedValueOnce(mockFileExists);
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValueOnce(JSON.stringify([existingRecord]));
    vi.mocked(FileSystem.writeAsStringAsync).mockResolvedValue();
    vi.mocked(FileSystem.moveAsync).mockResolvedValue();

    // Gọi loadListeningRecords để kích hoạt đọc lại
    const records = await service.loadListeningRecords();

    // Dữ liệu cũ và bản ghi pending phải được gộp lại đầy đủ (2 bản ghi)
    expect(records.length).toBe(2);
    expect(records[0]?.trackId).toBe('track_0');
    expect(records[1]?.trackId).toBe('track_1');

    // Xác nhận có kích hoạt ghi lại xuống đĩa
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
  });

  it('Nhánh 2: File chính hỏng JSON → Đổi tên .corrupt và cứu dữ liệu từ .tmp hợp lệ', async () => {
    // File chính tồn tại nhưng nội dung hỏng JSON
    vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (path: string) => {
      if (path.endsWith('.tmp')) return mockFileExists;
      return mockFileExists;
    });
    vi.mocked(FileSystem.readAsStringAsync).mockImplementation(async (path: string) => {
      if (path.endsWith('.tmp')) {
        // File .tmp hợp lệ do lần ghi trước
        return JSON.stringify([
          { trackId: 'saved_in_tmp', title: 'Cứu Từ Tmp', artist: 'Ca Sĩ', durationSec: 150, listenedSec: 150, timestamp: 2000 },
        ]);
      }
      return '{ corrupt json syntax ...';
    });
    vi.mocked(FileSystem.moveAsync).mockResolvedValue();

    const records = await service.loadListeningRecords();

    // Phải gọi moveAsync để đổi tên file hỏng thành .corrupt-<timestamp>
    expect(FileSystem.moveAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.stringContaining('beatify_listening_stats.json'),
        to: expect.stringContaining('.corrupt-'),
      })
    );

    // Cứu thành công bản ghi từ .tmp
    expect(records.length).toBe(1);
    expect(records[0]?.trackId).toBe('saved_in_tmp');
  });

  it('Nhánh 3: File chính chứa JSON hợp lệ nhưng không phải Array → Đổi tên .corrupt và khởi tạo mảng rỗng', async () => {
    vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (path: string) => {
      if (path.endsWith('.tmp')) return mockFileNotExists;
      return mockFileExists;
    });
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue('{"invalid": "not_an_array"}');
    vi.mocked(FileSystem.moveAsync).mockResolvedValue();

    const records = await service.loadListeningRecords();

    // Nhận diện file không phải array là file hỏng, kích hoạt đổi tên .corrupt
    expect(FileSystem.moveAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.stringContaining('beatify_listening_stats.json'),
        to: expect.stringContaining('.corrupt-'),
      })
    );

    // Vì không có .tmp nên khởi tạo mảng rỗng an toàn
    expect(records).toEqual([]);
  });

  it('Nhánh 4: Khôi phục từ .tmp khi file chính không tồn tại (Crash giữa Delete và Move)', async () => {
    // File chính không tồn tại (ví dụ app bị kill sau deleteAsync), nhưng .tmp còn nguyên
    vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (path: string) => {
      if (path.endsWith('.tmp')) return mockFileExists;
      return mockFileNotExists;
    });
    const tmpData: ListeningRecord[] = [
      { trackId: 'recovered_track', title: 'Bài Phục Hồi', artist: 'Nghệ Sĩ', durationSec: 210, listenedSec: 210, timestamp: 3000 },
    ];
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue(JSON.stringify(tmpData));
    vi.mocked(FileSystem.moveAsync).mockResolvedValue();

    const records = await service.loadListeningRecords();

    // Đã khôi phục dữ liệu từ .tmp thành công
    expect(records.length).toBe(1);
    expect(records[0]?.trackId).toBe('recovered_track');

    // Đã gọi moveAsync từ .tmp về STATS_FILE
    expect(FileSystem.moveAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.stringContaining('.tmp'),
        to: expect.stringContaining('beatify_listening_stats.json'),
      })
    );
  });

  it('Nhánh 5: Fallback delete thành công nhưng move lần 2 thất bại → .tmp KHÔNG bị xóa, load sau cứu được dữ liệu', async () => {
    const initialRecord: ListeningRecord = {
      trackId: 'track_init',
      title: 'Bài Đầu',
      artist: 'Nghệ Sĩ',
      durationSec: 180,
      listenedSec: 180,
      timestamp: 1000,
    };
    vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (path: string) => {
      if (path.endsWith('.tmp')) return mockFileNotExists;
      return mockFileExists;
    });
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue(JSON.stringify([initialRecord]));
    await service.loadListeningRecords();

    // Giả lập ghi: write tmp OK, move trực tiếp lỗi, delete file chính OK, move sau delete lỗi
    vi.mocked(FileSystem.writeAsStringAsync).mockResolvedValue();
    vi.mocked(FileSystem.deleteAsync).mockResolvedValue();
    vi.mocked(FileSystem.moveAsync)
      .mockRejectedValueOnce(new Error('move direct fail'))
      .mockRejectedValueOnce(new Error('move after delete fail'));

    await service.recordTrackListen({
      trackId: 'track_new',
      title: 'Bài Mới',
      artist: 'Nghệ Sĩ',
      durationSec: 200,
      listenedSec: 150,
    });

    // Chờ writeChain hoàn tất
    await new Promise((resolve) => setTimeout(resolve, 50));

    // deleteAsync KHÔNG ĐƯỢC gọi cho file .tmp vì file chính đã bị xóa (bảo toàn bản dữ liệu duy nhất)
    const deleteCalls = vi.mocked(FileSystem.deleteAsync).mock.calls;
    const deletedTmp = deleteCalls.some(([path]) => typeof path === 'string' && path.endsWith('.tmp'));
    expect(deletedTmp).toBe(false);

    // Lần khởi động tiếp theo: file chính mất, .tmp còn nguyên → khôi phục thành công
    const newService = new StatsStorageService();
    vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (path: string) => {
      if (path.endsWith('.tmp')) return mockFileExists;
      return mockFileNotExists;
    });
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue(
      JSON.stringify([
        initialRecord,
        { trackId: 'track_new', title: 'Bài Mới', artist: 'Nghệ Sĩ', durationSec: 200, listenedSec: 150, timestamp: 2000 },
      ])
    );
    vi.mocked(FileSystem.moveAsync).mockResolvedValue();

    const recovered = await newService.loadListeningRecords();
    expect(recovered.length).toBe(2);
    expect(recovered[1]?.trackId).toBe('track_new');
  });

  it('Nhánh 6: .tmp hỏng cú pháp JSON khi thử khôi phục → tự động xóa dọn dẹp .tmp rác', async () => {
    vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (path: string) => {
      if (path.endsWith('.tmp')) return mockFileExists;
      return mockFileNotExists;
    });
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue('invalid { json syntax in tmp');
    vi.mocked(FileSystem.deleteAsync).mockResolvedValue();

    const records = await service.loadListeningRecords();
    expect(records).toEqual([]);

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      expect.stringContaining('.tmp'),
      expect.objectContaining({ idempotent: true })
    );
  });

  it('Nhánh 7: .tmp hợp lệ nhưng moveAsync sang file chính thất bại → dữ liệu trong RAM vẫn được bảo toàn, lần ghi kế tiếp không mất dữ liệu .tmp', async () => {
    vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (path: string) => {
      if (path.endsWith('.tmp')) return mockFileExists;
      return mockFileNotExists; // file chính không có
    });
    const tmpData: ListeningRecord[] = [
      { trackId: 'saved_track', title: 'Bài Trong Tmp', artist: 'Nghệ Sĩ', durationSec: 180, listenedSec: 180, timestamp: 1234 },
    ];
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue(JSON.stringify(tmpData));
    // moveAsync sang file chính ném lỗi ở bước recovery (ví dụ file system locked)
    vi.mocked(FileSystem.moveAsync).mockRejectedValueOnce(new Error('move to main failed'));

    const records = await service.loadListeningRecords();

    // Dữ liệu trong RAM vẫn được nạp đầy đủ (không bị coi là null/rỗng)
    expect(records.length).toBe(1);
    expect(records[0]?.trackId).toBe('saved_track');
    expect(service.getLastRecoveryStatus()).toContain('Khôi phục từ .tmp (move thất bại, giữ RAM)');

    // TIẾP TỤC: Ghi một bài hát mới ngay sau đó
    vi.mocked(FileSystem.writeAsStringAsync).mockClear();
    vi.mocked(FileSystem.writeAsStringAsync).mockResolvedValue();
    vi.mocked(FileSystem.moveAsync).mockResolvedValue();

    await service.recordTrackListen({
      trackId: 'track_after_recovery_fail',
      title: 'Bài Hát Mới',
      artist: 'Nghệ Sĩ Mới',
      durationSec: 200,
      listenedSec: 200,
    });

    // Chờ writeChain hoàn tất
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Xác nhận writeAsStringAsync đã được gọi để ghi vào .tmp
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
    const writeCalls = vi.mocked(FileSystem.writeAsStringAsync).mock.calls;
    const lastWriteCall = writeCalls[writeCalls.length - 1];
    expect(lastWriteCall).toBeDefined();

    // NGUYÊN TẮC BẢO TOÀN DỮ LIỆU: File ghi mới PHẢI CHỨA CẢ 2 BÀI: bài cũ 'saved_track' và bài mới
    const writtenData = JSON.parse(lastWriteCall?.[1] as string) as ListeningRecord[];
    expect(writtenData.length).toBe(2);
    expect(writtenData[0]?.trackId).toBe('saved_track');
    expect(writtenData[1]?.trackId).toBe('track_after_recovery_fail');
    expect(service.getLastWriteBranch()).toBe('moveAsync trực tiếp (tạo mới)');
    expect(service.getWriteQueueStatus()).toBe('Đã ghi xong (hàng đợi rỗng)');
  });

  it('Nhánh 8: Lỗi I/O khi đọc .tmp lúc file chính vắng mặt → chặn ghi và không coi là mảng rỗng', async () => {
    vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (path: string) => {
      if (path.endsWith('.tmp')) return mockFileExists;
      return mockFileNotExists; // file chính không có
    });
    // readAsStringAsync ném lỗi I/O liên tục trong đợt lỗi
    vi.mocked(FileSystem.readAsStringAsync).mockRejectedValue(new Error('I/O read error on .tmp'));

    const records = await service.loadListeningRecords();
    expect(records).toEqual([]);

    // Khi có lỗi I/O trên .tmp, thử ghi bài mới phải bị chặn ghi (writeBlocked)
    vi.mocked(FileSystem.writeAsStringAsync).mockClear();
    await service.recordTrackListen({
      trackId: 'track_blocked',
      title: 'Bài Bị Chặn',
      artist: 'Nghệ Sĩ',
      durationSec: 120,
      listenedSec: 60,
    });

    // Không được ghi đè lên .tmp
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it('Nhánh 9: Lọc bản ghi hợp lệ qua Zod schema, loại bỏ phần tử sai cấu trúc', async () => {
    vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (path: string) => {
      if (path.endsWith('.tmp')) return mockFileNotExists;
      return mockFileExists;
    });
    // File chứa 1 phần tử chuẩn và 1 phần tử rác thiếu trường bắt buộc
    const mixedData = [
      { trackId: 'valid_1', title: 'Bài Chuẩn', artist: 'Ca Sĩ', durationSec: 180, listenedSec: 180, timestamp: 5000 },
      { trackId: 'corrupted_item', missing_title: true },
    ];
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue(JSON.stringify(mixedData));

    const records = await service.loadListeningRecords();
    // Phần tử rác bị loại bỏ qua Zod safeParse, chỉ giữ phần tử chuẩn
    expect(records.length).toBe(1);
    expect(records[0]?.trackId).toBe('valid_1');
    // Sao lưu file gốc thành .partial để bảo toàn dữ liệu tránh mất âm thầm
    expect(FileSystem.copyAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        to: expect.stringContaining('.partial-'),
      })
    );
  });

  it('Nhánh 10: Phân biệt nhãn tạo mới vs overwrite trong _doWrite', async () => {
    // Lần 1: File chính chưa tồn tại -> Nhãn phải là 'moveAsync trực tiếp (tạo mới)'
    vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (path: string) => {
      if (path.endsWith('.tmp')) return mockFileNotExists;
      return mockFileNotExists;
    });
    vi.mocked(FileSystem.writeAsStringAsync).mockResolvedValue();
    vi.mocked(FileSystem.moveAsync).mockResolvedValue();

    await service.recordTrackListen({
      trackId: 'track_create',
      title: 'Bài Tạo Mới',
      artist: 'Ca Sĩ',
      durationSec: 180,
      listenedSec: 180,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(service.getLastWriteBranch()).toBe('moveAsync trực tiếp (tạo mới)');

    // Lần 2: File chính đã tồn tại -> Nhãn phải là 'moveAsync trực tiếp (overwrite)'
    vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (path: string) => {
      if (path.endsWith('.tmp')) return mockFileNotExists;
      return mockFileExists; // File đích đã có
    });

    await service.recordTrackListen({
      trackId: 'track_overwrite',
      title: 'Bài Ghi Đè',
      artist: 'Ca Sĩ',
      durationSec: 200,
      listenedSec: 200,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(service.getLastWriteBranch()).toBe('moveAsync trực tiếp (overwrite)');
  });

  it('B4: Migration guard tự động chuyển đổi avatarEmoji sang avatarKey', async () => {
    vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (path: string) => {
      if (path.includes('beatify_user_profile.json')) return mockFileExists;
      return mockFileNotExists;
    });
    // Giả lập file profile cũ chỉ có avatarEmoji = '🎧'
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue(
      JSON.stringify({
        displayName: 'Người Dùng Cũ',
        avatarEmoji: '🎧',
        joinedDate: '2026-01-01',
        bio: 'Bio cũ',
      })
    );

    const profile = await service.loadUserProfile();
    expect(profile.avatarKey).toBe('headphones');
    expect(profile.displayName).toBe('Người Dùng Cũ');
  });

  it('Nhánh 11: Sao lưu .partial thất bại → lập tức chặn ghi (writeBlocked) để không xóa mất dữ liệu gốc', async () => {
    vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (path: string) => {
      if (path.endsWith('.tmp')) return mockFileNotExists;
      return mockFileExists;
    });
    // File chứa 1 bản ghi hợp lệ và 1 bản ghi lỗi cấu trúc
    const mixed = [
      { trackId: 'v1', title: 'Bài 1', artist: 'Ca Sĩ', durationSec: 100, listenedSec: 100, timestamp: 1000 },
      { trackId: 'v2', invalid_field: true },
    ];
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue(JSON.stringify(mixed));
    // Giả lập copyAsync (.partial) ném lỗi I/O liên tục (ví dụ đĩa đầy)
    vi.mocked(FileSystem.copyAsync).mockRejectedValue(new Error('Disk full during partial backup'));

    const records = await service.loadListeningRecords();
    expect(records).toEqual([]);

    // Thử ghi bài hát mới sau đó phải bị chặn ghi để bảo toàn file gốc
    vi.mocked(FileSystem.writeAsStringAsync).mockClear();
    await service.recordTrackListen({
      trackId: 'should_block',
      title: 'Bài Không Được Ghi',
      artist: 'Ca Sĩ',
      durationSec: 120,
      listenedSec: 60,
    });
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it('Nhánh 12: getInfoAsync lỗi I/O trước khi move → nhãn đích không xác định do lỗi I/O check', async () => {
    // 1. Khởi tạo load ban đầu thành công (file chính chưa có)
    vi.mocked(FileSystem.getInfoAsync).mockResolvedValueOnce(mockFileNotExists);
    await service.loadListeningRecords();

    // 2. Khi _doWrite kiểm tra file đích trước khi move, getInfoAsync ném lỗi I/O
    vi.mocked(FileSystem.getInfoAsync).mockRejectedValueOnce(new Error('I/O error during dest check'));
    vi.mocked(FileSystem.writeAsStringAsync).mockResolvedValue();
    vi.mocked(FileSystem.moveAsync).mockResolvedValue();

    await service.recordTrackListen({
      trackId: 'track_io_unknown',
      title: 'Bài Kiểm Tra I/O Check',
      artist: 'Ca Sĩ',
      durationSec: 150,
      listenedSec: 150,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(service.getLastWriteBranch()).toBe('moveAsync trực tiếp (đích không xác định do lỗi I/O check)');
  });

  it('Nhánh 13: moveAsync trực tiếp thất bại rơi vào fallback → lưu trữ thông điệp lỗi trong lastMoveError', async () => {
    const existing = [
      { trackId: 'existing_track', title: 'Bài Cũ', artist: 'Ca Sĩ', durationSec: 100, listenedSec: 100, timestamp: 1000 },
    ];
    vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (path: string) => {
      if (path.endsWith('.tmp')) return mockFileNotExists;
      return mockFileExists; // File đích tồn tại
    });
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue(JSON.stringify(existing));
    vi.mocked(FileSystem.writeAsStringAsync).mockResolvedValue();
    vi.mocked(FileSystem.deleteAsync).mockResolvedValue();
    // moveAsync đầu tiên thất bại với lỗi cụ thể
    vi.mocked(FileSystem.moveAsync)
      .mockRejectedValueOnce(new Error('Destination already exists and overwrite not supported'))
      .mockResolvedValueOnce(undefined); // move sau delete thành công

    await service.recordTrackListen({
      trackId: 'track_fallback_err',
      title: 'Bài Fallback Error',
      artist: 'Ca Sĩ',
      durationSec: 200,
      listenedSec: 200,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(service.getLastWriteBranch()).toBe('fallback (delete + move)');
    expect(service.getLastMoveError()).toContain('Destination already exists and overwrite not supported');
  });

  it('Nhánh 14: updateLastTrackListenedSec cập nhật chính xác thời lượng nghe thực tế của bài hát', async () => {
    vi.mocked(FileSystem.getInfoAsync).mockResolvedValue(mockFileExists);
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue(JSON.stringify([]));
    vi.mocked(FileSystem.writeAsStringAsync).mockResolvedValue();
    vi.mocked(FileSystem.moveAsync).mockResolvedValue();

    // 1. Ghi nhận lúc 15 giây
    await service.recordTrackListen({
      trackId: 'track_real_duration',
      title: 'Bài Hát Đo Thời Gian Thật',
      artist: 'Ca Sĩ',
      durationSec: 240,
      listenedSec: 15,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 2. Khi nghe đến 210 giây và chuyển bài: cập nhật thời lượng thực tế
    await service.updateLastTrackListenedSec('track_real_duration', 210);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const records = await service.loadListeningRecords();
    const updated = records.find((r) => r.trackId === 'track_real_duration');
    expect(updated).toBeDefined();
    expect(updated?.listenedSec).toBe(210); // Đã được cập nhật từ 15s lên 210s chuẩn xác!
  });
});


