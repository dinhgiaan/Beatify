import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  TextInput,
  Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  colors,
  spacing,
  radius,
  fontSizes,
  fontWeights,
  lineHeights,
  layout,
  useResponsive,
} from '../src/theme';
import {
  type Track,
} from '@music-app/shared';
import { useLibrary, usePlayer } from '../src/context';
import { formatTime } from '../src/utils/formatTime';
import { EditTrackModal } from '../src/components/EditTrackModal';
import { ProfileModal } from '../src/components/ProfileModal';
import { LyricsModal } from '../src/components/LyricsModal';
import { PlaylistModal } from '../src/components/PlaylistModal';
import {
  PlayIcon,
  PauseIcon,
  NextIcon,
  PrevIcon,
  SeekBackwardIcon,
  SeekForwardIcon,
  ShuffleIcon,
  RepeatIcon,
  RepeatOneIcon,
  ProfileIcon,
  EditIcon,
  MysteryIcon,
  QuestionIcon,
  DiscIcon,
  LyricsIcon,
  PlaylistIcon,
  HeartIcon,
} from '../src/components/icons/SvgIcons';

export default function SpikePlayerScreen() {
  const {
    userState,
    serverUrl,
    setServerUrl,
    serverToken,
    setServerToken,
    isSyncing,
    syncStatus,
    expirationDate,
    syncLibrary: handleSyncLibrary,
    updateUserState: handleUpdateUserState,
    toggleFavorite: handleToggleFavorite,
    fetchLyrics: handleFetchLyrics,
    saveTrack: handleSaveTrack,
    deleteTrack,
  } = useLibrary();

  const {
    tracks,
    currentTrackIndex,
    currentTrack,
    playerState,
    repeatMode,
    isSmartShuffle,
    sortMode,
    togglePlay: handleTogglePlay,
    next: handleNext,
    previous: handlePrevious,
    skipToTrack: handleSkipToTrack,
    seekOffset: handleSeekOffset,
    seekTo,
    cycleRepeat: handleCycleRepeat,
    toggleSmartShuffle: handleToggleSmartShuffle,
    applySortMode: handleApplySortMode,
    addCustomTrack,
    handleTrackDeleted,
    gaplessDeltaMs,
    atomicWriteBranch,
    lastMoveError,
    recoveryStatus,
    writeQueueStatus,
  } = usePlayer();

  // State cục bộ cho UI
  const [customUrl, setCustomUrl] = useState<string>('');
  const [barWidth, setBarWidth] = useState<number>(0);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [lyricsModalVisible, setLyricsModalVisible] = useState(false);
  const [playlistModalVisible, setPlaylistModalVisible] = useState(false);

  // Hook đo lường safe area & responsive cho toàn bộ màn hình
  const insets = useSafeAreaInsets();
  const { width, height, isLandscape, gutter, maxContentWidth } = useResponsive();

  // Tính toán kích thước ảnh bìa thích ứng
  // Lưu ý: Nhánh landscape tạm thời không chạy vì app đang khóa orientation: 'portrait' trong app.config.ts (giữ nguyên code kiến trúc responsive dự phòng).
  const artworkSize = isLandscape
    ? Math.max(140, Math.min(Math.round(height * 0.48), 240))
    : Math.max(140, Math.min(width - gutter * 2 - spacing.xl * 2, Math.round(height * 0.38), 340));

  const handleOpenEdit = (track: Track) => {
    setEditingTrack(track);
    setEditModalVisible(true);
  };

  const handleBarPress = async (locationX: number) => {
    if (barWidth <= 0 || tracks.length === 0) return;
    Vibration.vibrate(10);
    const totalDuration = playerState.durationSec || (currentTrack ? currentTrack.duration : 0);
    if (totalDuration <= 0) return;
    const ratio = Math.max(0, Math.min(1, locationX / barWidth));
    const target = ratio * totalDuration;
    await seekTo(target);
  };

  const handleAddCustomTrack = async () => {
    const trimmed = customUrl.trim();
    if (!trimmed) return;
    setCustomUrl('');
    await addCustomTrack(trimmed);
  };

  const handleDeleteTrack = async (trackId: string) => {
    await deleteTrack(trackId, handleTrackDeleted);
  };

  const totalDuration = playerState.durationSec || (currentTrack ? currentTrack.duration : 0);
  const progressPercent = totalDuration > 0
    ? Math.min(100, (playerState.positionSec / totalDuration) * 100)
    : 0;

  const gaplessMs = gaplessDeltaMs;
  const buildSha = process.env.EXPO_PUBLIC_BUILD_SHA || 'dev-local';

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        {
          paddingLeft: Math.max(gutter, insets.left),
          paddingRight: Math.max(gutter, insets.right),
          paddingBottom: insets.bottom + spacing.xxl,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={true}
    >
      <View style={[styles.contentWrapper, { maxWidth: maxContentWidth }]}>
        {/* Thẻ hiển thị bài hát chính */}
        <View style={styles.card}>
          <View style={styles.badgeRow}>
            <View style={styles.badgeLeftGroup}>
              <Text style={styles.badge}>BEATIFY PLAYER</Text>
              {isSmartShuffle && (
                <View style={styles.shuffleActivePill}>
                  <ShuffleIcon size={11} color={colors.primary} />
                  <Text style={styles.shuffleActivePillText}>TRỘN BÀI</Text>
                </View>
              )}
            </View>
            <View style={styles.badgeRightGroup}>
              <TouchableOpacity
                style={styles.profileHeaderBtn}
                onPress={() => {
                  Vibration.vibrate(10);
                  setProfileModalVisible(true);
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Mở hồ sơ cá nhân và thành tích nghe nhạc"
              >
                <ProfileIcon size={14} color={colors.primary} />
                <Text style={styles.profileHeaderBtnText}>Hồ sơ</Text>
              </TouchableOpacity>
              {currentTrack ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity
                    style={[styles.subtleEditBtn, { marginRight: spacing.sm }]}
                    onPress={() => handleToggleFavorite(currentTrack.id)}
                    activeOpacity={0.6}
                    hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={userState.favoriteIds.includes(currentTrack.id) ? "Bỏ thích bài hát này" : "Yêu thích bài hát này"}
                  >
                    <HeartIcon
                      size={14}
                      color={userState.favoriteIds.includes(currentTrack.id) ? colors.favorite : colors.textSubtle}
                      fill={userState.favoriteIds.includes(currentTrack.id) ? colors.favorite : 'none'}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.subtleEditBtn}
                    onPress={() => handleOpenEdit(currentTrack)}
                    activeOpacity={0.6}
                    hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel="Chỉnh sửa thông tin bài hát"
                  >
                    <EditIcon size={13} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ width: 24 }} />
              )}
            </View>
          </View>

          {/* Nhánh landscape 2 cột dưới đây tạm thời không chạy vì app đang khóa orientation: 'portrait' trong app.config.ts. Giữ nguyên theo kiến trúc responsive dự phòng. */}
          {isLandscape ? (
            <View style={styles.landscapePlayerBody}>
              {/* Cột trái: Khung ảnh bìa thích ứng */}
              <View style={[styles.artworkContainer, { width: artworkSize, height: artworkSize, marginBottom: 0 }]}>
                {currentTrack?.cover ? (
                  <Image
                    source={{ uri: currentTrack.cover }}
                    style={styles.artworkImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.artworkPlaceholder}>
                    <DiscIcon size={Math.min(64, Math.round(artworkSize * 0.35))} color={colors.borderLight} />
                    <Text style={[styles.artworkEmptyText, { marginTop: spacing.sm }]}>
                      {tracks.length === 0 ? 'Thư viện trống' : 'Không có ảnh bìa'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Cột phải: Thông tin bài hát & Bảng điều khiển */}
              <View style={styles.landscapeControlsCol}>
                <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
                  {currentTrack ? currentTrack.title : 'Chưa có bài hát'}
                </Text>
                <Text style={styles.artist} numberOfLines={1} ellipsizeMode="tail">
                  {currentTrack
                    ? `${currentTrack.artist} • ${currentTrack.album ?? 'Single'}`
                    : 'Đồng bộ từ Web quản lý hoặc nhập link bên dưới'}
                </Text>

                {/* Thanh tiến trình tua nhạc (Vùng chạm 44pt chuẩn Apple HIG) */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.progressBarTouchable}
                  onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
                  onPress={(e) => handleBarPress(e.nativeEvent.locationX)}
                >
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
                  </View>
                </TouchableOpacity>

                <View style={styles.timeRow}>
                  <Text style={styles.timeText}>{formatTime(playerState.positionSec)}</Text>
                  {playerState.isBuffering && <ActivityIndicator size="small" color={colors.primary} />}
                  <Text style={styles.timeText}>{formatTime(totalDuration)}</Text>
                </View>

                {/* Cụm điều khiển phát nhạc chính */}
                <View style={styles.controlsRow}>
                  <TouchableOpacity
                    style={styles.seekBtn}
                    disabled={tracks.length === 0}
                    onPress={() => handleSeekOffset(-5)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
                    accessibilityRole="button"
                    accessibilityLabel="Tua lùi 5 giây"
                  >
                    <SeekBackwardIcon size={22} color={colors.textPrimary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.skipBtn}
                    disabled={tracks.length === 0}
                    onPress={handlePrevious}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Phát bài trước đó"
                  >
                    <PrevIcon size={22} color={colors.textPrimary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.playCircleBtn, tracks.length === 0 && styles.playCircleBtnDisabled]}
                    disabled={tracks.length === 0 && !playerState.isPlaying}
                    onPress={handleTogglePlay}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={playerState.isPlaying ? "Tạm dừng phát nhạc" : "Bắt đầu phát nhạc"}
                  >
                    {playerState.isPlaying ? (
                      <PauseIcon size={26} color={colors.textDark} />
                    ) : (
                      <PlayIcon size={26} color={colors.textDark} />
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.skipBtn}
                    disabled={tracks.length === 0}
                    onPress={handleNext}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Phát bài tiếp theo"
                  >
                    <NextIcon size={22} color={colors.textPrimary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.seekBtn}
                    disabled={tracks.length === 0}
                    onPress={() => handleSeekOffset(5)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
                    accessibilityRole="button"
                    accessibilityLabel="Tua tới 5 giây"
                  >
                    <SeekForwardIcon size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                {/* Hàng nút chế độ: Lặp lại & Trộn bài thông minh */}
                <View style={styles.modeButtonsRow}>
                  <TouchableOpacity
                    style={[styles.modeBottomBtn, repeatMode !== 'off' && styles.modeBottomBtnActive]}
                    onPress={handleCycleRepeat}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={repeatMode === 'off' ? 'Chế độ lặp lại: Tắt' : repeatMode === 'track' ? 'Chế độ lặp lại: 1 bài' : 'Chế độ lặp lại: Toàn bộ danh sách'}
                  >
                    {repeatMode === 'track' ? (
                      <RepeatOneIcon size={16} color={colors.primary} />
                    ) : (
                      <RepeatIcon size={16} color={repeatMode !== 'off' ? colors.primary : colors.textTertiary} />
                    )}
                    <Text style={[styles.repeatBottomText, repeatMode !== 'off' && styles.repeatActiveColor]}>
                      {repeatMode === 'off' ? 'Repeat: Tắt' : repeatMode === 'track' ? 'Repeat: 1 bài' : 'Repeat: Tất cả'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modeBottomBtn, isSmartShuffle && styles.modeBottomBtnActive]}
                    onPress={handleToggleSmartShuffle}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={isSmartShuffle ? "Tắt trộn bài thông minh" : "Bật trộn bài thông minh"}
                  >
                    <ShuffleIcon size={16} color={isSmartShuffle ? colors.primary : colors.textTertiary} />
                    <Text style={[styles.repeatBottomText, isSmartShuffle && styles.repeatActiveColor]}>
                      {isSmartShuffle ? 'Shuffle: BẬT' : 'Shuffle: Tắt'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Hàng nút tính năng: Lyrics & Playlist */}
                <View style={[styles.modeButtonsRow, { marginTop: spacing.sm }]}>
                  <TouchableOpacity
                    style={[styles.modeBottomBtn, lyricsModalVisible && styles.modeBottomBtnActive]}
                    disabled={!currentTrack}
                    onPress={() => setLyricsModalVisible(true)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel="Mở màn hình lời bài hát"
                  >
                    <LyricsIcon size={16} color={currentTrack ? colors.primary : colors.textTertiary} />
                    <Text style={[styles.repeatBottomText, currentTrack && styles.repeatActiveColor]}>
                      Lyrics
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modeBottomBtn, playlistModalVisible && styles.modeBottomBtnActive]}
                    onPress={() => setPlaylistModalVisible(true)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel="Quản lý danh sách phát"
                  >
                    <PlaylistIcon size={16} color={colors.primary} />
                    <Text style={[styles.repeatBottomText, styles.repeatActiveColor]}>
                      Playlist ({userState.playlists.length})
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            /* Bố cục Portrait 1 cột truyền thống */
            <>
              {/* Khung ảnh bìa thích ứng với màn hình */}
              <View style={[styles.artworkContainer, { width: artworkSize, height: artworkSize }]}>
                {currentTrack?.cover ? (
                  <Image
                    source={{ uri: currentTrack.cover }}
                    style={styles.artworkImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.artworkPlaceholder}>
                    <DiscIcon size={Math.min(64, Math.round(artworkSize * 0.35))} color={colors.borderLight} />
                    <Text style={[styles.artworkEmptyText, { marginTop: spacing.sm }]}>
                      {tracks.length === 0 ? 'Thư viện trống' : 'Không có ảnh bìa'}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
                {currentTrack ? currentTrack.title : 'Chưa có bài hát'}
              </Text>
              <Text style={styles.artist} numberOfLines={1} ellipsizeMode="tail">
                {currentTrack
                  ? `${currentTrack.artist} • ${currentTrack.album ?? 'Single'}`
                  : 'Đồng bộ từ Web quản lý hoặc nhập link bên dưới'}
              </Text>

              {/* Thanh tiến trình tua nhạc (Vùng chạm 44pt chuẩn Apple HIG) */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.progressBarTouchable}
                onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
                onPress={(e) => handleBarPress(e.nativeEvent.locationX)}
              >
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
                </View>
              </TouchableOpacity>

              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatTime(playerState.positionSec)}</Text>
                {playerState.isBuffering && <ActivityIndicator size="small" color={colors.primary} />}
                <Text style={styles.timeText}>{formatTime(totalDuration)}</Text>
              </View>

              {/* Cụm điều khiển phát nhạc chính */}
              <View style={styles.controlsRow}>
                <TouchableOpacity
                  style={styles.seekBtn}
                  disabled={tracks.length === 0}
                  onPress={() => handleSeekOffset(-5)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
                  accessibilityRole="button"
                  accessibilityLabel="Tua lùi 5 giây"
                >
                  <SeekBackwardIcon size={22} color={colors.textPrimary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.skipBtn}
                  disabled={tracks.length === 0}
                  onPress={handlePrevious}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Phát bài trước đó"
                >
                  <PrevIcon size={22} color={colors.textPrimary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.playCircleBtn, tracks.length === 0 && styles.playCircleBtnDisabled]}
                  disabled={tracks.length === 0 && !playerState.isPlaying}
                  onPress={handleTogglePlay}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={playerState.isPlaying ? "Tạm dừng phát nhạc" : "Bắt đầu phát nhạc"}
                >
                  {playerState.isPlaying ? (
                    <PauseIcon size={26} color={colors.textDark} />
                  ) : (
                    <PlayIcon size={26} color={colors.textDark} />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.skipBtn}
                  disabled={tracks.length === 0}
                  onPress={handleNext}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Phát bài tiếp theo"
                >
                  <NextIcon size={22} color={colors.textPrimary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.seekBtn}
                  disabled={tracks.length === 0}
                  onPress={() => handleSeekOffset(5)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
                  accessibilityRole="button"
                  accessibilityLabel="Tua tới 5 giây"
                >
                  <SeekForwardIcon size={22} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>

              {/* Hàng nút chế độ: Lặp lại & Trộn bài thông minh */}
              <View style={styles.modeButtonsRow}>
                <TouchableOpacity
                  style={[styles.modeBottomBtn, repeatMode !== 'off' && styles.modeBottomBtnActive]}
                  onPress={handleCycleRepeat}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={repeatMode === 'off' ? 'Chế độ lặp lại: Tắt' : repeatMode === 'track' ? 'Chế độ lặp lại: 1 bài' : 'Chế độ lặp lại: Toàn bộ danh sách'}
                >
                  {repeatMode === 'track' ? (
                    <RepeatOneIcon size={16} color={colors.primary} />
                  ) : (
                    <RepeatIcon size={16} color={repeatMode !== 'off' ? colors.primary : colors.textTertiary} />
                  )}
                  <Text style={[styles.repeatBottomText, repeatMode !== 'off' && styles.repeatActiveColor]}>
                    {repeatMode === 'off' ? 'Repeat: Tắt' : repeatMode === 'track' ? 'Repeat: 1 bài' : 'Repeat: Tất cả'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modeBottomBtn, isSmartShuffle && styles.modeBottomBtnActive]}
                  onPress={handleToggleSmartShuffle}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={isSmartShuffle ? "Tắt trộn bài thông minh" : "Bật trộn bài thông minh"}
                >
                  <ShuffleIcon size={16} color={isSmartShuffle ? colors.primary : colors.textTertiary} />
                  <Text style={[styles.repeatBottomText, isSmartShuffle && styles.repeatActiveColor]}>
                    {isSmartShuffle ? 'Shuffle: BẬT' : 'Shuffle: Tắt'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Hàng nút tính năng: Lyrics & Playlist */}
              <View style={[styles.modeButtonsRow, { marginTop: spacing.sm }]}>
                <TouchableOpacity
                  style={[styles.modeBottomBtn, lyricsModalVisible && styles.modeBottomBtnActive]}
                  disabled={!currentTrack}
                  onPress={() => setLyricsModalVisible(true)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel="Mở màn hình lời bài hát"
                >
                  <LyricsIcon size={16} color={currentTrack ? colors.primary : colors.textTertiary} />
                  <Text style={[styles.repeatBottomText, currentTrack && styles.repeatActiveColor]}>
                    Lyrics
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modeBottomBtn, playlistModalVisible && styles.modeBottomBtnActive]}
                  onPress={() => setPlaylistModalVisible(true)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel="Quản lý danh sách phát"
                >
                  <PlaylistIcon size={16} color={colors.primary} />
                  <Text style={[styles.repeatBottomText, styles.repeatActiveColor]}>
                    Playlist ({userState.playlists.length})
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>


      {/* Khung kết nối & Đồng bộ Cloudflare R2 */}
      <View style={styles.syncCard}>
        <Text style={styles.syncCardTitle}>ĐỒNG BỘ TỨC THÌ VỚI CLOUDFLARE R2</Text>
        <Text style={styles.syncCardSubtitle}>
          Khi sửa hoặc xóa bài trên điện thoại, dữ liệu sẽ được cập nhật trực tiếp lên Cloudflare R2 và đồng bộ ngược về PC.
        </Text>
        <View style={styles.syncInputGroup}>
          <Text style={styles.syncInputLabel}>Địa chỉ Cloudflare Worker:</Text>
          <TextInput
            style={styles.inputField}
            placeholder="http://192.168.1.x:8787 hoặc domain Worker"
            placeholderTextColor={colors.textPlaceholder}
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={[styles.syncInputGroup, { marginTop: spacing.sm }]}>
          <Text style={styles.syncInputLabel}>API Token (Bearer):</Text>
          <TextInput
            style={styles.inputField}
            placeholder="Token bí mật để xác thực"
            placeholderTextColor={colors.textPlaceholder}
            value={serverToken}
            onChangeText={setServerToken}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <TouchableOpacity
          style={[styles.syncBtn, isSyncing && styles.syncBtnDisabled]}
          disabled={isSyncing}
          onPress={handleSyncLibrary}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Tải toàn bộ thư viện bài hát từ Cloudflare"
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color={colors.textDark} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <RepeatIcon size={15} color={colors.textDark} />
              <Text style={[styles.syncBtnText, { marginLeft: spacing.sm }]}>Tải toàn bộ thư viện từ Cloudflare</Text>
            </View>
          )}
        </TouchableOpacity>
        {syncStatus ? (
          <View style={styles.syncStatusBox}>
            <Text style={styles.syncStatusText} numberOfLines={3} ellipsizeMode="tail">
              {syncStatus}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Khung nhập link nhạc thật (Không dùng mock data) */}
      <View style={styles.inputCard}>
        <Text style={styles.inputCardTitle}>PHÁT TRỰC TIẾP FILE NHẠC CỦA BẠN</Text>
        <Text style={styles.inputCardSubtitle}>
          Dán link file nhạc trực tiếp (URL MP3/AAC) để phát ngay lập tức trên iPhone:
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.inputField}
            placeholder="https://example.com/song.mp3"
            placeholderTextColor={colors.textPlaceholder}
            value={customUrl}
            onChangeText={setCustomUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.addBtn}
            onPress={handleAddCustomTrack}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Phát trực tiếp bài hát từ liên kết"
          >
            <Text style={styles.addBtnText}>Phát</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Danh sách hàng đợi nếu đã có bài hát */}
      {tracks.length > 0 && (
        <View style={styles.queueCard}>
          <View style={styles.queueHeaderRow}>
            <Text style={styles.queueHeader}>DANH SÁCH BÀI HÁT ({tracks.length})</Text>
            {isSmartShuffle && (
              <View style={styles.mysteryQueueTag}>
                <MysteryIcon size={12} color={colors.warning} />
                <Text style={styles.mysteryQueueTagText}>BÍ MẬT HÀNG ĐỢI</Text>
              </View>
            )}
          </View>

          {/* Thanh lựa chọn chế độ sắp xếp danh sách thông minh */}
          <View style={styles.sortFilterRow}>
            <TouchableOpacity
              style={[styles.sortFilterBtn, sortMode === 'smart' && styles.sortFilterBtnActive]}
              onPress={() => handleApplySortMode('smart')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
            >
              <Text style={[styles.sortFilterText, sortMode === 'smart' && styles.sortFilterTextActive]}>
                ✨ Đan xen ca sĩ
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sortFilterBtn, sortMode === 'artist' && styles.sortFilterBtnActive]}
              onPress={() => handleApplySortMode('artist')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
            >
              <Text style={[styles.sortFilterText, sortMode === 'artist' && styles.sortFilterTextActive]}>
                🎤 Theo ca sĩ
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sortFilterBtn, sortMode === 'title' && styles.sortFilterBtnActive]}
              onPress={() => handleApplySortMode('title')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
            >
              <Text style={[styles.sortFilterText, sortMode === 'title' && styles.sortFilterTextActive]}>
                🔤 Tên A-Z
              </Text>
            </TouchableOpacity>
          </View>

          {/* Banner giải thích tính năng bất ngờ của Smart Shuffle */}
          {isSmartShuffle && (
            <View style={styles.mysteryBannerBox}>
              <MysteryIcon size={20} color={colors.warning} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.mysteryBannerTitle}>Trộn bài thông minh đang bật</Text>
                <Text style={styles.mysteryBannerDesc}>
                  Thứ tự các bài tiếp theo được giữ bí mật để mang lại cảm giác tò mò và bất ngờ!
                </Text>
              </View>
            </View>
          )}

          {tracks.map((track, idx) => {
            const isActive = idx === currentTrackIndex;
            const isMysterious = isSmartShuffle && idx > currentTrackIndex;

            return (
              <View
                key={track.id}
                style={[
                  styles.queueItem,
                  isActive && styles.queueItemActive,
                  isMysterious && styles.queueItemMysterious,
                ]}
              >
                <View style={styles.queueIndexBox}>
                  {isMysterious ? (
                    <QuestionIcon size={13} color={colors.textTertiary} />
                  ) : (
                    <Text
                      style={[
                        styles.queueIndexText,
                        isActive && styles.queueIndexTextActive,
                      ]}
                    >
                      {idx + 1}
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.queueItemInfo}
                  onPress={() => handleSkipToTrack(idx)}
                  accessibilityRole="button"
                  accessibilityLabel={isMysterious ? `Bài hát bí ẩn số ${idx + 1}` : `Chuyển sang bài ${track.title} của ${track.artist}`}
                >
                  <Text
                    style={[
                      styles.queueItemTitle,
                      isActive && styles.queueItemTitleActive,
                      isMysterious && styles.queueItemTitleMysterious,
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {isMysterious ? 'Bài hát bí ẩn' : track.title}
                  </Text>
                  <Text
                    style={[
                      styles.queueItemArtist,
                      isMysterious && styles.queueItemArtistMysterious,
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {isMysterious
                      ? 'Sẽ được tiết lộ khi bài này phát'
                      : `${track.artist} ${track.album ? `• ${track.album}` : ''}`}
                  </Text>
                </TouchableOpacity>

                <View style={styles.queueActionsRow}>
                  {isActive && (
                    <View style={{ marginRight: spacing.xs }}>
                      {playerState.isPlaying ? (
                        <PlayIcon size={13} color={colors.primary} />
                      ) : (
                        <PauseIcon size={13} color={colors.primary} />
                      )}
                    </View>
                  )}
                  {isMysterious ? (
                    <View style={styles.mysteryBadgePill}>
                      <Text style={styles.mysteryBadgePillText}>Sắp đến</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TouchableOpacity
                        style={[styles.queueEditBtn, { marginRight: spacing.xs }]}
                        onPress={() => handleToggleFavorite(track.id)}
                        activeOpacity={0.6}
                        hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
                        accessibilityRole="button"
                        accessibilityLabel={userState.favoriteIds.includes(track.id) ? `Bỏ thích ${track.title}` : `Thích ${track.title}`}
                      >
                        <HeartIcon
                          size={13}
                          color={userState.favoriteIds.includes(track.id) ? colors.favorite : colors.textTertiary}
                          fill={userState.favoriteIds.includes(track.id) ? colors.favorite : 'none'}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.queueEditBtn}
                        onPress={() => handleOpenEdit(track)}
                        activeOpacity={0.6}
                        hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Sửa thông tin ${track.title}`}
                      >
                        <EditIcon size={13} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Bảng thông tin Debug */}
      <View style={styles.debugCard}>
        <Text style={styles.debugHeader}>THÔNG TIN HỆ THỐNG & CHỨNG CHỈ</Text>

        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Build SHA:</Text>
          <Text style={styles.debugVal} numberOfLines={1} ellipsizeMode="middle">
            {buildSha}
          </Text>
        </View>

        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Hạn chứng chỉ:</Text>
          <Text style={styles.debugVal} numberOfLines={1} ellipsizeMode="tail">
            {expirationDate}
          </Text>
        </View>

        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Gapless In-App Δt:</Text>
          <Text style={styles.debugVal}>
            {gaplessMs !== null ? `${gaplessMs} ms` : 'Chưa đo'}
          </Text>
        </View>

        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Atomic Write Branch:</Text>
          <Text style={styles.debugVal}>{atomicWriteBranch}</Text>
        </View>

        {lastMoveError && (
          <View style={styles.debugRow}>
            <Text style={styles.debugLabel}>Lỗi move trực tiếp:</Text>
            <Text style={[styles.debugVal, styles.debugValError]}>{lastMoveError}</Text>
          </View>
        )}

        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Khôi phục .tmp:</Text>
          <Text style={styles.debugVal}>{recoveryStatus}</Text>
        </View>

        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Hàng đợi ghi đĩa:</Text>
          <Text style={styles.debugVal}>{writeQueueStatus}</Text>
        </View>
      </View>

      {/* Modal Chỉnh sửa bài hát trên Mobile */}
      <EditTrackModal
        visible={editModalVisible}
        track={editingTrack}
        onClose={() => setEditModalVisible(false)}
        onSave={handleSaveTrack}
        onDelete={handleDeleteTrack}
        onFetchLyrics={handleFetchLyrics}
      />

      {/* Modal Lời bài hát đồng bộ LRC */}
      <LyricsModal
        visible={lyricsModalVisible}
        track={currentTrack}
        currentTimeSec={playerState.positionSec}
        onClose={() => setLyricsModalVisible(false)}
        onSeek={(seconds) => {
          seekTo(seconds);
        }}
        onOpenEditLyrics={(track) => {
          setLyricsModalVisible(false);
          handleOpenEdit(track);
        }}
        onFetchLyrics={handleFetchLyrics}
      />

      {/* Modal Danh sách phát & Yêu thích */}
      <PlaylistModal
        visible={playlistModalVisible}
        onClose={() => setPlaylistModalVisible(false)}
        userState={userState}
        onUpdateUserState={handleUpdateUserState}
        libraryTracks={tracks}
        onPlayTrack={(track) => {
          const idx = tracks.findIndex((t) => t.id === track.id);
          if (idx >= 0) {
            handleSkipToTrack(idx);
          }
        }}
        currentTrackId={currentTrack?.id}
        isPlaying={playerState.isPlaying}
      />

      {/* Modal Hồ sơ cá nhân & Thống kê Beatify Replay */}
      <ProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        totalLibraryTracksCount={tracks.length}
      />
        </View>
      </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flexGrow: 1,
    paddingTop: spacing.lg,
  },
  contentWrapper: {
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  landscapePlayerBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  landscapeArtworkCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  landscapeControlsCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  badge: {
    color: colors.primary,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.5,
  },
  repeatBadge: {
    backgroundColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.xs,
  },
  repeatBadgeText: {
    color: colors.textMedium,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
  },
  artworkContainer: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.xl,
    shadowColor: colors.textDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  artworkImage: {
    width: '100%',
    height: '100%',
  },
  artworkPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceDarker,
  },
  artworkEmptyText: {
    color: colors.textDisabled,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.medium,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.titleLarge,
    fontWeight: fontWeights.bold,
    lineHeight: lineHeights.titleLarge,
    textAlign: 'center',
    marginBottom: spacing.xs,
    width: '100%',
  },
  artist: {
    color: colors.textMutedAlt,
    fontSize: fontSizes.subhead,
    lineHeight: lineHeights.subhead,
    textAlign: 'center',
    marginBottom: spacing.lg,
    width: '100%',
  },
  progressBarTouchable: {
    width: '100%',
    height: layout.minTouchTarget,
    marginVertical: -12,
    justifyContent: 'center',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: colors.borderLight,
    borderRadius: radius.xs,
    overflow: 'hidden',
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  timeText: {
    color: colors.textSubtle,
    fontSize: fontSizes.captionLarge,
    fontVariant: ['tabular-nums'],
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  seekBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceControl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderNeutral,
  },
  seekArrow: {
    color: colors.primary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
  seekNumber: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
    marginHorizontal: 1,
  },
  skipBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  skipIcon: {
    fontSize: fontSizes.subheading,
    color: colors.textPrimary,
  },
  playCircleBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  playCircleBtnDisabled: {
    backgroundColor: colors.border,
    opacity: 0.5,
    shadowOpacity: 0,
  },
  playCircleIcon: {
    fontSize: fontSizes.titleLarge,
    color: colors.textDark,
    fontWeight: fontWeights.bold,
  },
  repeatBottomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceControl,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderNeutral,
  },
  repeatBottomIcon: {
    fontSize: fontSizes.subhead,
    color: colors.textTertiary,
  },
  repeatBottomText: {
    fontSize: fontSizes.caption,
    color: colors.textTertiary,
    fontWeight: fontWeights.semibold,
  },
  repeatActiveColor: {
    color: colors.primary,
  },
  inputCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  inputCardTitle: {
    color: colors.primary,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.bold,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  inputCardSubtitle: {
    color: colors.textSubtle,
    fontSize: fontSizes.captionLarge,
    lineHeight: lineHeights.captionLarge,
    marginBottom: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  inputField: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: fontSizes.subhead,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  addBtn: {
    minHeight: layout.minTouchTarget,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  addBtnText: {
    color: colors.textDark,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.subhead,
  },
  queueCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  queueHeader: {
    color: colors.textSubtle,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  sortFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    padding: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortFilterBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortFilterBtnActive: {
    backgroundColor: colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  sortFilterText: {
    color: colors.textSubtle,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
  },
  sortFilterTextActive: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },

  queueItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.surfaceSubtle,
  },
  queueItemActive: {
    backgroundColor: colors.surfaceActive,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  queueItemInfo: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: spacing.sm,
  },
  queueItemTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.body,
  },
  queueItemTitleActive: {
    color: colors.primary,
  },
  queueItemArtist: {
    color: colors.textSubtle,
    fontSize: fontSizes.captionLarge,
    marginTop: spacing.xxs,
    lineHeight: lineHeights.captionLarge,
  },
  queueActiveBadge: {
    color: colors.primary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
    marginLeft: spacing.sm,
  },
  debugCard: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.xxxl,
  },
  debugHeader: {
    color: colors.textPrimary,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.bold,
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  debugRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  debugLabel: {
    flexShrink: 0,
    color: colors.textSubtle,
    fontSize: fontSizes.subhead,
    lineHeight: lineHeights.subhead,
  },
  debugVal: {
    flex: 1,
    textAlign: 'right',
    color: colors.textPrimary,
    fontSize: fontSizes.subhead,
    lineHeight: lineHeights.subhead,
    fontWeight: fontWeights.medium,
  },
  debugValError: {
    color: colors.dangerSoft,
  },
  subtleEditBtn: {
    padding: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceControl,
    opacity: 0.45,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subtleEditIcon: {
    color: colors.textMuted,
    fontSize: fontSizes.subhead,
    fontWeight: fontWeights.bold,
  },
  syncCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  syncCardTitle: {
    color: colors.primary,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.bold,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  syncCardSubtitle: {
    color: colors.textSubtle,
    fontSize: fontSizes.captionLarge,
    lineHeight: lineHeights.captionLarge,
    marginBottom: spacing.md,
  },
  syncInputGroup: {
    marginBottom: spacing.xs,
  },
  syncInputLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.xs,
  },
  syncBtn: {
    minHeight: layout.minTouchTarget,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  syncBtnDisabled: {
    opacity: 0.6,
  },
  syncBtnText: {
    color: colors.textDark,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.subhead,
  },
  syncStatusBox: {
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.sm,
    borderRadius: radius.xs,
    marginTop: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  syncStatusText: {
    color: colors.textMuted,
    fontSize: fontSizes.captionLarge,
    lineHeight: lineHeights.captionLarge,
  },
  queueActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  queueEditBtn: {
    minHeight: 28,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueEditBtnText: {
    color: colors.textSecondary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
  },
  queueIndexBox: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  queueIndexText: {
    color: colors.textTertiary,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.semibold,
  },
  queueIndexTextActive: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
  badgeLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badgeRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  profileHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  profileHeaderBtnText: {
    color: colors.textPrimary,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
  },
  shuffleActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
  },
  shuffleActivePillText: {
    color: colors.primary,
    fontSize: fontSizes.micro,
    fontWeight: fontWeights.extrabold,
    letterSpacing: 0.5,
  },
  modeButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    width: '100%',
    justifyContent: 'center',
  },
  modeBottomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfacePressed,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderDivider,
  },
  modeBottomBtnActive: {
    backgroundColor: colors.surfaceHighlight,
    borderColor: colors.primary,
  },
  queueHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  mysteryQueueTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningMuted,
    borderWidth: 1,
    borderColor: colors.warning,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
  },
  mysteryQueueTagText: {
    color: colors.warning,
    fontSize: fontSizes.micro,
    fontWeight: fontWeights.bold,
  },
  mysteryBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.mysteryBanner,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  mysteryBannerTitle: {
    color: colors.warning,
    fontSize: fontSizes.captionLarge,
    fontWeight: fontWeights.bold,
  },
  mysteryBannerDesc: {
    color: colors.textSubtle,
    fontSize: fontSizes.caption,
    marginTop: spacing.xxs,
    lineHeight: lineHeights.caption,
  },
  queueItemMysterious: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.mysteryBackground,
  },
  queueIndexTextMysterious: {
    color: colors.warning,
    fontSize: fontSizes.subhead,
  },
  queueItemTitleMysterious: {
    color: colors.textSecondaryAlt,
    fontStyle: 'italic',
    letterSpacing: 0.2,
  },
  queueItemArtistMysterious: {
    color: colors.textDisabled,
    fontSize: fontSizes.caption,
    fontStyle: 'italic',
  },
  mysteryBadgePill: {
    backgroundColor: colors.mysteryBadgeBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  mysteryBadgePillText: {
    color: colors.textSubtle,
    fontSize: fontSizes.micro,
    fontWeight: fontWeights.semibold,
  },
});

