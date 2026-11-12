import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '../../src/components/player/MiniPlayer';
import {
  HomeIcon,
  SearchIcon,
  HeartIcon,
  ClockRewindIcon,
  PlaylistIcon,
} from '../../src/components/icons/SvgIcons';
import {
  colors,
  fontWeights,
  radius,
} from '../../src/theme';

type TabsTabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

function getTabIcon(routeName: string, color: string) {
  const size = 16;
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

/**
 * Custom Bottom Tab Bar nổi bo tròn dạng Floating Pill
 * Có Icon + Text gọn gàng, và Sliding Indicator mượt mà di chuyển giữa các tab
 */
function CustomTabBar({ state, descriptors, navigation }: TabsTabBarProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(state.index)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: state.index,
      friction: 8,
      tension: 65,
      useNativeDriver: false,
    }).start();
  }, [state.index, slideAnim]);

  const numTabs = state.routes.length;
  const tabWidthPercent = 100 / numTabs;

  const indicatorLeft = slideAnim.interpolate({
    inputRange: state.routes.map((_, i) => i),
    outputRange: state.routes.map((_, i) => `${i * tabWidthPercent}%`),
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
      >
        {/* Sliding active pill chuyển động nhẹ nhàng giữa các tab */}
        <Animated.View
          style={[
            styles.activePillIndicator,
            {
              width: `${tabWidthPercent}%`,
              left: indicatorLeft as any,
            },
          ]}
        />

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
              <View style={styles.tabContent}>
                {getTabIcon(route.name, iconColor)}
                <Text
                  numberOfLines={1}
                  style={[
                    styles.tabLabel,
                    isFocused && styles.tabLabelFocused,
                  ]}
                >
                  {label}
                </Text>
              </View>
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
    backgroundColor: 'rgba(18, 18, 20, 0.95)', // Tăng độ đậm theo yêu cầu (không còn trong suốt quá mức)
    borderRadius: radius.pill,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)', // Viền nổi khối rõ nét
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
  activePillIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    backgroundColor: 'rgba(29, 185, 84, 0.16)',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.35)',
    zIndex: 0,
  },
  tabButton: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRadius: radius.pill,
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: fontWeights.medium,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  tabLabelFocused: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
});
