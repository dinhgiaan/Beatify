import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { UserProfile } from '@music-app/shared';
import { tokens } from '../../src/theme/tokens';
import { statsStorage } from '../../src/services/stats/statsStorage';
import { UserAvatar, ListGroup, SectionHeader } from '../../src/components/common';
import { CameraIcon, DiscIcon } from '../../src/components/icons/SvgIcons';
import { triggerSelectionHaptic } from '../../src/utils/haptics';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    statsStorage.loadUserProfile().then((profile) => {
      setUserProfile(profile);
      setDisplayName(profile.displayName);
      setBio(profile.bio);
      setAvatarUri(profile.avatarUri || '');
    }).catch(() => {});
  }, []);

  const handlePickImage = async () => {
    try {
      triggerSelectionHaptic();
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Cần quyền Thư viện ảnh',
          'Vui lòng cho phép Beatify truy cập Thư viện ảnh trong Cài đặt iPhone.'
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        const dest = `${FileSystem.documentDirectory || ''}avatar_${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: result.assets[0].uri, to: dest });
        setAvatarUri(dest);
      }
    } catch {
      Alert.alert('Không thể chọn ảnh', 'Đã xảy ra lỗi khi chọn ảnh.');
    }
  };

  const handleTakePhoto = async () => {
    try {
      triggerSelectionHaptic();
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Cần quyền Camera',
          'Vui lòng cho phép Beatify truy cập Camera trong Cài đặt iPhone.'
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        const dest = `${FileSystem.documentDirectory || ''}avatar_${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: result.assets[0].uri, to: dest });
        setAvatarUri(dest);
      }
    } catch {
      Alert.alert('Không thể chụp ảnh', 'Đã xảy ra lỗi khi khởi động máy ảnh.');
    }
  };

  const handleSave = async () => {
    triggerSelectionHaptic();
    setIsSaving(true);
    try {
      const updated: UserProfile = {
        displayName: displayName.trim() || 'Người Yêu Nhạc',
        bio: bio.trim(),
        avatarUri: avatarUri || '',
        avatarKey: userProfile?.avatarKey || 'headphones',
        joinedDate: userProfile?.joinedDate || new Date().toISOString().slice(0, 10),
      };

      await statsStorage.saveUserProfile(updated);
      setUserProfile(updated);
      setIsSaving(false);
      Alert.alert('Thành công', 'Hồ sơ đã được lưu!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      setIsSaving(false);
      Alert.alert('Lỗi', 'Không thể lưu hồ sơ cá nhân.');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.scrollInner,
        { paddingBottom: Math.max(insets.bottom, tokens.spacing.xl) + tokens.spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <SectionHeader title="ẢNH ĐẠI DIỆN" />
      <ListGroup>
        <View style={styles.avatarSection}>
          <UserAvatar
            avatarUri={avatarUri}
            displayName={displayName || 'Người Yêu Nhạc'}
            size={84}
          />

          <View style={styles.avatarBtnRow}>
            <TouchableOpacity style={styles.pillBtn} onPress={handleTakePhoto} activeOpacity={0.7}>
              <CameraIcon size={16} color={tokens.colors.textPrimary} />
              <Text style={styles.pillBtnText}>Chụp ảnh</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.pillBtn} onPress={handlePickImage} activeOpacity={0.7}>
              <DiscIcon size={16} color={tokens.colors.textPrimary} />
              <Text style={styles.pillBtnText}>Thư viện ảnh</Text>
            </TouchableOpacity>

            {Boolean(avatarUri) && (
              <TouchableOpacity
                style={[styles.pillBtn, styles.clearBtn]}
                onPress={() => setAvatarUri('')}
                activeOpacity={0.7}
              >
                <Text style={styles.clearBtnText}>Gỡ ảnh</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ListGroup>

      <SectionHeader title="THÔNG TIN CÁ NHÂN" />
      <ListGroup>
        <View style={styles.inputBox}>
          <Text style={styles.inputLabel}>Tên của bạn</Text>
          <TextInput
            style={styles.textInput}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={32}
            placeholder="Tên hiển thị..."
            placeholderTextColor={tokens.colors.textMuted}
          />

          <Text style={styles.inputLabel}>Giới thiệu ngắn (Bio)</Text>
          <TextInput
            style={[styles.textInput, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            maxLength={120}
            multiline
            placeholder="Viết vài dòng về gu âm nhạc của bạn..."
            placeholderTextColor={tokens.colors.textMuted}
          />

          <TouchableOpacity
            style={[styles.saveBtn, isSaving && styles.btnDisabled]}
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.7}
          >
            <Text style={styles.saveBtnText}>{isSaving ? 'Đang lưu...' : 'Lưu hồ sơ'}</Text>
          </TouchableOpacity>
        </View>
      </ListGroup>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bgBase,
  },
  scrollInner: {
    paddingTop: tokens.spacing.sm,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: tokens.spacing.lg,
  },
  avatarBtnRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.md,
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.colors.bgElevated,
    paddingVertical: 7,
    paddingHorizontal: tokens.spacing.md,
    borderRadius: tokens.radius.pill,
    borderWidth: tokens.hairlineWidth,
    borderColor: tokens.colors.separator,
  },
  pillBtnText: {
    ...tokens.typography.footnote,
    color: tokens.colors.textPrimary,
    fontWeight: '500',
  },
  clearBtn: {
    borderColor: tokens.colors.dangerBorder,
  },
  clearBtnText: {
    ...tokens.typography.footnote,
    color: tokens.colors.danger,
    fontWeight: '500',
  },
  inputBox: {
    padding: tokens.spacing.lg,
  },
  inputLabel: {
    ...tokens.typography.caption,
    color: tokens.colors.textMuted,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
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
    minHeight: 70,
    textAlignVertical: 'top',
  },
  saveBtn: {
    minHeight: 46,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: tokens.spacing.xs,
  },
  saveBtnText: {
    ...tokens.typography.body,
    color: '#000000',
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});

