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
} from 'react-native';
import type { Track, UpdateTrack } from '@music-app/shared';
import { CloseIcon, TrashIcon } from './icons/SvgIcons';

export interface EditTrackModalProps {
  visible: boolean;
  track: Track | null;
  onClose: () => void;
  onSave: (trackId: string, updates: UpdateTrack) => Promise<void>;
  onDelete?: (trackId: string) => Promise<void>;
}

export function EditTrackModal({
  visible,
  track,
  onClose,
  onSave,
  onDelete,
}: EditTrackModalProps) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [year, setYear] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Khi mở modal hoặc đổi track, nạp dữ liệu vào form
  useEffect(() => {
    if (track) {
      setTitle(track.title || '');
      setArtist(track.artist || '');
      setAlbum(track.album || '');
      setYear(track.year ? track.year.toString() : '');
      setLyrics('');
      setErrorMessage(null);
    }
  }, [track, visible]);

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
        ...(lyrics.trim() ? { lyrics: lyrics.trim() } : {}),
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
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Chỉnh sửa bài hát</Text>
              <Text style={styles.headerSubtitle}>ID: {track.id}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              disabled={isSaving || isDeleting}
            >
              <CloseIcon size={18} color="#b3b3b3" />
            </TouchableOpacity>
          </View>

          {/* Error Banner */}
          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
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
                placeholderTextColor="#666"
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
                placeholderTextColor="#666"
                editable={!isSaving && !isDeleting}
              />
            </View>

            {/* Hàng Album & Năm */}
            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 2, marginRight: 10 }]}>
                <Text style={styles.label}>ALBUM</Text>
                <TextInput
                  style={styles.input}
                  value={album}
                  onChangeText={setAlbum}
                  placeholder="Tên album (tùy chọn)"
                  placeholderTextColor="#666"
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
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                  maxLength={4}
                  editable={!isSaving && !isDeleting}
                />
              </View>
            </View>

            {/* Lời bài hát (.LRC) */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>LỜI BÀI HÁT (.LRC HOẶC TEXT)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={lyrics}
                onChangeText={setLyrics}
                placeholder="Dán nội dung lời bài hát hoặc cú pháp .lrc [00:12.34]..."
                placeholderTextColor="#666"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!isSaving && !isDeleting}
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
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#ef4444" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TrashIcon size={16} color="#ef4444" />
                    <Text style={[styles.deleteBtnText, { marginLeft: 6 }]}>Xóa bài</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            <View style={styles.primaryActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                disabled={isSaving || isDeleting}
              >
                <Text style={styles.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={isSaving || isDeleting}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#000" />
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#181818',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#282828',
    padding: 20,
    maxHeight: '90%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#282828',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#71717a',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  closeBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#27272a',
  },
  closeBtnText: {
    color: '#a1a1aa',
    fontSize: 14,
    fontWeight: 'bold',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
  },
  bodyScroll: {
    maxHeight: 400,
  },
  inputGroup: {
    marginBottom: 14,
  },
  rowInputs: {
    flexDirection: 'row',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#a1a1aa',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  requiredMark: {
    color: '#ef4444',
  },
  input: {
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    color: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#282828',
  },
  deleteBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  deleteBtnText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  primaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#27272a',
  },
  cancelBtnText: {
    color: '#d4d4d8',
    fontSize: 13,
    fontWeight: '600',
  },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
});
