import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TransitionLogEntry } from '@music-app/shared';
import {
  loadTransitionLogs,
  clearTransitionLogs,
} from '../services/player/transitionPreferences';
import { colors } from '../theme/colors';

interface TransitionLogModalProps {
  visible: boolean;
  onClose: () => void;
}

export function TransitionLogModal({ visible, onClose }: TransitionLogModalProps) {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<TransitionLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
    }
  }, [visible, refreshLogs]);

  const handleClear = async () => {
    await clearTransitionLogs();
    setLogs([]);
  };

  const getRelationBadge = (relation: string) => {
    switch (relation) {
      case 'same':
        return { label: 'CÙNG TÔNG', bg: '#064E3B', text: '#34D399' };
      case 'adjacent':
        return { label: 'BẬC 5 (±1H)', bg: '#164E63', text: '#38BDF8' };
      case 'relative':
        return { label: 'ĐỔI HỆ (A/B)', bg: '#3B0764', text: '#C084FC' };
      case 'energy_boost':
        return { label: 'ENERGY BOOST (+2H)', bg: '#78350F', text: '#FBBF24' };
      case 'incompatible':
        return { label: 'KHÔNG TƯƠNG THÍCH', bg: '#374151', text: '#9CA3AF' };
      default:
        return { label: 'CHƯA RÕ', bg: '#1F2937', text: '#9CA3AF' };
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
          {/* HEADER */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>NHẬT KÝ SMART TRANSITION</Text>
              <Text style={styles.subtitle}>Chẩn đoán chuyển bài thực tế ({logs.length} bản ghi)</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* ACTIONS */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={refreshLogs} activeOpacity={0.7}>
              <Text style={styles.actionBtnText}>Làm mới</Text>
            </TouchableOpacity>
            {logs.length > 0 && (
              <TouchableOpacity style={[styles.actionBtn, styles.clearBtn]} onPress={handleClear} activeOpacity={0.7}>
                <Text style={[styles.actionBtnText, styles.clearBtnText]}>Xóa nhật ký</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* BODY */}
          {isLoading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : logs.length === 0 ? (
            <View style={styles.centerBox}>
              <Text style={styles.emptyIcon}>🎛️</Text>
              <Text style={styles.emptyTitle}>Chưa có bản ghi nào</Text>
              <Text style={styles.emptyDesc}>
                Hãy bật Smart Transition và nghe hết bài để hệ thống tự động ghi lại quá trình chuyển bài thực tế trên máy.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {logs.map((entry) => {
                const badge = getRelationBadge(entry.camelotRelation);
                const formattedTime = new Date(entry.timestamp).toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });

                return (
                  <View key={entry.id} style={styles.card}>
                    {/* HÀNG TRÊN: THỜI GIAN & BADGE */}
                    <View style={styles.cardHeader}>
                      <Text style={styles.timeText}>{formattedTime}</Text>
                      <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                      </View>
                    </View>

                    {/* TÊN BÀI HÁT A -> B */}
                    <Text style={styles.trackFrom} numberOfLines={1}>
                      {entry.fromTrackTitle}
                    </Text>
                    <View style={styles.arrowRow}>
                      <Text style={styles.arrowIcon}>↓ chuyển sang</Text>
                    </View>
                    <Text style={styles.trackTo} numberOfLines={1}>
                      {entry.toTrackTitle}
                    </Text>

                    {/* BẢNG CHỈ SỐ KỸ THUẬT */}
                    <View style={styles.metaGrid}>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>BPM</Text>
                        <Text style={styles.metaValue}>
                          {entry.fromBpm ?? '--'} ➔ {entry.toBpm ?? '--'}
                          {entry.bpmDeltaPercent !== undefined ? ` (Δ${entry.bpmDeltaPercent}%)` : ''}
                        </Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>CAMELOT KEY</Text>
                        <Text style={styles.metaValue}>
                          {entry.fromKey ?? '--'} ➔ {entry.toKey ?? '--'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.metaGrid}>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>FADE</Text>
                        <Text style={styles.metaValue}>
                          {entry.actualFadeDurationSec}s (Cài {entry.configuredDurationSec}s)
                        </Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>APP STATE / SAFE</Text>
                        <Text style={styles.metaValue}>
                          {entry.appState.toUpperCase()} | {entry.isSafeMode ? 'SAFE' : 'FADE'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.footerRow}>
                      <Text style={styles.reasonText}>Lý do: {entry.reason}</Text>
                      <Text style={styles.volText}>Vol về: {(entry.finalVolume * 100).toFixed(0)}%</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionBtn: {
    backgroundColor: '#1F2937',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  clearBtn: {
    backgroundColor: '#371A1A',
  },
  clearBtnText: {
    color: '#EF4444',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262626',
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeText: {
    fontSize: 12,
    color: '#6B7280',
    fontVariant: ['tabular-nums'],
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  trackFrom: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F3F4F6',
  },
  arrowRow: {
    paddingVertical: 2,
  },
  arrowIcon: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600',
  },
  trackTo: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 10,
  },
  metaGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6,
  },
  metaItem: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    padding: 8,
    borderRadius: 6,
  },
  metaLabel: {
    fontSize: 9,
    color: '#6B7280',
    fontWeight: '700',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 12,
    color: '#E5E7EB',
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#262626',
    paddingTop: 8,
  },
  reasonText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  volText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
});

