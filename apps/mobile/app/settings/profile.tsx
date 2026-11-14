import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { UserProfile } from '@music-app/shared';
import { tokens } from '../../src/theme/tokens';
import { statsStorage } from '../../src/services/stats/statsStorage';
import { UserAvatar, ListGroup, SectionHeader } from '../../src/components/common';
import {
  CameraIcon,
  DiscIcon,
  HeadphonesIcon,
  MusicNoteIcon,
  HeartIcon,
  FlameIcon,
  StarIcon,
  TrophyIcon,
  MoonIcon,
} from '../../src/components/icons/SvgIcons';
import { triggerSelectionHaptic } from '../../src/utils/haptics';

const AVATAR_BADGES = [
  { key: 'headphones', label: 'Tai nghe', renderIcon: (size: number, color: string) => <HeadphonesIcon size={size} color={color} /> },
  { key: 'disc', label: 'Đĩa than', renderIcon: (size: number, color: string) => <DiscIcon size={size} color={color} /> },
  { key: 'note', label: 'Nốt nhạc', renderIcon: (size: number, color: string) => <MusicNoteIcon size={size} color={color} /> },
  { key: 'heart', label: 'Yêu thích', renderIcon: (size: number, color: string) => <HeartIcon size={size} color={color} fill={color} /> },
  { key: 'flame', label: 'Nhiệt huyết', renderIcon: (size: number, color: string) => <FlameIcon size={size} color={color} /> },
  { key: 'star', label: 'Ngôi sao', renderIcon: (size: number, color: string) => <StarIcon size={size} color={color} /> },
  { key: 'trophy', label: 'Quán quân', renderIcon: (size: number, color: string) => <TrophyIcon size={size} color={color} /> },
  { key: 'moon', label: 'Cú đêm', renderIcon: (size: number, color: string) => <MoonIcon size={size} color={color} /> },
] as const;

function SpringButton({
  children,
  onPress,
  style,
  disabled,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        disabled={disabled}
        onPressIn={() => {
          if (!disabled) scale.value = withSpring(0.94, { damping: 15, stiffness: 300 });
        }}
        onPressOut={() => {
          if (!disabled) scale.value = withSpring(1, { damping: 15, stiffness: 300 });
        }}
        onPress={onPress}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

function AnimatedInput({
  label,
  value,
  onChangeText,
  placeholder,
  maxLength,
  multiline,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const borderProgress = useSharedValue(0);

  useEffect(() => {
    borderProgress.value = withTiming(isFocused ? 1 : 0, { duration: 180 });
  }, [isFocused, borderProgress]);

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: isFocused ? tokens.colors.accent : tokens.colors.separator,
    borderWidth: isFocused ? 1.5 : tokens.hairlineWidth,
  }));

  return (
    <View style={{ marginBottom: tokens.spacing.md }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <Animated.View style={[styles.inputWrapper, borderStyle]}>
        <TextInput
          style={[styles.textInputInner, style]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={tokens.colors.textMuted}
          maxLength={maxLength}
          multiline={multiline}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
      </Animated.View>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState('');
  const [avatarKey, setAvatarKey] = useState('headphones');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    statsStorage.loadUserProfile().then((profile) => {
      setUserProfile(profile);
      setDisplayName(profile.displayName);
      setBio(profile.bio);
      setAvatarUri(profile.avatarUri || '');
      setAvatarKey(profile.avatarKey || 'headphones');
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

  const handleSelectBadge = (key: string) => {
    triggerSelectionHaptic();
    setAvatarKey(key);
    // Nếu đang có ảnh tải lên, xóa ảnh để áp dụng biểu tượng huy hiệu
    if (avatarUri) {
      setAvatarUri('');
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
        avatarKey: avatarKey || 'headphones',
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
            avatarKey={avatarKey}
            size={84}
          />

          <View style={styles.avatarBtnRow}>
            <SpringButton style={styles.pillBtn} onPress={handleTakePhoto}>
              <CameraIcon size={16} color={tokens.colors.textPrimary} />
              <Text style={styles.pillBtnText}>Chụp ảnh</Text>
            </SpringButton>

            <SpringButton style={styles.pillBtn} onPress={handlePickImage}>
              <DiscIcon size={16} color={tokens.colors.textPrimary} />
              <Text style={styles.pillBtnText}>Thư viện ảnh</Text>
            </SpringButton>

            {Boolean(avatarUri) && (
              <SpringButton
                style={[styles.pillBtn, styles.clearBtn]}
                onPress={() => setAvatarUri('')}
              >
                <Text style={styles.clearBtnText}>Gỡ ảnh</Text>
              </SpringButton>
            )}
          </View>
        </View>
      </ListGroup>

      {/* BIỂU TƯỢNG HUY HIỆU ĐẠI DIỆN VỚI HIỆU ỨNG CHẠM NHÚN LÒ XO */}
      <SectionHeader
        title="BIỂU TƯỢNG HUY HIỆU"
        subtitle="Chọn biểu tượng đại diện âm nhạc cho trang chủ và hồ sơ"
      />
      <ListGroup>
        <View style={styles.badgesGrid}>
          {AVATAR_BADGES.map((badge) => {
            const isSelected = !avatarUri && avatarKey === badge.key;
            return (
              <SpringButton
                key={badge.key}
                style={[
                  styles.badgeItem,
                  isSelected && styles.badgeItemSelected,
                ]}
                onPress={() => handleSelectBadge(badge.key)}
              >
                <View style={[styles.badgeIconCircle, isSelected && styles.badgeIconCircleSelected]}>
                  {badge.renderIcon(22, isSelected ? tokens.colors.accent : tokens.colors.textSecondary)}
                </View>
                <Text
                  style={[
                    styles.badgeItemText,
                    isSelected && styles.badgeItemTextSelected,
                  ]}
                  numberOfLines={1}
                >
                  {badge.label}
                </Text>
              </SpringButton>
            );
          })}
        </View>
      </ListGroup>

      <SectionHeader title="THÔNG TIN CÁ NHÂN" />
      <ListGroup>
        <View style={styles.inputBox}>
          <AnimatedInput
            label="Tên của bạn"
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={32}
            placeholder="Tên hiển thị..."
          />

          <AnimatedInput
            label="Giới thiệu ngắn (Bio)"
            value={bio}
            onChangeText={setBio}
            maxLength={120}
            multiline
            placeholder="Viết vài dòng về gu âm nhạc của bạn..."
            style={styles.bioInput}
          />

          <SpringButton
            style={[styles.saveBtn, isSaving && styles.btnDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Text style={styles.saveBtnText}>{isSaving ? 'Đang lưu...' : 'Lưu hồ sơ'}</Text>
          </SpringButton>
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
    paddingVertical: 8,
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
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  badgeItem: {
    width: '23%',
    alignItems: 'center',
    paddingVertical: tokens.spacing.md,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.bgElevated,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  badgeItemSelected: {
    backgroundColor: 'rgba(29, 185, 84, 0.14)',
    borderColor: tokens.colors.accent,
  },
  badgeIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  badgeIconCircleSelected: {
    backgroundColor: 'rgba(29, 185, 84, 0.22)',
  },
  badgeItemText: {
    ...tokens.typography.caption,
    fontSize: 11,
    color: tokens.colors.textMuted,
    fontWeight: '500',
  },
  badgeItemTextSelected: {
    color: tokens.colors.accent,
    fontWeight: '700',
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
  inputWrapper: {
    backgroundColor: tokens.colors.bgElevated,
    borderRadius: tokens.radius.card - 4,
  },
  textInputInner: {
    ...tokens.typography.body,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
    color: tokens.colors.textPrimary,
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
