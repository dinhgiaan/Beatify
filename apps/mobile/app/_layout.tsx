import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { colors, fontWeights, fontSizes } from '../src/theme';
import {
  LibraryProvider,
  PlayerProvider,
  PlayerProgressProvider,
  OfflineProvider,
} from '../src/context';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LibraryProvider>
          <OfflineProvider>
            <PlayerProvider>
              <PlayerProgressProvider>
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
                </Stack>
              </PlayerProgressProvider>
            </PlayerProvider>
          </OfflineProvider>
        </LibraryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
