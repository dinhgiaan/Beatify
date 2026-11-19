import React from 'react';
import { Tabs } from 'expo-router';
import { TabBar, type BottomTabBarProps } from '../../src/components/navigation/TabBar';

function renderCustomTabBar(props: BottomTabBarProps) {
  return <TabBar {...props} />;
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
        name="home"
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
        name="library"
        options={{
          title: 'Thư viện',
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
          href: null,
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
