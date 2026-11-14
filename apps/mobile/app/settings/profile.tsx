import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  StyleSheet,
  Dimensions,
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
  const [avatarMode, setAvatarMode] = useState<'badges' | 'custom'>('badges');
  const [isSaving, setIsSaving] = useState(false);

  // Reanimated sliding active pill cho tab chuyển đổi phong cách avatar
  const avatarModeIdx = avatarMode === 'badges' ? 0 : 1;
  const avatarModeShared = useSharedValue(avatarModeIdx);
  const screenWidth = Dimensions.get('window').width;
  const tabTrackWidthShared = useSharedValue(Math.max(screenWidth - 64, 280));

  useEffect(() => {
    avatarModeShared.value = withSpring(avatarMode === 'badges' ? 0 : 1, {
      damping: 20,
      stiffness: 150,
      mass: 0.7,
    });
  }, [avatarMode, avatarModeShared]);

  const modePillAnimStyle = useAnimatedStyle(() => {
    const availableWidth = Math.max(0, tabTrackWidthShared.value - 8);
    const itemWidth = availableWidth / 2;
    return {
      width: itemWidth > 0 ? itemWidth : 0,
      transform: [
        {
          translateX: avatarModeShared.value * itemWidth,
        },
      ],
      opacity: tabTrackWidthShared.value > 0 ? 1 : 0,
    };
  });

  useEffect(() => {
    statsStorage.loadUserProfile().then((profile) => {
      setUserProfile(profile);
      setDisplayName(profile.displayName);
      setBio(profile.bio);
      setAvatarUri(profile.avatarUri || '');
      setAvatarKey(profile.avatarKey || 'headphones');
      if (profile.avatarUri) {
        setAvatarMode('custom');
      }
    }).catch(() => { });
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
        setAvatarMode('custom');
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
        setAvatarMode('custom');
      }
    } catch {
      Alert.alert('Không thể chụp ảnh', 'Đã xảy ra lỗi khi khởi động máy ảnh.');
    }
  };

  const handleSelectBadge = (key: string) => {
    triggerSelectionHaptic();
    setAvatarKey(key);
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
            avatarUri={avatarMode === 'custom' ? avatarUri : ''}
            displayName={displayName || 'Người Yêu Nhạc'}
            avatarKey={avatarKey}
            size={88}
          />
        </View>
      </ListGroup>

      {/* PHÂN ĐOẠN TAB CHUYỂN ĐỔI PHONG CÁCH VỚI HIỆU ỨNG SLIDING ACTIVE PILL */}
      <SectionHeader
        title="PHONG CÁCH ĐẠI DIỆN"
        subtitle="Chọn giữa biểu tượng huy hiệu âm nhạc hoặc ảnh cá nhân"
      />
      <ListGroup>
        <View style={styles.tabTrackContainer}>
          <View
            style={styles.tabTrack}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 0) {
                tabTrackWidthShared.value = w;
              }
            }}
          >
            {/* Nền active di chuyển mượt mà dạng trượt (Sliding Active Pill) */}
            <Animated.View style={[styles.slidingActivePill, modePillAnimStyle]} pointerEvents="none" />

            <Pressable
              style={styles.modeTabBtn}
              onPress={() => {
                triggerSelectionHaptic();
                avatarModeShared.value = withSpring(0, {
                  damping: 18,
                  stiffness: 180,
                  mass: 0.65,
                });
                setAvatarMode('badges');
              }}
            >
              <Text
                style={[
                  styles.modeTabBtnText,
                  avatarMode === 'badges' && styles.modeTabBtnTextActive,
                ]}
              >
                Huy hiệu âm nhạc
              </Text>
            </Pressable>

            <Pressable
              style={styles.modeTabBtn}
              onPress={() => {
                triggerSelectionHaptic();
                avatarModeShared.value = withSpring(1, {
                  damping: 18,
                  stiffness: 180,
                  mass: 0.65,
                });
                setAvatarMode('custom');
              }}
            >
              <Text
                style={[
                  styles.modeTabBtnText,
                  avatarMode === 'custom' && styles.modeTabBtnTextActive,
                ]}
              >
                Ảnh cá nhân
              </Text>
            </Pressable>
          </View>
        </View>

        {avatarMode === 'badges' ? (
          <View style={styles.badgesGrid}>
            {AVATAR_BADGES.map((badge) => {
              const isSelected = avatarKey === badge.key;
              return (
                <View key={badge.key} style={styles.badgeCol}>
                  <SpringButton
                    style={[
                      styles.badgeCircleBtn,
                      isSelected && styles.badgeCircleBtnSelected,
                    ]}
                    onPress={() => handleSelectBadge(badge.key)}
                  >
                    {badge.renderIcon(26, isSelected ? tokens.colors.accent : tokens.colors.textSecondary)}
                  </SpringButton>
                  <Text
                    style={[
                      styles.badgeItemText,
                      isSelected && styles.badgeItemTextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {badge.label}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.customPhotoSection}>
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
        )}
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
      </ListGroup >
    </ScrollView >
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
  tabTrackContainer: {
    paddingHorizontal: tokens.spacing.md,
    paddingTop: tokens.spacing.md,
  },
  tabTrack: {
    position: 'relative',
    flexDirection: 'row',
    backgroundColor: tokens.colors.bgElevated,
    borderRadius: tokens.radius.pill,
    padding: 4,
    borderWidth: tokens.hairlineWidth,
    borderColor: tokens.colors.separator,
  },
  slidingActivePill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: tokens.colors.accent,
    borderRadius: tokens.radius.pill,
  },
  modeTabBtn: {
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: tokens.radius.pill,
    zIndex: 1,
  },
  modeTabBtnText: {
    ...tokens.typography.footnote,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
  },
  modeTabBtnTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  customPhotoSection: {
    padding: tokens.spacing.lg,
    alignItems: 'center',
  },
  avatarBtnRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.colors.bgElevated,
    paddingVertical: 9,
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
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.xs,
  },
  badgeCol: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: tokens.spacing.xs,
    marginBottom: tokens.spacing.sm,
  },
  badgeCircleBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  badgeCircleBtnSelected: {
    backgroundColor: 'rgba(29, 185, 84, 0.22)',
    borderColor: tokens.colors.accent,
    borderWidth: 2.5,
  },
  badgeItemText: {
    ...tokens.typography.caption,
    fontSize: 11.5,
    color: tokens.colors.textMuted,
    fontWeight: '500',
    textAlign: 'center',
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
