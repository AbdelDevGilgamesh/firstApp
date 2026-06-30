import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/src/theme/appTheme';

type AddQuickActionCardProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  subtitle: string;
  title: string;
};

export function AddQuickActionCard({ icon, onPress, subtitle, title }: AddQuickActionCardProps) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.cardAlt,
          borderColor: theme.cardBorder,
        },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.iconCircle, { backgroundColor: theme.chipBackground }]}>
        <Ionicons color={theme.primary} name={icon} size={20} />
      </View>
      <View style={styles.textGroup}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[styles.subtitle, { color: theme.mutedText }]}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 156,
    minHeight: 98,
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
  },
  iconCircle: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  textGroup: {
    gap: 3,
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.78,
  },
});
