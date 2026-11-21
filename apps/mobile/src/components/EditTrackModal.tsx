import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import type { Track, UpdateTrack } from '@music-app/shared';
import { TrashIcon } from './icons/SvgIcons';
import { ModalHeader } from './ModalHeader';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import {
  colors,
  spacing,
  radius,
  fontSizes,
  fontWeights,
  lineHeights,
  layout,
} from '../theme';

export interface EditTrackModalProps {
  visible: boolean;
  track: Track | null;
  onClose: () => void;
  onSave: (trackId: string, updates: UpdateTrack) => Promise<void>;
  onDelete?: (trackId: string) => Promise<void>;
  onFetchLyrics?: (trackId: string) => Promise<string | null>;
}

export function EditTrackModal({
  visible,
  track,
  onClose,
  onSave,
  onDelete,
  onFetchLyrics,
}: EditTrackModalProps) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  const isKeyboardVisible = keyboardHeight > 0;

  // Quản lý tab đang chọn: 'info' (Thông tin bài hát) hoặc 'lyrics' (Lời bài hát LRC)
  const [activeTab, setActiveTab] = useState<'info' | 'lyrics'>('info');
  const activeTabIndex = useSharedValue(0);
  const [tabBarWidth, setTabBarWidth] = useState(0);

  const handleTabChange = (tab: 'info' | 'lyrics') => {
    setActiveTab(tab);
    activeTabIndex.value = withSpring(tab === 'info' ? 0 : 1, {
      damping: 22,
      stiffness: 180,
      mass: 0.7,
    });
  };

  // Animation viên thuốc trượt (Sliding Active Pill) tuân thủ quy tắc bảo vệ UI cốt lõi
  const slidingActivePill = useAnimatedStyle(() => {
    const itemWidth = tabBarWidth > 0 ? (tabBarWidth - 8) / 2 : 0;
    return {
      width: Math.max(0, itemWidth),
      transform: [{ translateX: activeTabIndex.value * itemWidth }],
    };
  });

  // Khi bàn phím mở, Home bar bị che nên chân sheet chỉ cần đệm nhẹ
  const sheetPaddingBottom = isKeyboardVisible
    ? spacing.sm
    : Math.max(spacing.lg, insets.bottom + spacing.sm);

  // Chiều cao cố định ngoài ScrollView (paddingTop, sheetPaddingBottom, header ~64, tabs ~46, footer ~74, buffer an toàn 16)
  const fixedModalElementsHeight =
    spacing.xl + sheetPaddingBottom + 64 + 46 + 74 + spacing.lg;

  // Chiều cao tối đa khả dụng cho phần thân cuộn khi bàn phím mở
  const availableBodyHeight =
    screenHeight - insets.top - keyboardHeight - fixedModalElementsHeight;

  // Mở rộng không gian tối đa: 70% màn hình khi đóng bàn phím và tận dụng trọn vẹn khi mở bàn phím
  const maxBodyHeight = isKeyboardVisible
    ? Math.max(220, availableBodyHeight)
    : Math.max(layout.modalBodyMinHeight, Math.round(screenHeight * 0.70));

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [year, setYear] = useState('');
  const [coverUri, setCoverUri] = useState<string | undefined>(undefined);
  const [lyrics, setLyrics] = useState('');
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Khi mở modal hoặc đổi track, nạp dữ liệu vào form
  useEffect(() => {
    if (track && visible) {
      setTitle(track.title || '');
      setArtist(track.artist || '');
      setAlbum(track.album || '');
      setYear(track.year ? track.year.toString() : '');
      setCoverUri(track.cover);
      setLyrics('');
      setErrorMessage(null);
      setActiveTab('info');
      activeTabIndex.value = 0;

      if (onFetchLyrics) {
        setIsLoadingLyrics(true);
        onFetchLyrics(track.id)
          .then((content) => {
            if (content) {
              setLyrics(content);
            }
          })
          .catch((err) => {
            console.warn('Lỗi lấy lyrics cho bài hát:', err);
          })
          .finally(() => {
            setIsLoadingLyrics(false);
          });
      }
    }
  }, [track, visible, onFetchLyrics, activeTabIndex]);

  if (!track) return null;

  const handlePickCover = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1.0, // Giữ độ phân giải sắc nét cao nhất
      });
      if (!res.canceled && res.assets && res.assets[0]?.uri) {
        setCoverUri(res.assets[0].uri);
      }
    } catch (err) {
      Alert.alert('Không thể chọn ảnh', String(err));
    }
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    const trimmedArtist = artist.trim();

    if (!trimmedTitle) {
      setErrorMessage('Tên bài hát không được để trống');
      setActiveTab('info');
      activeTabIndex.value = 0;
      return;
    }
    if (!trimmedArtist) {
      setErrorMessage('Tên nghệ sĩ không được để trống');
      setActiveTab('info');
      activeTabIndex.value = 0;
      return;
    }

    let parsedYear: number | undefined;
    if (year.trim()) {
      const num = parseInt(year.trim(), 10);
      if (isNaN(num) || num < 1900 || num > 2100) {
        setErrorMessage('Năm phát hành không hợp lệ (1900 - 2100)');
        setActiveTab('info');
        activeTabIndex.value = 0;
        return;
      }
      parsedYear = num;
    }

    setErrorMessage(null);
    setIsSaving(true);
    try {
      const updates: UpdateTrack = {
        title: trimmedTitle,
        artist: trimmedArtist,
        album: album.trim() || undefined,
        year: parsedYear,
        lyrics: lyrics.trim(),
        cover: coverUri,
      };
      await onSave(track.id, updates);
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Có lỗi xảy ra khi lưu');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePress = () => {
    if (!onDelete) return;

    Alert.alert(
      'Xác nhận xóa bài hát',
      `Bạn có chắc chắn muốn xóa "${track.title}" khỏi thư viện không? Thao tác này sẽ đồng bộ ngay lập tức.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa bài hát',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await onDelete(track.id);
              onClose();
            } catch (err) {
              setErrorMessage(err instanceof Error ? err.message : 'Lỗi khi xóa bài hát');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const lineCount = lyrics.trim() ? lyrics.split('\n').filter(Boolean).length : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.modalContainer,
            { paddingBottom: sheetPaddingBottom },
          ]}
        >
          {/* Header dùng chung với nút đóng chuẩn >= 44x44pt */}
          <ModalHeader
            title="Chỉnh sửa bài hát"
            subtitle={`ID: ${track.id}`}
            onClose={onClose}
            closeDisabled={isSaving || isDeleting}
          />

          {/* Phân đoạn Tabs: Thông tin bài hát vs Lời bài hát */}
          <View
            style={styles.tabBarTrack}
            onLayout={(e) => setTabBarWidth(e.nativeEvent.layout.width)}
          >
            <Animated.View style={[styles.slidingActivePill, slidingActivePill]} />
            <TouchableOpacity
              style={styles.tabButton}
              onPress={() => handleTabChange('info')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === 'info' && styles.tabButtonTextActive,
                ]}
              >
                Thông tin bài hát
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.tabButton}
              onPress={() => handleTabChange('lyrics')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === 'lyrics' && styles.tabButtonTextActive,
                ]}
              >
                Lời bài hát (LRC)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Error Banner */}
          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <ScrollView
            style={[styles.bodyScroll, { maxHeight: maxBodyHeight }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {activeTab === 'info' ? (
              <View style={styles.tabContent}>
                {/* Ảnh bìa bài hát (Đổi ảnh HD sắc nét từ thư viện máy) */}
                <View style={styles.coverRow}>
                  <View style={styles.coverBox}>
                    {coverUri ? (
                      <Image
                        key={coverUri}
                        source={{ uri: coverUri }}
                        style={styles.coverImg}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <View style={styles.coverEmptyBox}>
                        <Text style={styles.coverEmptyText}>Chưa có bìa</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.coverActions}>
                    <Text style={styles.label}>ẢNH BÌA BÀI HÁT</Text>
                    <TouchableOpacity
                      style={styles.pickCoverBtn}
                      onPress={handlePickCover}
                      activeOpacity={0.7}
                      disabled={isSaving || isDeleting}
                    >
                      <Text style={styles.pickCoverBtnText}>
                        {coverUri ? 'Đổi ảnh bìa nét hơn' : 'Chọn ảnh HD từ máy'}
                      </Text>
                    </TouchableOpacity>
                    {coverUri && (
                      <TouchableOpacity
                        style={styles.removeCoverBtn}
                        onPress={() => setCoverUri(undefined)}
                        activeOpacity={0.7}
                        disabled={isSaving || isDeleting}
                      >
                        <Text style={styles.removeCoverBtnText}>Xóa ảnh bìa</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Tên bài hát */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    TÊN BÀI HÁT <Text style={styles.requiredMark}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Nhập tên bài hát"
                    placeholderTextColor={colors.textPlaceholder}
                    editable={!isSaving && !isDeleting}
                  />
                </View>

                {/* Nghệ sĩ */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    NGHỆ SĨ / CA SĨ <Text style={styles.requiredMark}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={artist}
                    onChangeText={setArtist}
                    placeholder="Nhập tên ca sĩ hoặc nghệ sĩ"
                    placeholderTextColor={colors.textPlaceholder}
                    editable={!isSaving && !isDeleting}
                  />
                </View>

                {/* Hàng Album & Năm */}
                <View style={styles.rowInputs}>
                  <View style={[styles.inputGroup, { flex: 2, marginRight: spacing.sm }]}>
                    <Text style={styles.label}>ALBUM</Text>
                    <TextInput
                      style={styles.input}
                      value={album}
                      onChangeText={setAlbum}
                      placeholder="Tên album (tùy chọn)"
                      placeholderTextColor={colors.textPlaceholder}
                      editable={!isSaving && !isDeleting}
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>NĂM</Text>
                    <TextInput
                      style={styles.input}
                      value={year}
                      onChangeText={setYear}
                      placeholder="2026"
                      placeholderTextColor={colors.textPlaceholder}
                      keyboardType="numeric"
                      maxLength={4}
                      editable={!isSaving && !isDeleting}
                    />
                  </View>
                </View>
              </View>
            ) : (
              /* TAB LỜI BÀI HÁT (LYRICS) - MỞ RỘNG TOÀN DIỆN CHIỀU CAO */
              <View style={styles.tabContent}>
                <View style={styles.lyricsControlHeader}>
                  <View style={styles.lyricsBadge}>
                    <Text style={styles.lyricsBadgeText}>
                      {lineCount > 0 ? `${lineCount} dòng lời` : 'Chưa có lời bài hát'}
                    </Text>
                  </View>

                  <View style={styles.lyricsActionButtons}>
                    {onFetchLyrics && (
                      <TouchableOpacity
                        style={styles.fetchLyricsBtn}
                        onPress={() => {
                          if (!track) return;
                          setIsLoadingLyrics(true);
                          onFetchLyrics(track.id)
                            .then((content) => {
                              if (content) setLyrics(content);
                            })
                            .finally(() => setIsLoadingLyrics(false));
                        }}
                        disabled={isLoadingLyrics || isSaving}
                        activeOpacity={0.7}
                      >
                        {isLoadingLyrics ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Text style={styles.fetchLyricsBtnText}>Tải lại từ server</Text>
                        )}
                      </TouchableOpacity>
                    )}

                    {lyrics.trim().length > 0 && (
                      <TouchableOpacity
                        style={styles.clearLyricsBtn}
                        onPress={() => setLyrics('')}
                        disabled={isSaving}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.clearLyricsBtnText}>Xóa trắng</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Khung soạn thảo lời bài hát mở rộng toàn diện */}
                <TextInput
                  style={[
                    styles.input,
                    styles.lyricsTextAreaExpanded,
                    {
                      minHeight: isKeyboardVisible
                        ? Math.max(160, availableBodyHeight - 56)
                        : 340,
                    },
                  ]}
                  value={lyrics}
                  onChangeText={setLyrics}
                  placeholder="Dán nội dung lời bài hát hoặc cú pháp .lrc [00:12.34]..."
                  placeholderTextColor={colors.textPlaceholder}
                  multiline
                  textAlignVertical="top"
                  editable={!isSaving && !isDeleting && !isLoadingLyrics}
                />
              </View>
            )}
          </ScrollView>

          {/* Action buttons footer */}
          <View style={styles.footerRow}>
            {onDelete && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={handleDeletePress}
                disabled={isSaving || isDeleting}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Xóa bài hát khỏi thư viện"
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <View style={styles.btnInnerRow}>
                    <TrashIcon size={16} color={colors.danger} />
                    <Text style={[styles.deleteBtnText, { marginLeft: spacing.xs }]}>Xóa bài</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            <View style={styles.primaryActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                disabled={isSaving || isDeleting}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Hủy bỏ thay đổi"
              >
                <Text style={styles.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={isSaving || isDeleting}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Lưu thay đổi thông tin bài hát"
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.textDark} />
                ) : (
                  <Text style={styles.saveBtnText}>Lưu thay đổi</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    maxHeight: '94%',
  },
  tabBarTrack: {
    height: 38,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: 3,
    flexDirection: 'row',
    marginBottom: spacing.md,
    position: 'relative',
  },
  slidingActivePill: {
    position: 'absolute',
    top: 3,
    left: 3,
    bottom: 3,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  tabButtonText: {
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
  },
  tabButtonTextActive: {
    color: colors.textDark,
    fontWeight: fontWeights.bold,
  },
  tabContent: {
    paddingBottom: spacing.sm,
  },
  errorBox: {
    backgroundColor: colors.dangerBgMuted,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.dangerLight,
    fontSize: fontSizes.subhead,
    lineHeight: lineHeights.subhead,
  },
  bodyScroll: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  rowInputs: {
    flexDirection: 'row',
  },
  label: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  requiredMark: {
    color: colors.danger,
  },
  input: {
    minHeight: layout.minTouchTarget,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.sm,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSizes.body,
  },
  lyricsControlHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  lyricsBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  lyricsBadgeText: {
    fontSize: fontSizes.caption,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  lyricsActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  fetchLyricsBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  fetchLyricsBtnText: {
    fontSize: fontSizes.caption,
    color: colors.primary,
    fontWeight: fontWeights.medium,
  },
  clearLyricsBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.xs,
    backgroundColor: colors.dangerBg,
  },
  clearLyricsBtnText: {
    fontSize: fontSizes.caption,
    color: colors.danger,
    fontWeight: fontWeights.medium,
  },
  lyricsTextAreaExpanded: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
    paddingTop: spacing.sm,
    textAlignVertical: 'top',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  btnInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteBtn: {
    minHeight: layout.minTouchTarget,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.dangerDark,
    backgroundColor: colors.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    color: colors.danger,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.semibold,
  },
  primaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cancelBtn: {
    minHeight: layout.minTouchTarget,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.semibold,
  },
  saveBtn: {
    minHeight: layout.minTouchTarget,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: colors.textDark,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.bold,
  },
  coverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  coverBox: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  coverImg: {
    width: '100%',
    height: '100%',
  },
  coverEmptyBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xs,
  },
  coverEmptyText: {
    color: colors.textMuted,
    fontSize: fontSizes.caption,
    textAlign: 'center',
  },
  coverActions: {
    flex: 1,
    justifyContent: 'center',
  },
  pickCoverBtn: {
    backgroundColor: colors.surfaceSecondary,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    alignItems: 'center',
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickCoverBtnText: {
    color: colors.textPrimary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.medium,
  },
  removeCoverBtn: {
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  removeCoverBtnText: {
    color: colors.danger,
    fontSize: fontSizes.caption,
  },
});
