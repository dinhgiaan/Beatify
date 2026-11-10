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
} from '../../src/theme';
import { TAB_BAR_BASE_HEIGHT } from '../../src/hooks/useTabBarMetrics';

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
    <View style={styles.tabBarWrapper}>
      {/* MiniPlayer xuất hiện ngay phía trên thanh tab khi có bài đang phát */}
      <MiniPlayer />

      <View
        style={[
          styles.tabBarContainer,
          {
            paddingBottom: insets.bottom,
            height: TAB_BAR_BASE_HEIGHT + insets.bottom,
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

          let label = options.title ?? route.name;
          let icon = null;
          const iconColor = isFocused ? colors.primary : colors.textTertiary;

          if (route.name === 'library') {
            label = 'Thư viện';
            icon = <LibraryIcon size={22} color={iconColor} />;
          } else if (route.name === 'search') {
            label = 'Tìm kiếm';
            icon = <SearchIcon size={22} color={iconColor} />;
          } else if (route.name === 'playlists') {
            label = 'Playlist';
            icon = <PlaylistIcon size={22} color={iconColor} />;
          }

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              activeOpacity={0.7}
              style={styles.tabButton}
            >
              <View style={styles.iconContainer}>{icon}</View>
              <Text
                style={[
                  styles.tabLabel,
                  { color: iconColor },
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
  },
  tabBarContainer: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundElevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabButton: {
    flex: 1,
    height: TAB_BAR_BASE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  iconContainer: {
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.medium,
    marginTop: 2,
  },
  tabLabelFocused: {
    fontWeight: fontWeights.semibold,
  },
});
