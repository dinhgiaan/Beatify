import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Vibration,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { FullReplayReport, UserProfile } from '@music-app/shared';
import { statsStorage } from '../services/stats/statsStorage';
import {
  colors,
  spacing,
  radius,
  fontSizes,
  fontWeights,
} from '../theme';
import {
  CloseIcon,
  EditIcon,
  HeadphonesIcon,
  DiscIcon,
  MusicNoteIcon,
  HeartIcon,
  FlameIcon,
  StarIcon,
  TrophyIcon,
  MoonIcon,
  ClockIcon,
  CheckIcon,
  ProfileIcon,
  MysteryIcon,
  CameraIcon,
} from './icons/SvgIcons';

function formatVietnameseDate(dateStr?: string | null): string {
  if (!dateStr) return 'Gần đây';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
  totalLibraryTracksCount: number;
  onProfileUpdated?: (profile: UserProfile) => void;
}

const AVATAR_OPTIONS = [
  'headphones',
  'disc',
  'note',
  'heart',
  'flame',
  'star',
  'trophy',
  'moon',
];

function renderAvatarSvg(key: string, size = 32, color = '#1DB954') {
  switch (key) {
    case 'disc':
      return <DiscIcon size={size} color={color} />;
    case 'note':
      return <MusicNoteIcon size={size} color={color} />;
    case 'heart':
      return <HeartIcon size={size} color={color} />;
    case 'flame':
      return <FlameIcon size={size} color={color} />;
    case 'star':
      return <StarIcon size={size} color={color} />;
    case 'trophy':
      return <TrophyIcon size={size} color={color} />;
    case 'moon':
      return <MoonIcon size={size} color={color} />;
    case 'headphones':
    default:
      return <HeadphonesIcon size={size} color={color} />;
  }
}

function renderMilestoneSvg(id: string, achieved: boolean) {
  const color = achieved ? '#1DB954' : '#555555';
  switch (id) {
    case 'first_song':
      return <MusicNoteIcon size={24} color={color} />;
    case 'night_owl':
      return <MoonIcon size={24} color={color} />;
    case 'plays_50':
      return <StarIcon size={24} color={color} />;
    case 'minutes_300':
      return <ClockIcon size={24} color={color} />;
    case 'plays_200':
      return <TrophyIcon size={24} color={color} />;
    case 'hours_20':
      return <FlameIcon size={24} color={color} />;
    default:
      return <MysteryIcon size={24} color={color} />;
  }
}

export function ProfileModal({
  visible,
  onClose,
  totalLibraryTracksCount,
  onProfileUpdated,
}: ProfileModalProps) {
  const [report, setReport] = useState<FullReplayReport | null>(null);
  const [activeTab, setActiveTab] = useState<'week' | 'month' | 'year' | 'memories'>('week');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [tempName, setTempName] = useState('');
  const [tempBio, setTempBio] = useState('');
  const [tempAvatarUri, setTempAvatarUri] = useState('');
  const [tempAvatarKey, setTempAvatarKey] = useState('headphones');

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible]);

  const loadData = async () => {
    const data = await statsStorage.getReplayReport();
    setReport(data);
    setTempName(data.profile.displayName);
    setTempBio(data.profile.bio);
    setTempAvatarUri(data.profile.avatarUri || '');
    setTempAvatarKey(data.profile.avatarKey || data.profile.avatarEmoji || 'headphones');
    setIsEditingProfile(false);
  };

  const handleStartEditing = () => {
    if (!report) return;
    setTempName(report.profile.displayName);
    setTempBio(report.profile.bio);
    setTempAvatarUri(report.profile.avatarUri || '');
    setTempAvatarKey(report.profile.avatarKey || report.profile.avatarEmoji || 'headphones');
    setIsEditingProfile(true);
    Vibration.vibrate(10);
  };

  const handlePickImage = async () => {
    try {
      Vibration.vibrate(10);
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          'Cần cấp quyền Thư viện ảnh',
          'Vui lòng cho phép Beatify truy cập Thư viện ảnh trong Cài đặt iPhone để chọn ảnh đại diện của bạn.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset && asset.uri) {
          const fileName = `user_avatar_${Date.now()}.jpg`;
          const destPath = `${FileSystem.documentDirectory || ''}${fileName}`;
          await FileSystem.copyAsync({
            from: asset.uri,
            to: destPath,
          });
          setTempAvatarUri(destPath);
          Vibration.vibrate(10);
        }
      }
    } catch (err) {
      console.warn('Lỗi chọn ảnh đại diện từ iPhone:', err);
      Alert.alert('Không thể chọn ảnh', 'Đã xảy ra lỗi khi mở thư viện ảnh của thiết bị.');
    }
  };

  const handleSaveProfile = async () => {
    if (!report) return;
    const trimmedName = tempName.trim() || 'Người Yêu Nhạc';
    const trimmedBio = tempBio.trim();
    const trimmedUri = tempAvatarUri.trim();
    const updated: UserProfile = {
      ...report.profile,
      displayName: trimmedName,
      bio: trimmedBio,
      avatarKey: tempAvatarKey,
      avatarEmoji: tempAvatarKey,
      avatarUri: trimmedUri,
    };
    await statsStorage.saveUserProfile(updated);
    setReport({ ...report, profile: updated });
    setIsEditingProfile(false);
    onProfileUpdated?.(updated);
    Vibration.vibrate(10);
  };

  const handleCancelEditing = () => {
    setIsEditingProfile(false);
    Vibration.vibrate(10);
  };

  if (!report) return null;

  const currentPeriodStats =
    activeTab === 'week'
      ? report.week
      : activeTab === 'month'
      ? report.month
      : report.year;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>HỒ SƠ & THỐNG KÊ</Text>
              <Text style={styles.headerSubtitle}>Beatify Replay & Dấu ấn âm nhạc của bạn</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => {
                Vibration.vibrate(10);
                onClose();
              }}
              activeOpacity={0.7}
            >
              <CloseIcon size={20} color="#b3b3b3" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Thẻ thông tin cá nhân hoặc Form chỉnh sửa */}
            {isEditingProfile ? (
              <View style={styles.editProfileContainer}>
                <Text style={styles.editSectionTitle}>CHỈNH SỬA HỒ SƠ & ẢNH ĐẠI DIỆN</Text>

                {/* Xem trước Avatar */}
                <View style={styles.editAvatarPreviewRow}>
                  <View style={styles.avatarBox}>
                    {tempAvatarUri ? (
                      <Image
                        source={{ uri: tempAvatarUri }}
                        style={styles.avatarImage}
                        resizeMode="cover"
                      />
                    ) : (
                      renderAvatarSvg(tempAvatarKey, 34, colors.primary)
                    )}
                  </View>
                  <View style={styles.editAvatarHint}>
                    <Text style={styles.editAvatarHintTitle}>Xem trước hiển thị</Text>
                    <Text style={styles.editAvatarHintSub}>
                      {tempAvatarUri ? 'Ảnh từ Thư viện iPhone' : `Biểu tượng: ${tempAvatarKey}`}
                    </Text>
                    {tempAvatarUri ? (
                      <TouchableOpacity
                        style={styles.clearAvatarUriBtn}
                        onPress={() => {
                          setTempAvatarUri('');
                          Vibration.vibrate(10);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.clearAvatarUriBtnText}>Gỡ ảnh (Dùng biểu tượng)</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>

                {/* Nút chọn ảnh trực tiếp từ Thư viện iPhone */}
                <TouchableOpacity
                  style={styles.pickImageBtn}
                  onPress={handlePickImage}
                  activeOpacity={0.8}
                >
                  <CameraIcon size={18} color={colors.textDark} />
                  <Text style={styles.pickImageBtnText}>
                    {tempAvatarUri ? 'Đổi ảnh' : 'Chọn ảnh từ iPhone'}
                  </Text>
                </TouchableOpacity>

                {/* Chọn biểu tượng âm nhạc */}
                <Text style={styles.editInputLabel}>Hoặc chọn biểu tượng đại diện</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.avatarOptionsRow}
                >
                  {AVATAR_OPTIONS.map((opt) => {
                    const isSelected = !tempAvatarUri && tempAvatarKey === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.avatarOptionBtn, isSelected && styles.avatarOptionBtnActive]}
                        onPress={() => {
                          Vibration.vibrate(10);
                          setTempAvatarUri('');
                          setTempAvatarKey(opt);
                        }}
                        activeOpacity={0.7}
                      >
                        {renderAvatarSvg(opt, 22, isSelected ? colors.primary : colors.textTertiary)}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Tên hiển thị */}
                <Text style={styles.editInputLabel}>Tên của bạn</Text>
                <TextInput
                  style={styles.editTextInput}
                  value={tempName}
                  onChangeText={setTempName}
                  maxLength={32}
                  placeholder="Tên hiển thị..."
                  placeholderTextColor={colors.textTertiary}
                />

                {/* Giới thiệu ngắn */}
                <Text style={styles.editInputLabel}>Giới thiệu ngắn (Bio)</Text>
                <TextInput
                  style={[styles.editTextInput, styles.bioInput]}
                  value={tempBio}
                  onChangeText={setTempBio}
                  maxLength={120}
                  multiline
                  placeholder="Giới thiệu bản thân..."
                  placeholderTextColor={colors.textTertiary}
                />

                {/* Cặp nút Lưu / Hủy */}
                <View style={styles.editActionRow}>
                  <TouchableOpacity
                    style={styles.editCancelBtn}
                    onPress={handleCancelEditing}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.editCancelBtnText}>Hủy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.editSaveBtn}
                    onPress={handleSaveProfile}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.editSaveBtnText}>Lưu thay đổi</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.profileCard}>
                {/* Nút icon Edit đặt ở top-right góc trên bên phải */}
                <TouchableOpacity
                  style={styles.profileTopRightEditBtn}
                  onPress={handleStartEditing}
                  activeOpacity={0.7}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityLabel="Chỉnh sửa hồ sơ cá nhân"
                >
                  <EditIcon size={16} color={colors.primary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.avatarBox}
                  onPress={handleStartEditing}
                  activeOpacity={0.8}
                  accessibilityLabel="Bấm để chỉnh sửa hồ sơ và ảnh đại diện"
                >
                  {report.profile.avatarUri ? (
                    <Image
                      source={{ uri: report.profile.avatarUri }}
                      style={styles.avatarImage}
                      resizeMode="cover"
                    />
                  ) : (
                    renderAvatarSvg(
                      report.profile.avatarKey || report.profile.avatarEmoji || 'headphones',
                      34,
                      colors.primary
                    )
                  )}
                  <View style={styles.avatarBadge}>
                    <EditIcon size={10} color={colors.textDark} />
                  </View>
                </TouchableOpacity>

                <View style={styles.profileInfo}>
                  <Text style={styles.displayName} numberOfLines={1}>
                    {report.profile.displayName}
                  </Text>
                  {report.profile.bio ? (
                    <Text style={styles.bioText} numberOfLines={2}>
                      {report.profile.bio}
                    </Text>
                  ) : null}
                  <View style={styles.joinedDateRow}>
                    <ClockIcon size={13} color={colors.textTertiary} />
                    <Text style={styles.joinedDateText}>
                      Bắt đầu hành trình: {formatVietnameseDate(report.profile.joinedDate)}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Cấp bậc Hip-hop đường phố (Street Rank) */}
            {report.streetRank && (
              <View style={styles.streetRankRow}>
                <View style={styles.streetRankPill}>
                  <Text style={styles.streetRankEmoji}>{report.streetRank.badge}</Text>
                  <Text style={styles.streetRankTitle}>{report.streetRank.title}</Text>
                  <View style={styles.streetRankLvl}>
                    <Text style={styles.streetRankLvlText}>LV.{report.streetRank.level}</Text>
                  </View>
                </View>
                <Text style={styles.streetRankSub}>{report.streetRank.description}</Text>
              </View>
            )}

            {/* Chỉ số nhanh bộ sưu tập */}
            <View style={styles.quickStatsRow}>
              <View style={styles.quickStatBox}>
                <Text style={styles.quickStatVal}>{totalLibraryTracksCount}</Text>
                <Text style={styles.quickStatLabel}>Bài trong kho</Text>
              </View>
              <View style={styles.quickStatBox}>
                <Text style={styles.quickStatVal}>{report.allTime.totalMinutes}</Text>
                <Text style={styles.quickStatLabel}>Phút đã nghe</Text>
              </View>
              <View style={styles.quickStatBox}>
                <Text style={styles.quickStatVal}>{report.allTime.totalPlays}</Text>
                <Text style={styles.quickStatLabel}>Lượt phát</Text>
              </View>
            </View>

            {/* Thanh chọn Tab thời gian */}
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tabItem, activeTab === 'week' && styles.tabItemActive]}
                onPress={() => {
                  Vibration.vibrate(10);
                  setActiveTab('week');
                }}
              >
                <Text style={[styles.tabText, activeTab === 'week' && styles.tabTextActive]}>
                  Tuần này
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, activeTab === 'month' && styles.tabItemActive]}
                onPress={() => {
                  Vibration.vibrate(10);
                  setActiveTab('month');
                }}
              >
                <Text style={[styles.tabText, activeTab === 'month' && styles.tabTextActive]}>
                  Tháng này
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, activeTab === 'year' && styles.tabItemActive]}
                onPress={() => {
                  Vibration.vibrate(10);
                  setActiveTab('year');
                }}
              >
                <Text style={[styles.tabText, activeTab === 'year' && styles.tabTextActive]}>
                  Năm 2026
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, activeTab === 'memories' && styles.tabItemActive]}
                onPress={() => {
                  Vibration.vibrate(10);
                  setActiveTab('memories');
                }}
              >
                <Text style={[styles.tabText, activeTab === 'memories' && styles.tabTextActive]}>
                  Kỷ niệm
                </Text>
              </TouchableOpacity>
            </View>

            {/* Nội dung Tab Thống kê (Tuần, Tháng, Năm) */}
            {activeTab !== 'memories' && (
              <View style={styles.periodContent}>
                {/* Tổng quan giai đoạn */}
                <View style={styles.metricBanner}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricNumber}>{currentPeriodStats.totalMinutes}</Text>
                    <Text style={styles.metricLabel}>Phút nghe nhạc</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <Text style={styles.metricNumber}>{currentPeriodStats.totalPlays}</Text>
                    <Text style={styles.metricLabel}>Lượt nghe</Text>
                  </View>
                </View>

                {/* Top bài hát */}
                <View style={styles.sectionBox}>
                  <View style={styles.sectionTitleRow}>
                    {activeTab === 'week' ? (
                      <FlameIcon size={16} color="#ff7700" />
                    ) : activeTab === 'month' ? (
                      <TrophyIcon size={16} color="#ffd700" />
                    ) : (
                      <StarIcon size={16} color="#ffd700" />
                    )}
                    <Text style={styles.sectionTitle}>
                      {activeTab === 'week'
                        ? 'TOP BÀI HÁT TUẦN NÀY'
                        : activeTab === 'month'
                        ? 'QUÁN QUÂN THÁNG NÀY'
                        : 'TOP BÀI HÁT NĂM 2026'}
                    </Text>
                  </View>

                  {currentPeriodStats.topTracks.length === 0 ? (
                    <Text style={styles.emptyText}>Chưa có bài hát nào được phát trong kỳ này</Text>
                  ) : (
                    currentPeriodStats.topTracks.map((t, idx) => (
                      <View key={t.trackId} style={styles.rankRow}>
                        <Text style={styles.rankIndex}>#{idx + 1}</Text>
                        <View style={styles.rankInfo}>
                          <Text style={styles.rankTitle}>{t.title}</Text>
                          <Text style={styles.rankSubtitle}>{t.artist}</Text>
                        </View>
                        <Text style={styles.rankBadge}>{t.count} lần ({t.minutes}p)</Text>
                      </View>
                    ))
                  )}
                </View>

                {/* Top ca sĩ */}
                <View style={styles.sectionBox}>
                  <View style={styles.sectionTitleRow}>
                    <ProfileIcon size={16} color="#1DB954" />
                    <Text style={styles.sectionTitle}>CA SĨ NỔI BẬT</Text>
                  </View>

                  {currentPeriodStats.topArtists.length === 0 ? (
                    <Text style={styles.emptyText}>Chưa có dữ liệu ca sĩ</Text>
                  ) : (
                    currentPeriodStats.topArtists.map((a, idx) => (
                      <View key={a.artist} style={styles.rankRow}>
                        <Text style={styles.rankIndex}>#{idx + 1}</Text>
                        <View style={styles.rankInfo}>
                          <Text style={styles.rankTitle}>{a.artist}</Text>
                        </View>
                        <Text style={styles.rankBadge}>{a.count} lượt</Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
            )}

            {/* Nội dung Tab Kỷ niệm & Cột mốc */}
            {activeTab === 'memories' && (
              <View style={styles.periodContent}>
                {/* Thẻ Bài đầu tiên & Bài nghe nhiều nhất */}
                <View style={styles.memoryHighlightCard}>
                  <View style={styles.sectionTitleRow}>
                    <ClockIcon size={15} color="#888888" />
                    <Text style={styles.memoryHighlightTitle}>DẤU ẤN ĐẦU TIÊN</Text>
                  </View>
                  {report.firstTrackEver ? (
                    <View style={styles.memoryHighlightBody}>
                      <Text style={styles.memorySongTitle}>{report.firstTrackEver.title}</Text>
                      <Text style={styles.memorySongArtist}>{report.firstTrackEver.artist}</Text>
                      <Text style={styles.memoryDate}>
                        Bài hát mở màn cho kho nhạc vào {report.firstTrackEver.playedAt}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.emptyText}>Hãy phát bài hát đầu tiên để lưu kỷ niệm</Text>
                  )}
                </View>

                <View style={[styles.memoryHighlightCard, { borderColor: '#1DB954' }]}>
                  <View style={styles.sectionTitleRow}>
                    <TrophyIcon size={16} color="#1DB954" />
                    <Text style={[styles.memoryHighlightTitle, { color: '#1DB954' }]}>
                      BÀI HÁT GẮN BÓ NHẤT MỌI THỜI ĐẠI
                    </Text>
                  </View>
                  {report.mostPlayedTrackEver ? (
                    <View style={styles.memoryHighlightBody}>
                      <Text style={styles.memorySongTitle}>
                        {report.mostPlayedTrackEver.title}
                      </Text>
                      <Text style={styles.memorySongArtist}>
                        {report.mostPlayedTrackEver.artist}
                      </Text>
                      <Text style={styles.memoryDate}>
                        Đã đồng hành cùng bạn {report.mostPlayedTrackEver.count} lần
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.emptyText}>Chưa có bài hát nổi bật</Text>
                  )}
                </View>

                {/* Danh sách Huy hiệu cột mốc */}
                <View style={styles.sectionBox}>
                  <View style={styles.sectionTitleRow}>
                    <TrophyIcon size={16} color="#ffd700" />
                    <Text style={styles.sectionTitle}>HUY HIỆU & THÀNH TỰU</Text>
                  </View>

                  {report.milestones.map((m) => (
                    <View
                      key={m.id}
                      style={[styles.milestoneRow, m.achieved && styles.milestoneRowAchieved]}
                    >
                      <View style={styles.milestoneIconBox}>
                        {renderMilestoneSvg(m.id, m.achieved)}
                      </View>
                      <View style={styles.milestoneInfo}>
                        <Text style={[styles.milestoneTitle, m.achieved && styles.milestoneTitleAchieved]}>
                          {m.title}
                        </Text>
                        <Text style={styles.milestoneDesc}>{m.desc}</Text>
                      </View>
                      {m.achieved ? (
                        <View style={styles.milestoneAchievedBadge}>
                          <CheckIcon size={14} color="#1DB954" />
                          <Text style={styles.milestoneStatusAchieved}>Đạt được</Text>
                        </View>
                      ) : (
                        <Text style={styles.milestoneStatusPending}>Chưa mở</Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '88%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#888888',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  profileCard: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 16,
    paddingRight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 16,
  },
  profileTopRightEditBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#383838',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  avatarBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceActive,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    position: 'relative',
    marginRight: 16,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: colors.primary,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editProfileContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceHighlight,
  },
  editSectionTitle: {
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.bold,
    color: colors.primary,
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  editAvatarPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  editAvatarHint: {
    flex: 1,
  },
  editAvatarHintTitle: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  editAvatarHintSub: {
    fontSize: fontSizes.captionLarge,
    color: colors.textTertiary,
    marginTop: 2,
  },
  clearAvatarUriBtn: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  clearAvatarUriBtnText: {
    fontSize: fontSizes.captionLarge,
    color: colors.warning,
    fontWeight: fontWeights.semibold,
  },
  pickImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  pickImageBtnText: {
    color: colors.textDark,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.bold,
  },
  editInputLabel: {
    fontSize: fontSizes.captionLarge,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
    fontWeight: fontWeights.semibold,
  },
  avatarOptionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  avatarOptionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  avatarOptionBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  editTextInput: {
    backgroundColor: colors.surfaceSecondary,
    color: colors.textPrimary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSizes.body,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  bioInput: {
    minHeight: 56,
    textAlignVertical: 'top',
  },
  editActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  editSaveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  editSaveBtnText: {
    color: colors.textDark,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.body,
  },
  editCancelBtn: {
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  editCancelBtnText: {
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
    fontSize: fontSizes.body,
  },
  editProfileTriggerBtn: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  editProfileTriggerText: {
    fontSize: fontSizes.captionLarge,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  profileInfo: {
    flex: 1,
  },
  nameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  displayName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameInput: {
    flex: 1,
    backgroundColor: '#282828',
    color: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    fontSize: 15,
  },
  saveNameBtn: {
    marginLeft: 8,
    backgroundColor: '#1DB954',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  saveNameBtnText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 13,
  },
  bioText: {
    fontSize: 13,
    color: '#aaaaaa',
    marginTop: 4,
  },
  joinedDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  joinedDateText: {
    fontSize: 11,
    color: '#777777',
    marginLeft: 6,
  },
  streetRankRow: {
    backgroundColor: '#181818',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.25)',
    gap: 4,
  },
  streetRankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streetRankEmoji: {
    fontSize: 18,
  },
  streetRankTitle: {
    color: '#1DB954',
    fontSize: 15,
    fontWeight: '700',
  },
  streetRankLvl: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  streetRankLvlText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '800',
  },
  streetRankSub: {
    color: '#888888',
    fontSize: 12,
  },
  quickStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  quickStatBox: {
    flex: 1,
    backgroundColor: '#181818',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#262626',
  },
  quickStatVal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1DB954',
  },
  quickStatLabel: {
    fontSize: 11,
    color: '#888888',
    marginTop: 4,
    textAlign: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabItemActive: {
    backgroundColor: '#2c2c2c',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888888',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  periodContent: {
    gap: 16,
  },
  metricBanner: {
    flexDirection: 'row',
    backgroundColor: '#181818',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#262626',
    alignItems: 'center',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricNumber: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
  },
  metricLabel: {
    fontSize: 12,
    color: '#888888',
    marginTop: 4,
  },
  metricDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#2e2e2e',
  },
  sectionBox: {
    backgroundColor: '#181818',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262626',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#b3b3b3',
    letterSpacing: 0.5,
    marginLeft: 8,
  },
  emptyText: {
    color: '#666666',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  rankIndex: {
    width: 28,
    fontSize: 14,
    fontWeight: '700',
    color: '#1DB954',
  },
  rankInfo: {
    flex: 1,
    marginRight: 10,
  },
  rankTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  rankSubtitle: {
    fontSize: 12,
    color: '#888888',
    marginTop: 2,
  },
  rankBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#aaaaaa',
  },
  memoryHighlightCard: {
    backgroundColor: '#181818',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  memoryHighlightTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#b3b3b3',
    letterSpacing: 0.5,
    marginLeft: 8,
  },
  memoryHighlightBody: {
    marginTop: 4,
  },
  memorySongTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  memorySongArtist: {
    fontSize: 13,
    color: '#1DB954',
    marginTop: 2,
  },
  memoryDate: {
    fontSize: 12,
    color: '#777777',
    marginTop: 6,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
    opacity: 0.5,
  },
  milestoneRowAchieved: {
    opacity: 1,
  },
  milestoneIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  milestoneInfo: {
    flex: 1,
  },
  milestoneTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888888',
  },
  milestoneTitleAchieved: {
    color: '#ffffff',
    fontWeight: '700',
  },
  milestoneDesc: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  milestoneAchievedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  milestoneStatusAchieved: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1DB954',
    marginLeft: 4,
  },
  milestoneStatusPending: {
    fontSize: 12,
    color: '#555555',
  },
});
