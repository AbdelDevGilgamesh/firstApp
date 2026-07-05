import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/src/theme/appTheme';

type AppConfirmSheetProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  type?: 'info' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
};

export function AppConfirmSheet({
  cancelLabel,
  confirmLabel,
  message,
  onCancel,
  onConfirm,
  title,
  type = 'info',
  visible,
}: AppConfirmSheetProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(28)).current;
  const accentColor = type === 'warning' ? theme.warning : theme.primary;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        duration: visible ? 180 : 140,
        toValue: visible ? 1 : 0,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        damping: 20,
        stiffness: 220,
        toValue: visible ? 0 : 28,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY, visible]);

  return (
    <Modal animationType="none" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.root}>
        <Pressable accessibilityRole="button" onPress={onCancel} style={StyleSheet.absoluteFill}>
          <Animated.View style={[styles.backdrop, { opacity }]} />
        </Pressable>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
              paddingBottom: insets.bottom + 18,
              shadowColor: theme.shadow,
              transform: [{ translateY }],
            },
          ]}>
          <View style={[styles.iconBubble, { backgroundColor: `${accentColor}22` }]}>
            <Text style={[styles.iconText, { color: accentColor }]}>{type === 'warning' ? '!' : 'i'}</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.message, { color: theme.mutedText }]}>{message}</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [
                styles.secondaryButton,
                { backgroundColor: theme.chipBackground, borderColor: theme.cardBorder },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.secondaryText, { color: theme.text }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: accentColor },
                pressed && styles.pressed,
              ]}>
              <Text style={styles.primaryText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.46)',
  },
  sheet: {
    gap: 12,
    borderTopWidth: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 22,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  iconBubble: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  iconText: {
    fontSize: 18,
    fontWeight: '900',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  secondaryButton: {
    minHeight: 52,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 16,
  },
  primaryButton: {
    minHeight: 52,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '900',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.86,
  },
});
