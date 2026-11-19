import type { Track } from './schemas';
import type { ListeningRecord } from './stats';
import { SKIP_RATIO_THRESHOLD } from './constants';

export type MusicMood = 'chill' | 'melancholy' | 'uplifting' | 'energetic' | 'focus';

export interface MoodProfile {
  primaryMood: MusicMood;
  valence: number; // 0.0 (buồn / u tối) -> 1.0 (tươi sáng / lạc quan)
  arousal: number; // 0.0 (êm dịu / chậm) -> 1.0 (bốc / năng lượng cao)
  confidence: number;
  tags: string[];
}

export interface UserMoodPrediction {
  mood: MusicMood;
  title: string;
  subtitle: string;
  badgeText: string;
  confidence: number;
  reason: string;
}

// ============================================================================
// TỪ ĐIỂN TỪ KHÓA CẢM XÚC (TIẾNG VIỆT & TIẾNG ANH)
// ============================================================================

const MELANCHOLY_WORDS = new Set([
  'buồn', 'khóc', 'mưa', 'đêm', 'cô đơn', 'nhớ', 'chia tay', 'một mình',
  'sầu', 'lạc', 'đau', 'xa', 'tàn', 'lặng', 'vỡ', 'nước mắt', 'người cũ',
  'dĩ vãng', 'quên', 'lỡ', 'tiếc', 'u sầu', 'hoài niệm', 'chia ly', 'đơn côi',
  'sad', 'alone', 'cry', 'rain', 'miss', 'goodbye', 'broken', 'dark', 'lost',
  'hurt', 'sorrow', 'tears', 'heartbreak', 'lonely', 'melancholy', 'pain',
]);

const CHILL_WORDS = new Set([
  'chill', 'lofi', 'acoustic', 'ngủ', 'mộng', 'mơ', 'bình yên', 'nhẹ nhàng',
  'lãng đãng', 'phiêu', 'hoàng hôn', 'mây', 'gió', 'biển', 'thong dong',
  'coffee', 'calm', 'relax', 'dream', 'soft', 'slow', 'breeze', 'quiet',
  'peace', 'sunset', 'sky', 'clouds', 'gentle', 'serene', 'mellow',
]);

const UPLIFTING_WORDS = new Set([
  'yêu', 'vui', 'nắng', 'hè', 'cười', 'hạnh phúc', 'bình minh', 'tươi',
  'xinh', 'say đắm', 'ngọt ngào', 'rạng rỡ', 'tình ca', 'bên nhau', 'mê say',
  'happy', 'love', 'smile', 'sun', 'summer', 'bright', 'good', 'feel',
  'sweet', 'joy', 'magic', 'positive', 'blessed', 'glow', 'sunshine',
]);

const ENERGETIC_WORDS = new Set([
  'cháy', 'bùng', 'bay', 'quẩy', 'gắt', 'lửa', 'chiến', 'bão', 'cuồng',
  'đua', 'hăng', 'bốc', 'hút', 'dậy sóng',
  'party', 'dance', 'hyped', 'club', 'up', 'high', 'beat', 'drop', 'bass',
  'fire', 'trap', 'drill', 'power', 'fast', 'hard', 'rock', 'wild', 'energy',
]);

const FOCUS_WORDS = new Set([
  'focus', 'study', 'work', 'tập trung', 'instrumental', 'ambient', 'piano',
  'lo-fi beat', 'chillhop', 'deep work', 'flow',
]);

/**
 * Trích xuất các token từ chuỗi văn bản (chuẩn hóa tiếng Việt & tiếng Anh)
 */
export function extractTextTokens(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

// ============================================================================
// PHÂN TÍCH CẢM XÚC TỪNG BÀI HÁT (TRACK MOOD PROFILING)
// ============================================================================

/**
 * Phân tích và dự đoán hồ sơ cảm xúc (MoodProfile) của một bài hát
 * Dựa trên: Từ khóa tiêu đề, Thể loại, BPM, Camelot Key, Loudness/ReplayGain
 */
export function analyzeTrackMood(track: Track): MoodProfile {
  let scoreMelancholy = 0;
  let scoreChill = 0;
  let scoreUplifting = 0;
  let scoreEnergetic = 0;
  let scoreFocus = 0;
  const tags: string[] = [];

  const textToScan = `${track.title} ${track.album || ''}`.toLowerCase();
  const tokens = extractTextTokens(textToScan);

  // 1. Phân tích từ khóa trong tiêu đề và album
  for (const token of tokens) {
    if (MELANCHOLY_WORDS.has(token)) {
      scoreMelancholy += 3.5;
      tags.push(token);
    }
    if (CHILL_WORDS.has(token)) {
      scoreChill += 3.5;
      tags.push(token);
    }
    if (UPLIFTING_WORDS.has(token)) {
      scoreUplifting += 3.5;
      tags.push(token);
    }
    if (ENERGETIC_WORDS.has(token)) {
      scoreEnergetic += 3.5;
      tags.push(token);
    }
    if (FOCUS_WORDS.has(token)) {
      scoreFocus += 3.5;
      tags.push(token);
    }
  }

  // Quét cụm từ 2 từ (n-gram)
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]} ${tokens[i + 1]}`;
    if (MELANCHOLY_WORDS.has(bigram)) scoreMelancholy += 4.5;
    if (CHILL_WORDS.has(bigram)) scoreChill += 4.5;
    if (UPLIFTING_WORDS.has(bigram)) scoreUplifting += 4.5;
    if (ENERGETIC_WORDS.has(bigram)) scoreEnergetic += 4.5;
    if (FOCUS_WORDS.has(bigram)) scoreFocus += 4.5;
  }

  // 2. Phân tích Thể loại (Genre)
  if (track.genre) {
    const g = track.genre.toLowerCase();
    if (g.includes('ballad') || g.includes('soul') || g.includes('blues') || g.includes('sad')) {
      scoreMelancholy += 4;
      tags.push('ballad');
    }
    if (g.includes('acoustic') || g.includes('lofi') || g.includes('lo-fi') || g.includes('indie')) {
      scoreChill += 4;
      tags.push('acoustic_lofi');
    }
    if (g.includes('pop') || g.includes('disco') || g.includes('funk') || g.includes('latin')) {
      scoreUplifting += 3.5;
      tags.push('pop_dance');
    }
    if (g.includes('rap') || g.includes('hip-hop') || g.includes('hip hop') || g.includes('trap') || g.includes('edm') || g.includes('rock') || g.includes('drill')) {
      scoreEnergetic += 4.5;
      tags.push('hiphop_edm');
    }
    if (g.includes('instrumental') || g.includes('ambient') || g.includes('classical')) {
      scoreFocus += 4;
      tags.push('instrumental');
    }
  }

  // 3. Phân tích Tempo (BPM)
  if (typeof track.bpm === 'number' && track.bpm > 0) {
    if (track.bpm < 85) {
      scoreMelancholy += 2.5;
      scoreChill += 2;
    } else if (track.bpm >= 85 && track.bpm < 105) {
      scoreChill += 2.5;
      scoreFocus += 2;
    } else if (track.bpm >= 105 && track.bpm < 125) {
      scoreUplifting += 2.5;
      scoreEnergetic += 1.5;
    } else {
      // BPM >= 125
      scoreEnergetic += 4;
    }
  }

  // 4. Phân tích Camelot Musical Key
  if (track.key) {
    const k = track.key.trim().toUpperCase();
    if (k.endsWith('A')) {
      // Minor key (Gam thứ) -> thiên về sâu lắng, suy tư, buồn
      scoreMelancholy += 2.5;
      scoreChill += 1;
    } else if (k.endsWith('B')) {
      // Major key (Gam trưởng) -> thiên về tươi sáng, lạc quan, bừng sáng
      scoreUplifting += 2.5;
      scoreEnergetic += 1;
    }
  }

  // 5. Phân tích Loudness / ReplayGain
  if (typeof track.replayGain === 'number') {
    if (track.replayGain < -8.5) {
      // Âm lượng bốc, nén mạnh
      scoreEnergetic += 2;
    } else if (track.replayGain > -4.5) {
      // Âm lượng êm dịu, mộc
      scoreChill += 2;
      scoreMelancholy += 1;
    }
  }

  // Tổng hợp Mood cao điểm nhất
  const moods: Array<{ mood: MusicMood; score: number }> = [
    { mood: 'melancholy', score: scoreMelancholy },
    { mood: 'chill', score: scoreChill },
    { mood: 'uplifting', score: scoreUplifting },
    { mood: 'energetic', score: scoreEnergetic },
    { mood: 'focus', score: scoreFocus },
  ];

  moods.sort((a, b) => b.score - a.score);
  const best = moods[0] ?? { mood: 'chill', score: 0 };
  const primaryMood = best.score > 0 ? best.mood : 'chill';
  if (!tags.includes(primaryMood)) {
    tags.push(primaryMood);
  }

  // Tính Valence (0: Buồn -> 1: Vui) & Arousal (0: Êm dịu -> 1: Bốc lửa)
  const total = Math.max(1, scoreMelancholy + scoreChill + scoreUplifting + scoreEnergetic + scoreFocus);
  const valence = Math.min(1.0, Math.max(0.0, (scoreUplifting * 1.0 + scoreChill * 0.6 + scoreFocus * 0.5 + scoreEnergetic * 0.7) / total));
  const arousal = Math.min(1.0, Math.max(0.0, (scoreEnergetic * 1.0 + scoreUplifting * 0.7 + scoreFocus * 0.4 + scoreMelancholy * 0.3) / total));

  return {
    primaryMood,
    valence: Number(valence.toFixed(2)),
    arousal: Number(arousal.toFixed(2)),
    confidence: Number(Math.min(1.0, Math.max(0.4, best.score / 8)).toFixed(2)),
    tags,
  };
}

// ============================================================================
// DỰ ĐOÁN CẢM XÚC NGƯỜI DÙNG (USER MOOD PREDICTION)
// ============================================================================

export interface PredictUserMoodOptions {
  now?: number;
  recentTrackIds?: string[];
  records?: ListeningRecord[];
  tracksMap?: Map<string, Track>;
}

/**
 * Dự đoán tâm trạng hiện tại của người dùng dựa trên:
 * 1. Chuỗi bài nghe gần nhất (Recent behavior)
 * 2. Tỷ lệ nghe trọn vẹn vs Skip
 * 3. Chu kỳ nhịp sinh học theo thời gian trong ngày (Circadian Rhythm)
 */
export function predictUserMood(options: PredictUserMoodOptions = {}): UserMoodPrediction {
  const now = options.now ?? Date.now();
  const hour = new Date(now).getHours();

  // 1. Phân tích điểm nền theo khung giờ trong ngày (Circadian Base Scores)
  let baseMelancholy = 0;
  let baseChill = 0;
  let baseUplifting = 0;
  let baseEnergetic = 0;
  let baseFocus = 0;

  if (hour >= 22 || hour < 5) {
    // Đêm muộn (22:00 - 04:59): Không gian sâu lắng, suy tư hoặc thư thái trước khi ngủ
    baseMelancholy = 5;
    baseChill += 4;
  } else if (hour >= 5 && hour < 11) {
    // Sáng sớm (05:00 - 10:59): Khởi đầu tích cực, tươi sáng, đón chào ngày mới
    baseUplifting = 5;
    baseChill += 3;
  } else if (hour >= 11 && hour < 17) {
    // Buổi chiều (11:00 - 16:59): Giữ nhịp làm việc tập trung hoặc giải tỏa căng thẳng
    baseFocus = 4.5;
    baseEnergetic = 3.5;
    baseChill += 2.5;
  } else {
    // Buổi tối (17:00 - 21:59): Xả hơi, giải trí thư giãn hoặc hưng phấn cùng bạn bè
    baseChill += 4.5;
    baseUplifting = 3.5;
    baseEnergetic = 3;
  }

  // 2. Phân tích lịch sử nghe gần nhất (Recent Listening Analysis)
  const recentIds = options.recentTrackIds || [];
  const tracksMap = options.tracksMap;
  const records = options.records || [];

  let historyMelancholy = 0;
  let historyChill = 0;
  let historyUplifting = 0;
  let historyEnergetic = 0;
  let historyFocus = 0;
  let analyzedRecentCount = 0;

  // Lấy tối đa 6 bài nghe gần nhất
  if (tracksMap && recentIds.length > 0) {
    const candidateIds = recentIds.slice(0, 6);
    for (let i = 0; i < candidateIds.length; i++) {
      const tId = candidateIds[i];
      if (!tId) continue;
      const track = tracksMap.get(tId);
      if (!track) continue;

      const profile = analyzeTrackMood(track);
      // Trọng số giảm dần theo độ mới: bài vừa nghe tức thì có trọng số cao nhất (1.0 -> 0.4)
      const weight = Math.max(0.4, 1.0 - i * 0.12);

      switch (profile.primaryMood) {
        case 'melancholy':
          historyMelancholy += 6 * weight;
          break;
        case 'chill':
          historyChill += 6 * weight;
          break;
        case 'uplifting':
          historyUplifting += 6 * weight;
          break;
        case 'energetic':
          historyEnergetic += 6 * weight;
          break;
        case 'focus':
          historyFocus += 6 * weight;
          break;
      }
      analyzedRecentCount++;
    }
  }

  // Kiểm tra thêm các bản ghi skip trong 1 giờ qua:
  // Nếu người dùng skip nhiều bài energetic -> hạ energetic, tăng chill
  const oneHourAgo = now - 3600_000;
  const recentRecordsInHour = records.filter((r) => r.timestamp >= oneHourAgo && r.timestamp <= now);
  for (const rec of recentRecordsInHour) {
    if (rec.durationSec > 0 && rec.listenedSec / rec.durationSec < SKIP_RATIO_THRESHOLD) {
      // Bài bị skip: giảm nhẹ điểm thể loại tương ứng
      if (tracksMap) {
        const skippedTrack = tracksMap.get(rec.trackId);
        if (skippedTrack) {
          const skipProfile = analyzeTrackMood(skippedTrack);
          if (skipProfile.primaryMood === 'energetic') historyEnergetic -= 2;
          if (skipProfile.primaryMood === 'melancholy') historyMelancholy -= 2;
        }
      }
    }
  }

  // Tổng hợp điểm số (kết hợp nền khung giờ + hành vi gần nhất)
  const totalMelancholy = baseMelancholy + historyMelancholy;
  const totalChill = baseChill + historyChill;
  const totalUplifting = baseUplifting + historyUplifting;
  const totalEnergetic = baseEnergetic + historyEnergetic;
  const totalFocus = baseFocus + historyFocus;

  const moodScores: Array<{ mood: MusicMood; score: number }> = [
    { mood: 'melancholy', score: totalMelancholy },
    { mood: 'chill', score: totalChill },
    { mood: 'uplifting', score: totalUplifting },
    { mood: 'energetic', score: totalEnergetic },
    { mood: 'focus', score: totalFocus },
  ];

  moodScores.sort((a, b) => b.score - a.score);
  const bestMood = moodScores[0]?.mood ?? 'chill';

  // Độ tin cậy (confidence)
  const confidence = analyzedRecentCount >= 3 ? 0.9 : analyzedRecentCount >= 1 ? 0.78 : 0.65;

  switch (bestMood) {
    case 'melancholy':
      return {
        mood: 'melancholy',
        title: 'Tâm trạng: Trầm lắng & Hoài niệm',
        subtitle: 'Những giai điệu sâu lắng chạm đến góc riêng của bạn',
        badgeText: 'Trầm lắng',
        confidence,
        reason: analyzedRecentCount > 0
          ? 'Đồng điệu với những bài hát da diết bạn vừa nghe'
          : 'Không gian tĩnh lặng của màn đêm',
      };
    case 'energetic':
      return {
        mood: 'energetic',
        title: 'Tâm trạng: Bùng nổ năng lượng',
        subtitle: 'Bứt phá cảm xúc cùng những giai điệu bốc lửa',
        badgeText: 'Sôi động',
        confidence,
        reason: analyzedRecentCount > 0
          ? 'Cộng hưởng từ nhịp điệu sôi động gần đây của bạn'
          : 'Tiếp thêm năng lượng bứt phá ngày mới',
      };
    case 'uplifting':
      return {
        mood: 'uplifting',
        title: 'Tâm trạng: Tươi sáng & Lạc quan',
        subtitle: 'Giai điệu tích cực lan tỏa niềm vui ngày mới',
        badgeText: 'Lạc quan',
        confidence,
        reason: analyzedRecentCount > 0
          ? 'Đồng hành cùng nguồn năng lượng vui tươi bạn đang chọn'
          : 'Khởi đầu ngày mới tràn đầy sức sống',
      };
    case 'focus':
      return {
        mood: 'focus',
        title: 'Tâm trạng: Tập trung & Dòng chảy',
        subtitle: 'Âm nhạc mượt mà đồng hành cùng sự tập trung tối đa',
        badgeText: 'Tập trung',
        confidence,
        reason: 'Nhịp điệu đều đặn lý tưởng cho công việc và học tập',
      };
    case 'chill':
    default:
      return {
        mood: 'chill',
        title: 'Tâm trạng: Thư thái & Bình yên',
        subtitle: 'Không gian âm nhạc êm dịu xoa dịu tâm hồn',
        badgeText: 'Thư thái',
        confidence,
        reason: analyzedRecentCount > 0
          ? 'Giai điệu êm dịu phù hợp với nhịp nghe của bạn'
          : 'Giai điệu thư giãn nhẹ nhàng dành cho bạn',
      };
  }
}
