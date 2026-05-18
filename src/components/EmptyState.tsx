import { StyleSheet, Text, View } from 'react-native';

type EmptyStateProps = {
  title: string;
  message: string;
};

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  title: {
    color: '#1E1F24',
    fontSize: 17,
    fontWeight: '800',
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
