import React from 'react';
import { TouchableOpacity, StyleSheet, type LayoutChangeEvent } from 'react-native';
import type { Tabs } from 'expo-router';
import {
  HomeIcon,
  SearchIcon,
  HeartIcon,
  ClockRewindIcon,
  PlaylistIcon,
} from '../icons/SvgIcons';
import { colors, radius } from '../../theme';

type TabsTabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

export type TabRoute = TabsTabBarProps['state']['routes'][0];
export type TabDescriptorOptions = TabsTabBarProps['descriptors'][string]['options'];

export interface TabBarItemProps {
  route: TabRoute;
  index: number;
  isFocused: boolean;
  options: TabDescriptorOptions;
  onPress: () => void;
  onLongPress: () => void;
  onLayout?: (index: number, x: number, width: number) => void;
}

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

function getTabLabel(routeName: string, customTitle?: string): string {
  if (customTitle) return customTitle;
  switch (routeName) {
    case 'library':
      return 'Trang chủ';
    case 'search':
      return 'Tìm kiếm';
    case 'collection':
      return 'Yêu thích';
    case 'recent':
      return 'Vừa nghe';
    case 'playlists':
      return 'Playlist';
    default:
      return routeName;
  }
}

export function TabBarItem({
  route,
  index,
  isFocused,
  options,
  onPress,
  onLongPress,
  onLayout,
}: TabBarItemProps) {
  const iconColor = isFocused ? colors.primary : 'rgba(255, 255, 255, 0.45)';
  const label = getTabLabel(route.name, options?.title);

  const handleLayout = (e: LayoutChangeEvent) => {
    if (onLayout) {
      const { x, width } = e.nativeEvent.layout;
      onLayout(index, x, width);
    }
  };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={options?.tabBarAccessibilityLabel ?? label}
      testID={options?.tabBarButtonTestID}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      activeOpacity={1}
      onLayout={handleLayout}
      style={styles.tabButton}
    >
      {getTabIcon(route.name, iconColor)}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tabButton: {
    flex: 1,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    zIndex: 2,
    backgroundColor: 'transparent',
  },
});
