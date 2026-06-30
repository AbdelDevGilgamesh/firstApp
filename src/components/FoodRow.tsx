import { useRef } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { FoodEntry } from "@/src/types";

type FoodRowProps = {
  deleteMode?: "swipe" | "actions" | "none";
  entry: FoodEntry;
  onDelete?: (entry: FoodEntry) => void;
  onEdit?: (entry: FoodEntry) => void;
  onOpenActions?: (entry: FoodEntry) => void;
  onSwipeEnd?: () => void;
  onSwipeStart?: () => void;
  variant?: "light" | "dark";
};

function getFoodAvatar(name: string) {
  const normalizedName = name.toLowerCase();

  if (
    normalizedName.includes("water") ||
    normalizedName.includes("milk") ||
    normalizedName.includes("juice")
  ) {
    return "🥛";
  }

  if (
    normalizedName.includes("rice") ||
    normalizedName.includes("pasta") ||
    normalizedName.includes("oat")
  ) {
    return "🍚";
  }

  if (
    normalizedName.includes("chicken") ||
    normalizedName.includes("beef") ||
    normalizedName.includes("tuna")
  ) {
    return "🍗";
  }

  if (
    normalizedName.includes("apple") ||
    normalizedName.includes("banana") ||
    normalizedName.includes("fruit")
  ) {
    return "🍎";
  }

  if (normalizedName.includes("egg")) {
    return "🥚";
  }

  if (
    normalizedName.includes("salad") ||
    normalizedName.includes("vegetable")
  ) {
    return "🥗";
  }

  return "🍽️";
}

function formatMacro(value?: number) {
  return Math.round(Number(value ?? 0) * 10) / 10;
}

export function FoodRow({
  deleteMode = "swipe",
  entry,
  onDelete,
  onEdit,
  onOpenActions,
  onSwipeEnd,
  onSwipeStart,
  variant = "light",
}: FoodRowProps) {
  const isDark = variant === "dark";
  const canSwipeDelete = deleteMode === "swipe" && Boolean(onDelete);
  const canShowActions = deleteMode === "actions" && Boolean(onOpenActions);
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);
  const quantityLabel =
    entry.quantity ??
    (entry.quantityValue && entry.unit
      ? `${entry.quantityValue} ${entry.unit}`
      : undefined);
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 12 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onMoveShouldSetPanResponderCapture: (_, gestureState) =>
        Math.abs(gestureState.dx) > 12 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderGrant: () => {
        onSwipeStart?.();
      },
      onPanResponderMove: (_, gestureState) => {
        const nextX = Math.max(
          Math.min(gestureState.dx + (isOpen.current ? -96 : 0), 0),
          -96,
        );
        translateX.setValue(nextX);
      },
      onPanResponderRelease: (_, gestureState) => {
        const shouldOpen =
          gestureState.dx < -38 || (isOpen.current && gestureState.dx < 28);

        isOpen.current = shouldOpen;
        Animated.spring(translateX, {
          toValue: shouldOpen ? -96 : 0,
          useNativeDriver: true,
        }).start(() => {
          onSwipeEnd?.();
        });
      },
      onPanResponderTerminate: () => {
        onSwipeEnd?.();
      },
    }),
  ).current;

  function closeSwipe() {
    isOpen.current = false;
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
    }).start(() => {
      onSwipeEnd?.();
    });
  }

  function handleDelete() {
    closeSwipe();
    onDelete?.(entry);
  }

  return (
    <View style={styles.swipeContainer}>
      {canSwipeDelete ? (
        <Pressable
          accessibilityRole="button"
          onPress={handleDelete}
          style={({ pressed }) => [
            styles.swipeDelete,
            pressed && styles.swipeDeletePressed,
          ]}
        >
          <Text style={styles.swipeDeleteText}>Delete</Text>
        </Pressable>
      ) : null}
      <Animated.View
        style={[
          styles.row,
          isDark && styles.rowDark,
          { transform: [{ translateX }] },
        ]}
        {...(canSwipeDelete ? panResponder.panHandlers : {})}
      >
        <Pressable
          accessibilityRole="button"
          disabled={!onEdit}
          delayLongPress={260}
          onLongPress={() => {
            if (canShowActions) {
              onOpenActions?.(entry);
            }
          }}
          onPress={() => onEdit?.(entry)}
          style={({ pressed }) => [
            styles.rowPressable,
            pressed && onEdit ? styles.rowPressed : null,
          ]}
        >
          <View style={[styles.avatar, isDark && styles.avatarDark]}>
            <Text style={styles.avatarText}>{getFoodAvatar(entry.name)}</Text>
          </View>
          <View style={styles.nameGroup}>
            <Text
              numberOfLines={1}
              style={[styles.name, isDark && styles.nameDark]}
            >
              {entry.name}
            </Text>
            {quantityLabel ? (
              <Text
                numberOfLines={1}
                style={[styles.quantity, isDark && styles.quantityDark]}
              >
                {quantityLabel}
              </Text>
            ) : (
              <Text style={[styles.quantity, isDark && styles.quantityDark]}>
                Logged serving
              </Text>
            )}
            <Text style={[styles.macros, isDark && styles.macrosDark]}>
              P {formatMacro(entry.protein)}g / C {formatMacro(entry.carbs)}g /
              F {formatMacro(entry.fat)}g
            </Text>
          </View>
          <View style={styles.trailing}>
            {canShowActions ? (
              <Pressable
                accessibilityLabel="Food actions"
                accessibilityRole="button"
                hitSlop={10}
                onPress={(event) => {
                  event.stopPropagation();
                  onOpenActions?.(entry);
                }}
                style={({ pressed }) => [styles.menuButton, pressed && styles.rowPressed]}
              >
                <Text style={[styles.menuText, isDark && styles.menuTextDark]}>...</Text>
              </Pressable>
            ) : null}
            <Text style={[styles.calories, isDark && styles.caloriesDark]}>
              {entry.calories}
            </Text>
            <Text
              style={[styles.calorieLabel, isDark && styles.calorieLabelDark]}
            >
              cal
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeContainer: {
    overflow: "hidden",
    borderRadius: 16,
  },
  swipeDelete: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 96,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#B95C3A",
  },
  swipeDeletePressed: {
    backgroundColor: "#9E482B",
  },
  swipeDeleteText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  row: {
    minHeight: 92,
    borderWidth: 1,
    borderColor: "#E5E7DD",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    shadowColor: "#1E1F24",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  rowDark: {
    borderColor: "#253047",
    backgroundColor: "#101827",
    shadowOpacity: 0,
    elevation: 0,
  },
  rowPressable: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowPressed: {
    opacity: 0.82,
  },
  avatar: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#F1F3EF",
  },
  avatarDark: {
    backgroundColor: "#1E293B",
  },
  avatarText: {
    fontSize: 23,
  },
  nameGroup: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: "#1E1F24",
    fontSize: 16,
    fontWeight: "900",
  },
  nameDark: {
    color: "#F8FAFC",
  },
  quantity: {
    color: "#6B6F76",
    fontSize: 13,
    fontWeight: "700",
  },
  quantityDark: {
    color: "#94A3B8",
  },
  macros: {
    color: "#6B6F76",
    fontSize: 12,
    fontWeight: "800",
  },
  macrosDark: {
    color: "#CBD5E1",
  },
  trailing: {
    minWidth: 62,
    alignItems: "flex-end",
  },
  menuButton: {
    minWidth: 34,
    minHeight: 26,
    alignItems: "flex-end",
    justifyContent: "center",
    marginBottom: 2,
  },
  menuText: {
    color: "#6B6F76",
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 20,
  },
  menuTextDark: {
    color: "#94A3B8",
  },
  calories: {
    color: "#2E7D57",
    fontSize: 22,
    fontWeight: "900",
  },
  caloriesDark: {
    color: "#7DD3FC",
  },
  calorieLabel: {
    marginTop: -2,
    color: "#6B6F76",
    fontSize: 12,
    fontWeight: "800",
  },
  calorieLabelDark: {
    color: "#94A3B8",
  },
});
