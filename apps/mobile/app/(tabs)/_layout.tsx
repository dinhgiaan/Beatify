import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '../../src/components/player/MiniPlayer';
import { triggerSelectionHaptic } from '../../src/utils/haptics';
import {
  HomeIcon,
  SearchIcon,
  HeartIcon,
  ClockRewindIcon,
  PlaylistIcon,
} from '../../src/components/icons/SvgIcons';
import {
  colors,
  radius,
} from '../../src/theme';

type TabsTabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

function getTabIcon(routeName: string, color: string) {
  const size = 20;
  switch (routeName) {
    case 'library':
      return <HomeIcon size={size} color={color} />;
    case 'search':
      return <SearchIcon size={size} color={color} />;
    case 'collection':
      return <HeartIcon size={size} color={color} fill={color} />;
    case 'recent':
      return <ClockRewindIcon size={size} color={color} />;
    case 'playlists':
      return <PlaylistIcon size={size} color={color} />;
    default:
      return null;
  }
}

// Lưu vết vị trí tab ở cấp độ module để bảo toàn chuyển động trượt xuyên suốt:
// Dù React Navigation có remount Tab Bar giữa các Screen,
// activeIndex vẫn luôn xuất phát từ tab nguồn và lướt mượt mà sang tab đích!
let previousTabIndex = 0;
let currentTabIndex = 0;
let lastKnownDockWidth = Math.min(Dimensions.get('window').width * 0.95, 410);
let pendingNavigationTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Custom Bottom Tab Bar nổi bo tròn dạng Floating Pill tối giản
 * Thuần Icon gọn gàng, có hiệu ứng viên thuốc trượt mượt mà (Sliding Active Pill) theo tab đang chọn
 */
function CustomTabBar({ state, descriptors, navigation }: TabsTabBarProps) {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const initialDockWidth = lastKnownDockWidth || Math.min(screenWidth * 0.95, 410);
  const dockWidthShared = useSharedValue(initialDockWidth);

  // Phản hồi tức thì ngay khi chạm (Optimistic Active State)
  const [optimisticIndex, setOptimisticIndex] = useState(state.index);

  // Khởi tạo activeIndex từ previousTabIndex:
  // Đảm bảo không bao giờ bị nhảy bụp tới đích khi component mount ở screen mới
  const activeIndex = useSharedValue(previousTabIndex);

  useEffect(() => {
    setOptimisticIndex(state.index);

    if (state.index !== currentTabIndex) {
      previousTabIndex = currentTabIndex;
      currentTabIndex = state.index;
    }

    activeIndex.value = withSpring(state.index, {
      damping: 15,
      stiffness: 95,
      mass: 0.75,
    });

    // Chỉ chốt previousTabIndex sau khi animation đã lướt hoàn tất ổn định (400ms)
    // Ngăn chặn các lần remount giữa chừng làm mất vị trí xuất phát ban đầu
    const timer = setTimeout(() => {
      previousTabIndex = state.index;
    }, 400);

    return () => clearTimeout(timer);
  }, [state.index, activeIndex]);

  const pillAnimStyle = useAnimatedStyle(() => {
    const totalTabs = state.routes.length || 5;
    // Trừ 8px paddingHorizontal (4px mỗi bên) của floatingDock
    const availableWidth = Math.max(0, dockWidthShared.value - 8);
    const tabWidth = availableWidth / totalTabs;

    return {
      width: tabWidth > 0 ? tabWidth : 0,
      transform: [
        {
          translateX: activeIndex.value * tabWidth,
        },
      ],
      opacity: dockWidthShared.value > 0 ? 1 : 0,
    };
  });

  return (
    <View style={styles.tabBarWrapper} pointerEvents="box-none">
      {/* MiniPlayer xuất hiện ngay phía trên thanh tab khi có bài đang phát */}
      <MiniPlayer />

      {/* Thanh Tab Bar dạng viên thuốc nổi bo tròn */}
      <View
        style={[
          styles.floatingDock,
          {
            marginBottom: Math.max(insets.bottom, 12),
          },
        ]}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0) {
            dockWidthShared.value = w;
            lastKnownDockWidth = w;
          }
        }}
      >
        {/* Nền active di chuyển mượt mà dạng trượt (Sliding Pill) */}
        <Animated.View style={[styles.slidingActivePill, pillAnimStyle]} pointerEvents="none" />

        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const options = descriptor?.options ?? {};
          const isFocused = optimisticIndex === index;

          const onPress = () => {
            triggerSelectionHaptic();
            if (state.index === index) {
              return;
            }

            const fromIndex = currentTabIndex;
            const toIndex = index;

            previousTabIndex = fromIndex;
            currentTabIndex = toIndex;
            setOptimisticIndex(toIndex);

            // 1. Kích hoạt hiệu ứng trượt NGAY TỨC THÌ trên UI-thread
            // Mắt người dùng lập tức thấy viên thuốc lướt êm ái, đầm tay sang tab mới
            activeIndex.value = withSpring(toIndex, {
              damping: 15,
              stiffness: 95,
              mass: 0.75,
            });

            // 2. Chuyển màn hình sau nhịp trễ 130ms:
            // Đảm bảo viên thuốc đã lướt đi được hơn 60% quãng đường trước mắt người dùng
            // trước khi luồng JS bắt đầu render cây component màn hình mới,
            // giúp mắt bắt trọn đường lướt mượt mà chuẩn iOS không bị drop frame
            if (pendingNavigationTimer) {
              clearTimeout(pendingNavigationTimer);
            }
            pendingNavigationTimer = setTimeout(() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }, 130);
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          let label = options.title ?? route.name;
          if (route.name === 'library') {
            label = 'Trang chủ';
          } else if (route.name === 'search') {
            label = 'Tìm kiếm';
          } else if (route.name === 'collection') {
            label = 'Yêu thích';
          } else if (route.name === 'recent') {
            label = 'Vừa nghe';
          } else if (route.name === 'playlists') {
            label = 'Playlist';
          }

          const iconColor = isFocused ? colors.primary : 'rgba(255, 255, 255, 0.45)';

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              delayLongPress={500}
              activeOpacity={0.7}
              style={styles.tabButton}
            >
              {getTabIcon(route.name, iconColor)}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function renderCustomTabBar(props: TabsTabBarProps) {
  return <CustomTabBar {...props} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={renderCustomTabBar}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="library"
        options={{
          title: 'Trang chủ',
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Tìm kiếm',
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: 'Yêu thích',
        }}
      />
      <Tabs.Screen
        name="recent"
        options={{
          title: 'Vừa nghe',
        }}
      />
      <Tabs.Screen
        name="playlists"
        options={{
          title: 'Playlist',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  floatingDock: {
    flexDirection: 'row',
    backgroundColor: 'rgba(18, 18, 20, 0.95)',
    borderRadius: radius.pill,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    width: '95%',
    maxWidth: 410,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.65,
    shadowRadius: 20,
    elevation: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    zIndex: 2,
    backgroundColor: 'transparent',
  },
  slidingActivePill: {
    position: 'absolute',
    left: 4,
    top: 4,
    bottom: 4,
    height: 42,
    backgroundColor: 'rgba(29, 185, 84, 0.28)',
    borderColor: 'rgba(29, 185, 84, 0.85)',
    borderWidth: 1.5,
    borderRadius: radius.pill,
    zIndex: 1,
  },
});
