import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { FullReplayReport, UserProfile } from '@music-app/shared';
import { statsStorage } from '../services/stats/statsStorage';
import { tokens } from '../theme/tokens';
import {
  CloseIcon,
  EditIcon,
  HeadphonesIcon,
  DiscIcon,
  MusicNoteIcon,
  HeartIcon,
  FlameIcon,
  TrophyIcon,
  MoonIcon,
  ClockIcon,
  CheckIcon,
  CameraIcon,
} from './icons/SvgIcons';
import { cleanTrackTitle } from '../utils/recentFormatters';
import { STATS_LABELS } from '../constants/labels';
import { UserAvatar, ListGroup, SectionHeader } from './common';
import { triggerSelectionHaptic } from '../utils/haptics';

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
  totalLibraryTracksCount?: number;
  onProfileUpdated?: (profile: UserProfile) => void;
  initialEditing?: boolean;
}

function renderMilestoneSvg(id: string, achieved: boolean) {
  const color = achieved ? tokens.colors.accent : tokens.colors.textMuted;
  switch (id) {
    case 'first_track':
      return <MusicNoteIcon size={20} color={color} />;
    case 'listen_10':
    case 'listen_50':
    case 'listen_100':
    case 'listen_500':
      return <HeadphonesIcon size={20} color={color} />;
    case 'night_owl':
      return <MoonIcon size={20} color={color} />;
    case 'loyal_fan':
      return <HeartIcon size={20} color={color} />;
    case 'music_buff':
      return <FlameIcon size={20} color={color} />;
    case 'marathon':
      return <ClockIcon size={20} color={color} />;
    case 'library_builder':
      return <DiscIcon size={20} color={color} />;
    default:
      return <TrophyIcon size={20} color={color} />;
  }
}

export function ProfileModal({
  visible,
  onClose,
  totalLibraryTracksCount,
  onProfileUpdated,
  initialEditing = false,
}: ProfileModalProps) {
  const insets = useSafeAreaInsets();
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
  }, [visible, initialEditing]);

  const loadData = async () => {
    const data = await statsStorage.getReplayReport();
    setReport(data);
    setTempName(data.profile.displayName);
    setTempBio(data.profile.bio);
    setTempAvatarUri(data.profile.avatarUri || '');
    setTempAvatarKey(data.profile.avatarKey || data.profile.avatarEmoji || 'headphones');
    setIsEditingProfile(Boolean(initialEditing));
  };

  const handleStartEditing = () => {
    if (!report) return;
    triggerSelectionHaptic();
    setTempName(report.profile.displayName);
    setTempBio(report.profile.bio);
    setTempAvatarUri(report.profile.avatarUri || '');
    setTempAvatarKey(report.profile.avatarKey || report.profile.avatarEmoji || 'headphones');
    setIsEditingProfile(true);
  };

  const handlePickImage = async () => {
    try {
      triggerSelectionHaptic();
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
        allowsEditing: false,
        quality: 0.9,
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
        }
      }
    } catch (err) {
      console.warn('Lỗi chọn ảnh đại diện từ iPhone:', err);
      Alert.alert('Không thể chọn ảnh', 'Đã xảy ra lỗi khi mở thư viện ảnh của thiết bị.');
    }
  };

  const handleTakePhoto = async () => {
    try {
      triggerSelectionHaptic();
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          'Cần cấp quyền Camera',
          'Vui lòng cho phép Beatify truy cập Camera trong Cài đặt iPhone để chụp ảnh đại diện mới của bạn.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
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
        }
      }
    } catch (err) {
      console.warn('Lỗi chụp ảnh từ Camera:', err);
      Alert.alert('Không thể chụp ảnh', 'Đã xảy ra lỗi khi khởi động Camera.');
    }
  };

  const handleSaveProfile = async () => {
    const trimmedName = tempName.trim() || 'Người Yêu Nhạc';
    const trimmedBio = tempBio.trim();

    try {
      triggerSelectionHaptic();
      const updatedProfile: UserProfile = {
        displayName: trimmedName,
        bio: trimmedBio,
        avatarUri: tempAvatarUri || '',
        avatarKey: tempAvatarKey,
        joinedDate: report?.profile.joinedDate || new Date().toISOString().slice(0, 10),
      };

      await statsStorage.saveUserProfile(updatedProfile);

      if (report) {
        setReport({
          ...report,
          profile: updatedProfile,
        });
      }

      setIsEditingProfile(false);
      onProfileUpdated?.(updatedProfile);
    } catch (err) {
      console.warn('Lỗi lưu hồ sơ:', err);
      Alert.alert('Lỗi', 'Không thể lưu hồ sơ cá nhân.');
    }
  };

  const handleCancelEditing = () => {
    triggerSelectionHaptic();
    if (report) {
      setTempName(report.profile.displayName);
      setTempBio(report.profile.bio);
      setTempAvatarUri(report.profile.avatarUri || '');
      setTempAvatarKey(report.profile.avatarKey || report.profile.avatarEmoji || 'headphones');
    }
    setIsEditingProfile(false);
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
            <Modal
              visible={visible}
              animationType="slide"
              presentationStyle="pageSheet"
              onRequestClose={onClose}
            >
              <View style={styles.container}>
                {/* Grabber indicator chuẩn iOS PageSheet (Lỗi 2) */}
                <View style={styles.grabberBox}>
                  <View style={styles.grabber} />
                </View>

                {/* Header Modal phẳng tối giản với nút Đóng tròn */}
                <View style={styles.header}>
                  <Text style={styles.headerTitle}>Hồ sơ & Thống kê</Text>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={onClose}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityLabel="Đóng thống kê"
                  >
                    <CloseIcon size={18} color={tokens.colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {/* Thanh chọn Tab thời gian STICKY ở đầu màn hình (Lỗi 1: Tab không bị cuộn mất hay cắt chữ) */}
                <View style={styles.tabBarContainer}>
                  <View style={styles.tabBar}>
                    {(
                      [
                        { key: 'week', label: 'Tuần này' },
                        { key: 'month', label: 'Tháng này' },
                        { key: 'year', label: 'Năm nay' },
                        { key: 'memories', label: 'Kỷ niệm' },
                      ] as const
                    ).map((tab) => {
                      const isActive = activeTab === tab.key;
                      return (
                        <TouchableOpacity
                          key={tab.key}
                          style={[styles.tabItem, isActive && styles.tabItemActive]}
                          onPress={() => {
                            triggerSelectionHaptic();
                            setActiveTab(tab.key);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                            {tab.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent}>
                  {/* Thẻ thông tin cá nhân hoặc Form chỉnh sửa */}
                  {isEditingProfile ? (
                    <View style={styles.editProfileContainer}>
                      <Text style={styles.editSectionTitle}>CHỈNH SỬA HỒ SƠ & ẢNH ĐẠI DIỆN</Text>
                      {/* Nội dung cuộn chính */}
                      <ScrollView
                        style={styles.scrollContent}
                        contentContainerStyle={[
                          styles.scrollInner,
                          { paddingBottom: Math.max(insets.bottom, tokens.spacing.xl) + tokens.spacing.xl },
                        ]}
                        showsVerticalScrollIndicator={false}
                      >
                        {/* PHẦN PROFILE & AVATAR (Lỗi 3: Avatar rỗng hiển thị chữ cái đầu) */}
                        {isEditingProfile ? (
                          <View style={styles.editSection}>
                            <SectionHeader title="CHỈNH SỬA HỒ SƠ" />
                            <ListGroup>
                              <View style={styles.editAvatarCenter}>
                                <UserAvatar
                                  avatarUri={tempAvatarUri}
                                  displayName={tempName || 'Người Yêu Nhạc'}
                                  size={72}
                                />

                                {/* Xem trước Avatar */}
                                <View style={styles.editAvatarPreviewRow}>
                                  <TouchableOpacity
                                    style={styles.avatarBox}
                                    onLongPress={() => {
                                      if (tempAvatarUri) {
                                        Vibration.vibrate(15);
                                        setIsAvatarPreviewModalOpen(true);
                                      }
                                    }}
                                    delayLongPress={600}
                                    activeOpacity={0.8}
                                  >
                                    {tempAvatarUri ? (
                                      <Image
                                        source={{ uri: tempAvatarUri }}
                                        style={styles.avatarImage}
                                        resizeMode="cover"
                                      />
                                    ) : (
                                      renderAvatarSvg(tempAvatarKey, 34, colors.primary)
                                    )}
                                  </TouchableOpacity>
                                  <View style={styles.editAvatarHint}>
                                    {tempAvatarUri ? (
                                      <View style={styles.imageActionButtonsRow}>
                                        <TouchableOpacity
                                          style={styles.pickImageBtn}
                                          onPress={handleTakePhoto}
                                          activeOpacity={0.7}
                                        >
                                          <CameraIcon size={16} color={tokens.colors.textPrimary} />
                                          <Text style={styles.pickImageBtnText}>Chụp ảnh</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                          style={styles.pickImageBtn}
                                          onPress={handlePickImage}
                                          activeOpacity={0.7}
                                        >
                                          <DiscIcon size={16} color={tokens.colors.textPrimary} />
                                          <Text style={styles.pickImageBtnText}>Thư viện ảnh</Text>
                                        </TouchableOpacity>

                                        {Boolean(tempAvatarUri) && (
                                          <TouchableOpacity
                                            style={styles.clearAvatarUriBtn}
                                            onPress={() => {
                                              setTempAvatarUri('');
                                              Vibration.vibrate(10);
                                            }}
                                            style={[styles.pickImageBtn, styles.clearAvatarBtn]}
                                            onPress={() => setTempAvatarUri('')}
                                            activeOpacity={0.7}
                                          >
                                            <Text style={styles.clearAvatarUriBtnText}>Gỡ ảnh (Dùng biểu tượng)</Text>
                                            <Text style={styles.clearAvatarBtnText}>Gỡ ảnh</Text>
                                          </TouchableOpacity>
                                        ) : null}
                    )}
                                      </View>
                </View>

                                  {/* Lựa chọn ảnh trực tiếp từ Camera hoặc Thư viện iPhone (Không ép crop) */}
                                  <View style={styles.imageActionButtonsRow}>
                                    <TouchableOpacity
                                      style={[styles.pickImageBtn, styles.takePhotoBtn]}
                                      onPress={handleTakePhoto}
                                      activeOpacity={0.8}
                                    >
                                      <CameraIcon size={17} color={colors.textDark} />
                                      <Text style={styles.pickImageBtnText}>Chụp ảnh</Text>
                                    </TouchableOpacity>
                                    <View style={styles.inputBox}>
                                      <Text style={styles.inputLabel}>Tên của bạn</Text>
                                      <TextInput
                                        style={styles.textInput}
                                        value={tempName}
                                        onChangeText={setTempName}
                                        maxLength={32}
                                        placeholder="Tên hiển thị..."
                                        placeholderTextColor={tokens.colors.textMuted}
                                      />

                                      <TouchableOpacity
                                        style={[styles.pickImageBtn, styles.libraryPhotoBtn]}
                                        onPress={handlePickImage}
                                        activeOpacity={0.8}
                                      >
                                        <DiscIcon size={17} color={colors.textPrimary} />
                                        <Text style={[styles.pickImageBtnText, { color: colors.textPrimary }]}>Thư viện ảnh</Text>
                                      </TouchableOpacity>
                                      <Text style={styles.inputLabel}>Giới thiệu ngắn (Bio)</Text>
                                      <TextInput
                                        style={[styles.textInput, styles.bioInput]}
                                        value={tempBio}
                                        onChangeText={setTempBio}
                                        maxLength={120}
                                        multiline
                                        placeholder="Giới thiệu bản thân..."
                                        placeholderTextColor={tokens.colors.textMuted}
                                      />

                                      <View style={styles.editActionRow}>
                                        <TouchableOpacity
                                          style={styles.cancelBtn}
                                          onPress={handleCancelEditing}
                                          activeOpacity={0.7}
                                        >
                                          <Text style={styles.cancelBtnText}>Hủy</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          style={styles.saveBtn}
                                          onPress={handleSaveProfile}
                                          activeOpacity={0.7}
                                        >
                                          <Text style={styles.saveBtnText}>Lưu thay đổi</Text>
                                        </TouchableOpacity>
                                      </View>
                                    </View>

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
                                    </ListGroup>
                                  </View>
                                  ) : (
                                  <View style={styles.profileCard}>
                                    <UserAvatar
                                      avatarUri={report.profile.avatarUri}
                                      displayName={report.profile.displayName}
                                      size={68}
                                    />
                                    <View style={styles.profileInfoCol}>
                                      <View style={styles.profileNameRow}>
                                        <Text style={styles.profileName} numberOfLines={1}>
                                          {report.profile.displayName}
                                        </Text>
                                        <TouchableOpacity
                                          style={styles.editCancelBtn}
                                          onPress={handleCancelEditing}
                                          activeOpacity={0.7}
                                          onPress={handleStartEditing}
                                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                          style={styles.editIconButton}
                                        >
                                          <Text style={styles.editCancelBtnText}>Hủy</Text>
                                          <EditIcon size={15} color={tokens.colors.textSecondary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          style={styles.editSaveBtn}
                                          onPress={handleSaveProfile}
                                          activeOpacity={0.7}
                                        >
                                          <Text style={styles.editSaveBtnText}>Lưu thay đổi</Text>
                                        </TouchableOpacity>
                                      </View>
                                      {Boolean(report.profile.bio) && (
                                        <Text style={styles.profileBio} numberOfLines={2}>
                                          {report.profile.bio}
                                        </Text>
                                      )}
                                      {/* Cấp bậc nếu có */}
                                      {report.streetRank && (
                                        <Text style={styles.streetRankText}>
                                          LV.{report.streetRank.level} · {report.streetRank.title}
                                        </Text>
                                      )}
                                      {typeof totalLibraryTracksCount === 'number' && (
                                        <Text style={styles.libraryCountText}>
                                          {totalLibraryTracksCount} bài trong thư viện
                                        </Text>
                                      )}
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
                                    </View>
          )}

                                    <TouchableOpacity
                                      style={styles.avatarBox}
                                      onPress={handleStartEditing}
                                      onLongPress={() => {
                                        if (report.profile.avatarUri) {
                                          Vibration.vibrate(15);
                                          setIsAvatarPreviewModalOpen(true);
                                        }
                                      }}
                                      delayLongPress={600}
                                      activeOpacity={0.8}
                                      accessibilityLabel="Chạm để chỉnh sửa, nhấn giữ để xem phóng to ảnh đại diện"
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
                                        {/* NỘI DUNG THEO TỪNG KỲ (TUẦN / THÁNG / NĂM) - Thống nhất thuật ngữ (Lỗi 6) */}
                                        {activeTab !== 'memories' && (
                                          <View style={styles.tabContent}>
                                            {/* Chỉ số chính của kỳ (không lặp toàn thời gian, Lỗi 10) */}
                                            <View style={styles.metricBanner}>
                                              <View style={styles.metricItem}>
                                                <Text style={styles.metricNumber}>
                                                  {Math.round(currentPeriodStats.totalMinutes)}
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
                                                <Text style={styles.metricLabel}>{STATS_LABELS.MINUTES}</Text>
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
                                                  <View style={styles.metricDivider} />
                                                  <View style={styles.metricItem}>
                                                    <Text style={styles.metricNumber}>{currentPeriodStats.totalPlays}</Text>
                                                    <Text style={styles.metricLabel}>{STATS_LABELS.PLAYS}</Text>
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
                                                        {/* TOP BÀI HÁT (Lỗi 5: Tiêu đề rác cleanTrackTitle + 2 lines ellipsize) */}
                                                        <SectionHeader
                                                          title={
                                                            activeTab === 'week'
                                                              ? 'BÀI HÁT NGHE NHIỀU TUẦN NÀY'
                                                              : activeTab === 'month'
                                                                ? 'BÀI HÁT NGHE NHIỀU THÁNG NÀY'
                                                                : 'BÀI HÁT NGHE NHIỀU NĂM NAY'
                                                          }
                                                        />
                                                        <ListGroup>
                                                          {currentPeriodStats.topTracks.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>Chưa có bài hát nào được phát trong kỳ này</Text>
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
                                                                ) : (
                                                                currentPeriodStats.topTracks.map(
                                                                (
                                                                t: {trackId: string; title: string; artist: string; count: number; minutes: number },
                                                                idx: number
                    ) => (
                                                                <View key={t.trackId} style={styles.trackRow}>
                                                                  <Text style={styles.trackIndex}>#{idx + 1}</Text>
                                                                  <View style={styles.trackInfo}>
                                                                    <Text style={styles.trackTitle} numberOfLines={2} ellipsizeMode="tail">
                                                                      {cleanTrackTitle(t.title)}
                                                                    </Text>
                                                                    <Text style={styles.trackArtist} numberOfLines={1}>
                                                                      {t.artist}
                                                                    </Text>
                                                                  </View>
                                                                  <Text style={styles.rankBadge}>{t.count} lần ({t.minutes}p)</Text>
                                                                  <View style={styles.trackStatsBadge}>
                                                                    <Text style={styles.trackStatsText}>
                                                                      {t.count} {STATS_LABELS.PLAYS.toLowerCase()}
                                                                    </Text>
                                                                    <Text style={styles.trackStatsSubText}>{Math.round(t.minutes)}p</Text>
                                                                  </View>
                                                                </View>
                                                                ))
                  )}
                                                              </View>
                                                              )
                                                              )
                )}
                                                            </ListGroup>

                {/* Top ca sĩ */ }
                                                            < View style = { styles.sectionBox } >
                                                            <View style={styles.sectionTitleRow}>
                                                              <ProfileIcon size={16} color="#1DB954" />
                                                              <Text style={styles.sectionTitle}>CA SĨ NỔI BẬT</Text>
                                                              {/* CA SĨ NỔI BẬT */}
                                                              <SectionHeader title="NGHỆ SĨ NỔI BẬT" />
                                                              <ListGroup>
                                                                {currentPeriodStats.topArtists.length === 0 ? (
                                                                  <View style={styles.emptyBox}>
                                                                    <Text style={styles.emptyText}>Chưa có dữ liệu nghệ sĩ</Text>
                                                                  </View>

                  {currentPeriodStats.topArtists.length === 0 ? (
                                                                  <Text style={styles.emptyText}>Chưa có dữ liệu ca sĩ</Text>
                                                                ) : (
                                                                  currentPeriodStats.topArtists.map((a, idx) => (
                                                                    <View key={a.artist} style={styles.rankRow}>
                                                                      <Text style={styles.rankIndex}>#{idx + 1}</Text>
                                                                      <View style={styles.rankInfo}>
                                                                        <Text style={styles.rankTitle}>{a.artist}</Text>
                                                                        ) : (
                                                                        currentPeriodStats.topArtists.map(
                                                                        (a: {artist: string; count: number; minutes: number }, idx: number) => (
                                                                        <View key={a.artist} style={styles.artistRow}>
                                                                          <Text style={styles.artistIndex}>#{idx + 1}</Text>
                                                                          <View style={styles.artistInfo}>
                                                                            <Text style={styles.artistName} numberOfLines={1}>
                                                                              {a.artist}
                                                                            </Text>
                                                                          </View>
                                                                          <Text style={styles.rankBadge}>{a.count} lượt</Text>
                                                                          <Text style={styles.artistCount}>
                                                                            {a.count} {STATS_LABELS.PLAYS.toLowerCase()}
                                                                          </Text>
                                                                        </View>
                                                                        ))
                  )}
                                                                      </View>
                                                                    </View>
                                                                  )}
                                                                )
                                                                )
                )}
                                                              </ListGroup>
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
                                                                {/* NỘI DUNG TAB KỶ NIỆM */}
                                                                {activeTab === 'memories' && (
                                                                  <View style={styles.tabContent}>
                                                                    <SectionHeader title="DẤU ẤN ĐẦU TIÊN" />
                                                                    <ListGroup>
                                                                      {report.firstTrackEver ? (
                                                                        <View style={styles.memoryBox}>
                                                                          <Text style={styles.memoryTitle} numberOfLines={2} ellipsizeMode="tail">
                                                                            {cleanTrackTitle(report.firstTrackEver.title)}
                                                                          </Text>
                                                                          <Text style={styles.memorySubtitle}>{report.firstTrackEver.artist}</Text>
                                                                          <Text style={styles.memoryDate}>
                                                                            Bài hát mở màn ngày {formatVietnameseDate(report.firstTrackEver.playedAt)}
                                                                          </Text>
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
                                                                ) : (
                                                                <View style={styles.emptyBox}>
                                                                  <Text style={styles.emptyText}>Hãy nghe bài hát đầu tiên để lưu dấu ấn</Text>
                                                                </View>
                )}
                                                              </ListGroup>

                                                              <View style={[styles.memoryHighlightCard, { borderColor: '#1DB954' }]}>
                                                                <View style={styles.sectionTitleRow}>
                                                                  <TrophyIcon size={16} color="#1DB954" />
                                                                  <Text style={[styles.memoryHighlightTitle, { color: '#1DB954' }]}>
                                                                    BÀI HÁT GẮN BÓ NHẤT MỌI THỜI ĐẠI
                                                                    <SectionHeader title="BÀI HÁT GẮN BÓ NHẤT" />
                                                                    <ListGroup>
                                                                      {report.mostPlayedTrackEver ? (
                                                                        <View style={styles.memoryBox}>
                                                                          <Text style={styles.memoryTitle} numberOfLines={2} ellipsizeMode="tail">
                                                                            {cleanTrackTitle(report.mostPlayedTrackEver.title)}
                                                                          </Text>
                                                                          <Text style={styles.memorySubtitle}>{report.mostPlayedTrackEver.artist}</Text>
                                                                          <Text style={styles.memoryDate}>
                                                                            Đã đồng hành cùng bạn {report.mostPlayedTrackEver.count} {STATS_LABELS.PLAYS.toLowerCase()}
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
                                                                      ): (
                                                                          <View style = {styles.emptyBox}>
                                                                      <Text style={styles.emptyText}>Chưa có bài hát nổi bật</Text>
                  )}
                                                                    </View>

                                                                    {/* Danh sách Huy hiệu cột mốc */}
                                                                    <View style={styles.sectionBox}>
                                                                      <View style={styles.sectionTitleRow}>
                                                                        <TrophyIcon size={16} color="#ffd700" />
                                                                        <Text style={styles.sectionTitle}>HUY HIỆU & THÀNH TỰU</Text>
                                                                      </View>
                )}
                                                                    </ListGroup>

                                                                    {report.milestones.map((m) => (
                                                                      <View
                                                                        key={m.id}
                                                                        style={[styles.milestoneRow, m.achieved && styles.milestoneRowAchieved]}
                                                                      >
                                                                        <View style={styles.milestoneIconBox}>
                                                                          {renderMilestoneSvg(m.id, m.achieved)}
                                                                          {/* DANH SÁCH CỘT MỐC ĐẠT ĐƯỢC */}
                                                                          <SectionHeader title="CỘT MỐC & THÀNH TỰU" />
                                                                          <ListGroup>
                                                                            {report.milestones.map((m) => (
                                                                              <View key={m.id} style={styles.milestoneRow}>
                                                                                <View style={styles.milestoneIconBox}>
                                                                                  {renderMilestoneSvg(m.id, m.achieved)}
                                                                                </View>
                                                                                <View style={styles.milestoneTextCol}>
                                                                                  <Text
                                                                                    style={[
                                                                                      styles.milestoneTitle,
                                                                                      !m.achieved && styles.milestoneTitleLocked,
                                                                                    ]}
                                                                                  >
                                                                                    {m.title}
                                                                                  </Text>
                                                                                  <Text style={styles.milestoneDesc}>{m.desc}</Text>
                                                                                </View>
                                                                                {m.achieved ? (
                      <View style={styles.achievedPill}>
                        <CheckIcon size={12} color={tokens.colors.accent} />
                        <Text style={styles.achievedPillText}>Đạt</Text>
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

                                                                {/* Modal Phóng to toàn màn hình ảnh đại diện */}
                                                                <Modal
                                                                  visible={isAvatarPreviewModalOpen}
                                                                  transparent={true}
                                                                  animationType="fade"
                                                                  onRequestClose={() => setIsAvatarPreviewModalOpen(false)}
                                                                >
                                                                  <TouchableOpacity
                                                                    style={styles.fullscreenAvatarOverlay}
                                                                    activeOpacity={1}
                                                                    onPress={() => setIsAvatarPreviewModalOpen(false)}
                                                                  >
                                                                    <View style={styles.fullscreenAvatarContainer}>
                                                                      <Image
                                                                        source={{ uri: isEditingProfile ? tempAvatarUri : (report?.profile.avatarUri || '') }}
                                                                        style={styles.fullscreenAvatarImage}
                                                                        resizeMode="contain"
                                                                      />
                                                                      ) : (
                                                                      <Text style={styles.lockedPillText}>Chưa mở</Text>
                    )}
                                                                    </View>
                ))}
                                                                  </ListGroup>
                                                              </View>
                                                            </TouchableOpacity>
                                                          </Modal>
                                                        )}
                                                      </ScrollView>
                                                    </View>
                                                  </Modal>
                                                );
}

                                                const styles = StyleSheet.create({
                                                  overlay: {
                                                  container: {
                                                  flex: 1,
                                                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                                                justifyContent: 'flex-end',
                                                backgroundColor: tokens.colors.bgBase,
  },
                                                container: {
                                                  backgroundColor: '#121212',
                                                borderTopLeftRadius: 24,
                                                borderTopRightRadius: 24,
                                                height: '88%',
                                                paddingBottom: 24,
                                                grabberBox: {
                                                  alignItems: 'center',
                                                paddingTop: 8,
                                                paddingBottom: 4,
  },
                                                grabber: {
                                                  width: 36,
                                                height: 5,
                                                borderRadius: 2.5,
                                                backgroundColor: tokens.colors.grabber,
  },
                                                header: {
                                                  flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                paddingHorizontal: 20,
                                                paddingTop: 20,
                                                paddingBottom: 16,
                                                borderBottomWidth: 1,
                                                borderBottomColor: '#222222',
                                                paddingHorizontal: tokens.spacing.lg,
                                                paddingVertical: tokens.spacing.md,
                                                borderBottomWidth: tokens.hairlineWidth,
                                                borderBottomColor: tokens.colors.separator,
  },
                                                headerTitle: {
                                                  ...tokens.typography.headline,
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
                                                closeButton: {
                                                  width: 30,
                                                height: 30,
                                                borderRadius: 15,
                                                backgroundColor: tokens.colors.bgSurface,
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                                justifyContent: 'center',
  },
                                                scrollContent: {
                                                  padding: 20,
                                                paddingBottom: 40,
                                                // Tab Bar Sticky (Lỗi 1)
                                                tabBarContainer: {
                                                  backgroundColor: tokens.colors.bgBase,
                                                paddingHorizontal: tokens.spacing.lg,
                                                paddingVertical: tokens.spacing.sm,
                                                borderBottomWidth: tokens.hairlineWidth,
                                                borderBottomColor: tokens.colors.separator,
  },
                                                profileCard: {
                                                  position: 'relative',
                                                tabBar: {
                                                  flexDirection: 'row',
                                                alignItems: 'center',
                                                backgroundColor: '#1a1a1a',
                                                padding: 16,
                                                paddingRight: 48,
                                                borderRadius: 16,
                                                borderWidth: 1,
                                                borderColor: '#2a2a2a',
                                                marginBottom: 16,
                                                backgroundColor: tokens.colors.bgSurface,
                                                borderRadius: tokens.radius.pill,
                                                padding: 3,
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
                                                tabItem: {
                                                  flex: 1,
                                                minHeight: 32,
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
                                                borderRadius: tokens.radius.pill,
  },
                                                avatarImage: {
                                                  width: 64,
                                                height: 64,
                                                borderRadius: 32,
                                                tabItemActive: {
                                                  backgroundColor: tokens.colors.bgElevated,
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
                                                tabText: {
                                                  ...tokens.typography.footnote,
                                                  color: tokens.colors.textMuted,
                                                fontWeight: '500',
  },
                                                editProfileContainer: {
                                                  backgroundColor: colors.surface,
                                                borderRadius: radius.lg,
                                                padding: spacing.md,
                                                marginBottom: spacing.md,
                                                borderWidth: 1,
                                                borderColor: colors.surfaceHighlight,
                                                tabTextActive: {
                                                  color: tokens.colors.textPrimary,
                                                fontWeight: '600',
  },
                                                editSectionTitle: {
                                                  fontSize: fontSizes.captionLarge,
                                                fontWeight: fontWeights.bold,
                                                color: colors.primary,
                                                letterSpacing: 0.5,
                                                marginBottom: spacing.md,
                                                scrollContent: {
                                                  flex: 1,
  },
                                                editAvatarPreviewRow: {
                                                  scrollInner: {
                                                  paddingTop: tokens.spacing.md,
  },
                                                profileCard: {
                                                  flexDirection: 'row',
                                                alignItems: 'center',
                                                marginBottom: spacing.md,
                                                backgroundColor: tokens.colors.bgSurface,
                                                marginHorizontal: tokens.spacing.lg,
                                                padding: tokens.spacing.lg,
                                                borderRadius: tokens.radius.card,
  },
                                                editAvatarHint: {
                                                  profileInfoCol: {
                                                  flex: 1,
                                                marginLeft: tokens.spacing.lg,
  },
                                                editAvatarHintTitle: {
                                                  fontSize: fontSizes.body,
                                                fontWeight: fontWeights.bold,
                                                color: colors.textPrimary,
                                                profileNameRow: {
                                                  flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
  },
                                                editAvatarHintSub: {
                                                  fontSize: fontSizes.captionLarge,
                                                color: colors.textTertiary,
                                                profileName: {
                                                  ...tokens.typography.headline,
                                                  fontSize: 18,
                                                flex: 1,
  },
                                                editIconButton: {
                                                  padding: 4,
  },
                                                profileBio: {
                                                  ...tokens.typography.footnote,
                                                  color: tokens.colors.textSecondary,
                                                marginTop: 4,
  },
                                                streetRankText: {
                                                  ...tokens.typography.caption,
                                                  color: tokens.colors.accent,
                                                fontWeight: '600',
                                                marginTop: 6,
  },
                                                libraryCountText: {
                                                  ...tokens.typography.caption,
                                                  color: tokens.colors.textDim,
                                                marginTop: 2,
  },
                                                clearAvatarUriBtn: {
                                                  marginTop: spacing.xs,
                                                alignSelf: 'flex-start',
                                                backgroundColor: colors.surfaceHighlight,
                                                paddingHorizontal: spacing.sm,
                                                paddingVertical: 4,
                                                borderRadius: radius.sm,
                                                editSection: {
                                                  marginBottom: tokens.spacing.md,
  },
                                                clearAvatarUriBtnText: {
                                                  fontSize: fontSizes.captionLarge,
                                                color: colors.warning,
                                                fontWeight: fontWeights.semibold,
                                                editAvatarCenter: {
                                                  alignItems: 'center',
                                                paddingVertical: tokens.spacing.lg,
  },
                                                imageActionButtonsRow: {
                                                  flexDirection: 'row',
                                                gap: spacing.sm,
                                                marginBottom: spacing.md,
                                                gap: tokens.spacing.sm,
                                                marginTop: tokens.spacing.md,
  },
                                                takePhotoBtn: {
                                                  flex: 1,
                                                marginBottom: 0,
                                                backgroundColor: colors.primary,
  },
                                                libraryPhotoBtn: {
                                                  flex: 1,
                                                marginBottom: 0,
                                                backgroundColor: colors.surfaceHighlight,
                                                borderWidth: 1,
                                                borderColor: 'rgba(255, 255, 255, 0.1)',
  },
                                                pickImageBtn: {
                                                  flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: spacing.xs,
                                                backgroundColor: colors.primary,
                                                borderRadius: radius.md,
                                                paddingVertical: spacing.sm,
                                                paddingHorizontal: spacing.sm,
                                                gap: 6,
                                                backgroundColor: tokens.colors.bgElevated,
                                                paddingVertical: 7,
                                                paddingHorizontal: tokens.spacing.md,
                                                borderRadius: tokens.radius.pill,
                                                borderWidth: tokens.hairlineWidth,
                                                borderColor: tokens.colors.separator,
  },
                                                pickImageBtnText: {
                                                  color: colors.textDark,
                                                fontSize: fontSizes.subhead,
                                                fontWeight: fontWeights.bold,
                                                ...tokens.typography.footnote,
                                                color: tokens.colors.textPrimary,
                                                fontWeight: '500',
  },
                                                editInputLabel: {
                                                  fontSize: fontSizes.captionLarge,
                                                color: colors.textSecondary,
                                                marginBottom: spacing.xs,
                                                marginTop: spacing.xs,
                                                fontWeight: fontWeights.semibold,
                                                clearAvatarBtn: {
                                                  borderColor: tokens.colors.dangerBorder,
  },
                                                avatarOptionsRow: {
                                                  flexDirection: 'row',
                                                gap: spacing.sm,
                                                paddingVertical: spacing.xs,
                                                marginBottom: spacing.sm,
                                                clearAvatarBtnText: {
                                                  ...tokens.typography.footnote,
                                                  color: tokens.colors.danger,
                                                fontWeight: '500',
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
                                                inputBox: {
                                                  padding: tokens.spacing.lg,
  },
                                                avatarOptionBtnActive: {
                                                  borderColor: colors.primary,
                                                backgroundColor: colors.primaryMuted,
                                                inputLabel: {
                                                  ...tokens.typography.caption,
                                                  color: tokens.colors.textMuted,
                                                marginBottom: 6,
                                                textTransform: 'uppercase',
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
                                                textInput: {
                                                  ...tokens.typography.body,
                                                  backgroundColor: tokens.colors.bgElevated,
                                                borderRadius: tokens.radius.card - 4,
                                                paddingHorizontal: tokens.spacing.md,
                                                paddingVertical: 10,
                                                color: tokens.colors.textPrimary,
                                                borderWidth: tokens.hairlineWidth,
                                                borderColor: tokens.colors.separator,
                                                marginBottom: tokens.spacing.md,
  },
                                                bioInput: {
                                                  minHeight: 56,
                                                minHeight: 64,
                                                textAlignVertical: 'top',
  },
                                                editActionRow: {
                                                  flexDirection: 'row',
                                                justifyContent: 'flex-end',
                                                gap: spacing.sm,
                                                marginTop: spacing.sm,
                                                gap: tokens.spacing.md,
                                                marginTop: tokens.spacing.xs,
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
                                                  cancelBtn: {
                                                  flex: 1,
  },
                                                nameDisplayRow: {
                                                  flexDirection: 'row',
                                                minHeight: 44,
                                                borderRadius: tokens.radius.pill,
                                                backgroundColor: tokens.colors.bgElevated,
                                                justifyContent: 'center',
                                                alignItems: 'center',
  },
                                                displayName: {
                                                  fontSize: 18,
                                                fontWeight: '700',
                                                color: '#ffffff',
                                                cancelBtnText: {
                                                  ...tokens.typography.body,
                                                  color: tokens.colors.textSecondary,
                                                fontWeight: '600',
  },
                                                nameEditRow: {
                                                  flexDirection: 'row',
                                                saveBtn: {
                                                  flex: 2,
                                                minHeight: 44,
                                                borderRadius: tokens.radius.pill,
                                                backgroundColor: tokens.colors.accent,
                                                justifyContent: 'center',
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
                                                  saveBtnText: {
                                                  ...tokens.typography.body,
                                                  color: '#000000',
                                                fontWeight: '700',
                                                fontSize: 13,
  },
                                                bioText: {
                                                  fontSize: 13,
                                                color: '#aaaaaa',
                                                marginTop: 4,
                                                tabContent: {
                                                  marginTop: tokens.spacing.xs,
  },
                                                joinedDateRow: {
                                                  metricBanner: {
                                                  flexDirection: 'row',
                                                backgroundColor: tokens.colors.bgSurface,
                                                marginHorizontal: tokens.spacing.lg,
                                                marginTop: tokens.spacing.md,
                                                borderRadius: tokens.radius.card,
                                                paddingVertical: tokens.spacing.lg,
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
                                                metricItem: {
                                                  flex: 1,
                                                alignItems: 'center',
                                                gap: 8,
  },
                                                streetRankEmoji: {
                                                  fontSize: 18,
  },
                                                streetRankTitle: {
                                                  color: '#1DB954',
                                                fontSize: 15,
                                                metricNumber: {
                                                  ...tokens.typography.largeTitle,
                                                  fontSize: 28,
                                                fontWeight: '700',
                                                color: tokens.colors.accent,
  },
                                                streetRankLvl: {
                                                  backgroundColor: '#1DB954',
                                                paddingHorizontal: 6,
                                                paddingVertical: 1,
                                                borderRadius: 4,
                                                metricLabel: {
                                                  ...tokens.typography.footnote,
                                                  color: tokens.colors.textSecondary,
                                                marginTop: 2,
  },
                                                streetRankLvlText: {
                                                  color: '#000000',
                                                fontSize: 9,
                                                fontWeight: '800',
                                                metricDivider: {
                                                  width: tokens.hairlineWidth,
                                                height: 36,
                                                backgroundColor: tokens.colors.separator,
  },
                                                streetRankSub: {
                                                  color: '#888888',
                                                fontSize: 12,
  },
                                                quickStatsRow: {
                                                  trackRow: {
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
                                                paddingVertical: tokens.spacing.md,
                                                paddingHorizontal: tokens.spacing.lg,
  },
                                                quickStatVal: {
                                                  fontSize: 18,
                                                fontWeight: '800',
                                                color: '#1DB954',
                                                trackIndex: {
                                                  ...tokens.typography.headline,
                                                  fontSize: 15,
                                                color: tokens.colors.textDim,
                                                width: 28,
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
                                                  trackInfo: {
                                                  flex: 1,
                                                paddingVertical: 10,
                                                alignItems: 'center',
                                                borderRadius: 8,
                                                paddingRight: tokens.spacing.sm,
  },
                                                tabItemActive: {
                                                  backgroundColor: '#2c2c2c',
  },
                                                tabText: {
                                                  fontSize: 13,
                                                trackTitle: {
                                                  ...tokens.typography.body,
                                                  fontSize: 15,
                                                fontWeight: '600',
                                                color: '#888888',
                                                color: tokens.colors.textPrimary,
  },
                                                tabTextActive: {
                                                  color: '#ffffff',
                                                fontWeight: '700',
                                                trackArtist: {
                                                  ...tokens.typography.footnote,
                                                  color: tokens.colors.textSecondary,
                                                marginTop: 2,
  },
                                                periodContent: {
                                                  gap: 16,
                                                trackStatsBadge: {
                                                  alignItems: 'flex-end',
  },
                                                metricBanner: {
                                                  flexDirection: 'row',
                                                backgroundColor: '#181818',
                                                borderRadius: 14,
                                                padding: 18,
                                                borderWidth: 1,
                                                borderColor: '#262626',
                                                alignItems: 'center',
                                                trackStatsText: {
                                                  ...tokens.typography.footnote,
                                                  fontWeight: '600',
                                                color: tokens.colors.textPrimary,
  },
                                                metricItem: {
                                                  flex: 1,
                                                alignItems: 'center',
                                                trackStatsSubText: {
                                                  ...tokens.typography.caption,
                                                  color: tokens.colors.textDim,
                                                marginTop: 1,
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
                                                  artistRow: {
                                                  flexDirection: 'row',
                                                alignItems: 'center',
                                                marginBottom: 14,
                                                paddingVertical: tokens.spacing.md,
                                                paddingHorizontal: tokens.spacing.lg,
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
                                                  artistIndex: {
                                                  ...tokens.typography.headline,
                                                  fontSize: 15,
                                                color: tokens.colors.textDim,
                                                width: 28,
                                                fontSize: 14,
                                                fontWeight: '700',
                                                color: '#1DB954',
  },
                                                rankInfo: {
                                                  artistInfo: {
                                                  flex: 1,
                                                marginRight: 10,
  },
                                                rankTitle: {
                                                  fontSize: 14,
                                                artistName: {
                                                  ...tokens.typography.body,
                                                  fontSize: 15,
                                                fontWeight: '600',
                                                color: '#ffffff',
                                                color: tokens.colors.textPrimary,
  },
                                                rankSubtitle: {
                                                  fontSize: 12,
                                                color: '#888888',
                                                marginTop: 2,
                                                artistCount: {
                                                  ...tokens.typography.footnote,
                                                  color: tokens.colors.textSecondary,
                                                fontWeight: '500',
  },
                                                rankBadge: {
                                                  fontSize: 12,
                                                fontWeight: '600',
                                                color: '#aaaaaa',
                                                memoryBox: {
                                                  padding: tokens.spacing.lg,
  },
                                                memoryHighlightCard: {
                                                  backgroundColor: '#181818',
                                                borderRadius: 14,
                                                padding: 16,
                                                borderWidth: 1,
                                                borderColor: '#2a2a2a',
                                                memoryTitle: {
                                                  ...tokens.typography.headline,
                                                  fontSize: 16,
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
                                                memorySubtitle: {
                                                  ...tokens.typography.footnote,
                                                  color: tokens.colors.textSecondary,
                                                marginTop: 2,
  },
                                                memoryDate: {
                                                  fontSize: 12,
                                                color: '#777777',
                                                marginTop: 6,
                                                ...tokens.typography.caption,
                                                color: tokens.colors.textDim,
                                                marginTop: tokens.spacing.xs,
  },
                                                milestoneRow: {
                                                  flexDirection: 'row',
                                                alignItems: 'center',
                                                paddingVertical: 12,
                                                borderBottomWidth: 1,
                                                borderBottomColor: '#222222',
                                                opacity: 0.5,
                                                paddingVertical: tokens.spacing.md,
                                                paddingHorizontal: tokens.spacing.lg,
  },
                                                milestoneRowAchieved: {
                                                  opacity: 1,
  },
                                                milestoneIconBox: {
                                                  width: 36,
                                                height: 36,
                                                borderRadius: 18,
                                                backgroundColor: '#222222',
                                                backgroundColor: tokens.colors.bgElevated,
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                marginRight: 12,
                                                marginRight: tokens.spacing.md,
  },
                                                milestoneInfo: {
                                                  milestoneTextCol: {
                                                  flex: 1,
                                                paddingRight: tokens.spacing.sm,
  },
                                                milestoneTitle: {
                                                  fontSize: 14,
                                                ...tokens.typography.body,
                                                fontSize: 15,
                                                fontWeight: '600',
                                                color: '#888888',
                                                color: tokens.colors.textPrimary,
  },
                                                milestoneTitleAchieved: {
                                                  color: '#ffffff',
                                                fontWeight: '700',
                                                milestoneTitleLocked: {
                                                  color: tokens.colors.textMuted,
  },
                                                milestoneDesc: {
                                                  fontSize: 12,
                                                color: '#666666',
                                                ...tokens.typography.footnote,
                                                color: tokens.colors.textMuted,
                                                marginTop: 2,
  },
                                                milestoneAchievedBadge: {
                                                  achievedPill: {
                                                  flexDirection: 'row',
                                                alignItems: 'center',
                                                gap: 4,
                                                paddingHorizontal: 8,
                                                paddingVertical: 3,
                                                borderRadius: tokens.radius.pill,
                                                backgroundColor: tokens.colors.accentMuted,
  },
                                                milestoneStatusAchieved: {
                                                  fontSize: 12,
                                                fontWeight: '700',
                                                color: '#1DB954',
                                                marginLeft: 4,
                                                achievedPillText: {
                                                  ...tokens.typography.caption,
                                                  color: tokens.colors.accent,
                                                fontWeight: '600',
  },
                                                milestoneStatusPending: {
                                                  fontSize: 12,
                                                color: '#555555',
                                                lockedPillText: {
                                                  ...tokens.typography.caption,
                                                  color: tokens.colors.textDim,
  },
                                                fullscreenAvatarOverlay: {
                                                  flex: 1,
                                                backgroundColor: 'rgba(0, 0, 0, 0.92)',
                                                justifyContent: 'center',
                                                emptyBox: {
                                                  padding: tokens.spacing.xl,
                                                alignItems: 'center',
                                                padding: 20,
  },
                                                fullscreenAvatarContainer: {
                                                  width: '90%',
                                                aspectRatio: 1,
                                                borderRadius: 24,
                                                overflow: 'hidden',
                                                shadowColor: '#000',
                                                shadowOffset: {width: 0, height: 10 },
                                                shadowOpacity: 0.5,
                                                shadowRadius: 20,
                                                elevation: 25,
                                                emptyText: {
                                                  ...tokens.typography.footnote,
                                                  color: tokens.colors.textMuted,
                                                textAlign: 'center',
  },
                                                fullscreenAvatarImage: {
                                                  width: '100%',
});
