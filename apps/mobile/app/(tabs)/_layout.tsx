import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '../../src/components/player/MiniPlayer';
import {
  HomeIcon,
  SearchIcon,
  PlaylistIcon,
  ClockRewindIcon,
} from '../../src/components/icons/SvgIcons';
import {
  colors,
  fontWeights,
  radius,
} from '../../src/theme';

type TabsTabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

/**
 * Custom Bottom Tab Bar kết hợp MiniPlayer nằm ngay trên thanh điều hướng
 * Tôn trọng Home Indicator qua useSafeAreaInsets, kiểm soát 100% theme tokens
 */
function CustomTabBar({ state, descriptors, navigation }: TabsTabBarProps) {
  const insets = useSafeAreaInsets();
  const [tabWidth, setTabWidth] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const numTabs = state.routes.length || 4;

  useEffect(() => {
    if (tabWidth > 0) {
      Animated.spring(slideAnim, {
        toValue: state.index * tabWidth,
        useNativeDriver: true,
        friction: 9,
        tension: 70,
      }).start();
    }
  }, [state.index, tabWidth, slideAnim]);

  return (
    <View style={styles.tabBarWrapper} pointerEvents="box-none">
      {/* MiniPlayer xuất hiện ngay phía trên thanh tab khi có bài đang phát */}
      <MiniPlayer />

      {/* Thanh Tab Bar dạng viên thuốc nổi bo tròn chuẩn iOS 18 Glassmorphism */}
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
            setTabWidth((w - 8) / numTabs);
          }
        }}
      >
        {/* Lớp nền viên thuốc động lướt mượt mà giữa các tab (iOS 18 Active Glass Pill) */}
        {tabWidth > 0 && (
          <Animated.View
            style={[
              styles.activePillIndicator,
              {
                width: tabWidth,
                transform: [{ translateX: slideAnim }],
              },
            ]}
          />
        )}

        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const options = descriptor?.options ?? {};
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          let label = options.title ?? route.name;
          let icon = null;
          const iconColor = isFocused ? colors.primary : 'rgba(255, 255, 255, 0.55)';

          if (route.name === 'library') {
            label = 'Trang chủ';
            icon = <HomeIcon size={19} color={iconColor} />;
          } else if (route.name === 'recent') {
            label = 'Vừa nghe';
            icon = <ClockRewindIcon size={19} color={iconColor} />;
          } else if (route.name === 'search') {
            label = 'Tìm kiếm';
            icon = <SearchIcon size={19} color={iconColor} />;
          } else if (route.name === 'playlists') {
            label = 'Playlist';
            icon = <PlaylistIcon size={19} color={iconColor} />;
          }

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
              <View style={styles.iconContainer}>{icon}</View>
              <Text
                style={[
                  styles.tabLabel,
                  isFocused && styles.tabLabelFocused,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
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
        name="recent"
        options={{
          title: 'Vừa nghe',
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Tìm kiếm',
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
    backgroundColor: 'rgba(28, 28, 30, 0.78)', // bg-[#1C1C1E]/78 Glassmorphism
    borderRadius: radius.pill,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)', // border-white/10
    alignItems: 'center',
    justifyContent: 'center',
    width: '94%',
    maxWidth: 380,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 16,
  },
  activePillIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.14)', // bg-white/15 active pill
    borderRadius: radius.pill,
  },
  tabButton: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  iconContainer: {
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 10.5,
    fontWeight: fontWeights.medium,
    color: 'rgba(255, 255, 255, 0.55)',
    marginTop: 2,
  },
  tabLabelFocused: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
});
