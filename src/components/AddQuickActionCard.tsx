import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/src/components/PressableScale';
import { useAppTheme } from '@/src/theme/appTheme';

type AddQuickActionCardProps = {
  accentColor?: string;
  delay?: number;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  subtitle: string;
  title: string;
};

export function AddQuickActionCard({
  accentColor,
  delay = 0,
  icon,
  onPress,
  style,
  subtitle,
  title,
}: AddQuickActionCardProps) {
  const theme = useAppTheme();
  const entrance = useRef(new Animated.Value(0)).current;
  const activeColor = accentColor ?? theme.primary;

  useEffect(() => {
    Animated.timing(entrance, {
      delay,
      duration: 260,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [delay, entrance]);

  const translateY = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  return (
    <Animated.View style={[styles.wrapper, style, { opacity: entrance, transform: [{ translateY }] }]}>
      <PressableScale
        accessibilityRole="button"
        onPress={onPress}
        style={[
          styles.card,
          {
            backgroundColor: theme.isDark ? theme.cardAlt : `${activeColor}0D`,
            borderColor: `${activeColor}33`,
          },
        ]}>
        <View style={[styles.accentBar, { backgroundColor: activeColor }]} />
        <View style={[styles.iconCircle, { backgroundColor: `${activeColor}18` }]}>
          <Ionicons color={activeColor} name={icon} size={20} />
        </View>
        <View style={styles.textGroup}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
            {title}
          </Text>
          <Text numberOfLines={1} style={[styles.subtitle, { color: theme.mutedText }]}>
            {subtitle}
          </Text>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {},
  card: {
    minHeight: 84,
    gap: 8,
    borderWidth: 1,
    borderRadius: 15,
    padding: 12,
  },
  accentBar: {
    width: 34,
    height: 4,
    borderRadius: 999,
  },
  iconCircle: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  textGroup: {
    gap: 3,
  },
  title: {
    fontSize: 14,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '800',
  },
});
