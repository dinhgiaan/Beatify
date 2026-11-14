import React, { useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../../src/theme/tokens';
import { useOffline, usePlayer } from '../../src/context';
import { formatBytes } from '../../src/services/offline/offlineStorage';
import { ListGroup, SectionHeader, SettingRow } from '../../src/components/common';
import { triggerSelectionHaptic } from '../../src/utils/haptics';

const LIMIT_OPTIONS = [10, 20, 30, 40, 50] as const;

export default function StorageSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { offlineTracks, totalSizeBytes, clearAllOffline } = useOffline();
  const { recentLimit, setRecentLimit, clearRecentTracks } = usePlayer();

  const currentLimitIdx = LIMIT_OPTIONS.indexOf(recentLimit as (typeof LIMIT_OPTIONS)[number]);
  const activeIndexShared = useSharedValue(currentLimitIdx >= 0 ? currentLimitIdx : 0);
  const screenWidth = Dimensions.get('window').width;
  const containerWidthShared = useSharedValue(Math.max(screenWidth - 64, 260));

  useEffect(() => {
    const idx = LIMIT_OPTIONS.indexOf(recentLimit as (typeof LIMIT_OPTIONS)[number]);
    if (idx >= 0) {
      activeIndexShared.value = withSpring(idx, {
        damping: 20,
        stiffness: 150,
        mass: 0.7,
      });
    }
  }, [recentLimit, activeIndexShared]);

  const pillAnimStyle = useAnimatedStyle(() => {
    const totalItems = LIMIT_OPTIONS.length;
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
      opacity: containerWidthShared.value > 0 ? 1 : 0,
    };
  });

  const handleClearAllOffline = () => {
    triggerSelectionHaptic();
    Alert.alert(
      'Xóa toàn bộ nhạc ngoại tuyến?',
      `Hành động này sẽ giải phóng toàn bộ ${formatBytes(totalSizeBytes)} bộ nhớ trên iPhone.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa tất cả',
          style: 'destructive',
          onPress: async () => {
            await clearAllOffline();
          },
        },
      ]
    );
  };

  const handleClearRecent = () => {
    triggerSelectionHaptic();
    Alert.alert(
      'Xóa lịch sử nghe gần đây?',
      'Toàn bộ danh sách bài hát vừa nghe sẽ được làm trống. Dữ liệu này không thể khôi phục.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa ngay',
          style: 'destructive',
          onPress: () => clearRecentTracks(),
        },
      ]
    );
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
      {/* NHẠC NGOẠI TUYẾN (OFFLINE) */}
      <SectionHeader title="NHẠC NGOẠI TUYẾN (OFFLINE)" />
      <ListGroup>
        <SettingRow
          label="Dung lượng đã chiếm"
          value={formatBytes(totalSizeBytes)}
        />
        <SettingRow
          label="Bài hát đã lưu"
          value={`${offlineTracks.length} bài`}
        />
        {offlineTracks.length > 0 && (
          <SettingRow
            label="Xóa tất cả nhạc ngoại tuyến"
            description={`Giải phóng ${formatBytes(totalSizeBytes)} bộ nhớ máy`}
            isDanger
            onPress={handleClearAllOffline}
          />
        )}
      </ListGroup>

      {/* LỊCH SỬ NGHE GẦN ĐÂY */}
      <SectionHeader
        title="LỊCH SỬ NGHE GẦN ĐÂY"
        subtitle="Tự động ghi nhận bài hát sau khi nghe tối thiểu 5 giây"
      />
      <ListGroup>
        <View style={styles.limitBox}>
          <Text style={styles.limitLabel}>Số bài lưu tối đa</Text>
              <View
                style={styles.pillTrack}
                onLayout={(e) => {
                  const w = e.nativeEvent.layout.width;
                  if (w > 0) {
                    containerWidthShared.value = w;
                  }
                }}
              >
                {/* Nền active di chuyển dạng trượt (Sliding Active Pill) */}
                <Animated.View style={[styles.slidingActivePill, pillAnimStyle]} pointerEvents="none" />

                {LIMIT_OPTIONS.map((limitOption) => {
                  const isActive = recentLimit === limitOption;
                  return (
                    <TouchableOpacity
                      key={limitOption}
                      style={styles.pillBtn}
                      onPress={() => {
                        triggerSelectionHaptic();
                        const idx = LIMIT_OPTIONS.indexOf(limitOption);
                        if (idx >= 0) {
                          activeIndexShared.value = withSpring(idx, {
                            damping: 20,
                            stiffness: 150,
                            mass: 0.7,
                          });
                        }
                        setRecentLimit(limitOption);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.pillBtnText, isActive && styles.pillBtnTextActive]}>
                        {limitOption}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
        </View>

          <SettingRow
            label="Xóa toàn bộ lịch sử nghe"
            description="Làm trống danh sách bài hát vừa nghe"
            isDanger
            onPress={handleClearRecent}
          />
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
  limitBox: {
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
  },
  limitLabel: {
    ...tokens.typography.body,
    fontSize: 15,
    color: tokens.colors.textPrimary,
    marginBottom: tokens.spacing.xs,
  },
    pillTrack: {
      position: 'relative',
      flexDirection: 'row',
      backgroundColor: tokens.colors.bgElevated,
      borderRadius: tokens.radius.pill,
      padding: 4,
      marginTop: tokens.spacing.xs,
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

