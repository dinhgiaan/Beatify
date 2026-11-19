import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Share,
  Alert,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Track } from '@music-app/shared';
import { colors, fontSizes, fontWeights, spacing, radius } from '../../theme';
import { CloseIcon, DiscIcon } from '../icons/SvgIcons';

interface LyricPosterModalProps {
  visible: boolean;
  onClose: () => void;
  initialLyricText: string;
  track: Track | null;
}

type FontStyleOption = 'streetBold' | 'typewriter' | 'modernSans' | 'graffiti';
type ColorThemeOption = 'darkConcrete' | 'toxicNeon' | 'goldenDrip' | 'purpleHaze' | 'crimsonRed';
type TextAlignOption = 'left' | 'center' | 'right';
type CardAspectOption = 'square' | 'story';

interface ColorThemeDef {
  name: string;
  bgColor: string;
  textColor: string;
  accentColor: string;
  badgeBg: string;
}

const COLOR_THEMES: Record<ColorThemeOption, ColorThemeDef> = {
  darkConcrete: {
    name: 'Xi măng đen',
    bgColor: '#18181b',
    textColor: '#ffffff',
    accentColor: colors.primary,
    badgeBg: 'rgba(255, 255, 255, 0.1)',
  },
  toxicNeon: {
    name: 'Toxic Neon',
    bgColor: '#05130b',
    textColor: '#10B981',
    accentColor: '#34D399',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
  },
  goldenDrip: {
    name: 'Golden Drip',
    bgColor: '#120f08',
    textColor: '#F59E0B',
    accentColor: '#FBBF24',
    badgeBg: 'rgba(245, 158, 11, 0.15)',
  },
  purpleHaze: {
    name: 'Purple Haze',
    bgColor: '#13091f',
    textColor: '#C084FC',
    accentColor: '#E879F9',
    badgeBg: 'rgba(192, 132, 252, 0.15)',
  },
  crimsonRed: {
    name: 'Crimson Red',
    bgColor: '#1c080b',
    textColor: '#F87171',
    accentColor: '#EF4444',
    badgeBg: 'rgba(239, 68, 68, 0.15)',
  },
};

/**
 * LyricPosterModal: Trình tạo Thẻ Poster Lời Bài Hát Trích Dẫn Đường Phố (Lyric Poster Card)
 * - Live Preview tỷ lệ 1:1 hoặc 9:16 cập nhật ngay tức thì
 * - Tùy chỉnh Font chữ, Phối màu Themes, Căn lề Trái/Giữa/Phải
 * - Tùy chọn nền mờ Artwork Glassmorphism
 * - Chia sẻ và lưu trữ dễ dàng
 */
export function LyricPosterModal({
  visible,
  onClose,
  initialLyricText,
  track,
}: LyricPosterModalProps) {
  const insets = useSafeAreaInsets();

  const [lyricText, setLyricText] = useState(initialLyricText || 'Lời trích dẫn truyền cảm hứng');
  const [selectedFont, setSelectedFont] = useState<FontStyleOption>('streetBold');
  const [selectedTheme, setSelectedTheme] = useState<ColorThemeOption>('toxicNeon');
  const [textAlign, setTextAlign] = useState<TextAlignOption>('center');
  const [aspect, setAspect] = useState<CardAspectOption>('square');
  const [useArtworkBg, setUseArtworkBg] = useState(true);

  // Đồng bộ lyricText khi initialLyricText thay đổi
  React.useEffect(() => {
    if (initialLyricText) {
      setLyricText(initialLyricText);
    }
  }, [initialLyricText]);

  const activeTheme = COLOR_THEMES[selectedTheme];

  const getLyricTextStyle = (): TextStyle => {
    switch (selectedFont) {
      case 'typewriter':
        return {
          fontFamily: 'Courier',
          fontWeight: fontWeights.bold,
          letterSpacing: 0.5,
          lineHeight: 28,
        };
      case 'modernSans':
        return {
          fontWeight: fontWeights.regular,
          letterSpacing: -0.2,
          lineHeight: 30,
        };
      case 'graffiti':
        return {
          fontWeight: fontWeights.extrabold,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          lineHeight: 32,
        };
      case 'streetBold':
      default:
        return {
          fontWeight: fontWeights.extrabold,
          letterSpacing: -0.5,
          lineHeight: 32,
        };
    }
  };

  const handleShare = async () => {
    const title = track?.title || 'Beatify';
    const artist = track?.artist || 'Unknown';
    const message = `"${lyricText}"\n\n— Bài hát: ${title} • ${artist}\nNghe trọn vẹn trên Beatify Music.`;

    try {
      await Share.share({
        message,
        title: `Beatify Lyric Quote: ${title}`,
      });
    } catch {
      Alert.alert('Không thể chia sẻ', 'Đã xảy ra lỗi khi mở bảng chia sẻ.');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: Math.max(insets.top, spacing.md) }]}>
        {/* Header Modal */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Tạo Poster Trích Dẫn</Text>
            <Text style={styles.headerSubtitle}>Tùy biến typography & chia sẻ punchline yêu thích</Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <CloseIcon size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, spacing.xl) + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* KHUNG XEM TRƯỚC TRỰC QUAN (LIVE PREVIEW POSTER CARD) */}
          <View
            style={[
              styles.previewCard,
              {
                backgroundColor: activeTheme.bgColor,
                aspectRatio: aspect === 'square' ? 1 : 9 / 14,
              },
            ]}
          >
            {/* Nền mờ Artwork nếu được bật */}
            {useArtworkBg && track?.cover ? (
              <Image
                source={{ uri: track.cover }}
                style={styles.previewArtworkBg}
                blurRadius={28}
                resizeMode="cover"
              />
            ) : null}

            {/* Lớp phủ mờ bảo đảm độ tương phản chữ */}
            <View
              style={[
                styles.previewOverlay,
                {
                  backgroundColor: useArtworkBg
                    ? 'rgba(0, 0, 0, 0.65)'
                    : activeTheme.bgColor,
                },
              ]}
            />

            {/* Nội dung trên Poster */}
            <View style={styles.posterInnerContent}>
              {/* Logo nhãn nước Beatify góc trên */}
              <View style={styles.posterHeaderBadge}>
                <DiscIcon size={14} color={activeTheme.accentColor} />
                <Text style={[styles.posterHeaderLogo, { color: activeTheme.accentColor }]}>
                  BEATIFY PUNCHLINE
                </Text>
              </View>

              {/* Câu Lời bài hát chính */}
              <View style={styles.quoteWrap}>
                <Text
                  style={[
                    styles.quoteText,
                    getLyricTextStyle(),
                    {
                      color: activeTheme.textColor,
                      textAlign,
                    },
                  ]}
                  numberOfLines={aspect === 'square' ? 4 : 6}
                >
                  &ldquo;{lyricText}&rdquo;
                </Text>
              </View>

              {/* Thông tin Bài hát & Nghệ sĩ góc dưới */}
              <View style={[styles.posterFooter, { backgroundColor: activeTheme.badgeBg }]}>
                {track?.cover ? (
                  <Image source={{ uri: track.cover }} style={styles.footerCover} resizeMode="cover" />
                ) : (
                  <View style={styles.footerPlaceholder}>
                    <DiscIcon size={16} color={activeTheme.accentColor} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.footerTitle, { color: activeTheme.textColor }]} numberOfLines={1}>
                    {track?.title || 'Chưa rõ bài hát'}
                  </Text>
                  <Text style={[styles.footerArtist, { color: activeTheme.accentColor }]} numberOfLines={1}>
                    {track?.artist || 'Chưa rõ ca sĩ'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Ô CHỈNH SỬA LỜI BÀI HÁT TỰ DO */}
          <View style={styles.editSection}>
            <Text style={styles.sectionLabel}>CHỈNH SỬA NỘI DUNG CÂU HÁT</Text>
            <TextInput
              style={styles.lyricTextInput}
              value={lyricText}
              onChangeText={setLyricText}
              multiline
              maxLength={180}
              placeholder="Nhập hoặc chỉnh sửa câu punchline..."
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          {/* CHỌN BẢNG MÀU (THEMES) */}
          <View style={styles.editSection}>
            <Text style={styles.sectionLabel}>PHỐI MÀU POSTER</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {(Object.keys(COLOR_THEMES) as ColorThemeOption[]).map((themeKey) => {
                const item = COLOR_THEMES[themeKey];
                const isActive = selectedTheme === themeKey;
                return (
                  <TouchableOpacity
                    key={themeKey}
                    style={[
                      styles.themeChip,
                      { backgroundColor: item.bgColor, borderColor: isActive ? colors.primary : '#333' },
                      isActive && styles.chipActiveRing,
                    ]}
                    onPress={() => {
                      setSelectedTheme(themeKey);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.themeChipDot, { backgroundColor: item.textColor }]} />
                    <Text style={[styles.themeChipText, { color: item.textColor }]}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* CHỌN FONT CHỮ (TYPOGRAPHY) */}
          <View style={styles.editSection}>
            <Text style={styles.sectionLabel}>FONT CHỮ (TYPOGRAPHY)</Text>
            <View style={styles.grid2Col}>
              {[
                { id: 'streetBold', label: 'Street Bold ✦' },
                { id: 'graffiti', label: 'Graffiti Cap' },
                { id: 'typewriter', label: 'Typewriter' },
                { id: 'modernSans', label: 'Modern Sans' },
              ].map((f) => {
                const isActive = selectedFont === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.toggleBtn, isActive && styles.toggleBtnActive]}
                    onPress={() => {
                      setSelectedFont(f.id as FontStyleOption);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.toggleBtnText, isActive && styles.toggleBtnTextActive]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* CĂN LỀ & BỐ CỤC */}
          <View style={styles.editSection}>
            <Text style={styles.sectionLabel}>CĂN LỀ & TỶ LỆ KHUNG HÌNH</Text>
            <View style={styles.dualOptionsRow}>
              {/* Căn lề */}
              <View style={styles.buttonSegmentGroup}>
                {(['left', 'center', 'right'] as const).map((a) => (
                  <TouchableOpacity
                    key={a}
                    style={[styles.segmentBtn, textAlign === a && styles.segmentBtnActive]}
                    onPress={() => {
                      setTextAlign(a);
                    }}
                  >
                    <Text style={[styles.segmentBtnText, textAlign === a && styles.segmentBtnTextActive]}>
                      {a === 'left' ? 'Trái' : a === 'center' ? 'Giữa' : 'Phải'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Tỷ lệ */}
              <View style={styles.buttonSegmentGroup}>
                <TouchableOpacity
                  style={[styles.segmentBtn, aspect === 'square' && styles.segmentBtnActive]}
                  onPress={() => {
                    setAspect('square');
                  }}
                >
                  <Text style={[styles.segmentBtnText, aspect === 'square' && styles.segmentBtnTextActive]}>
                    1:1 Vuông
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentBtn, aspect === 'story' && styles.segmentBtnActive]}
                  onPress={() => {
                    setAspect('story');
                  }}
                >
                  <Text style={[styles.segmentBtnText, aspect === 'story' && styles.segmentBtnTextActive]}>
                    9:16 Story
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Bật/Tắt nền mờ Artwork */}
            <TouchableOpacity
              style={styles.toggleArtworkRow}
              onPress={() => {
                setUseArtworkBg(!useArtworkBg);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.toggleArtworkText}>Nền ảnh bìa mờ (Glassmorphism Blur)</Text>
              <View style={[styles.checkbox, useArtworkBg && styles.checkboxActive]}>
                {useArtworkBg && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>
          </View>

          {/* NÚT CHIA SẺ & LƯU POSTER */}
          <TouchableOpacity
            style={styles.sharePosterBtn}
            onPress={handleShare}
            activeOpacity={0.8}
          >
            <Text style={styles.sharePosterBtnText}>Chia sẻ / Lưu ảnh Poster</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: fontSizes.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  // Preview Card styles
  previewCard: {
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 12,
  },
  previewArtworkBg: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  previewOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  posterInnerContent: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  posterHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  posterHeaderLogo: {
    fontSize: 10,
    fontWeight: fontWeights.bold,
    letterSpacing: 1,
  },
  quoteWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  quoteText: {
    fontSize: fontSizes.headline,
  },
  posterFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  footerCover: {
    width: 36,
    height: 36,
    borderRadius: radius.xs,
  },
  footerPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerTitle: {
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.bold,
  },
  footerArtist: {
    fontSize: fontSizes.caption,
    marginTop: 1,
  },
  // Edit Controls
  editSection: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  lyricTextInput: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    color: colors.textPrimary,
    fontSize: fontSizes.subhead,
    padding: spacing.sm,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  chipsRow: {
    gap: spacing.xs,
    paddingVertical: 2,
  },
  themeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  chipActiveRing: {
    borderColor: colors.primary,
  },
  themeChipDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  themeChipText: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
  },
  grid2Col: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  toggleBtn: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  toggleBtnText: {
    color: colors.textSecondary,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.semibold,
  },
  toggleBtnTextActive: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
  dualOptionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  buttonSegmentGroup: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.surface,
  },
  segmentBtnText: {
    color: colors.textTertiary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
  },
  segmentBtnTextActive: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  toggleArtworkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    marginTop: 4,
  },
  toggleArtworkText: {
    color: colors.textSecondary,
    fontSize: fontSizes.subhead,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.xs,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: '#000000',
    fontSize: 13,
    fontWeight: fontWeights.bold,
  },
  sharePosterBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  sharePosterBtnText: {
    color: '#000000',
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
});
