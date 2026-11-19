import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TransitionLogEntry } from '@music-app/shared';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import {
  loadTransitionLogs,
  clearTransitionLogs,
} from '../services/player/transitionPreferences';
import { tokens } from '../theme/tokens';
import { CloseIcon, DiscIcon } from './icons/SvgIcons';
import {
  formatTransitionReason,
  formatAppState,
  formatCamelotRelation,
} from '../constants/labels';
import { cleanTrackTitle } from '../utils/recentFormatters';
import { ListGroup, SectionHeader } from './common';
import { triggerSelectionHaptic } from '../utils/haptics';

interface TransitionLogModalProps {
  visible: boolean;
  onClose: () => void;
}

function formatLogTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function TransitionLogModal({ visible, onClose }: TransitionLogModalProps) {
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
    if (visible) {
      refreshLogs();
      setExpandedLogId(null);
    }
  }, [visible, refreshLogs]);

  // Alert xác nhận khi xóa nhật ký (Lỗi 8)
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

  // Nhóm nhật ký theo ngày (Lỗi 4: Hôm nay, Hôm qua, Ngày...)
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Drag indicator chuẩn Apple (Lỗi 2) */}
        <View style={styles.grabberBox}>
          <View style={styles.grabber} />
        </View>

        {/* Header Modal */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Nhật ký chuyển bài</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Đóng nhật ký"
          >
            <CloseIcon size={18} color={tokens.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Body Scroll */}
        {isLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={tokens.colors.accent} size="small" />
          </View>
        ) : logs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBox}>
              <DiscIcon size={32} color={tokens.colors.textDim} />
            </View>
            <Text style={styles.emptyTitle}>Chưa có bản ghi nào</Text>
            <Text style={styles.emptyDesc}>
              Bật Chuyển bài thông minh và nghe bài hát để hệ thống tự động ghi lại quá trình hòa âm trên máy.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={[
              styles.scrollInner,
              { paddingBottom: Math.max(insets.bottom, tokens.spacing.xl) + tokens.spacing.xl },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {groupedLogs.map((group) => (
              <View key={group.dateLabel} style={styles.dateGroup}>
                <SectionHeader title={group.dateLabel} variant="list" />
                <ListGroup>
                  {group.items.map((entry) => {
                    const isExpanded = expandedLogId === entry.id;
                    const fromTitle = cleanTrackTitle(entry.fromTrackTitle);
                    const toTitle = cleanTrackTitle(entry.toTrackTitle);
                    const timeStr = formatLogTime(entry.timestamp);
                    const camelotInfo = formatCamelotRelation(entry.camelotRelation);

                    // Kiểm tra có dữ liệu BPM hoặc Key không (Lỗi 4: ẩn khi null)
                    const hasBpm =
                      entry.fromBpm !== undefined || entry.toBpm !== undefined;
                    const hasKey =
                      Boolean(entry.fromKey) || Boolean(entry.toKey);

                    return (
                      <View key={entry.id} style={styles.logItemContainer}>
                        {/* HÀNG RÚT GỌN 1 DÒNG (Lỗi 4) */}
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
                          <Text style={[styles.chevron, isExpanded && styles.chevronExpanded]}>
                            ›
                          </Text>
                        </TouchableOpacity>

                        {/* PHẦN CHI TIẾT KHI BẤM MỞ RỘNG */}
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

                            {/* CHỈ HIỆN BPM NẾU CÓ DỮ LIỆU THỰC TẾ (Lỗi 4: không render -- -> --) */}
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

                            {/* CHỈ HIỆN KHÓA ĐIỆU KEY NẾU CÓ DỮ LIỆU */}
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
                                <Text style={styles.detailVal}>
                                  {Math.round(entry.finalVolume * 100)}%
                                </Text>
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

            {/* NÚT XÓA NHẬT KÝ KIỂU DANGER PHỤ CÓ ALERT XÁC NHẬN (Lỗi 8) */}
            < View style={styles.footerActionBox} >
              <TouchableOpacity
                style={styles.clearLogsButton}
                onPress={handleClear}
                activeOpacity={0.7}
              >
                <Text style={styles.clearLogsText}>Xóa toàn bộ nhật ký</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bgBase,
  },
  grabberBox: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: tokens.colors.grabber,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: tokens.hairlineWidth,
    borderBottomColor: tokens.colors.separator,
  },
  headerTitle: {
    ...tokens.typography.headline,
    fontSize: 18,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: tokens.colors.bgSurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flex: 1,
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
    transform: [{ rotate: '0deg' }],
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
    backgroundColor: 'transparent',
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
