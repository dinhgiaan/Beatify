import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TransitionLogEntry } from '@music-app/shared';
import { tokens } from '../../src/theme/tokens';
import {
  loadTransitionLogs,
  clearTransitionLogs,
} from '../../src/services/player/transitionPreferences';
import {
  formatTransitionReason,
  formatAppState,
  formatCamelotRelation,
} from '../../src/constants/labels';
import { cleanTrackTitle } from '../../src/utils/recentFormatters';
import { ListGroup, SectionHeader } from '../../src/components/common';
import { DiscIcon } from '../../src/components/icons/SvgIcons';
import { triggerSelectionHaptic } from '../../src/utils/haptics';

function formatLogTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

interface LogItemProps {
  entry: TransitionLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}

function TransitionLogItem({ entry, isExpanded, onToggle }: LogItemProps) {
  const fromTitle = cleanTrackTitle(entry.fromTrackTitle);
  const toTitle = cleanTrackTitle(entry.toTrackTitle);
  const timeStr = formatLogTime(entry.timestamp);
  const camelotInfo = formatCamelotRelation(entry.camelotRelation);

  const hasBpm = entry.fromBpm !== undefined || entry.toBpm !== undefined;
  const hasKey = Boolean(entry.fromKey) || Boolean(entry.toKey);

  const chevronAnim = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(isExpanded ? '90deg' : '0deg', { duration: 180 }) }],
  }));

  return (
    <View style={styles.logItemContainer}>
      <TouchableOpacity
        style={styles.singleRow}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={styles.singleRowMain}>
          <Text style={styles.singleRowTitle} numberOfLines={1}>
            {fromTitle} <Text style={styles.arrowText}>→</Text> {toTitle}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.badgeFade}>
              <Text style={styles.badgeFadeText}>{entry.actualFadeDurationSec}s</Text>
            </View>
            <Text style={styles.metaTime}>{timeStr}</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaReason} numberOfLines={1}>
              {formatTransitionReason(entry.reason)}
            </Text>
          </View>
        </View>

        <Animated.View style={chevronAnim}>
          <Text style={styles.chevron}>›</Text>
        </Animated.View>
      </TouchableOpacity>

      {isExpanded && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={styles.detailBox}
        >
          <View style={styles.detailGrid}>
            <View style={styles.detailCol}>
              <Text style={styles.detailLabel}>LOẠI HÒA ÂM</Text>
              <Text style={styles.detailVal}>{formatTransitionReason(entry.reason)}</Text>
            </View>
            <View style={styles.detailCol}>
              <Text style={styles.detailLabel}>TRẠNG THÁI APP</Text>
              <Text style={styles.detailVal}>
                {formatAppState(entry.appState)}
                {entry.isSafeMode ? ' · Safe' : ''}
              </Text>
            </View>
          </View>

          {hasBpm && (
            <View style={styles.detailGrid}>
              <View style={styles.detailCol}>
                <Text style={styles.detailLabel}>BPM NHỊP ĐIỆU</Text>
                <Text style={styles.detailVal}>
                  {entry.fromBpm ?? '--'} → {entry.toBpm ?? '--'}
                  {entry.bpmDeltaPercent !== undefined ? ` (Δ${entry.bpmDeltaPercent}%)` : ''}
                </Text>
              </View>
            </View>
          )}

          {hasKey && (
            <View style={styles.detailGrid}>
              <View style={styles.detailCol}>
                <Text style={styles.detailLabel}>CAMELOT KEY</Text>
                <Text style={styles.detailVal}>
                  {entry.fromKey ?? '--'} → {entry.toKey ?? '--'}
                  {camelotInfo ? ` · ${camelotInfo.label}` : ''}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.detailGrid}>
            <View style={styles.detailCol}>
              <Text style={styles.detailLabel}>THỜI LƯỢNG FADE</Text>
              <Text style={styles.detailVal}>
                {entry.actualFadeDurationSec}s (Cài đặt {entry.configuredDurationSec}s)
              </Text>
            </View>
            <View style={styles.detailCol}>
              <Text style={styles.detailLabel}>ÂM LƯỢNG KẾT THÚC</Text>
              <Text style={styles.detailVal}>{Math.round(entry.finalVolume * 100)}%</Text>
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

export default function TransitionLogsScreen() {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<TransitionLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const refreshLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await loadTransitionLogs();
      setLogs(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshLogs();
  }, [refreshLogs]);

  const handleClear = () => {
    triggerSelectionHaptic();
    Alert.alert(
      'Xóa toàn bộ nhật ký chuyển bài?',
      'Dữ liệu chẩn đoán chuyển bài thực tế trên thiết bị sẽ được xóa sạch. Hành động này không thể hoàn tác.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa nhật ký',
          style: 'destructive',
          onPress: async () => {
            await clearTransitionLogs();
            setLogs([]);
            setExpandedLogId(null);
          },
        },
      ]
    );
  };

  const toggleExpand = (id: string) => {
    triggerSelectionHaptic();
    setExpandedLogId((prev) => (prev === id ? null : id));
  };

  const groupedLogs = useMemo(() => {
    const groups: { dateLabel: string; items: TransitionLogEntry[] }[] = [];
    const dateMap = new Map<string, TransitionLogEntry[]>();

    const todayStr = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    for (const entry of logs) {
      const d = new Date(entry.timestamp);
      const ds = d.toDateString();
      const label =
        ds === todayStr
          ? 'Hôm nay'
          : ds === yesterday
            ? 'Hôm qua'
            : d.toLocaleDateString('vi-VN', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            });

      let arr = dateMap.get(label);
      if (!arr) {
        arr = [];
        dateMap.set(label, arr);
        groups.push({ dateLabel: label, items: arr });
      }
      arr.push(entry);
    }

    return groups;
  }, [logs]);

  if (isLoading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator color={tokens.colors.accent} size="small" />
      </View>
    );
  }

  if (logs.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconBox}>
          <DiscIcon size={32} color={tokens.colors.textDim} />
        </View>
        <Text style={styles.emptyTitle}>Chưa có bản ghi nào</Text>
        <Text style={styles.emptyDesc}>
          Bật Chuyển bài thông minh và nghe bài hát để hệ thống tự động ghi lại quá trình hòa âm trên máy.
        </Text>
      </View>
    );
  }

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
      {groupedLogs.map((group) => (
        <View key={group.dateLabel} style={styles.dateGroup}>
          <SectionHeader title={group.dateLabel} />
          <ListGroup>
            {group.items.map((entry) => (
              <TransitionLogItem
                key={entry.id}
                entry={entry}
                isExpanded={expandedLogId === entry.id}
                onToggle={() => toggleExpand(entry.id)}
              />
            ))}
          </ListGroup>
        </View>
      ))}

      <View style={styles.footerActionBox}>
        <TouchableOpacity
          style={styles.clearLogsButton}
          onPress={handleClear}
          activeOpacity={0.7}
        >
          <Text style={styles.clearLogsText}>Xóa toàn bộ nhật ký</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bgBase,
  },
  scrollInner: {
    paddingTop: tokens.spacing.xs,
  },
  dateGroup: {
    marginBottom: tokens.spacing.xs,
  },
  logItemContainer: {
    overflow: 'hidden',
  },
  singleRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.spacing.sm + 2,
    paddingHorizontal: tokens.spacing.lg,
  },
  singleRowMain: {
    flex: 1,
    paddingRight: tokens.spacing.sm,
  },
  singleRowTitle: {
    ...tokens.typography.body,
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colors.textPrimary,
  },
    arrowText: {
      color: tokens.colors.accent,
      fontWeight: '700',
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      gap: 6,
    },
    badgeFade: {
      backgroundColor: tokens.colors.bgElevated,
      paddingHorizontal: 6,
      paddingVertical: 1.5,
      borderRadius: 4,
      borderWidth: tokens.hairlineWidth,
      borderColor: tokens.colors.separator,
    },
    badgeFadeText: {
      ...tokens.typography.caption,
      fontSize: 11,
      fontWeight: '700',
      color: tokens.colors.accent,
    },
    metaTime: {
      ...tokens.typography.footnote,
      fontSize: 13,
      color: tokens.colors.textSecondary,
    },
    metaDot: {
      color: tokens.colors.textDim,
      fontSize: 12,
    },
    metaReason: {
      ...tokens.typography.footnote,
      fontSize: 13,
      color: tokens.colors.textMuted,
      flexShrink: 1,
    },
    chevron: {
      fontSize: 20,
      fontWeight: '600',
      color: tokens.colors.textDim,
    },
    detailBox: {
      backgroundColor: tokens.colors.bgElevated,
      paddingHorizontal: tokens.spacing.lg,
      paddingVertical: tokens.spacing.md,
      borderTopWidth: tokens.hairlineWidth,
      borderTopColor: tokens.colors.separator,
    },
    detailGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginVertical: 4,
    },
    detailCol: {
      flex: 1,
    },
    detailLabel: {
      ...tokens.typography.caption,
      fontSize: 10,
      fontWeight: '600',
      color: tokens.colors.textMuted,
      letterSpacing: 0.5,
    },
    detailVal: {
      ...tokens.typography.footnote,
      color: tokens.colors.textPrimary,
      fontWeight: '500',
      marginTop: 2,
    },
    footerActionBox: {
      marginTop: tokens.spacing.xl,
      paddingHorizontal: tokens.spacing.lg,
      alignItems: 'center',
    },
    clearLogsButton: {
      minHeight: 44,
      paddingHorizontal: tokens.spacing.xl,
      borderRadius: tokens.radius.pill,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: tokens.hairlineWidth,
      borderColor: tokens.colors.dangerBorder,
    },
    clearLogsText: {
      ...tokens.typography.footnote,
      color: tokens.colors.danger,
      fontWeight: '600',
    },
    centerBox: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: tokens.spacing.xxl,
    },
    emptyIconBox: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: tokens.colors.bgSurface,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: tokens.spacing.md,
    },
    emptyTitle: {
      ...tokens.typography.headline,
      color: tokens.colors.textPrimary,
      textAlign: 'center',
      marginBottom: 6,
    },
    emptyDesc: {
      ...tokens.typography.footnote,
      color: tokens.colors.textMuted,
      textAlign: 'center',
      lineHeight: 18,
    },
  });
