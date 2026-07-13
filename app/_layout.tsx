import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { CalorieProvider } from '@/src/context/CalorieContext';
import { AppDialogProvider } from '@/src/context/AppDialogContext';
import { LanguageProvider } from '@/src/context/LanguageContext';
import { TokenProvider } from '@/src/context/TokenContext';
import { ToastProvider } from '@/src/context/ToastContext';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <LanguageProvider>
        <TokenProvider>
          <CalorieProvider>
            <ToastProvider>
              <AppDialogProvider>
                <Stack>
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="daily-nutrition-detail" options={{ headerShown: false }} />
                  <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
                </Stack>
              </AppDialogProvider>
            </ToastProvider>
          </CalorieProvider>
        </TokenProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
