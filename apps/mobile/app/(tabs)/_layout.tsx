import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '../../src/components/player/MiniPlayer';
import {
  LibraryIcon,
  SearchIcon,
  PlaylistIcon,
} from '../../src/components/icons/SvgIcons';
import {
  colors,
  fontSizes,
  fontWeights,
  spacing,
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

  return (
    <View style={styles.tabBarWrapper} pointerEvents="box-none">
      {/* MiniPlayer xuất hiện ngay phía trên thanh tab khi có bài đang phát */}
      <MiniPlayer />

      {/* Thanh Tab Bar dạng viên thuốc nổi bo tròn (Floating Pill Capsule Dock) */}
      <View
        style={[
          styles.floatingDock,
          {
            marginBottom: Math.max(insets.bottom, 10),
          },
        ]}
      >
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
          const iconColor = isFocused ? colors.primary : colors.textTertiary;

          if (route.name === 'library') {
            label = 'Thư viện';
            icon = <LibraryIcon size={20} color={iconColor} />;
          } else if (route.name === 'search') {
            label = 'Tìm kiếm';
            icon = <SearchIcon size={20} color={iconColor} />;
          } else if (route.name === 'playlists') {
            label = 'Playlist';
            icon = <PlaylistIcon size={20} color={iconColor} />;
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
              style={[
                styles.tabButton,
                isFocused && styles.tabButtonFocused,
              ]}
            >
              <View style={styles.iconContainer}>{icon}</View>
              <Text
                style={[
                  styles.tabLabel,
                  { color: isFocused ? colors.textPrimary : colors.textTertiary },
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
          title: 'Thư viện',
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
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    width: '86%',
    maxWidth: 320,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 12,
  },
  tabButton: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
  },
  tabButtonFocused: {
    backgroundColor: colors.surfaceActive,
  },
  iconContainer: {
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.medium,
    marginTop: 2,
  },
  tabLabelFocused: {
    fontWeight: fontWeights.bold,
  },
});
