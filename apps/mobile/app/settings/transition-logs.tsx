import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TransitionLogEntry } from '@music-app/shared';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
            {group.items.map((entry) => {
              const isExpanded = expandedLogId === entry.id;
              const fromTitle = cleanTrackTitle(entry.fromTrackTitle);
              const toTitle = cleanTrackTitle(entry.toTrackTitle);
              const timeStr = formatLogTime(entry.timestamp);
              const camelotInfo = formatCamelotRelation(entry.camelotRelation);

              const hasBpm = entry.fromBpm !== undefined || entry.toBpm !== undefined;
              const hasKey = Boolean(entry.fromKey) || Boolean(entry.toKey);

              return (
                <View key={entry.id} style={styles.logItemContainer}>
                  <TouchableOpacity
                    style={styles.singleRow}
                    onPress={() => toggleExpand(entry.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.singleRowMain}>
                      <Text style={styles.singleRowTitle} numberOfLines={1}>
                        {fromTitle} → {toTitle}
                      </Text>
                      <Text style={styles.singleRowMeta}>
                        {entry.actualFadeDurationSec}s · {timeStr} · {formatTransitionReason(entry.reason)}
                      </Text>
                    </View>
                    <Text style={[styles.chevron, isExpanded && styles.chevronExpanded]}>›</Text>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.detailBox}>
                      <View style={styles.detailGrid}>
                        <View style={styles.detailCol}>
                          <Text style={styles.detailLabel}>Loại hòa âm</Text>
                          <Text style={styles.detailVal}>{formatTransitionReason(entry.reason)}</Text>
                        </View>
                        <View style={styles.detailCol}>
                          <Text style={styles.detailLabel}>Trạng thái app</Text>
                          <Text style={styles.detailVal}>
                            {formatAppState(entry.appState)}
                            {entry.isSafeMode ? ' · Safe Mode' : ''}
                          </Text>
                        </View>
                      </View>

                      {hasBpm && (
                        <View style={styles.detailGrid}>
                          <View style={styles.detailCol}>
                            <Text style={styles.detailLabel}>BPM nhịp điệu</Text>
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
                            <Text style={styles.detailLabel}>Camelot Key</Text>
                            <Text style={styles.detailVal}>
                              {entry.fromKey ?? '--'} → {entry.toKey ?? '--'} ({camelotInfo.label})
                            </Text>
                          </View>
                        </View>
                      )}

                      <View style={styles.detailGrid}>
                        <View style={styles.detailCol}>
                          <Text style={styles.detailLabel}>Thời lượng thực tế</Text>
                          <Text style={styles.detailVal}>
                            {entry.actualFadeDurationSec}s (Cài đặt {entry.configuredDurationSec}s)
                          </Text>
                        </View>
                        <View style={styles.detailCol}>
                          <Text style={styles.detailLabel}>Âm lượng kết thúc</Text>
                          <Text style={styles.detailVal}>{Math.round(entry.finalVolume * 100)}%</Text>
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
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
    minHeight: 52,
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
  singleRowMeta: {
    ...tokens.typography.footnote,
    color: tokens.colors.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: 18,
    fontWeight: '600',
    color: tokens.colors.textDim,
  },
  chevronExpanded: {
    transform: [{ rotate: '90deg' }],
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
    color: tokens.colors.textMuted,
  },
  detailVal: {
    ...tokens.typography.footnote,
    color: tokens.colors.textPrimary,
    fontWeight: '500',
    marginTop: 1,
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

