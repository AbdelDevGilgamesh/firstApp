import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/src/theme/appTheme';

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
}>;

export function Screen({ children, scroll = true }: ScreenProps) {
  const theme = useAppTheme();

  if (!scroll) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={[styles.content, { paddingHorizontal: theme.spacing.screenHorizontal }]}>
          {children}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            gap: theme.spacing.lg,
            paddingHorizontal: theme.spacing.screenHorizontal,
          },
        ]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F2',
  },
  content: {
    flex: 1,
    paddingVertical: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 24,
  },
});
