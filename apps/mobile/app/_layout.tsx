import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, fontWeights, fontSizes } from '../src/theme';
import { LibraryProvider, PlayerProvider } from '../src/context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LibraryProvider>
        <PlayerProvider>
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
                title: 'Beatify Spike',
              }}
            />
          </Stack>
        </PlayerProvider>
      </LibraryProvider>
    </SafeAreaProvider>
  );
}
