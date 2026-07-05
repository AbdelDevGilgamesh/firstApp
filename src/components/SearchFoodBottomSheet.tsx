import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  FlatList,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FoodSearchRow } from '@/src/components/FoodSearchRow';
import { useLanguage } from '@/src/context/LanguageContext';
import { FoodDefinition } from '@/src/foods';
import { useAppTheme } from '@/src/theme/appTheme';

type SearchFoodBottomSheetProps = {
  categories: string[];
  getFoodKey: (food: FoodDefinition) => string;
  isFavorite: (food: FoodDefinition) => boolean;
  onClose: () => void;
  onSelectFood: (food: FoodDefinition) => void;
  onToggleFavorite: (food: FoodDefinition) => void;
  results: FoodDefinition[];
  searchQuery: string;
  selectedCategory: string;
  setSearchQuery: (value: string) => void;
  setSelectedCategory: (value: string) => void;
  title?: string;
  visible: boolean;
};

const SCREEN_HEIGHT = Dimensions.get('window').height;

export function SearchFoodBottomSheet({
  categories,
  getFoodKey,
  isFavorite,
  onClose,
  onSelectFood,
  onToggleFavorite,
  results,
  searchQuery,
  selectedCategory,
  setSearchQuery,
  setSelectedCategory,
  title,
  visible,
}: SearchFoodBottomSheetProps) {
  const theme = useAppTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const displayTitle = title ?? t('add.searchFood');
  const inputRef = useRef<TextInput>(null);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [isRendered, setIsRendered] = useState(visible);
  const [isDragging, setIsDragging] = useState(false);

  function closeFromDrag() {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 140,
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        duration: 180,
        toValue: SCREEN_HEIGHT,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy > 2 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderGrant: () => {
        setIsDragging(true);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(Math.max(gestureState.dy, 0));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        setIsDragging(false);

        if (gestureState.dy > 80 || gestureState.vy > 0.7) {
          closeFromDrag();
          return;
        }

        Animated.spring(translateY, {
          friction: 8,
          tension: 130,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
        Animated.spring(translateY, {
          friction: 8,
          tension: 130,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  useEffect(() => {
    if (visible) {
      setIsRendered(true);
      translateY.setValue(SCREEN_HEIGHT);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          duration: 180,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          friction: 9,
          tension: 125,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setTimeout(() => inputRef.current?.focus(), 80);
      });
      return;
    }

    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 140,
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        duration: 180,
        toValue: SCREEN_HEIGHT,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsRendered(false);
    });
  }, [backdropOpacity, translateY, visible]);

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible={isRendered}>
      <View style={styles.modalRoot}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', android: undefined })}
          pointerEvents="box-none"
          style={styles.keyboardAvoider}>
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
                paddingBottom: Math.max(insets.bottom, 14) + 12,
                transform: [{ translateY }],
              },
            ]}>
            <View style={styles.sheetHeaderArea}>
              <View {...panResponder.panHandlers} style={styles.dragHandleZone}>
                <View
                  style={[
                    styles.handle,
                    {
                      backgroundColor: theme.cardBorder,
                      opacity: isDragging ? 0.95 : 0.72,
                    },
                  ]}
                />
              </View>

              <View style={styles.header}>
                <Text style={[styles.title, { color: theme.text }]}>{displayTitle}</Text>
                <Pressable
                  accessibilityLabel="Close search"
                  accessibilityRole="button"
                  onPress={onClose}
                  style={({ pressed }) => [
                    styles.closeButton,
                    { backgroundColor: theme.chipBackground },
                    pressed && styles.pressed,
                  ]}>
                  <Ionicons color={theme.mutedText} name="close" size={18} />
                </Pressable>
              </View>
            </View>

            <View
              style={[
                styles.searchBox,
                {
                  backgroundColor: theme.inputBackground,
                  borderColor: theme.cardBorder,
                },
              ]}>
              <Ionicons color={theme.mutedText} name="search" size={18} />
              <TextInput
                ref={inputRef}
                autoCapitalize="words"
                onChangeText={setSearchQuery}
                placeholder={t('add.searchPlaceholder')}
                placeholderTextColor={theme.mutedText}
                style={[styles.searchInput, { color: theme.text }]}
                value={searchQuery}
              />
              {searchQuery.trim() ? (
                <Pressable
                  accessibilityLabel="Clear search"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setSearchQuery('')}>
                  <Ionicons color={theme.mutedText} name="close-circle" size={18} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.categoryWrap}>
              <ScrollView
                horizontal
                contentContainerStyle={styles.categoryRow}
                keyboardShouldPersistTaps="handled"
                showsHorizontalScrollIndicator={false}>
                {categories.map((category) => {
                  const isSelected = category === selectedCategory;

                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={category}
                      onPress={() => setSelectedCategory(category)}
                      style={({ pressed }) => [
                        styles.categoryChip,
                        { backgroundColor: isSelected ? theme.primary : theme.chipBackground },
                        pressed && styles.pressed,
                      ]}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.categoryText,
                          { color: isSelected ? '#FFFFFF' : theme.mutedText },
                        ]}>
                        {category}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <FlatList
              contentContainerStyle={[
                styles.resultsContent,
                { paddingBottom: Math.max(insets.bottom, 14) + 140 },
              ]}
              data={results}
              keyboardShouldPersistTaps="handled"
              keyExtractor={getFoodKey}
              ListEmptyComponent={
                <View style={[styles.emptyState, { backgroundColor: theme.cardAlt }]}>
                  <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('add.noFoodFound')}</Text>
                  <Text style={[styles.emptyText, { color: theme.mutedText }]}>
                    {t('add.tryAnotherSearch')}
                  </Text>
                </View>
              }
              renderItem={({ item: food }) => (
                <FoodSearchRow
                  food={food}
                  isFavorite={isFavorite(food)}
                  onPress={onSelectFood}
                  onToggleFavorite={onToggleFavorite}
                />
              )}
              showsVerticalScrollIndicator={false}
              style={styles.resultsList}
            />
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.38)',
  },
  keyboardAvoider: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    minHeight: '62%',
    flex: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.16,
    shadowRadius: 30,
    elevation: 12,
  },
  sheetHeaderArea: {
    paddingTop: 4,
    paddingBottom: 14,
  },
  dragHandleZone: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: 999,
  },
  header: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  searchBox: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  categoryRow: {
    gap: 8,
    paddingVertical: 10,
    paddingRight: 18,
  },
  categoryWrap: {
    flexShrink: 0,
    marginBottom: 14,
  },
  categoryChip: {
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 14,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '900',
  },
  resultsList: {
    flex: 1,
  },
  resultsContent: {
    paddingTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    gap: 6,
    borderRadius: 18,
    padding: 18,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
});
