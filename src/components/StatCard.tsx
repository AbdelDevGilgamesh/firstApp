import { StyleSheet, Text, View } from 'react-native';

type StatCardProps = {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
};

export function StatCard({ label, value, tone = 'default' }: StatCardProps) {
  return (
    <View style={[styles.card, styles[tone]]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 112,
    justifyContent: 'space-between',
    borderRadius: 8,
    padding: 16,
  },
  default: {
    backgroundColor: '#1E1F24',
  },
  success: {
    backgroundColor: '#2E7D57',
  },
  warning: {
    backgroundColor: '#B95C3A',
  },
  label: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '600',
  },
  value: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
});
