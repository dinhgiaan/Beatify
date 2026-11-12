import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '../../src/components/player/MiniPlayer';
import {
  colors,
  fontWeights,
  radius,
} from '../../src/theme';

type TabsTabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

/**
 * Custom Bottom Tab Bar tối giản chuẩn Apple + Hip-hop
 * Chỉ dùng nhãn chữ và chấm chỉ báo 4px bên dưới tab đang active, không dùng icon
 */
function CustomTabBar({ state, descriptors, navigation }: TabsTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.tabBarWrapper} pointerEvents="box-none">
      {/* MiniPlayer xuất hiện ngay phía trên thanh tab khi có bài đang phát */}
      <MiniPlayer />

      {/* Thanh Tab Bar dạng viên thuốc nổi bo tròn tối giản */}
      <View
        style={[
          styles.floatingDock,
          {
            marginBottom: Math.max(insets.bottom, 12),
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
              <Text
                style={[
                  styles.tabLabel,
                  isFocused && styles.tabLabelFocused,
                ]}
              >
                {label}
              </Text>
              {isFocused && <View style={styles.activeDot} />}
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
  tabLabel: {
    fontSize: 13,
    fontWeight: fontWeights.medium,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  tabLabelFocused: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginTop: 3,
  },
});
