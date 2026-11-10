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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Track, UpdateTrack } from '@music-app/shared';
import { TrashIcon } from './icons/SvgIcons';
import { ModalHeader } from './ModalHeader';
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

  // Chiều cao thân cuộn thích ứng, đảm bảo khi bàn phím mở vẫn cuộn được trên iPhone Face ID
  const maxBodyHeight = Math.max(
    layout.modalBodyMinHeight,
    Math.min(layout.modalBodyMaxHeight, Math.round(screenHeight * 0.46))
  );

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [year, setYear] = useState('');
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
      setLyrics('');
      setErrorMessage(null);

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
  }, [track, visible, onFetchLyrics]);

  if (!track) return null;

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    const trimmedArtist = artist.trim();

    if (!trimmedTitle) {
      setErrorMessage('Tên bài hát không được để trống');
      return;
    }
    if (!trimmedArtist) {
      setErrorMessage('Tên nghệ sĩ không được để trống');
      return;
    }

    let parsedYear: number | undefined;
    if (year.trim()) {
      const num = parseInt(year.trim(), 10);
      if (isNaN(num) || num < 1900 || num > 2100) {
        setErrorMessage('Năm phát hành không hợp lệ (1900 - 2100)');
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
            { paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.sm) },
          ]}
        >
          {/* Header dùng chung với nút đóng chuẩn >= 44x44pt */}
          <ModalHeader
            title="Chỉnh sửa bài hát"
            subtitle={`ID: ${track.id}`}
            onClose={onClose}
            closeDisabled={isSaving || isDeleting}
          />

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

            {/* Lời bài hát (.LRC) */}
            <View style={styles.inputGroup}>
              <View style={styles.lyricsLabelRow}>
                <Text style={styles.label}>LỜI BÀI HÁT (.LRC HOẶC TEXT)</Text>
                {isLoadingLyrics && (
                  <View style={styles.lyricsLoadingRow}>
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: spacing.xs }} />
                    <Text style={styles.lyricsLoadingText}>Đang nạp lời...</Text>
                  </View>
                )}
              </View>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={lyrics}
                onChangeText={setLyrics}
                placeholder="Dán nội dung lời bài hát hoặc cú pháp .lrc [00:12.34]..."
                placeholderTextColor={colors.textPlaceholder}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                editable={!isSaving && !isDeleting && !isLoadingLyrics}
              />
            </View>
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
    maxHeight: '92%',
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
  textArea: {
    minHeight: 96,
    textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  lyricsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  lyricsLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lyricsLoadingText: {
    fontSize: fontSizes.caption,
    color: colors.primary,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
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
});
