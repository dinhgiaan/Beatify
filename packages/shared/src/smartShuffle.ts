import type { Track } from './schemas';

/**
 * Thuật toán Smart Shuffle (Trộn bài thông minh):
 * Thay vì ngẫu nhiên đơn thuần (dễ làm 2-3 bài cùng 1 ca sĩ phát liên tiếp),
 * Smart Shuffle phân bổ đều các bài hát của cùng nghệ sĩ trên toàn bộ danh sách,
 * tối đa hóa khoảng cách giữa các bài cùng ca sĩ.
 *
 * @param tracks Danh sách bài hát gốc
 * @param currentTrackId ID bài hát đang phát (nếu có, bài này sẽ được ghim ở vị trí đầu tiên)
 * @returns Danh sách bài hát đã được xáo trộn thông minh
 */
export function smartShuffle(tracks: Track[], currentTrackId?: string | null): Track[] {
  if (!tracks || tracks.length <= 2) {
    return [...tracks];
  }

  // 1. Nếu có bài đang phát, tách riêng bài đó ra để giữ ở đầu danh sách
  let activeTrack: Track | null = null;
  const pool: Track[] = [];

  for (const t of tracks) {
    if (currentTrackId && t.id === currentTrackId && !activeTrack) {
      activeTrack = t;
    } else {
      pool.push(t);
    }
  }

  // 2. Gom nhóm các bài hát còn lại theo Nghệ sĩ
  const artistMap = new Map<string, Track[]>();
  for (const track of pool) {
    const artistKey = (track.artist || 'Unknown Artist').toLowerCase().trim();
    const list = artistMap.get(artistKey) || [];
    list.push(track);
    artistMap.set(artistKey, list);
  }

  // Xáo trộn ngẫu nhiên nội bộ các bài trong từng nghệ sĩ
  for (const list of artistMap.values()) {
    fisherYatesShuffle(list);
  }

  // 3. Phân bổ đan xen (Round-Robin có trọng số & Tránh lặp nghệ sĩ liên tiếp)
  const result: Track[] = [];
  let lastArtistKey: string | null = activeTrack
    ? (activeTrack.artist || 'Unknown Artist').toLowerCase().trim()
    : null;

  while (artistMap.size > 0) {
    // Tìm nghệ sĩ có số bài còn lại nhiều nhất trong TẤT CẢ nghệ sĩ
    const allSorted = Array.from(artistMap.entries()).sort((a, b) => b[1].length - a[1].length);
    const globalMax = allSorted[0] ? allSorted[0][1].length : 0;

    // Tìm các nghệ sĩ khả dụng khác với lastArtistKey
    const availableArtists = allSorted.filter(([key]) => key !== lastArtistKey);

    let selectedKey = '';

    if (availableArtists.length > 0) {
      // Ưu tiên cao nhất cho nghệ sĩ đang có số bài bằng globalMax để tránh bị dồn ở cuối
      const topCandidates = availableArtists.filter(([, list]) => list.length === globalMax);
      const candidatesToPick = topCandidates.length > 0
        ? topCandidates
        : availableArtists.filter(([, list]) => list.length === (availableArtists[0]?.[1].length ?? 1));

      const chosen = candidatesToPick[Math.floor(Math.random() * candidatesToPick.length)] ?? candidatesToPick[0];
      if (chosen) {
        selectedKey = chosen[0];
      }
    }

    if (!selectedKey) {
      // Bắt buộc phải chọn lại nghệ sĩ vừa phát nếu chỉ còn mỗi nghệ sĩ đó
      const remaining = Array.from(artistMap.keys());
      selectedKey = remaining[0] ?? '';
    }

    if (!selectedKey) break;

    const trackList = artistMap.get(selectedKey);
    if (trackList && trackList.length > 0) {
      const pickedTrack = trackList.pop();
      if (pickedTrack) {
        result.push(pickedTrack);
        lastArtistKey = selectedKey;
      }

      if (trackList.length === 0) {
        artistMap.delete(selectedKey);
      }
    } else {
      artistMap.delete(selectedKey);
    }
  }

  // 4. Ghép bài đang phát vào đầu danh sách (nếu có)
  if (activeTrack) {
    return [activeTrack, ...result];
  }

  return result;
}

/**
 * Thuật toán Fisher-Yates shuffle thuần túy
 */
function fisherYatesShuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i] as T;
    array[i] = array[j] as T;
    array[j] = temp;
  }
  return array;
}

export type TrackSortMode = 'smart' | 'artist' | 'title' | 'recent';

/**
 * Thuật toán phân bổ đan xen nghệ sĩ tối ưu (Smart Interleaving Artist Distribution).
 * Tránh tình trạng dồn cục hàng chục bài của 1 ca sĩ ở đầu danh sách khi quét thư mục A-Z.
 * Đảm bảo:
 * 1. Phân tán đều các bài hát của từng ca sĩ trên toàn bộ danh sách.
 * 2. Tối đa hóa khoảng cách giữa các bài của cùng một nghệ sĩ.
 * 3. Bảo toàn 100% dữ liệu gốc, không làm mất bất kỳ bài hát nào.
 */
export function interleaveTracksByArtist(tracks: Track[]): Track[] {
  if (!tracks || tracks.length <= 2) {
    return [...tracks];
  }

  // 1. Gom nhóm các bài hát theo Nghệ sĩ
  const artistMap = new Map<string, Track[]>();
  for (const track of tracks) {
    const artistKey = (track.artist || 'Unknown Artist').trim().toLowerCase();
    const list = artistMap.get(artistKey) || [];
    list.push(track);
    artistMap.set(artistKey, list);
  }

  // Xáo trộn nhẹ nội bộ các bài của từng ca sĩ để thêm phần tự nhiên
  for (const list of artistMap.values()) {
    fisherYatesShuffle(list);
  }

  // 2. Phân bổ đan xen có trọng số (Greedy Interleaving by Remaining Count)
  const result: Track[] = [];
  let lastArtistKey: string | null = null;

  while (artistMap.size > 0) {
    const allSorted = Array.from(artistMap.entries()).sort((a, b) => b[1].length - a[1].length);
    const globalMax = allSorted[0]?.[1].length ?? 0;

    const availableArtists = allSorted.filter(([key]) => key !== lastArtistKey);
    let selectedKey = '';

    if (availableArtists.length > 0) {
      const topCandidates = availableArtists.filter(([, list]) => list.length === globalMax);
      const candidatesToPick =
        topCandidates.length > 0
          ? topCandidates
          : availableArtists.filter(
              ([, list]) => list.length === (availableArtists[0]?.[1].length ?? 1)
            );

      const chosen =
        candidatesToPick[Math.floor(Math.random() * candidatesToPick.length)] ?? candidatesToPick[0];
      if (chosen) {
        selectedKey = chosen[0];
      }
    }

    if (!selectedKey) {
      const remaining = Array.from(artistMap.keys());
      selectedKey = remaining[0] ?? '';
    }

    if (!selectedKey) break;

    const trackList = artistMap.get(selectedKey);
    if (trackList && trackList.length > 0) {
      const pickedTrack = trackList.pop();
      if (pickedTrack) {
        result.push(pickedTrack);
        lastArtistKey = selectedKey;
      }
      if (trackList.length === 0) {
        artistMap.delete(selectedKey);
      }
    } else {
      artistMap.delete(selectedKey);
    }
  }

  return result;
}

/**
 * Sắp xếp danh sách bài hát theo các chế độ hiển thị thông minh
 */
export function sortTracksByMode(tracks: Track[], mode: TrackSortMode): Track[] {
  if (!tracks || tracks.length <= 1) return [...tracks];

  switch (mode) {
    case 'smart':
      return interleaveTracksByArtist(tracks);
    case 'artist':
      return [...tracks].sort((a, b) => {
        const artistCompare = (a.artist || '').localeCompare(b.artist || '', 'vi', {
          sensitivity: 'base',
        });
        if (artistCompare !== 0) return artistCompare;
        return (a.title || '').localeCompare(b.title || '', 'vi', { sensitivity: 'base' });
      });
    case 'title':
      return [...tracks].sort((a, b) =>
        (a.title || '').localeCompare(b.title || '', 'vi', { sensitivity: 'base' })
      );
    case 'recent':
      return [...tracks].reverse();
    default:
      return [...tracks];
  }
}
