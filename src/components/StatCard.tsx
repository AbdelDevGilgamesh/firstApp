import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/src/theme/appTheme';

type StatCardProps = {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
};

export function StatCard({ label, value, tone = 'default' }: StatCardProps) {
  const theme = useAppTheme();
  const isFilled = tone !== 'default';
  const backgroundColor =
    tone === 'success' ? theme.success : tone === 'warning' ? theme.warning : theme.card;
  const textColor = isFilled ? '#FFFFFF' : theme.text;
  const labelColor = isFilled ? 'rgba(255,255,255,0.76)' : theme.mutedText;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor,
          borderColor: isFilled ? 'transparent' : theme.cardBorder,
          shadowColor: theme.shadow,
        },
      ]}>
      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      <Text style={[styles.value, { color: textColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 112,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
  },
  value: {
    fontSize: 28,
    fontWeight: '900',
  },
});
