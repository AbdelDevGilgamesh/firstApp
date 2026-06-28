import { router, useLocalSearchParams } from 'expo-router';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '@/src/components/Screen';
import { useCalories } from '@/src/context/CalorieContext';
import {
  DEFAULT_FOODS,
  FoodDefinition,
  mealToFoodDefinition,
  templateToFoodDefinition,
} from '@/src/foods';
import { MealIngredient, ServingPreset } from '@/src/types';
import { normalizeText, searchFoods } from '@/src/utils/foodSearch';

const MAX_SEARCH_RESULTS = 30;
const OPEN_FOOD_FACTS_FIELDS = [
  'code',
  'product_name',
  'generic_name',
  'brands',
  'categories',
  'categories_tags',
  'nutriments',
].join(',');
const PRIORITY_CATEGORIES = [
  'All',
  'Meat',
  'Grains',
  'Dairy and eggs',
  'Fruit',
  'Moroccan foods',
  'Drinks',
  'Prepared meals',
];

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseStoredQuantity(quantity?: string) {
  if (!quantity) {
    return { quantityValue: '', unit: '' };
  }

  const match = quantity.trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/);

  if (!match) {
    return { quantityValue: quantity, unit: '' };
  }

  return { quantityValue: match[1], unit: match[2] };
}

function getFoodKey(food: FoodDefinition) {
  return `${food.source}:${food.id}`;
}

type OpenFoodFactsProduct = {
  code?: string;
  product_name?: string;
  generic_name?: string;
  brands?: string;
  categories?: string;
  categories_tags?: string[];
  nutriments?: Record<string, unknown>;
};

type OpenFoodFactsProductResponse = {
  status?: number;
  product?: OpenFoodFactsProduct;
};

function toWords(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1);
}

function toOptionalNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanCategory(value: string) {
  return value
    .replace(/^[a-z]{2}:/i, '')
    .replace(/-/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getOpenFoodFactsCategory(product: OpenFoodFactsProduct) {
  const tag = product.categories_tags?.find((category) => cleanCategory(category).length > 0);

  if (tag) {
    return cleanCategory(tag);
  }

  return product.categories?.split(',').map(cleanCategory).find(Boolean) ?? 'Packaged foods';
}

function mapOpenFoodFactsProduct(
  barcode: string,
  product: OpenFoodFactsProduct,
): Omit<FoodDefinition, 'source'> | null {
  const name = (product.product_name || product.generic_name || '').trim();

  if (!name) {
    return null;
  }

  const nutriments = product.nutriments ?? {};
  const calories = toOptionalNumber(nutriments['energy-kcal_100g']);
  const protein = toOptionalNumber(nutriments['proteins_100g']);
  const carbs = toOptionalNumber(nutriments['carbohydrates_100g']);
  const fat = toOptionalNumber(nutriments['fat_100g']);

  if (
    calories === null ||
    protein === null ||
    carbs === null ||
    fat === null ||
    calories <= 0 ||
    calories > 900
  ) {
    return null;
  }

  const category = getOpenFoodFactsCategory(product);

  return {
    id: barcode,
    barcode,
    name,
    category,
    baseQuantity: 100,
    unit: 'g',
    calories: Math.round(calories),
    baseCalories: Math.round(calories),
    protein: round(protein),
    carbs: round(carbs),
    fat: round(fat),
    keywords: Array.from(
      new Set([...toWords(name), ...toWords(category), ...toWords(product.brands ?? ''), barcode]),
    ),
  };
}

export default function AddFoodScreen() {
  const {
    addFood,
    addFoodTemplate,
    addMealTemplate,
    entries,
    foodUsageCounts,
    foodTemplates,
    mealTemplates,
    pinnedFoodKeys,
    togglePinnedFood,
    updateFood,
  } = useCalories();
  const params = useLocalSearchParams<{ entryId?: string }>();
  const editingEntryId = typeof params.entryId === 'string' ? params.entryId : undefined;
  const editingEntry = useMemo(
    () => entries.find((entry) => entry.id === editingEntryId),
    [editingEntryId, entries],
  );
  const allFoods = useMemo(
    () => [
      ...DEFAULT_FOODS,
      ...foodTemplates.map(templateToFoodDefinition),
      ...mealTemplates.map(mealToFoodDefinition),
    ],
    [foodTemplates, mealTemplates],
  );

  const categories = useMemo(() => {
    const discovered = Array.from(new Set(allFoods.map((food) => food.category))).sort();
    return [
      ...PRIORITY_CATEGORIES.filter(
        (category) => category === 'All' || discovered.includes(category),
      ),
      ...discovered.filter((category) => !PRIORITY_CATEGORIES.includes(category)),
    ];
  }, [allFoods]);

  const [search, setSearch] = useState('');
  const [activeMode, setActiveMode] = useState<'find' | 'meal' | 'scan'>('find');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodDefinition | null>(null);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [mealName, setMealName] = useState('');
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [selectedIngredient, setSelectedIngredient] = useState<FoodDefinition | null>(null);
  const [ingredientQuantity, setIngredientQuantity] = useState('');
  const [ingredientUnit, setIngredientUnit] = useState('');
  const [ingredientCalories, setIngredientCalories] = useState('');
  const [ingredientProtein, setIngredientProtein] = useState('');
  const [ingredientCarbs, setIngredientCarbs] = useState('');
  const [ingredientFat, setIngredientFat] = useState('');
  const [editingIngredientIndex, setEditingIngredientIndex] = useState<number | null>(null);
  const [mealIngredients, setMealIngredients] = useState<MealIngredient[]>([]);

  useEffect(() => {
    if (editingEntry) {
      const storedQuantity = parseStoredQuantity(editingEntry.quantity);
      const entryFood =
        editingEntry.baseQuantity && editingEntry.baseCalories
          ? {
              id: `entry-${editingEntry.id}`,
              name: editingEntry.name,
              category: 'Logged foods',
              baseQuantity: editingEntry.baseQuantity,
              unit: editingEntry.unit ?? '',
              calories: editingEntry.baseCalories,
              baseCalories: editingEntry.baseCalories,
              protein: editingEntry.baseProtein ?? editingEntry.protein ?? 0,
              carbs: editingEntry.baseCarbs ?? editingEntry.carbs ?? 0,
              fat: editingEntry.baseFat ?? editingEntry.fat ?? 0,
              keywords: [editingEntry.name],
              source: 'custom' as const,
            }
          : null;

      setSelectedFood(entryFood);
      setDetailsOpen(true);
      setManualMode(false);
      setName(editingEntry.name);
      setQuantity(String(editingEntry.quantityValue ?? storedQuantity.quantityValue));
      setUnit(editingEntry.unit ?? storedQuantity.unit);
      setCalories(String(editingEntry.calories));
      setProtein(String(editingEntry.protein ?? 0));
      setCarbs(String(editingEntry.carbs ?? 0));
      setFat(String(editingEntry.fat ?? 0));
    } else if (!editingEntryId) {
      resetForm();
    }
  }, [editingEntry, editingEntryId]);

  const visibleFoods = useMemo(() => {
    const query = search.trim();
    const categoryFoods =
      selectedCategory === 'All'
        ? allFoods
        : allFoods.filter((food) => food.category === selectedCategory);

    if (query) {
      return searchFoods({
        foods: allFoods,
        query,
        category: selectedCategory,
        limit: MAX_SEARCH_RESULTS,
        usageCounts: foodUsageCounts,
        getFoodKey,
      });
    }

    const pinnedFoods = categoryFoods.filter((food) => pinnedFoodKeys.includes(getFoodKey(food)));

    if (pinnedFoods.length > 0) {
      return pinnedFoods;
    }

    return [...categoryFoods]
      .sort((a, b) => (foodUsageCounts[getFoodKey(b)] ?? 0) - (foodUsageCounts[getFoodKey(a)] ?? 0))
      .slice(0, 2);
  }, [allFoods, foodUsageCounts, pinnedFoodKeys, search, selectedCategory]);

  const isSearching = search.trim().length > 0;
  const resultsTitle = isSearching
    ? 'Search results'
    : pinnedFoodKeys.length > 0
      ? 'Pinned foods'
      : 'Top foods';
  const hasValidFood =
    name.trim().length > 0 &&
    toNumber(quantity) > 0 &&
    unit.trim().length > 0 &&
    toNumber(calories) > 0 &&
    toNumber(protein) >= 0 &&
    toNumber(carbs) >= 0 &&
    toNumber(fat) >= 0;
  const hasValidCustomFood = hasValidFood;
  const isEditing = Boolean(editingEntry);
  const servingPresets = useMemo(() => {
    if (selectedFood?.servingPresets?.length) {
      return selectedFood.servingPresets;
    }

    if (!selectedFood && !unit.trim()) {
      return [];
    }

    const activeUnit = unit.trim();
    return activeUnit.toLowerCase() === 'g'
      ? [50, 100, 150, 200, 250].map((value) => ({
          label: `${value}g`,
          quantity: value,
          unit: activeUnit,
        }))
      : [1, 2, 3].map((value) => ({ label: String(value), quantity: value, unit: activeUnit }));
  }, [selectedFood, unit]);
  const ingredientResults = useMemo(() => {
    if (!ingredientSearch.trim()) {
      return [];
    }

    return searchFoods({
      foods: allFoods,
      query: ingredientSearch,
      category: 'All',
      limit: 12,
      usageCounts: foodUsageCounts,
      getFoodKey,
    });
  }, [allFoods, foodUsageCounts, ingredientSearch]);
  const ingredientServingPresets = useMemo(() => {
    if (selectedIngredient?.servingPresets?.length) {
      return selectedIngredient.servingPresets;
    }

    if (!selectedIngredient && !ingredientUnit.trim()) {
      return [];
    }

    const activeUnit = ingredientUnit.trim();
    return activeUnit.toLowerCase() === 'g'
      ? [50, 100, 150, 200, 250].map((value) => ({
          label: `${value}g`,
          quantity: value,
          unit: activeUnit,
        }))
      : [1, 2, 3].map((value) => ({ label: String(value), quantity: value, unit: activeUnit }));
  }, [ingredientUnit, selectedIngredient]);
  const mealTotals = useMemo(
    () =>
      mealIngredients.reduce(
        (totals, ingredient) => ({
          calories: totals.calories + ingredient.calories,
          protein: totals.protein + ingredient.protein,
          carbs: totals.carbs + ingredient.carbs,
          fat: totals.fat + ingredient.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [mealIngredients],
  );

  function resetForm() {
    setDetailsOpen(false);
    setManualMode(false);
    setSelectedFood(null);
    setName('');
    setQuantity('');
    setUnit('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
  }

  function openFoodDetails(food: FoodDefinition) {
    setSelectedFood(food);
    setDetailsOpen(true);
    setManualMode(false);
    setName(food.name);
    setQuantity(String(food.baseQuantity));
    setUnit(food.unit);
    setCalories(String(food.baseCalories));
    setProtein(String(food.protein));
    setCarbs(String(food.carbs));
    setFat(String(food.fat));
  }

  function openManualDetails() {
    setSelectedFood(null);
    setDetailsOpen(true);
    setManualMode(true);
    setName(search.trim());
    setQuantity('');
    setUnit('g');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
  }

  function findFoodByBarcode(value: string) {
    const normalizedValue = normalizeText(value);

    return allFoods.find((food) => {
      if (normalizeText(food.id) === normalizedValue) {
        return true;
      }

      if (food.barcode && normalizeText(food.barcode) === normalizedValue) {
        return true;
      }

      return food.keywords.some((keyword) => normalizeText(keyword) === normalizedValue);
    });
  }

  async function fetchOpenFoodFactsFood(barcode: string) {
    try {
      const params = new URLSearchParams({
        fields: OPEN_FOOD_FACTS_FIELDS,
      });
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
          barcode,
        )}.json?${params.toString()}`,
        {
          headers: {
            'User-Agent': 'CalorieTrackerApp/1.0 contact:dev@example.com',
          },
        },
      );

      if (!response.ok) {
        console.warn(`Open Food Facts lookup failed with status ${response.status}.`);
        return null;
      }

      const data = (await response.json()) as OpenFoodFactsProductResponse;

      if (data.status !== 1 || !data.product) {
        return null;
      }

      return mapOpenFoodFactsProduct(barcode, data.product);
    } catch (error) {
      console.warn('Open Food Facts lookup failed.', error);
      return null;
    }
  }

  async function handleBarcodeScanned(value: string) {
    const food = findFoodByBarcode(value);

    if (food) {
      setActiveMode('find');
      openFoodDetails(food);
      return true;
    }

    const remoteFood = await fetchOpenFoodFactsFood(value);

    if (!remoteFood) {
      return false;
    }

    const cachedTemplate = await addFoodTemplate({
      barcode: value,
      name: remoteFood.name,
      category: remoteFood.category,
      baseQuantity: remoteFood.baseQuantity,
      unit: remoteFood.unit,
      baseCalories: remoteFood.baseCalories,
      protein: remoteFood.protein,
      carbs: remoteFood.carbs,
      fat: remoteFood.fat,
      keywords: remoteFood.keywords,
      source: 'barcode',
    });
    const cachedFood = templateToFoodDefinition(cachedTemplate);

    setActiveMode('find');
    openFoodDetails(cachedFood);
    return true;
  }

  function closeDetails() {
    if (!isEditing) {
      setDetailsOpen(false);
      setManualMode(false);
      setSelectedFood(null);
    } else {
      router.push('/');
    }
  }

  function updateFromRatio(nextRatio: number) {
    if (!selectedFood || !Number.isFinite(nextRatio)) {
      return;
    }

    setCalories(String(round(selectedFood.baseCalories * nextRatio, 0)));
    setProtein(String(round(selectedFood.protein * nextRatio)));
    setCarbs(String(round(selectedFood.carbs * nextRatio)));
    setFat(String(round(selectedFood.fat * nextRatio)));
  }

  function updateIngredientFromRatio(nextRatio: number) {
    if (!selectedIngredient || !Number.isFinite(nextRatio)) {
      return;
    }

    setIngredientCalories(String(round(selectedIngredient.baseCalories * nextRatio, 0)));
    setIngredientProtein(String(round(selectedIngredient.protein * nextRatio)));
    setIngredientCarbs(String(round(selectedIngredient.carbs * nextRatio)));
    setIngredientFat(String(round(selectedIngredient.fat * nextRatio)));
  }

  function handleQuantityChange(value: string) {
    setQuantity(value);

    if (!selectedFood || selectedFood.baseQuantity <= 0) {
      return;
    }

    updateFromRatio(toNumber(value) / selectedFood.baseQuantity);
  }

  function handleServingPreset(preset: ServingPreset) {
    setQuantity(String(preset.quantity));
    setUnit(preset.unit);

    if (
      typeof preset.calories === 'number' &&
      typeof preset.protein === 'number' &&
      typeof preset.carbs === 'number' &&
      typeof preset.fat === 'number'
    ) {
      setCalories(String(preset.calories));
      setProtein(String(preset.protein));
      setCarbs(String(preset.carbs));
      setFat(String(preset.fat));
      return;
    }

    if (selectedFood && selectedFood.baseQuantity > 0) {
      updateFromRatio(preset.quantity / selectedFood.baseQuantity);
    }
  }

  function handleCaloriesChange(value: string) {
    setCalories(value);

    if (!selectedFood || selectedFood.baseCalories <= 0) {
      return;
    }

    const ratio = toNumber(value) / selectedFood.baseCalories;
    setQuantity(String(round(selectedFood.baseQuantity * ratio)));
    setProtein(String(round(selectedFood.protein * ratio)));
    setCarbs(String(round(selectedFood.carbs * ratio)));
    setFat(String(round(selectedFood.fat * ratio)));
  }

  function openIngredientDetails(food: FoodDefinition) {
    setSelectedIngredient(food);
    setIngredientQuantity(String(food.baseQuantity));
    setIngredientUnit(food.unit);
    setIngredientCalories(String(food.baseCalories));
    setIngredientProtein(String(food.protein));
    setIngredientCarbs(String(food.carbs));
    setIngredientFat(String(food.fat));
  }

  function handleIngredientQuantityChange(value: string) {
    setIngredientQuantity(value);

    if (!selectedIngredient || selectedIngredient.baseQuantity <= 0) {
      return;
    }

    updateIngredientFromRatio(toNumber(value) / selectedIngredient.baseQuantity);
  }

  function handleIngredientCaloriesChange(value: string) {
    setIngredientCalories(value);

    if (!selectedIngredient || selectedIngredient.baseCalories <= 0) {
      return;
    }

    const ratio = toNumber(value) / selectedIngredient.baseCalories;
    setIngredientQuantity(String(round(selectedIngredient.baseQuantity * ratio)));
    setIngredientProtein(String(round(selectedIngredient.protein * ratio)));
    setIngredientCarbs(String(round(selectedIngredient.carbs * ratio)));
    setIngredientFat(String(round(selectedIngredient.fat * ratio)));
  }

  function handleIngredientPreset(preset: ServingPreset) {
    setIngredientQuantity(String(preset.quantity));
    setIngredientUnit(preset.unit);

    if (
      typeof preset.calories === 'number' &&
      typeof preset.protein === 'number' &&
      typeof preset.carbs === 'number' &&
      typeof preset.fat === 'number'
    ) {
      setIngredientCalories(String(preset.calories));
      setIngredientProtein(String(preset.protein));
      setIngredientCarbs(String(preset.carbs));
      setIngredientFat(String(preset.fat));
      return;
    }

    if (selectedIngredient && selectedIngredient.baseQuantity > 0) {
      updateIngredientFromRatio(preset.quantity / selectedIngredient.baseQuantity);
    }
  }

  function resetIngredientForm() {
    setSelectedIngredient(null);
    setIngredientSearch('');
    setIngredientQuantity('');
    setIngredientUnit('');
    setIngredientCalories('');
    setIngredientProtein('');
    setIngredientCarbs('');
    setIngredientFat('');
    setEditingIngredientIndex(null);
  }

  function handleAddIngredient() {
    if (!selectedIngredient || toNumber(ingredientQuantity) <= 0 || toNumber(ingredientCalories) <= 0) {
      Alert.alert('Check ingredient', 'Select an ingredient and enter quantity/calories.');
      return;
    }

    const nextIngredient: MealIngredient = {
      foodId: getFoodKey(selectedIngredient),
      name: selectedIngredient.name,
      quantity: round(toNumber(ingredientQuantity)),
      unit: ingredientUnit.trim(),
      calories: Math.round(toNumber(ingredientCalories)),
      protein: round(toNumber(ingredientProtein)),
      carbs: round(toNumber(ingredientCarbs)),
      fat: round(toNumber(ingredientFat)),
      baseQuantity: selectedIngredient.baseQuantity,
      baseCalories: selectedIngredient.baseCalories,
      baseProtein: selectedIngredient.protein,
      baseCarbs: selectedIngredient.carbs,
      baseFat: selectedIngredient.fat,
    };

    setMealIngredients((current) => {
      if (editingIngredientIndex === null) {
        return [...current, nextIngredient];
      }

      return current.map((ingredient, index) =>
        index === editingIngredientIndex ? nextIngredient : ingredient,
      );
    });
    resetIngredientForm();
  }

  function handleEditIngredient(ingredient: MealIngredient, index: number) {
    const ingredientFood: FoodDefinition = {
      id: ingredient.foodId,
      name: ingredient.name,
      category: 'Meals',
      baseQuantity: ingredient.baseQuantity ?? ingredient.quantity,
      unit: ingredient.unit,
      calories: ingredient.baseCalories ?? ingredient.calories,
      baseCalories: ingredient.baseCalories ?? ingredient.calories,
      protein: ingredient.baseProtein ?? ingredient.protein,
      carbs: ingredient.baseCarbs ?? ingredient.carbs,
      fat: ingredient.baseFat ?? ingredient.fat,
      keywords: [ingredient.name],
      source: 'custom',
    };

    setSelectedIngredient(ingredientFood);
    setIngredientQuantity(String(ingredient.quantity));
    setIngredientUnit(ingredient.unit);
    setIngredientCalories(String(ingredient.calories));
    setIngredientProtein(String(ingredient.protein));
    setIngredientCarbs(String(ingredient.carbs));
    setIngredientFat(String(ingredient.fat));
    setEditingIngredientIndex(index);
  }

  function handleRemoveIngredient(index: number) {
    setMealIngredients((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSaveMealTemplate() {
    if (!mealName.trim() || mealIngredients.length === 0) {
      Alert.alert('Check meal', 'Enter a meal name and add at least one ingredient.');
      return null;
    }

    const nextMeal = await addMealTemplate({
      name: mealName,
      ingredients: mealIngredients,
      calories: Math.round(mealTotals.calories),
      protein: round(mealTotals.protein),
      carbs: round(mealTotals.carbs),
      fat: round(mealTotals.fat),
    });
    Alert.alert('Meal saved', `${mealName.trim()} will appear in food search.`);
    return nextMeal;
  }

  async function handleAddMealToToday() {
    if (!mealName.trim() || mealIngredients.length === 0) {
      Alert.alert('Check meal', 'Enter a meal name and add at least one ingredient.');
      return;
    }

    await addFood({
      name: mealName,
      foodKey: `meal:${mealName.trim().toLowerCase()}`,
      calories: Math.round(mealTotals.calories),
      quantity: '1 meal',
      quantityValue: 1,
      unit: 'meal',
      protein: round(mealTotals.protein),
      carbs: round(mealTotals.carbs),
      fat: round(mealTotals.fat),
      baseQuantity: 1,
      baseCalories: Math.round(mealTotals.calories),
      baseProtein: round(mealTotals.protein),
      baseCarbs: round(mealTotals.carbs),
      baseFat: round(mealTotals.fat),
    });
    router.push('/');
  }

  async function handleSaveCustomFood() {
    if (!hasValidCustomFood) {
      Alert.alert('Check custom food', 'Enter name, quantity, unit, calories, and macros.');
      return;
    }

    const nextTemplate = await addFoodTemplate({
      name,
      baseQuantity: round(toNumber(quantity)),
      unit: unit.trim(),
      baseCalories: Math.round(toNumber(calories)),
      protein: round(toNumber(protein)),
      carbs: round(toNumber(carbs)),
      fat: round(toNumber(fat)),
    });
    const nextFood = templateToFoodDefinition(nextTemplate);
    setSelectedFood(nextFood);
    setManualMode(false);
    Alert.alert('Food saved', `${name.trim()} will appear in search results.`);
  }

  async function handleSave() {
    if (!hasValidFood || isSaving) {
      Alert.alert('Check food details', 'Enter food name, quantity, unit, calories, and macros.');
      return;
    }

    setIsSaving(true);

    try {
      const input = {
        name,
        foodKey: selectedFood ? getFoodKey(selectedFood) : undefined,
        calories: Math.round(toNumber(calories)),
        quantity: `${round(toNumber(quantity))} ${unit.trim()}`,
        quantityValue: round(toNumber(quantity)),
        unit: unit.trim(),
        protein: round(toNumber(protein)),
        carbs: round(toNumber(carbs)),
        fat: round(toNumber(fat)),
        baseQuantity: selectedFood?.baseQuantity,
        baseCalories: selectedFood?.baseCalories,
        baseProtein: selectedFood?.protein,
        baseCarbs: selectedFood?.carbs,
        baseFat: selectedFood?.fat,
      };

      if (editingEntry) {
        await updateFood(editingEntry.id, input);
      } else {
        await addFood(input);
        resetForm();
      }

      router.push('/');
    } finally {
      setIsSaving(false);
    }
  }

  function renderFoodResult({ item: food }: { item: FoodDefinition }) {
    const foodKey = getFoodKey(food);
    const isPinned = pinnedFoodKeys.includes(foodKey);

    return (
      <View style={styles.foodResult}>
        <Pressable
          accessibilityRole="button"
          onPress={() => openFoodDetails(food)}
          style={({ pressed }) => [styles.foodResultMain, pressed && styles.foodResultPressed]}>
          <View style={styles.foodResultHeader}>
            <Text style={styles.foodResultName}>{food.name}</Text>
            <Text style={styles.foodResultCalories}>{food.baseCalories} cal</Text>
          </View>
          <Text style={styles.foodResultMeta}>
            {food.category} · per {food.baseQuantity}
            {food.unit}
          </Text>
          <Text style={styles.foodResultMeta}>
            P {food.protein}g / C {food.carbs}g / F {food.fat}g
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => togglePinnedFood(foodKey)}
          style={({ pressed }) => [
            styles.pinButton,
            isPinned && styles.pinButtonActive,
            pressed && styles.pinButtonPressed,
          ]}>
          <Text style={[styles.pinButtonText, isPinned && styles.pinButtonTextActive]}>
            {isPinned ? 'Pinned' : 'Pin'}
          </Text>
        </Pressable>
      </View>
    );
  }

  function renderIngredientSearchResult({ item: food }: { item: FoodDefinition }) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => openIngredientDetails(food)}
        style={({ pressed }) => [styles.ingredientResult, pressed && styles.foodResultPressed]}>
        <View style={styles.foodResultHeader}>
          <Text style={styles.foodResultName}>{food.name}</Text>
          <Text style={styles.foodResultCalories}>{food.baseCalories} cal</Text>
        </View>
        <Text style={styles.foodResultMeta}>
          {food.category} · per {food.baseQuantity}
          {food.unit}
        </Text>
      </Pressable>
    );
  }

  if (activeMode === 'scan') {
    return (
      <ScanProductScreen
        onAddMyFood={() => {
          setActiveMode('find');
          openManualDetails();
        }}
        onBack={() => setActiveMode('find')}
        onPrepareMeal={() => setActiveMode('meal')}
        onLookupBarcode={handleBarcodeScanned}
      />
    );
  }

  if (activeMode === 'meal') {
    return (
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.keyboardView}>
        <Screen>
          <View style={styles.modeSwitch}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setActiveMode('find')}
              style={styles.modeButton}>
              <Text style={styles.modeButtonText}>Find food</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setActiveMode('meal')}
              style={[styles.modeButton, styles.modeButtonActive]}>
              <Text style={[styles.modeButtonText, styles.modeButtonTextActive]}>Prepare meal</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setActiveMode('scan')}
              style={styles.modeButton}>
              <Text style={styles.modeButtonText}>Scan product</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Prepare meal</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Meal name</Text>
              <TextInput
                autoCapitalize="words"
                onChangeText={setMealName}
                placeholder="Chicken rice bowl"
                placeholderTextColor="#9A9FA6"
                style={styles.input}
                value={mealName}
              />
            </View>

            <View style={styles.totalCard}>
              <Text style={styles.totalTitle}>{Math.round(mealTotals.calories)} cal</Text>
              <Text style={styles.macroSummary}>
                P {round(mealTotals.protein)}g / C {round(mealTotals.carbs)}g / F{' '}
                {round(mealTotals.fat)}g
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.resultsTitle}>Add ingredient</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Search ingredient</Text>
              <TextInput
                autoCapitalize="words"
                onChangeText={setIngredientSearch}
                placeholder="Rice, chicken, olive oil"
                placeholderTextColor="#9A9FA6"
                style={styles.input}
                value={ingredientSearch}
              />
            </View>

            {ingredientResults.length > 0 ? (
              <FlatList
                data={ingredientResults}
                keyExtractor={getFoodKey}
                keyboardShouldPersistTaps="handled"
                renderItem={renderIngredientSearchResult}
                scrollEnabled={false}
              />
            ) : null}

            {selectedIngredient ? (
              <View style={styles.ingredientEditor}>
                <Text style={styles.resultsTitle}>{selectedIngredient.name}</Text>
                {ingredientServingPresets.length > 0 ? (
                  <View style={styles.presets}>
                    {ingredientServingPresets.map((preset) => {
                      const isSelected =
                        toNumber(ingredientQuantity) === preset.quantity &&
                        ingredientUnit === preset.unit;

                      return (
                        <Pressable
                          accessibilityRole="button"
                          key={`${preset.label}-${preset.quantity}-${preset.unit}`}
                          onPress={() => handleIngredientPreset(preset)}
                          style={({ pressed }) => [
                            styles.presetButton,
                            isSelected && styles.presetButtonSelected,
                            pressed && styles.buttonPressed,
                          ]}>
                          <Text
                            style={[
                              styles.presetButtonText,
                              isSelected && styles.presetButtonTextSelected,
                            ]}>
                            {preset.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                <View style={styles.rowFields}>
                  <View style={[styles.field, styles.flexField]}>
                    <Text style={styles.label}>Quantity</Text>
                    <TextInput
                      inputMode="decimal"
                      keyboardType="decimal-pad"
                      onChangeText={handleIngredientQuantityChange}
                      placeholder="100"
                      placeholderTextColor="#9A9FA6"
                      style={styles.input}
                      value={ingredientQuantity}
                    />
                  </View>
                  <View style={[styles.field, styles.unitField]}>
                    <Text style={styles.label}>Unit</Text>
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={setIngredientUnit}
                      placeholder="g"
                      placeholderTextColor="#9A9FA6"
                      style={styles.input}
                      value={ingredientUnit}
                    />
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Calories</Text>
                  <TextInput
                    inputMode="numeric"
                    keyboardType="number-pad"
                    onChangeText={handleIngredientCaloriesChange}
                    placeholder="250"
                    placeholderTextColor="#9A9FA6"
                    style={styles.input}
                    value={ingredientCalories}
                  />
                </View>

                <Text style={styles.macroSummary}>
                  P {round(toNumber(ingredientProtein))}g / C {round(toNumber(ingredientCarbs))}g / F{' '}
                  {round(toNumber(ingredientFat))}g
                </Text>

                <Pressable
                  accessibilityRole="button"
                  onPress={handleAddIngredient}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
                  <Text style={styles.secondaryButtonText}>
                    {editingIngredientIndex === null ? 'Add ingredient' : 'Update ingredient'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.resultsTitle}>Ingredients</Text>
            {mealIngredients.length === 0 ? (
              <Text style={styles.foodResultMeta}>No ingredients yet.</Text>
            ) : (
              mealIngredients.map((ingredient, index) => (
                <View key={`${ingredient.foodId}-${index}`} style={styles.ingredientRow}>
                  <View style={styles.flexField}>
                    <Text style={styles.foodResultName}>
                      {ingredient.name} — {ingredient.quantity}
                      {ingredient.unit} — {ingredient.calories} cal
                    </Text>
                    <Text style={styles.foodResultMeta}>
                      P {ingredient.protein}g / C {ingredient.carbs}g / F {ingredient.fat}g
                    </Text>
                  </View>
                  <View style={styles.ingredientActions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleEditIngredient(ingredient, index)}
                      style={styles.smallAction}>
                      <Text style={styles.smallActionText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleRemoveIngredient(index)}
                      style={styles.smallAction}>
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}

            <Pressable
              accessibilityRole="button"
              onPress={handleSaveMealTemplate}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
              <Text style={styles.secondaryButtonText}>Save meal</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={handleAddMealToToday}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
              <Text style={styles.buttonText}>Add meal to today</Text>
            </Pressable>
          </View>
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  if (detailsOpen) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.keyboardView}>
        <Screen>
          <View style={styles.detailsHeader}>
            <Pressable
              accessibilityRole="button"
              onPress={closeDetails}
              style={({ pressed }) => [styles.closeButton, pressed && styles.buttonPressed]}>
              <Text style={styles.closeButtonText}>{isEditing ? 'Cancel' : 'Back'}</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>{manualMode ? 'Add my food' : name}</Text>
            {!manualMode && selectedFood ? (
              <Text style={styles.subtitle}>
                {selectedFood.baseCalories} cal · base serving {selectedFood.baseQuantity}
                {selectedFood.unit}
              </Text>
            ) : (
              <Text style={styles.subtitle}>Create a reusable food and save it locally.</Text>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Food name</Text>
              <TextInput
                autoCapitalize="words"
                onChangeText={setName}
                placeholder="Food name"
                placeholderTextColor="#9A9FA6"
                style={styles.input}
                value={name}
              />
            </View>

            {servingPresets.length > 0 ? (
              <View style={styles.field}>
                <Text style={styles.label}>Servings</Text>
                <View style={styles.presets}>
                  {servingPresets.map((preset) => {
                    const isSelected = toNumber(quantity) === preset.quantity && unit === preset.unit;

                    return (
                      <Pressable
                        accessibilityRole="button"
                        key={`${preset.label}-${preset.quantity}-${preset.unit}`}
                        onPress={() => handleServingPreset(preset)}
                        style={({ pressed }) => [
                          styles.presetButton,
                          isSelected && styles.presetButtonSelected,
                          pressed && styles.buttonPressed,
                        ]}>
                        <Text
                          style={[
                            styles.presetButtonText,
                            isSelected && styles.presetButtonTextSelected,
                          ]}>
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={styles.rowFields}>
              <View style={[styles.field, styles.flexField]}>
                <Text style={styles.label}>{manualMode ? 'Base quantity' : 'Quantity'}</Text>
                <TextInput
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  onChangeText={handleQuantityChange}
                  placeholder="100"
                  placeholderTextColor="#9A9FA6"
                  style={styles.input}
                  value={quantity}
                />
              </View>
              <View style={[styles.field, styles.unitField]}>
                <Text style={styles.label}>Unit</Text>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setUnit}
                  placeholder="g"
                  placeholderTextColor="#9A9FA6"
                  style={styles.input}
                  value={unit}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{manualMode ? 'Base calories' : 'Calories'}</Text>
              <TextInput
                inputMode="numeric"
                keyboardType="number-pad"
                onChangeText={handleCaloriesChange}
                placeholder="250"
                placeholderTextColor="#9A9FA6"
                style={styles.input}
                value={calories}
              />
            </View>

            <View style={styles.macroGrid}>
              <View style={styles.macroField}>
                <Text style={styles.label}>Protein</Text>
                <TextInput
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  onChangeText={setProtein}
                  placeholder="0"
                  placeholderTextColor="#9A9FA6"
                  style={styles.input}
                  value={protein}
                />
              </View>
              <View style={styles.macroField}>
                <Text style={styles.label}>Carbs</Text>
                <TextInput
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  onChangeText={setCarbs}
                  placeholder="0"
                  placeholderTextColor="#9A9FA6"
                  style={styles.input}
                  value={carbs}
                />
              </View>
              <View style={styles.macroField}>
                <Text style={styles.label}>Fat</Text>
                <TextInput
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  onChangeText={setFat}
                  placeholder="0"
                  placeholderTextColor="#9A9FA6"
                  style={styles.input}
                  value={fat}
                />
              </View>
            </View>

            <Text style={styles.macroSummary}>
              P {round(toNumber(protein))}g / C {round(toNumber(carbs))}g / F{' '}
              {round(toNumber(fat))}g
            </Text>

            {manualMode ? (
              <Pressable
                accessibilityRole="button"
                disabled={!hasValidCustomFood}
                onPress={handleSaveCustomFood}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  !hasValidCustomFood && styles.buttonDisabled,
                  pressed && hasValidCustomFood ? styles.buttonPressed : null,
                ]}>
                <Text style={styles.secondaryButtonText}>Save to My foods</Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={!hasValidFood || isSaving}
              onPress={handleSave}
              style={({ pressed }) => [
                styles.button,
                (!hasValidFood || isSaving) && styles.buttonDisabled,
                pressed && hasValidFood ? styles.buttonPressed : null,
              ]}>
              <Text style={styles.buttonText}>
                {isSaving ? 'Saving...' : isEditing ? 'Save changes' : 'Save food'}
              </Text>
            </Pressable>
          </View>
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={styles.keyboardView}>
      <Screen scroll={false}>
        <FlatList
          contentContainerStyle={styles.listContent}
          data={visibleFoods}
          keyExtractor={getFoodKey}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          renderItem={renderFoodResult}
          ListHeaderComponent={
            <View style={styles.searchHeader}>
              <View style={styles.modeSwitch}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setActiveMode('find')}
                  style={[styles.modeButton, styles.modeButtonActive]}>
                  <Text style={[styles.modeButtonText, styles.modeButtonTextActive]}>Find food</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setActiveMode('meal')}
                  style={styles.modeButton}>
                  <Text style={styles.modeButtonText}>Prepare meal</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setActiveMode('scan')}
                  style={styles.modeButton}>
                  <Text style={styles.modeButtonText}>Scan product</Text>
                </Pressable>
              </View>
              <Text style={styles.title}>Find food</Text>
              <View style={styles.field}>
                <Text style={styles.label}>Search foods</Text>
                <TextInput
                  autoCapitalize="words"
                  onChangeText={setSearch}
                  placeholder="Rice, tuna, yogurt"
                  placeholderTextColor="#9A9FA6"
                  style={styles.input}
                  value={search}
                />
              </View>
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
                        styles.categoryButton,
                        isSelected && styles.categoryButtonSelected,
                        pressed && styles.buttonPressed,
                      ]}>
                      <Text
                        style={[
                          styles.categoryButtonText,
                          isSelected && styles.categoryButtonTextSelected,
                        ]}>
                        {category}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={styles.resultsTitle}>{resultsTitle}</Text>
            </View>
          }
          ListFooterComponent={
            isSearching ? (
              <View style={styles.manualPrompt}>
                <Text style={styles.manualPromptText}>
                  {visibleFoods.length === 0 ? "Can't find this food?" : "Can't find your food?"}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={openManualDetails}
                  style={({ pressed }) => [styles.manualButton, pressed && styles.buttonPressed]}>
                  <Text style={styles.manualButtonText}>Add my food</Text>
                </Pressable>
              </View>
            ) : null
          }
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

type ScanProductScreenProps = {
  onAddMyFood: () => void;
  onBack: () => void;
  onPrepareMeal: () => void;
  onLookupBarcode: (barcode: string) => Promise<boolean>;
};

function ScanProductScreen({
  onAddMyFood,
  onBack,
  onLookupBarcode,
  onPrepareMeal,
}: ScanProductScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedValue, setScannedValue] = useState<string | null>(null);
  const [notFoundValue, setNotFoundValue] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  async function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (scannedValue) {
      return;
    }

    setScannedValue(result.data);
    setIsLookingUp(true);
    const found = await onLookupBarcode(result.data);
    setIsLookingUp(false);

    if (!found) {
      setNotFoundValue(result.data);
    }
  }

  function handleScanAgain() {
    setScannedValue(null);
    setNotFoundValue(null);
    setIsLookingUp(false);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={styles.keyboardView}>
      <Screen>
        <View style={styles.modeSwitch}>
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.modeButton}>
            <Text style={styles.modeButtonText}>Find food</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onPrepareMeal} style={styles.modeButton}>
            <Text style={styles.modeButtonText}>Prepare meal</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => undefined}
            style={[styles.modeButton, styles.modeButtonActive]}>
            <Text style={[styles.modeButtonText, styles.modeButtonTextActive]}>Scan product</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Scan product</Text>
          <Text style={styles.subtitle}>Scan a barcode and match it against the local food database.</Text>

          {!permission ? (
            <Text style={styles.foodResultMeta}>Checking camera permission...</Text>
          ) : !permission.granted ? (
            <View style={styles.manualPrompt}>
              <Text style={styles.manualPromptText}>Camera permission is required.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={requestPermission}
                style={({ pressed }) => [styles.manualButton, pressed && styles.buttonPressed]}>
                <Text style={styles.manualButtonText}>Allow camera</Text>
              </Pressable>
            </View>
          ) : (
            <CameraView
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
              }}
              onBarcodeScanned={scannedValue ? undefined : handleBarcodeScanned}
              style={styles.camera}
            />
          )}

          {isLookingUp ? (
            <View style={styles.manualPrompt}>
              <Text style={styles.manualPromptText}>Looking up product...</Text>
              <Text style={styles.foodResultMeta}>Checking local cache and Open Food Facts.</Text>
            </View>
          ) : null}

          {notFoundValue ? (
            <View style={styles.notFoundBox}>
              <Text style={styles.manualPromptText}>Product not found</Text>
              <Text style={styles.foodResultMeta}>Barcode: {notFoundValue}</Text>
              <View style={styles.rowFields}>
                <Pressable
                  accessibilityRole="button"
                  onPress={onAddMyFood}
                  style={({ pressed }) => [styles.secondaryButton, styles.flexField, pressed && styles.buttonPressed]}>
                  <Text style={styles.secondaryButtonText}>Add my food</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleScanAgain}
                  style={({ pressed }) => [styles.manualButton, styles.flexField, pressed && styles.buttonPressed]}>
                  <Text style={styles.manualButtonText}>Scan again</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  listContent: {
    gap: 10,
    paddingBottom: 140,
  },
  searchHeader: {
    gap: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 20,
    shadowColor: '#1E1F24',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  modeSwitch: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#F1F3EF',
    paddingHorizontal: 12,
  },
  modeButtonActive: {
    backgroundColor: '#2563eb',
  },
  modeButtonText: {
    color: '#6B6F76',
    fontSize: 14,
    fontWeight: '900',
  },
  modeButtonTextActive: {
    color: '#FFFFFF',
  },
  card: {
    gap: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 20,
    shadowColor: '#1E1F24',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  title: {
    color: '#1E1F24',
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: -10,
    color: '#6B6F76',
    fontSize: 15,
    lineHeight: 22,
  },
  field: {
    gap: 8,
  },
  label: {
    color: '#3E4249',
    fontSize: 14,
    fontWeight: '800',
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#DADDD4',
    borderRadius: 8,
    backgroundColor: '#FAFAF7',
    color: '#1E1F24',
    paddingHorizontal: 14,
    fontSize: 16,
  },
  categoryRow: {
    gap: 8,
    paddingRight: 20,
  },
  categoryButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#F1F3EF',
    paddingHorizontal: 12,
  },
  categoryButtonSelected: {
    backgroundColor: '#2563eb',
  },
  categoryButtonText: {
    color: '#6B6F76',
    fontSize: 13,
    fontWeight: '900',
  },
  categoryButtonTextSelected: {
    color: '#FFFFFF',
  },
  resultsTitle: {
    color: '#1E1F24',
    fontSize: 16,
    fontWeight: '900',
  },
  foodResult: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    borderWidth: 1,
    borderColor: '#DADDD4',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  foodResultMain: {
    flex: 1,
    gap: 5,
    justifyContent: 'center',
    padding: 12,
  },
  foodResultPressed: {
    opacity: 0.8,
  },
  foodResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  foodResultName: {
    flex: 1,
    color: '#1E1F24',
    fontSize: 16,
    fontWeight: '900',
  },
  foodResultCalories: {
    color: '#2E7D57',
    fontSize: 15,
    fontWeight: '900',
  },
  foodResultMeta: {
    color: '#6B6F76',
    fontSize: 13,
    lineHeight: 18,
  },
  pinButton: {
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#DADDD4',
    backgroundColor: '#F1F3EF',
    paddingHorizontal: 8,
  },
  pinButtonActive: {
    backgroundColor: '#EFF6FF',
  },
  pinButtonPressed: {
    opacity: 0.78,
  },
  pinButtonText: {
    color: '#6B6F76',
    fontSize: 12,
    fontWeight: '900',
  },
  pinButtonTextActive: {
    color: '#2563eb',
  },
  manualPrompt: {
    gap: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  manualPromptText: {
    color: '#1E1F24',
    fontSize: 15,
    fontWeight: '900',
  },
  manualButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  manualButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  totalCard: {
    gap: 4,
    borderRadius: 8,
    backgroundColor: '#F7F7F2',
    padding: 14,
  },
  totalTitle: {
    color: '#1E1F24',
    fontSize: 26,
    fontWeight: '900',
  },
  camera: {
    height: 360,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#1E1F24',
  },
  notFoundBox: {
    gap: 12,
    borderRadius: 8,
    backgroundColor: '#F8EDE9',
    padding: 14,
  },
  ingredientResult: {
    gap: 5,
    borderWidth: 1,
    borderColor: '#DADDD4',
    borderRadius: 8,
    backgroundColor: '#FAFAF7',
    marginTop: 10,
    padding: 12,
  },
  ingredientEditor: {
    gap: 14,
    borderRadius: 8,
    backgroundColor: '#F7F7F2',
    padding: 12,
  },
  ingredientRow: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 8,
    backgroundColor: '#FAFAF7',
    padding: 12,
  },
  ingredientActions: {
    gap: 8,
    justifyContent: 'center',
  },
  smallAction: {
    minHeight: 32,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#F1F3EF',
    paddingHorizontal: 10,
  },
  smallActionText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '900',
  },
  removeText: {
    color: '#B95C3A',
    fontSize: 12,
    fontWeight: '900',
  },
  detailsHeader: {
    alignItems: 'flex-start',
  },
  closeButton: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
  },
  closeButtonText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '900',
  },
  rowFields: {
    flexDirection: 'row',
    gap: 12,
  },
  flexField: {
    flex: 1,
  },
  unitField: {
    width: 96,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetButton: {
    minHeight: 38,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#F1F3EF',
    paddingHorizontal: 12,
  },
  presetButtonSelected: {
    backgroundColor: '#2563eb',
  },
  presetButtonText: {
    color: '#3E4249',
    fontSize: 13,
    fontWeight: '900',
  },
  presetButtonTextSelected: {
    color: '#FFFFFF',
  },
  macroGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  macroField: {
    flex: 1,
    gap: 8,
  },
  macroSummary: {
    color: '#2E7D57',
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#1E1F24',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  button: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2E7D57',
  },
  buttonDisabled: {
    backgroundColor: '#AAB8AF',
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
});
