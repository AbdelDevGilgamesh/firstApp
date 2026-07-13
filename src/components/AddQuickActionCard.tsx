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
    <Animated.View
      style={[
        styles.wrapper,
        {
          backgroundColor: theme.card,
          borderColor: theme.cardBorder,
          borderRadius: theme.radii.large,
          opacity: entrance,
          transform: [{ translateY }],
        },
        style,
      ]}>
      <PressableScale
        accessibilityRole="button"
        onPress={onPress}
        style={styles.card}>
        <View style={[styles.accentLine, { backgroundColor: activeColor }]} />
        <View style={styles.cardTopRow}>
          <View style={[styles.iconCircle, { backgroundColor: `${activeColor}18` }]}>
            <Ionicons color={activeColor} name={icon} size={20} />
          </View>
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
  wrapper: {
    overflow: 'hidden',
    borderWidth: 1,
  },
  card: {
    minHeight: 98,
    gap: 12,
    padding: 15,
    paddingTop: 17,
  },
  accentLine: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 3,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
  },
  textGroup: {
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 19,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
  },
});
