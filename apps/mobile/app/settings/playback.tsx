import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../../src/theme/tokens';
import { usePlayer } from '../../src/context';
import { ListGroup, SectionHeader, SettingRow } from '../../src/components/common';
import { triggerSelectionHaptic } from '../../src/utils/haptics';
import {
  loadRespectSystemReduceMotion,
  saveRespectSystemReduceMotion,
} from '../../src/services/player/motionPreferences';

const DURATIONS = [2, 3, 4, 5, 6, 8] as const;

export default function PlaybackSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    isVinylMode,
    toggleVinylMode,
    transitionSettings,
    updateTransitionSettings,
  } = usePlayer();

  const [respectSystemMotion, setRespectSystemMotion] = useState(false);

  useEffect(() => {
    loadRespectSystemReduceMotion().then(setRespectSystemMotion).catch(() => {});
  }, []);

  const activeIdx = DURATIONS.indexOf(transitionSettings.durationSec as (typeof DURATIONS)[number]);
  const activeIndexShared = useSharedValue(activeIdx >= 0 ? activeIdx : 2);
  const screenWidth = Dimensions.get('window').width;
  const containerWidthShared = useSharedValue(Math.max(screenWidth - 64, 260));

  useEffect(() => {
    const idx = DURATIONS.indexOf(transitionSettings.durationSec as (typeof DURATIONS)[number]);
    if (idx >= 0) {
      activeIndexShared.value = withSpring(idx, {
        damping: 20,
        stiffness: 150,
        mass: 0.7,
      });
    }
  }, [transitionSettings.durationSec, activeIndexShared]);

  const pillAnimStyle = useAnimatedStyle(() => {
    const totalItems = DURATIONS.length;
    // Padding 4px mỗi bên (tổng 8px) của pillTrack
    const availableWidth = Math.max(0, containerWidthShared.value - 8);
    const itemWidth = totalItems > 0 ? availableWidth / totalItems : 0;
    return {
      width: itemWidth > 0 ? itemWidth : 0,
      transform: [
        {
          translateX: activeIndexShared.value * itemWidth,
        },
      ],
      opacity: containerWidthShared.value > 0 && transitionSettings.enabled ? 1 : 0,
    };
  });

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
      <Animated.View entering={FadeIn.duration(180)} style={{ flex: 1 }}>
        {/* ĐĨA THAN VINYL */}
        <View style={styles.sectionBlock}>
          <SectionHeader title="ĐĨA THAN VINYL" variant="list" />
          <ListGroup>
            <SettingRow
              label="Chế độ đĩa than 360°"
              description="Cần kim tonearm và hiệu ứng xoay 33⅓ RPM trên màn hình đang phát (Now Playing)"
              isSwitch
              switchValue={isVinylMode}
              onSwitchChange={toggleVinylMode}
            />
          </ListGroup>
        </View>

        {/* CHUYỂN BÀI THÔNG MINH */}
        <View style={[styles.sectionBlock, styles.sectionSpaced]}>
          <SectionHeader
            title="CHUYỂN BÀI THÔNG MINH"
            subtitle="Hòa âm fade âm lượng mượt mà giữa hai bài hát liên tiếp"
            variant="list"
          />
          <ListGroup>
            <SettingRow
              label="Kích hoạt chuyển bài"
              description="Tự động fade âm lượng giữa bài cũ và bài mới"
              isSwitch
              switchValue={transitionSettings.enabled}
              onSwitchChange={(val) => updateTransitionSettings({ enabled: val })}
            />

            {/* Chip thời gian: mờ khi Switch tắt kèm hiệu ứng sliding pill */}
            <View
              style={[
                styles.durationContainer,
                !transitionSettings.enabled && styles.durationDisabled,
              ]}
            >
              <View style={styles.durationHeader}>
                <Text style={styles.durationLabel}>Thời gian chuyển bài</Text>
                <Text style={styles.durationSubLabel}>
                  Hòa âm mượt mà giữa hai bài hát liên tiếp
                </Text>
              </View>

              <View
                style={styles.pillTrack}
                onLayout={(e) => {
                  const w = e.nativeEvent.layout.width;
                  if (w > 0) {
                    containerWidthShared.value = w;
                  }
                }}
              >
                {/* Nền active di chuyển mượt mà (Sliding Active Pill) */}
                <Animated.View style={[styles.slidingActivePill, pillAnimStyle]} pointerEvents="none" />

                {DURATIONS.map((dur) => {
                  const isSelected = transitionSettings.durationSec === dur;
                  return (
                    <TouchableOpacity
                      key={dur}
                      disabled={!transitionSettings.enabled}
                      style={styles.pillBtn}
                      onPress={() => {
                        triggerSelectionHaptic();
                        const idx = DURATIONS.indexOf(dur);
                        if (idx >= 0) {
                          activeIndexShared.value = withSpring(idx, {
                            damping: 20,
                            stiffness: 150,
                            mass: 0.7,
                          });
                        }
                        updateTransitionSettings({ durationSec: dur });
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.pillBtnText,
                          isSelected && transitionSettings.enabled && styles.pillBtnTextActive,
                        ]}
                      >
                        {dur}s
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <SettingRow
              label="Chế độ an toàn (Safe Mode)"
              description="Giữ ổn định khi nghe nhạc trên màn hình khóa"
              isSwitch
              disabled={!transitionSettings.enabled}
              switchValue={transitionSettings.safeMode}
              onSwitchChange={(val) => updateTransitionSettings({ safeMode: val })}
            />

            <SettingRow
              label="Xem nhật ký chuyển bài"
              description="Chẩn đoán chi tiết các lần hòa âm thực tế trên máy"
              showChevron
              onPress={() => {
                triggerSelectionHaptic();
                router.push('/settings/transition-logs');
              }}
            />
          </ListGroup>
        </View>

        {/* HIỆU ỨNG & CHUYỂN ĐỘNG */}
        <View style={[styles.sectionBlock, styles.sectionSpaced]}>
          <SectionHeader title="HIỆU ỨNG & CHUYỂN ĐỘNG" variant="list" />
          <ListGroup>
            <SettingRow
              label="Tôn trọng Giảm chuyển động của hệ thống"
              description="Tự động tắt hiệu ứng trượt và nảy nếu iOS bật Reduce Motion (Mặc định: TẮT)"
              isSwitch
              switchValue={respectSystemMotion}
              onSwitchChange={(val) => {
                triggerSelectionHaptic();
                setRespectSystemMotion(val);
                saveRespectSystemReduceMotion(val).catch(() => {});
              }}
            />
          </ListGroup>
        </View>
      </Animated.View>
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
  sectionBlock: {},
  sectionSpaced: {
    marginTop: 26,
  },
  durationContainer: {
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
  },
  durationDisabled: {
    opacity: 0.35,
  },
  durationHeader: {
    marginBottom: tokens.spacing.sm,
  },
  durationLabel: {
    ...tokens.typography.body,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.colors.textPrimary,
  },
  durationSubLabel: {
    ...tokens.typography.footnote,
    color: tokens.colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  pillTrack: {
    position: 'relative',
    flexDirection: 'row',
    backgroundColor: tokens.colors.bgElevated,
    borderRadius: tokens.radius.pill,
    padding: 4,
    marginTop: 10,
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
  pillBtn: {
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: tokens.radius.pill,
    zIndex: 1,
  },
  pillBtnText: {
    ...tokens.typography.footnote,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
  },
  pillBtnTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
});

