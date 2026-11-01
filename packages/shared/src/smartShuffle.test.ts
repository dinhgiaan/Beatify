import { describe, it, expect } from 'vitest';
import { smartShuffle, interleaveTracksByArtist, sortTracksByMode } from './smartShuffle';
import type { Track } from './schemas';

function makeMockTrack(id: string, artist: string, title = `Song ${id}`): Track {
  return {
    id,
    file: `music/${id}.mp3`,
    storage: 'r2',
    title,
    artist,
    album: 'Album 1',
    duration: 180,
  };
}

describe('smartShuffle', () => {
  it('xử lý an toàn khi danh sách rỗng hoặc 1-2 bài', () => {
    expect(smartShuffle([])).toEqual([]);

    const single = [makeMockTrack('1', 'Sơn Tùng M-TP')];
    expect(smartShuffle(single)).toEqual(single);

    const pair = [makeMockTrack('1', 'Sơn Tùng M-TP'), makeMockTrack('2', 'Đen Vâu')];
    expect(smartShuffle(pair)).toHaveLength(2);
  });

  it('bảo toàn đầy đủ tất cả bài hát và không sinh trùng lặp', () => {
    const list: Track[] = [
      makeMockTrack('1', 'Sơn Tùng M-TP'),
      makeMockTrack('2', 'Sơn Tùng M-TP'),
      makeMockTrack('3', 'Đen Vâu'),
      makeMockTrack('4', 'Đen Vâu'),
      makeMockTrack('5', 'Vũ'),
      makeMockTrack('6', 'Vũ'),
      makeMockTrack('7', 'Hà Anh Tuấn'),
    ];

    const shuffled = smartShuffle(list);
    expect(shuffled).toHaveLength(list.length);

    const ids = shuffled.map((t) => t.id).sort();
    const origIds = list.map((t) => t.id).sort();
    expect(ids).toEqual(origIds);
  });

  it('ghim bài đang phát ở đầu danh sách nếu cung cấp currentTrackId', () => {
    const list: Track[] = [
      makeMockTrack('1', 'Sơn Tùng M-TP'),
      makeMockTrack('2', 'Đen Vâu'),
      makeMockTrack('3', 'Vũ'),
    ];

    const shuffled = smartShuffle(list, '2');
    expect(shuffled[0]?.id).toBe('2');
    expect(shuffled).toHaveLength(3);
  });

  it('phân tán đều các bài của cùng ca sĩ, tránh trùng lặp liên tiếp', () => {
    // 3 ca sĩ, mỗi ca sĩ 3 bài
    const list: Track[] = [
      makeMockTrack('1', 'A'),
      makeMockTrack('2', 'A'),
      makeMockTrack('3', 'A'),
      makeMockTrack('4', 'B'),
      makeMockTrack('5', 'B'),
      makeMockTrack('6', 'B'),
      makeMockTrack('7', 'C'),
      makeMockTrack('8', 'C'),
      makeMockTrack('9', 'C'),
    ];

    // Chạy kiểm tra lặp lại 10 lần để đảm bảo tính ổn định
    for (let run = 0; run < 10; run++) {
      const shuffled = smartShuffle(list);
      expect(shuffled).toHaveLength(9);

      for (let i = 0; i < shuffled.length - 1; i++) {
        const currArtist = shuffled[i]?.artist.toLowerCase();
        const nextArtist = shuffled[i + 1]?.artist.toLowerCase();
        // Không thể có 2 bài của cùng 1 ca sĩ đứng cạnh nhau khi tỉ lệ ca sĩ cân bằng
        expect(currArtist).not.toBe(nextArtist);
      }
    }
  });

  it('xử lý an toàn khi toàn bộ bài hát chỉ thuộc về 1 ca sĩ duy nhất', () => {
    const list: Track[] = [
      makeMockTrack('1', 'Sơn Tùng M-TP'),
      makeMockTrack('2', 'Sơn Tùng M-TP'),
      makeMockTrack('3', 'Sơn Tùng M-TP'),
      makeMockTrack('4', 'Sơn Tùng M-TP'),
    ];

    const shuffled = smartShuffle(list);
    expect(shuffled).toHaveLength(4);
    const ids = new Set(shuffled.map((t) => t.id));
    expect(ids.size).toBe(4);
  });

  it('xử lý an toàn khi currentTrackId không tồn tại trong danh sách', () => {
    const list: Track[] = [
      makeMockTrack('1', 'A'),
      makeMockTrack('2', 'B'),
      makeMockTrack('3', 'C'),
    ];

    const shuffled = smartShuffle(list, 'non_existent_id');
    expect(shuffled).toHaveLength(3);
    const ids = new Set(shuffled.map((t) => t.id));
    expect(ids.size).toBe(3);
  });

  it('xử lý thư viện lớn (100 bài hát, 20 ca sĩ) đảm bảo không crash và không thất thoát dữ liệu', () => {
    const list: Track[] = [];
    for (let i = 0; i < 100; i++) {
      list.push(makeMockTrack(`track_${i}`, `Artist_${i % 20}`));
    }

    const shuffled = smartShuffle(list, 'track_42');
    expect(shuffled).toHaveLength(100);
    expect(shuffled[0]?.id).toBe('track_42');
    const ids = new Set(shuffled.map((t) => t.id));
    expect(ids.size).toBe(100);
  });
});

describe('interleaveTracksByArtist', () => {
  it('phân tán đều bài hát của các ca sĩ, xóa bỏ tình trạng dồn cục ở đầu danh sách', () => {
    // Giả sử có 4 bài của MCK ở đầu, sau đó 4 bài của Đen Vâu, 2 bài của Vũ
    const list: Track[] = [
      makeMockTrack('1', 'MCK'),
      makeMockTrack('2', 'MCK'),
      makeMockTrack('3', 'MCK'),
      makeMockTrack('4', 'MCK'),
      makeMockTrack('5', 'Đen Vâu'),
      makeMockTrack('6', 'Đen Vâu'),
      makeMockTrack('7', 'Đen Vâu'),
      makeMockTrack('8', 'Đen Vâu'),
      makeMockTrack('9', 'Vũ'),
      makeMockTrack('10', 'Vũ'),
    ];

    const interleaved = interleaveTracksByArtist(list);
    expect(interleaved).toHaveLength(10);

    // Không thể có 2 bài của MCK hay Đen Vâu nằm sát nhau liên tiếp
    for (let i = 0; i < interleaved.length - 1; i++) {
      const current = interleaved[i]?.artist.toLowerCase();
      const next = interleaved[i + 1]?.artist.toLowerCase();
      expect(current).not.toBe(next);
    }
  });

  it('bảo toàn 100% số lượng bài hát', () => {
    const list = [
      makeMockTrack('1', 'A'),
      makeMockTrack('2', 'A'),
      makeMockTrack('3', 'B'),
    ];
    const res = interleaveTracksByArtist(list);
    expect(res).toHaveLength(3);
    expect(res.map((t) => t.id).sort()).toEqual(['1', '2', '3']);
  });
});

describe('sortTracksByMode', () => {
  const list: Track[] = [
    makeMockTrack('1', 'Sơn Tùng', 'Cơn Mưa Ngang Qua'),
    makeMockTrack('2', 'Đen Vâu', 'Trốn Tìm'),
    makeMockTrack('3', 'Vũ', 'Lạ Lùng'),
  ];

  it('sắp xếp theo nghệ sĩ (A-Z)', () => {
    const sorted = sortTracksByMode(list, 'artist');
    expect(sorted.map((t) => t.artist)).toEqual(['Đen Vâu', 'Sơn Tùng', 'Vũ']);
  });

  it('sắp xếp theo tên bài hát (A-Z)', () => {
    const sorted = sortTracksByMode(list, 'title');
    expect(sorted.map((t) => t.title)).toEqual(['Cơn Mưa Ngang Qua', 'Lạ Lùng', 'Trốn Tìm']);
  });

  it('sắp xếp theo smart (đan xen)', () => {
    const sorted = sortTracksByMode(list, 'smart');
    expect(sorted).toHaveLength(3);
  });
});

