import { PropsWithChildren, useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

type PressableScaleProps = PropsWithChildren<
  PressableProps & {
    disabled?: boolean;
    scaleTo?: number;
    style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  }
>;

export function PressableScale({
  children,
  disabled,
  onPressIn,
  onPressOut,
  scaleTo = 0.97,
  style,
  ...props
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (disabled) {
      scale.setValue(1);
      opacity.setValue(0.55);
    } else {
      opacity.setValue(1);
    }
  }, [disabled, opacity, scale]);

  function animate(toValue: number, toOpacity: number) {
    Animated.parallel([
      Animated.spring(scale, {
        friction: 7,
        tension: 180,
        toValue,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        duration: 120,
        toValue: toOpacity,
        useNativeDriver: true,
      }),
    ]).start();
  }

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <Pressable
        {...props}
        disabled={disabled}
        onPressIn={(event) => {
          if (!disabled) {
            animate(scaleTo, 0.9);
          }
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          if (!disabled) {
            animate(1, 1);
          }
          onPressOut?.(event);
        }}
        style={style}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
