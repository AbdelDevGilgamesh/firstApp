import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/src/theme/appTheme';

type EmptyStateProps = {
  title: string;
  message: string;
};

export function EmptyState({ title, message }: EmptyStateProps) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.card,
          borderColor: theme.cardBorder,
          borderRadius: theme.radii.xl,
          shadowColor: theme.shadow,
        },
      ]}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.message, { color: theme.mutedText }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    padding: 24,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
    elevation: 1,
  },
  title: {
    color: '#1E1F24',
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  message: {
    marginTop: 8,
    color: '#6B6F76',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
