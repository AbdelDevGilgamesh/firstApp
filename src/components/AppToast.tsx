import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/src/theme/appTheme';

export type AppToastType = 'success' | 'info' | 'warning' | 'error';

type AppToastProps = {
  message?: string | null;
  title?: string | null;
  visible?: boolean;
  type?: AppToastType;
  position?: 'top' | 'bottom';
  onDismiss?: () => void;
  duration?: number;
};

const TOAST_META: Record<
  AppToastType,
  { icon: string; accent: string; darkAccent: string; background: string; darkBackground: string }
> = {
  success: {
    icon: '✓',
    accent: '#2E7D57',
    darkAccent: '#86EFAC',
    background: '#EAF7EF',
    darkBackground: '#123123',
  },
  info: {
    icon: 'i',
    accent: '#2563EB',
    darkAccent: '#7DD3FC',
    background: '#EAF2FF',
    darkBackground: '#102642',
  },
  warning: {
    icon: '!',
    accent: '#C76B2A',
    darkAccent: '#FDBA74',
    background: '#FFF3E5',
    darkBackground: '#382515',
  },
  error: {
    icon: '!',
    accent: '#BE123C',
    darkAccent: '#FDA4AF',
    background: '#FFF1F2',
    darkBackground: '#3B1720',
  },
};

export function AppToast({
  duration = 5000,
  message,
  onDismiss,
  position = 'top',
  title,
  type = 'info',
  visible,
}: AppToastProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-screenWidth)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;
  const [isDismissed, setIsDismissed] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasContent = Boolean(title || message);
  const isVisible = (visible ?? hasContent) && hasContent && !isDismissed;
  const displayTitle = title ?? message;
  const displayMessage = title ? message : null;
  const meta = TOAST_META[type];
  const iconText = type === 'success' ? String.fromCharCode(10003) : meta.icon;
  const accentColor = theme.isDark ? meta.darkAccent : meta.accent;
  const backgroundColor = theme.isDark ? meta.darkBackground : meta.background;

  useEffect(() => {
    setIsDismissed(false);
    translateX.setValue(-screenWidth);
    progressAnim.setValue(1);
  }, [message, progressAnim, screenWidth, title, translateX, type]);

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      progressAnim.stopAnimation();
      progressAnim.setValue(1);
    }

    Animated.parallel([
      Animated.timing(opacity, {
        duration: isVisible ? 300 : 220,
        easing: isVisible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        toValue: isVisible ? 1 : 0,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        duration: isVisible ? 300 : 220,
        easing: isVisible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        toValue: isVisible ? 0 : screenWidth * 0.4,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && !isVisible) {
        setShouldRender(false);
      }
    });
  }, [isVisible, opacity, progressAnim, screenWidth, translateX]);

  function dismissToast() {
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }

    progressAnim.stopAnimation();

    Animated.parallel([
      Animated.timing(opacity, {
        duration: 220,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        duration: 220,
        easing: Easing.in(Easing.cubic),
        toValue: screenWidth * 0.4,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsDismissed(true);
      setShouldRender(false);
      onDismiss?.();
    });
  }

  useEffect(() => {
    if (!isVisible || !duration || duration <= 0) {
      return undefined;
    }

    progressAnim.stopAnimation();
    progressAnim.setValue(1);
    Animated.timing(progressAnim, {
      duration,
      easing: Easing.linear,
      toValue: 0,
      useNativeDriver: false,
    }).start();

    dismissTimeoutRef.current = setTimeout(dismissToast, duration);

    return () => {
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
        dismissTimeoutRef.current = null;
      }
      progressAnim.stopAnimation();
    };
  }, [duration, isVisible, progressAnim]);

  if (!shouldRender || !displayTitle) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.modalRoot}>
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.toastPositioner,
          {
            bottom: position === 'bottom' ? insets.bottom + 82 : undefined,
            opacity,
            top: position === 'top' ? insets.top : undefined,
            transform: [{ translateX }],
          },
        ]}>
        <View
          pointerEvents="auto"
          style={[
            styles.toast,
            {
              backgroundColor,
              shadowColor: theme.shadow,
              paddingTop: position === 'top' ? 10 : 12,
            },
          ]}>
          <View style={[styles.iconBubble, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.72)' }]}>
            <Text style={[styles.iconText, { color: accentColor }]}>{iconText}</Text>
          </View>
          <View style={styles.textBlock}>
            <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>
              {displayTitle}
            </Text>
            {displayMessage ? (
              <Text numberOfLines={2} style={[styles.message, { color: theme.mutedText }]}>
                {displayMessage}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel="Dismiss notification"
            accessibilityRole="button"
            onPress={dismissToast}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <Text style={[styles.closeText, { color: theme.mutedText }]}>x</Text>
          </Pressable>
          {duration > 0 ? (
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: accentColor,
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  toastPositioner: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 999,
  },
  toast: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 10,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 999,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  progressFill: {
    height: '100%',
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  iconBubble: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  iconText: {
    fontSize: 22,
    fontWeight: '900',
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
  },
  message: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  closeText: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
  },
  pressed: {
    opacity: 0.72,
  },
});
