import React from 'react';
import { Vibration } from 'react-native';
import { Stack } from 'expo-router';

// Vô hiệu hóa rung toàn cục theo yêu cầu người dùng
Vibration.vibrate = () => {};
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { colors, fontWeights, fontSizes } from '../src/theme';
import {
  LibraryProvider,
  PlayerProvider,
  PlayerProgressProvider,
  OfflineProvider,
  useLibrary,
} from '../src/context';
import { NetworkStatusBanner } from '../src/components/common/NetworkStatusBanner';

function RootAppContent() {
  const { networkStatus } = useLibrary();

  return (
    <>
      <NetworkStatusBanner status={networkStatus} />
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.backgroundElevated,
          },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: {
            fontWeight: fontWeights.semibold,
            fontSize: fontSizes.titleSmall,
          },
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="now-playing"
          options={{
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            presentation: 'modal',
            headerShown: false,
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LibraryProvider>
          <OfflineProvider>
            <PlayerProvider>
              <PlayerProgressProvider>
                <RootAppContent />
              </PlayerProgressProvider>
            </PlayerProvider>
          </OfflineProvider>
        </LibraryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
