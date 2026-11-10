import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Vibration, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { useLibrary } from '../src/context';
import { setSecureServerToken } from '../src/services/auth/secureTokenStorage';
import { colors, fontSizes, fontWeights, spacing, radius } from '../src/theme';
import { CheckIcon } from '../src/components/icons/SvgIcons';

const CONFIG_FILE = `${FileSystem.documentDirectory || ''}beatify_server_config.json`;

export default function ConnectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ api?: string; token?: string }>();
  const { setServerUrl, setServerToken, syncLibrary } = useLibrary();

  const [status, setStatus] = useState<'connecting' | 'success' | 'warning' | 'error'>('connecting');
  const [message, setMessage] = useState<string>('Đang xử lý cấu hình kết nối...');

  useEffect(() => {
    async function processConnect() {
      try {
        const rawApi = params.api ? decodeURIComponent(params.api).trim().replace(/\/+$/, '') : '';
        const rawToken = params.token ? decodeURIComponent(params.token).trim() : '';

        if (!rawApi) {
          setStatus('error');
          setMessage('Không tìm thấy địa chỉ máy chủ (API URL) trong mã QR.');
          return;
        }

        // Cập nhật state trong context
        setServerUrl(rawApi);
        setServerToken(rawToken);

        // Lưu vào SecureStore Keychain và File cấu hình
        await Promise.all([
          setSecureServerToken(rawToken).catch(() => {}),
          FileSystem.writeAsStringAsync(
            CONFIG_FILE,
            JSON.stringify({ serverUrl: rawApi })
          ).catch(() => {}),
        ]);

        Vibration.vibrate([0, 80, 50, 80]);

        // Cảnh báo nếu URL là 127.0.0.1 hoặc localhost
        if (rawApi.includes('127.0.0.1') || rawApi.includes('localhost')) {
          setStatus('warning');
          setMessage(
            `Đã nhận máy chủ: ${rawApi}\n\n⚠️ Lưu ý: "127.0.0.1" là địa chỉ cục bộ của máy tính. iPhone không thể kết nối tới PC qua 127.0.0.1. Vui lòng đổi sang địa chỉ IP mạng LAN của máy tính hoặc địa chỉ Cloudflare Worker.`
          );
        } else {
          setStatus('success');
          setMessage(`Đã kết nối thành công tới máy chủ:\n${rawApi}\n\nĐang tự động đồng bộ thư viện nhạc...`);
          syncLibrary({ silent: false, force: true }).catch(() => {});
        }

        // Tự động chuyển về thư viện sau 2 giây
        setTimeout(() => {
          router.replace('/(tabs)/library');
        }, 2000);
      } catch (err) {
        setStatus('error');
        setMessage(`Lỗi kết nối: ${String(err)}`);
      }
    }

    processConnect();
  }, [params.api, params.token, router, setServerToken, setServerUrl, syncLibrary]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {status === 'connecting' ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.iconBox} />
        ) : status === 'success' ? (
          <View style={[styles.iconCircle, { backgroundColor: colors.primaryMuted, borderColor: colors.primary }]}>
            <CheckIcon size={32} color={colors.primary} />
          </View>
        ) : (
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(234, 179, 8, 0.15)', borderColor: colors.warning }]}>
            <Text style={{ fontSize: 28 }}>⚠️</Text>
          </View>
        )}

        <Text style={styles.title}>
          {status === 'connecting'
            ? 'Đang kết nối...'
            : status === 'success'
            ? 'Kết nối thành công!'
            : status === 'warning'
            ? 'Cần kiểm tra địa chỉ IP'
            : 'Lỗi kết nối'}
        </Text>

        <Text style={styles.desc}>{message}</Text>

        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => router.replace('/(tabs)/library')}
          activeOpacity={0.7}
        >
          <Text style={styles.doneBtnText}>Về Thư viện</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceHighlight,
  },
  iconBox: {
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  desc: {
    fontSize: fontSizes.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  doneBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  doneBtnText: {
    color: colors.textDark,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
});
