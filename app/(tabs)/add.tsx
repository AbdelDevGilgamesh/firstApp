import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
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
import { AddQuickActionCard } from '@/src/components/AddQuickActionCard';
import { FoodBrowseCard } from '@/src/components/FoodBrowseCard';
import { MealPhotoEstimateCard } from '@/src/components/MealPhotoEstimateCard';
import { ProductRatingCard } from '@/src/components/ProductRatingCard';
import { SearchFoodBottomSheet } from '@/src/components/SearchFoodBottomSheet';
import { useCalories } from '@/src/context/CalorieContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { useTokens } from '@/src/context/TokenContext';
import { useToast } from '@/src/context/ToastContext';
import {
  DEFAULT_FOODS,
  FoodDefinition,
  mealToFoodDefinition,
  templateToFoodDefinition,
} from '@/src/foods';
import { MealIngredient, ServingPreset } from '@/src/types';
import { create as createScannedFood } from '@/src/services/scannedFoodsDbService';
import { lookupBarcodeOnline, OnlineProductLookupProduct } from '@/src/services/productLookupService';
import {
  AiFoodEstimate,
  AiMealEstimate,
  generateFoodFromDescription,
  generateMealFromDescription,
  isAiQuotaExceededError,
  isAiTemporarilyUnavailableError,
} from '@/src/services/aiAutofillService';
import { extractNutritionTextFromImage } from '@/src/services/nutritionOcrService';
import { useAppTheme } from '@/src/theme/appTheme';
import { normalizeText, searchFoods } from '@/src/utils/foodSearch';
import {
  MealPhotoCookingFat,
  MealPhotoFoodType,
  MealPhotoPortionSize,
  MealPhotoSauce,
  estimateMealFromPhoto,
} from '@/src/utils/mealPhotoEstimate';
import { parseServingSize, scaleNutrition } from '@/src/utils/nutritionScaling';
import { ParsedNutritionFacts, parseNutritionFactsText } from '@/src/utils/nutritionFactsParser';
import { cropCameraImageToFrame } from '@/src/utils/cropCameraImageToFrame';
import { getFoodFormErrors, hasErrors, validateName } from '@/src/utils/validation';

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
const TEST_PROFILE_ID_KEY = 'testProfileId';
const LEGACY_TEST_PROFILE_ID_KEY = 'calorie-tracker.test-profile-id';
const MEAL_PHOTO_TOKEN_COST = 5;
const AI_AUTOFILL_TOKEN_COST = 1;
const DEFAULT_MEAL_LABELS = [
  'Breakfast',
  'Lunch',
  'Dinner',
  'Snack',
  'Meal 1',
  'Meal 2',
  'Meal 3',
  'Meal 4',
  'Pre-workout',
  'Post-workout',
  'Shake',
  'Before bed',
] as const;
const CUSTOM_MEAL_LABEL = 'Custom';

type AddMode = 'find' | 'meal' | 'scan' | 'mealPhoto' | 'mealAi' | 'customAi';
type NutritionFactsStep = 'idle' | 'loading' | 'manualPaste' | 'review' | 'error';
type ScanMode = 'barcode' | 'nutritionLabel';
type LayoutRect = { x: number; y: number; width: number; height: number };
type NutritionServingBasis = '100g' | '100ml' | 'serving';

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getDefaultMealLabel(date = new Date()) {
  const hour = date.getHours();

  if (hour >= 5 && hour < 11) {
    return 'Breakfast';
  }

  if (hour >= 11 && hour < 16) {
    return 'Lunch';
  }

  if (hour >= 16 && hour < 22) {
    return 'Dinner';
  }

  return 'Snack';
}

function getMealLabelState(label?: string, createdAt?: string) {
  const fallbackDate = createdAt ? new Date(createdAt) : new Date();
  const fallback = getDefaultMealLabel(Number.isFinite(fallbackDate.getTime()) ? fallbackDate : new Date());
  const normalizedLabel = label?.trim() || fallback;

  if (DEFAULT_MEAL_LABELS.includes(normalizedLabel as (typeof DEFAULT_MEAL_LABELS)[number])) {
    return { selected: normalizedLabel, custom: '' };
  }

  return { selected: CUSTOM_MEAL_LABEL, custom: normalizedLabel };
}

function parseReviewNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function isReviewNumberInRange(value: string, min: number, max: number) {
  const parsed = parseReviewNumber(value);
  return parsed !== null && parsed >= min && parsed <= max;
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

function getFoodAvatar(food: FoodDefinition) {
  const normalizedCategory = normalizeText(food.category);
  const normalizedName = normalizeText(food.name);

  if (
    normalizedCategory.includes('meat') ||
    normalizedCategory.includes('seafood') ||
    normalizedName.includes('chicken') ||
    normalizedName.includes('beef') ||
    normalizedName.includes('tuna') ||
    normalizedName.includes('salmon')
  ) {
    return '🍗';
  }

  if (
    normalizedCategory.includes('grain') ||
    normalizedName.includes('rice') ||
    normalizedName.includes('pasta') ||
    normalizedName.includes('oat')
  ) {
    return '🍚';
  }

  if (
    normalizedCategory.includes('vegetable') ||
    normalizedName.includes('salad') ||
    normalizedName.includes('lettuce')
  ) {
    return '🥗';
  }

  if (
    normalizedCategory.includes('dairy') ||
    normalizedCategory.includes('drink') ||
    normalizedName.includes('milk') ||
    normalizedName.includes('yogurt') ||
    normalizedName.includes('juice')
  ) {
    return '🥛';
  }

  return '🍽️';
}

function mapOnlineLookupProduct(product: OnlineProductLookupProduct): FoodDefinition {
  const serving = parseServingSize(product.servingSize);
  const baseQuantity = serving.quantity ?? 100;
  const unit = serving.unit ?? 'g';
  const calories = Math.round(product.calories);

  return {
    id: product.barcode,
    barcode: product.barcode,
    name: product.name,
    category: product.brand ? `Packaged food - ${product.brand}` : 'Packaged food',
    baseQuantity,
    unit,
    calories,
    baseCalories: calories,
    protein: round(product.protein),
    carbs: round(product.carbs),
    fat: round(product.fat),
    sugar: product.sugar === undefined ? undefined : round(product.sugar),
    salt: product.sodium === undefined ? undefined : round(product.sodium),
    keywords: Array.from(new Set([...toWords(product.name), ...toWords(product.brand ?? ''), product.barcode])),
    servingPresets:
      unit.toLowerCase() === 'g'
        ? [50, 100, 150, 200, 250].map((quantity) => {
            const scaled = scaleNutrition(
              {
                calories,
                protein: product.protein,
                carbs: product.carbs,
                fat: product.fat,
              },
              baseQuantity,
              quantity,
            );

            return {
              label: `${quantity}g`,
              quantity,
              unit,
              calories: scaled.calories,
              protein: scaled.protein,
              carbs: scaled.carbs,
              fat: scaled.fat,
            };
          })
        : undefined,
    source: 'barcode',
  };
}

function FieldError({ message }: { message?: string | null }) {
  if (!message) {
    return null;
  }

  return <Text style={styles.errorText}>{message}</Text>;
}

async function loadTestProfileId() {
  try {
    return (
      (await AsyncStorage.getItem(TEST_PROFILE_ID_KEY)) ??
      (await AsyncStorage.getItem(LEGACY_TEST_PROFILE_ID_KEY))
    );
  } catch (error) {
    console.warn('Failed to load testProfileId for scanned food sync.', error);
    return null;
  }
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

type ProductValidationResult = {
  isValid: boolean;
  missingFields: string[];
  reason: string;
};

type IncompleteScannedProduct = {
  barcode: string;
  name: string;
  brand?: string;
  validation: ProductValidationResult;
};

type OpenFoodFactsLookupResult =
  | { type: 'found'; food: Omit<FoodDefinition, 'source'> }
  | { type: 'incomplete'; product: IncompleteScannedProduct }
  | { type: 'not_found' }
  | { type: 'network_error'; message: string };

type BarcodeLookupStatus = 'found' | 'incomplete' | 'not_found' | 'network_error';

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

function validateOpenFoodFactsNutrition(product: OpenFoodFactsProduct): ProductValidationResult {
  const nutriments = product.nutriments ?? {};
  const calories = toOptionalNumber(nutriments['energy-kcal_100g']);
  const protein = toOptionalNumber(nutriments['proteins_100g']);
  const carbs = toOptionalNumber(nutriments['carbohydrates_100g']);
  const fat = toOptionalNumber(nutriments['fat_100g']);
  const missingFields: string[] = [];

  if (calories === null) missingFields.push('calories');
  if (protein === null) missingFields.push('protein');
  if (carbs === null) missingFields.push('carbs');
  if (fat === null) missingFields.push('fat');

  if (calories !== null && calories <= 0) {
    return {
      isValid: false,
      missingFields,
      reason: 'Calories must be greater than 0.',
    };
  }

  if (calories !== null && calories > 900) {
    return {
      isValid: false,
      missingFields,
      reason: 'Calories are outside the expected range per 100g.',
    };
  }

  if (missingFields.length > 0) {
    return {
      isValid: false,
      missingFields,
      reason: `Missing nutrition fields: ${missingFields.join(', ')}.`,
    };
  }

  return {
    isValid: true,
    missingFields: [],
    reason: 'Complete calories and macro data found.',
  };
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
  const sugar = toOptionalNumber(nutriments['sugars_100g']);
  const salt = toOptionalNumber(nutriments['salt_100g']);
  const saturatedFat = toOptionalNumber(nutriments['saturated-fat_100g']);

  if (!validateOpenFoodFactsNutrition(product).isValid || calories === null || protein === null || carbs === null || fat === null) {
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
    sugar: sugar === null ? undefined : round(sugar),
    salt: salt === null ? undefined : round(salt),
    saturatedFat: saturatedFat === null ? undefined : round(saturatedFat),
    keywords: Array.from(
      new Set([...toWords(name), ...toWords(category), ...toWords(product.brands ?? ''), barcode]),
    ),
    servingPresets: [
      {
        label: '100g',
        quantity: 100,
        unit: 'g',
        calories: Math.round(calories),
        protein: round(protein),
        carbs: round(carbs),
        fat: round(fat),
      },
      {
        label: '150g',
        quantity: 150,
        unit: 'g',
        calories: Math.round(calories * 1.5),
        protein: round(protein * 1.5),
        carbs: round(carbs * 1.5),
        fat: round(fat * 1.5),
      },
      {
        label: '200g',
        quantity: 200,
        unit: 'g',
        calories: Math.round(calories * 2),
        protein: round(protein * 2),
        carbs: round(carbs * 2),
        fat: round(fat * 2),
      },
    ],
  };
}

export default function AddFoodScreen() {
  const theme = useAppTheme();
  const { t } = useLanguage();
  const { showToast } = useToast();
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
  const { canSpendTokens, spendTokens, tokenBalance } = useTokens();
  const surfaceStyle = {
    backgroundColor: theme.card,
    borderColor: theme.cardBorder,
    borderWidth: 1,
    shadowColor: theme.shadow,
  };
  const softSurfaceStyle = {
    backgroundColor: theme.cardAlt,
    borderColor: theme.cardBorder,
  };
  const inputStyle = {
    backgroundColor: theme.inputBackground,
    borderColor: theme.cardBorder,
    color: theme.text,
  };
  const chipStyle = {
    backgroundColor: theme.chipBackground,
  };
  const textStyle = { color: theme.text };
  const mutedTextStyle = { color: theme.mutedText };
  const params = useLocalSearchParams<{ entryId?: string; mode?: string }>();
  const editingEntryId = typeof params.entryId === 'string' ? params.entryId : undefined;
  const requestedMode =
    params.mode === 'meal' || params.mode === 'scan' || params.mode === 'find' || params.mode === 'mealPhoto'
      ? params.mode
      : undefined;
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
  const [searchSheetVisible, setSearchSheetVisible] = useState(false);
  const [activeMode, setActiveMode] = useState<AddMode>('find');
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
  const [originalAiBase, setOriginalAiBase] = useState<{
    quantity: number;
    unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null>(null);
  const [mealLabel, setMealLabel] = useState(getDefaultMealLabel());
  const [customMealLabel, setCustomMealLabel] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [mealName, setMealName] = useState('');
  const [committedMealName, setCommittedMealName] = useState('');
  const [savedMealId, setSavedMealId] = useState<string | null>(null);
  const [isMealNameEditing, setIsMealNameEditing] = useState(true);
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
  const [pendingScannedFood, setPendingScannedFood] = useState<FoodDefinition | null>(null);
  const [incompleteScannedProduct, setIncompleteScannedProduct] = useState<IncompleteScannedProduct | null>(null);
  const [networkErrorBarcode, setNetworkErrorBarcode] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState<string | null>(null);
  const [mealPhotoUri, setMealPhotoUri] = useState<string | null>(null);
  const [mealPhotoPortion, setMealPhotoPortion] = useState<MealPhotoPortionSize>('medium');
  const [mealPhotoCookingFat, setMealPhotoCookingFat] = useState<MealPhotoCookingFat>('none');
  const [mealPhotoSauce, setMealPhotoSauce] = useState<MealPhotoSauce>('none');
  const [mealPhotoFoodType, setMealPhotoFoodType] = useState<MealPhotoFoodType>('mixed');
  const [mealPhotoEstimateVisible, setMealPhotoEstimateVisible] = useState(false);
  const [nutritionFactsBarcode, setNutritionFactsBarcode] = useState<string | null>(null);
  const [nutritionFactsImageUri, setNutritionFactsImageUri] = useState<string | null>(null);
  const [nutritionFactsText, setNutritionFactsText] = useState('');
  const [nutritionFactsOcrMessage, setNutritionFactsOcrMessage] = useState<string | null>(null);
  const [nutritionFactsStep, setNutritionFactsStep] = useState<NutritionFactsStep>('idle');
  const [nutritionFactsError, setNutritionFactsError] = useState<string | null>(null);
  const [isExtractingNutritionText, setIsExtractingNutritionText] = useState(false);
  const [isSavingNutritionProduct, setIsSavingNutritionProduct] = useState(false);
  const [parsedNutritionFacts, setParsedNutritionFacts] = useState<ParsedNutritionFacts | null>(null);
  const [nutritionProductName, setNutritionProductName] = useState('Scanned product');
  const [nutritionCalories, setNutritionCalories] = useState('');
  const [nutritionProtein, setNutritionProtein] = useState('');
  const [nutritionCarbs, setNutritionCarbs] = useState('');
  const [nutritionFat, setNutritionFat] = useState('');
  const [nutritionSugar, setNutritionSugar] = useState('');
  const [nutritionSalt, setNutritionSalt] = useState('');
  const [nutritionSaturatedFat, setNutritionSaturatedFat] = useState('');
  const [nutritionServingBasis, setNutritionServingBasis] = useState<NutritionServingBasis>('100g');
  const [aiDescription, setAiDescription] = useState('');
  const [aiMealResult, setAiMealResult] = useState<AiMealEstimate | null>(null);
  const [aiFoodResult, setAiFoodResult] = useState<AiFoodEstimate | null>(null);
  const [isGeneratingAiAutofill, setIsGeneratingAiAutofill] = useState(false);
  const mealNameInputRef = useRef<TextInput>(null);
  const activeModeRef = useRef(activeMode);
  const detailsOpenRef = useRef(detailsOpen);

  useEffect(() => {
    activeModeRef.current = activeMode;
    detailsOpenRef.current = detailsOpen;
  }, [activeMode, detailsOpen]);

  useFocusEffect(
    useCallback(() => {
      if (!editingEntryId) {
        resetTransientAddState();
        setActiveMode(requestedMode ?? 'find');
      }

      return undefined;
    }, [editingEntryId, requestedMode]),
  );

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
      const nextMealLabel = getMealLabelState(editingEntry.mealLabel, editingEntry.createdAt);
      setMealLabel(nextMealLabel.selected);
      setCustomMealLabel(nextMealLabel.custom);
      setOriginalAiBase(null);
    } else if (!editingEntryId) {
      resetForm();
    }
  }, [editingEntry, editingEntryId]);

  useEffect(() => {
    if (!editingEntryId && requestedMode) {
      setActiveMode(requestedMode);
    }
  }, [editingEntryId, requestedMode]);

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
      ? 'Favorites'
      : entries.length > 0
        ? 'Recently logged'
        : 'Suggested for you';
  const foodErrors = useMemo(
    () => getFoodFormErrors({ name, quantity, unit, calories, protein, carbs, fat }),
    [calories, carbs, fat, name, protein, quantity, unit],
  );
  const hasValidFood = !hasErrors(foodErrors);
  const hasValidCustomFood = hasValidFood;
  const ingredientErrors = useMemo(
    () =>
      getFoodFormErrors({
        name: selectedIngredient?.name ?? '',
        quantity: ingredientQuantity,
        unit: ingredientUnit,
        calories: ingredientCalories,
        protein: ingredientProtein,
        carbs: ingredientCarbs,
        fat: ingredientFat,
      }),
    [
      ingredientCalories,
      ingredientCarbs,
      ingredientFat,
      ingredientProtein,
      ingredientQuantity,
      ingredientUnit,
      selectedIngredient?.name,
    ],
  );
  const hasValidIngredient = Boolean(selectedIngredient) && !hasErrors(ingredientErrors);
  const normalizedMealName = normalizeText(mealName);
  const duplicateMeal = useMemo(
    () =>
      normalizedMealName
        ? mealTemplates.find(
            (template) =>
              normalizeText(template.name) === normalizedMealName &&
              template.id !== savedMealId &&
              template.supabaseId !== savedMealId,
          )
        : undefined,
    [mealTemplates, normalizedMealName, savedMealId],
  );
  const duplicateMealNameError = duplicateMeal
    ? 'A meal with this name already exists.'
    : null;
  const mealNameError = validateName(mealName, 'Meal name') ?? duplicateMealNameError;
  const hasValidMeal = !mealNameError && mealIngredients.length > 0;
  const isEditing = Boolean(editingEntry);
  const effectiveMealLabel = useMemo(
    () =>
      mealLabel === CUSTOM_MEAL_LABEL
        ? customMealLabel.trim() || getDefaultMealLabel()
        : mealLabel,
    [customMealLabel, mealLabel],
  );
  const servingPresets = useMemo(() => {
    if (selectedFood?.servingPresets?.length) {
      return selectedFood.servingPresets;
    }

    if (!selectedFood && !unit.trim()) {
      return [];
    }

    const activeUnit = unit.trim();
    const baseQuantity = toNumber(quantity);
    const gramValues = [50, 100, 150, 200, 250];
    const values =
      activeUnit.toLowerCase() === 'g'
        ? Array.from(
            new Set([
              ...gramValues,
              ...(manualMode && Number.isFinite(baseQuantity) && baseQuantity > 0 ? [round(baseQuantity)] : []),
            ]),
          ).sort((a, b) => a - b)
        : Array.from(
            new Set([
              1,
              2,
              3,
              ...(manualMode && Number.isFinite(baseQuantity) && baseQuantity > 0 ? [round(baseQuantity)] : []),
            ]),
          ).sort((a, b) => a - b);

    return activeUnit.toLowerCase() === 'g'
      ? values.map((value) => ({
          label: `${value}g`,
          quantity: value,
          unit: activeUnit,
        }))
      : values.map((value) => ({ label: String(value), quantity: value, unit: activeUnit }));
  }, [manualMode, quantity, selectedFood, unit]);
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
    const nextMealLabel = getMealLabelState();
    setDetailsOpen(false);
    setManualMode(false);
    setSelectedFood(null);
    setManualBarcode(null);
    setName('');
    setQuantity('');
    setUnit('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setOriginalAiBase(null);
    setMealLabel(nextMealLabel.selected);
    setCustomMealLabel(nextMealLabel.custom);
  }

  function resetTransientAddState() {
    resetForm();
    setPendingScannedFood(null);
    setIncompleteScannedProduct(null);
    setNetworkErrorBarcode(null);
    resetMealPhotoFlow();
  }

  function openFoodDetails(food: FoodDefinition) {
    Keyboard.dismiss();
    setSearchSheetVisible(false);
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
    setOriginalAiBase(null);
    const nextMealLabel = getMealLabelState();
    setMealLabel(nextMealLabel.selected);
    setCustomMealLabel(nextMealLabel.custom);
  }

  function closeSearchSheet({ clearSearch = false }: { clearSearch?: boolean } = {}) {
    Keyboard.dismiss();
    setSearchSheetVisible(false);

    if (clearSearch) {
      setSearch('');
    }
  }

  function handleSelectFoodFromSearch(food: FoodDefinition) {
    closeSearchSheet();
    openFoodDetails(food);
  }

  function resetAiAutofill() {
    setAiDescription('');
    setAiMealResult(null);
    setAiFoodResult(null);
    setIsGeneratingAiAutofill(false);
  }

  function openMealAiFlow() {
    Keyboard.dismiss();
    resetAiAutofill();
    setActiveMode('mealAi');
  }

  function openCustomAiFlow() {
    Keyboard.dismiss();
    resetAiAutofill();
    setActiveMode('customAi');
  }

  function openMealBuilderManually() {
    resetAiAutofill();
    setActiveMode('meal');
  }

  function openCustomFoodManually() {
    resetAiAutofill();
    openManualDetails();
  }

  function openManualDetails(prefill?: { barcode?: string; name?: string }) {
    setSelectedFood(null);
    setDetailsOpen(true);
    setManualMode(true);
    setManualBarcode(prefill?.barcode ?? null);
    setName(prefill?.name ?? search.trim());
    setQuantity(prefill?.barcode ? '100' : '');
    setUnit('g');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setOriginalAiBase(null);
    const nextMealLabel = getMealLabelState();
    setMealLabel(nextMealLabel.selected);
    setCustomMealLabel(nextMealLabel.custom);
  }

  function applyAiMealEstimate(estimate: AiMealEstimate) {
    const nextIngredients: MealIngredient[] = estimate.ingredients.map((ingredient, index) => ({
      foodId: `ai:${normalizeText(ingredient.name)}:${index}`,
      name: ingredient.name,
      quantity: round(ingredient.quantityValue),
      unit: ingredient.unit,
      calories: Math.round(ingredient.calories),
      protein: round(ingredient.protein),
      carbs: round(ingredient.carbs),
      fat: round(ingredient.fat),
      baseQuantity: round(ingredient.quantityValue),
      baseCalories: Math.round(ingredient.calories),
      baseProtein: round(ingredient.protein),
      baseCarbs: round(ingredient.carbs),
      baseFat: round(ingredient.fat),
    }));

    setMealName(estimate.mealName);
    setCommittedMealName(estimate.mealName);
    setIsMealNameEditing(false);
    setMealIngredients(nextIngredients);
    resetIngredientForm();
    resetAiAutofill();
    setActiveMode('meal');
  }

  function applyAiFoodEstimate(estimate: AiFoodEstimate) {
    const parsedServing = parseServingSize(estimate.servingSize);
    const quantityText = parsedServing.quantity === null ? '1' : String(parsedServing.quantity);
    const unitText = parsedServing.unit ?? 'serving';
    const nextMealLabel = getMealLabelState();

    setSelectedFood(null);
    setDetailsOpen(true);
    setManualMode(true);
    setManualBarcode(null);
    setName(estimate.name);
    setQuantity(quantityText);
    setUnit(unitText);
    setCalories(String(Math.round(estimate.calories)));
    setProtein(String(round(estimate.protein)));
    setCarbs(String(round(estimate.carbs)));
    setFat(String(round(estimate.fat)));
    setOriginalAiBase({
      quantity: Number(quantityText),
      unit: unitText,
      calories: Math.round(estimate.calories),
      protein: round(estimate.protein),
      carbs: round(estimate.carbs),
      fat: round(estimate.fat),
    });
    setMealLabel(nextMealLabel.selected);
    setCustomMealLabel(nextMealLabel.custom);
    resetAiAutofill();
    setActiveMode('find');
  }

  function getAiProviderLabel(result?: AiMealEstimate | AiFoodEstimate | null) {
    if (!result) {
      return null;
    }

    if (result.isDemo) {
      return 'Demo estimate - for testing only';
      return 'Demo estimate — for testing only';
    }

    if (!__DEV__) {
      return null;
    }

    const providerLabel =
      result.provider === 'gemini'
        ? 'Gemini'
        : result.provider === 'openrouter'
          ? 'OpenRouter'
          : result.provider === 'groq'
            ? 'Groq'
            : null;

    return providerLabel ? `AI estimate · ${providerLabel}` : 'AI estimate';
  }

  async function handleGenerateAiMeal() {
    if (!aiDescription.trim() || isGeneratingAiAutofill || !canSpendTokens(AI_AUTOFILL_TOKEN_COST)) {
      return;
    }

    setIsGeneratingAiAutofill(true);

    try {
      const estimate = await generateMealFromDescription(aiDescription.trim());

      if (!estimate.ingredients.length) {
        throw new Error('AI meal estimate returned no ingredients.');
      }

      console.log('[AI Autofill] Provider used:', estimate.provider, estimate.model);

      const didSpend = estimate.isDemo
        ? true
        : await spendTokens(AI_AUTOFILL_TOKEN_COST, 'ai_meal_autofill');

      if (!didSpend) {
        showToast({ title: t('ai.notEnoughTokens'), type: 'warning' });
        return;
      }

      setAiMealResult(estimate);
    } catch (error) {
      console.error('AI meal autofill failed', error);
      if (isAiQuotaExceededError(error)) {
        showToast({
          title: t('ai.limitReached'),
          message: t('ai.limitReachedMessage'),
          type: 'warning',
        });
      } else if (isAiTemporarilyUnavailableError(error)) {
        showToast({
          title: t('ai.busy'),
          message: t('ai.busyMessage'),
          type: 'warning',
        });
      } else {
        showToast({ title: 'Could not create estimate', type: 'error' });
      }
    } finally {
      setIsGeneratingAiAutofill(false);
    }
  }

  async function handleGenerateAiFood() {
    if (!aiDescription.trim() || isGeneratingAiAutofill || !canSpendTokens(AI_AUTOFILL_TOKEN_COST)) {
      return;
    }

    setIsGeneratingAiAutofill(true);

    try {
      const estimate = await generateFoodFromDescription(aiDescription.trim());

      if (!estimate.name.trim() || estimate.calories < 0) {
        throw new Error('AI food estimate was not usable.');
      }

      console.log('[AI Autofill] Provider used:', estimate.provider, estimate.model);

      const didSpend = estimate.isDemo
        ? true
        : await spendTokens(AI_AUTOFILL_TOKEN_COST, 'ai_food_autofill');

      if (!didSpend) {
        showToast({ title: t('ai.notEnoughTokens'), type: 'warning' });
        return;
      }

      setAiFoodResult(estimate);
    } catch (error) {
      console.error('AI food autofill failed', error);
      if (isAiQuotaExceededError(error)) {
        showToast({
          title: t('ai.limitReached'),
          message: t('ai.limitReachedMessage'),
          type: 'warning',
        });
      } else if (isAiTemporarilyUnavailableError(error)) {
        showToast({
          title: t('ai.busy'),
          message: t('ai.busyMessage'),
          type: 'warning',
        });
      } else {
        showToast({ title: 'Could not create estimate', type: 'error' });
      }
    } finally {
      setIsGeneratingAiAutofill(false);
    }
  }

  function renderMealLabelSelector() {
    return (
      <View style={styles.field}>
        <Text style={[styles.label, textStyle]}>{t('add.meal')}</Text>
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mealLabelChips}>
          {[...DEFAULT_MEAL_LABELS, CUSTOM_MEAL_LABEL].map((label) => {
            const isSelected = mealLabel === label;

            return (
              <Pressable
                accessibilityRole="button"
                key={label}
                onPress={() => setMealLabel(label)}
                style={({ pressed }) => [
                  styles.mealLabelChip,
                  {
                    backgroundColor: isSelected ? theme.primary : theme.chipBackground,
                    borderColor: isSelected ? theme.primary : theme.cardBorder,
                  },
                  pressed && styles.buttonPressed,
                ]}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.mealLabelChipText,
                    { color: isSelected ? '#FFFFFF' : theme.text },
                  ]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {mealLabel === CUSTOM_MEAL_LABEL ? (
          <TextInput
            autoCapitalize="words"
            onChangeText={setCustomMealLabel}
            placeholder={t('add.customMealLabel')}
            placeholderTextColor="#9A9FA6"
            style={[styles.input, inputStyle]}
            value={customMealLabel}
          />
        ) : null}
      </View>
    );
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

      return food.keywords.some((keyword) => {
        const normalizedKeyword = normalizeText(keyword);
        return normalizedKeyword === normalizedValue || normalizedKeyword.includes(normalizedValue);
      });
    });
  }

  async function fetchOpenFoodFactsFood(barcode: string): Promise<OpenFoodFactsLookupResult> {
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
        console.warn('Open Food Facts lookup failed.', { barcode, status: response.status });
        return { type: 'network_error', message: `Open Food Facts returned ${response.status}.` };
      }

      const data = (await response.json()) as OpenFoodFactsProductResponse;
      console.log('Open Food Facts status', { barcode, status: data.status });

      if (data.status !== 1 || !data.product) {
        return { type: 'not_found' };
      }

      const name = (data.product.product_name || data.product.generic_name || '').trim();

      if (!name) {
        console.warn('Open Food Facts validation failed.', {
          barcode,
          reason: 'Product has no usable name.',
        });
        return {
          type: 'incomplete',
          product: {
            barcode,
            name: 'Scanned product',
            brand: data.product.brands?.trim() || undefined,
            validation: {
              isValid: false,
              missingFields: ['name'],
              reason: 'Product exists, but the name or nutrition data is incomplete.',
            },
          },
        };
      }

      const validation = validateOpenFoodFactsNutrition(data.product);
      const mappedFood = mapOpenFoodFactsProduct(barcode, data.product);

      if (!validation.isValid || !mappedFood) {
        console.warn('Open Food Facts validation failed.', {
          barcode,
          missingFields: validation.missingFields,
          reason: validation.reason,
        });
        return {
          type: 'incomplete',
          product: {
            barcode,
            name,
            brand: data.product.brands?.trim() || undefined,
            validation,
          },
        };
      }

      return { type: 'found', food: mappedFood };
    } catch (error) {
      console.warn('Open Food Facts lookup failed.', { barcode, error });
      return { type: 'network_error', message: 'Network request failed.' };
    }
  }

  async function saveScannedFoodToSupabase(scannedBarcode: string, product: FoodDefinition) {
    const testProfileId = await loadTestProfileId();

    if (!testProfileId) {
      return;
    }

    const calories = Math.round(product.calories);
    const baseCalories = Math.round(product.baseCalories ?? product.calories);
    const mappedScannedFood = {
      user_id: testProfileId,
      barcode: product.barcode ?? scannedBarcode,
      food_key: product.id ?? scannedBarcode,
      name: product.name,
      category: product.category ?? 'Scanned food',
      base_quantity: Number(product.baseQuantity ?? 100),
      unit: product.unit ?? 'g',
      calories,
      protein: Number(product.protein ?? 0),
      carbs: Number(product.carbs ?? 0),
      fat: Number(product.fat ?? 0),
      base_calories: baseCalories,
      base_protein: Number(product.protein ?? 0),
      base_carbs: Number(product.carbs ?? 0),
      base_fat: Number(product.fat ?? 0),
      source: 'barcode' as const,
      keywords: product.keywords ?? [],
      created_at: new Date().toISOString(),
    };

    await createScannedFood(mappedScannedFood);
  }

  async function handleBarcodeScanned(value: string): Promise<BarcodeLookupStatus> {
    console.log('Barcode scanned', { barcode: value });
    setPendingScannedFood(null);
    setIncompleteScannedProduct(null);
    setNetworkErrorBarcode(null);
    const food = findFoodByBarcode(value);

    if (food) {
      console.log('Barcode lookup source used', {
        barcode: value,
        source: food.source === 'barcode' ? 'scanned cache' : 'local',
      });
      await saveScannedFoodToSupabase(value, food);
      setPendingScannedFood(food);
      return 'found' as const;
    }

    const lookup = await fetchOpenFoodFactsFood(value);

    if (lookup.type === 'network_error') {
      setNetworkErrorBarcode(value);
      return 'network_error' as const;
    }

    if (lookup.type === 'not_found') {
      return 'not_found' as const;
    }

    if (lookup.type === 'incomplete') {
      console.log('Barcode lookup source used', { barcode: value, source: 'Open Food Facts incomplete' });
      setIncompleteScannedProduct(lookup.product);
      return 'incomplete' as const;
    }

    console.log('Barcode lookup source used', { barcode: value, source: 'Open Food Facts' });
    const cachedTemplate = await addFoodTemplate({
      barcode: value,
      name: lookup.food.name,
      category: lookup.food.category,
      baseQuantity: lookup.food.baseQuantity,
      unit: lookup.food.unit,
      baseCalories: lookup.food.baseCalories,
      protein: lookup.food.protein,
      carbs: lookup.food.carbs,
      fat: lookup.food.fat,
      sugar: lookup.food.sugar,
      salt: lookup.food.salt,
      saturatedFat: lookup.food.saturatedFat,
      keywords: lookup.food.keywords,
      servingPresets: lookup.food.servingPresets,
      source: 'barcode',
    });
    const cachedFood = templateToFoodDefinition(cachedTemplate);

    await saveScannedFoodToSupabase(value, cachedFood);
    setPendingScannedFood(cachedFood);
    return 'found' as const;
  }

  async function handleInternetProductLookup(barcode: string) {
    const result = await lookupBarcodeOnline(barcode);

    if (result.status === 'not_found') {
      showToast({
        title: t('barcode.productNotFoundOnline'),
        message: t('barcode.aiShouldReview'),
        type: 'info',
      });
      return 'not_found' as const;
    }

    if (result.status === 'error') {
      showToast({
        title: t('barcode.lookupFailed'),
        message: result.error,
        type: 'warning',
      });
      return 'error' as const;
    }

    const food = mapOnlineLookupProduct(result.product);
    const didSpend = await spendTokens(1, 'internet_product_lookup');

    if (!didSpend) {
      showToast({ title: t('ai.notEnoughTokens'), type: 'warning' });
      return 'error' as const;
    }

    await saveScannedFoodToSupabase(barcode, food);
    setPendingScannedFood(food);
    showToast({
      title: t('toast.productSaved'),
      message: t('barcode.aiShouldReview'),
      type: 'success',
    });
    return 'found' as const;
  }

  async function handleAddReviewedProduct() {
    if (!pendingScannedFood) {
      return;
    }

    if (!canSpendTokens(2)) {
      showNotEnoughTokensAlert();
      return;
    }

    const product = pendingScannedFood;
    await spendTokens(2, 'scan_food');
    setPendingScannedFood(null);
    setActiveMode('find');
    openFoodDetails(product);
  }

  function handleDismissReviewedProduct() {
    setPendingScannedFood(null);
    setIncompleteScannedProduct(null);
    setNetworkErrorBarcode(null);
  }

  function handleCompleteScannedProduct(product: IncompleteScannedProduct) {
    setPendingScannedFood(null);
    setIncompleteScannedProduct(null);
    setNetworkErrorBarcode(null);
    setActiveMode('find');
    openManualDetails({ barcode: product.barcode, name: product.name });
  }

  function handleAddScannedProductManually(barcode: string) {
    setPendingScannedFood(null);
    setIncompleteScannedProduct(null);
    setNetworkErrorBarcode(null);
    setActiveMode('find');
    openManualDetails({ barcode });
  }

  async function selectMealPhoto(source: 'camera' | 'library') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        source === 'camera' ? 'Camera permission needed' : 'Photo library permission needed',
        'Allow access to choose a meal photo.',
      );
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [4, 3],
            mediaTypes: ['images'],
            quality: 0.8,
          });

    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }

    setMealPhotoUri(result.assets[0].uri);
    setMealPhotoEstimateVisible(false);
  }

  function resetMealPhotoFlow() {
    setMealPhotoUri(null);
    setMealPhotoPortion('medium');
    setMealPhotoCookingFat('none');
    setMealPhotoSauce('none');
    setMealPhotoFoodType('mixed');
    setMealPhotoEstimateVisible(false);
  }

  function resetNutritionFactsFlow() {
    setNutritionFactsBarcode(null);
    setNutritionFactsImageUri(null);
    setNutritionFactsText('');
    setNutritionFactsOcrMessage(null);
    setNutritionFactsStep('idle');
    setNutritionFactsError(null);
    setIsExtractingNutritionText(false);
    setIsSavingNutritionProduct(false);
    setParsedNutritionFacts(null);
    setNutritionProductName('Scanned product');
    setNutritionCalories('');
    setNutritionProtein('');
    setNutritionCarbs('');
    setNutritionFat('');
    setNutritionSugar('');
    setNutritionSalt('');
    setNutritionSaturatedFat('');
    setNutritionServingBasis('100g');
  }

  function applyParsedNutritionFacts(parsed: ParsedNutritionFacts) {
    setParsedNutritionFacts(parsed);
    setNutritionCalories(parsed.calories === undefined ? '' : String(parsed.calories));
    setNutritionProtein(parsed.protein === undefined ? '' : String(parsed.protein));
    setNutritionCarbs(parsed.carbs === undefined ? '' : String(parsed.carbs));
    setNutritionFat(parsed.fat === undefined ? '' : String(parsed.fat));
    setNutritionSugar(parsed.sugar === undefined ? '' : String(parsed.sugar));
    setNutritionSalt(parsed.salt === undefined ? '' : String(parsed.salt));
    setNutritionSaturatedFat(parsed.saturatedFat === undefined ? '' : String(parsed.saturatedFat));
    setNutritionServingBasis(parsed.unit === 'ml' ? '100ml' : '100g');
  }

  function beginNutritionFactsScan(barcode: string) {
    setNutritionFactsBarcode(barcode);
    setNutritionFactsImageUri(null);
    setNutritionFactsText('');
    setNutritionFactsOcrMessage(null);
    setNutritionFactsError(null);
    setParsedNutritionFacts(null);
    setNutritionProductName('Scanned product');
    setNutritionCalories('');
    setNutritionProtein('');
    setNutritionCarbs('');
    setNutritionFat('');
    setNutritionSugar('');
    setNutritionSalt('');
    setNutritionSaturatedFat('');
    setNutritionServingBasis('100g');
    setNutritionFactsStep('idle');
    setIsExtractingNutritionText(false);
  }

  function handleFillNutritionFactsManually() {
    Keyboard.dismiss();
    setNutritionFactsOcrMessage(null);
    setNutritionFactsError(null);
    setParsedNutritionFacts(null);
    setNutritionCalories('');
    setNutritionProtein('');
    setNutritionCarbs('');
    setNutritionFat('');
    setNutritionSugar('');
    setNutritionSalt('');
    setNutritionSaturatedFat('');
    setNutritionServingBasis('100g');
    setNutritionFactsStep('review');
  }

  async function handleNutritionLabelImageSelected(imageUri: string) {
    setNutritionFactsImageUri(imageUri);
    setNutritionProductName('Scanned product');
    setNutritionFactsText('');
    setNutritionFactsOcrMessage(null);
    setNutritionFactsError(null);
    setParsedNutritionFacts(null);
    setNutritionFactsStep('loading');
    setIsExtractingNutritionText(true);
    console.log('[Nutrition OCR] imageUri', imageUri);

    try {
      const ocrResult = await extractNutritionTextFromImage(imageUri);
      const text = ocrResult.text.trim();
      console.log('[Nutrition OCR] extracted text length', text.length);

      if (!text) {
        throw new Error('No text was detected in the selected image.');
      }

      const parsed = parseNutritionFactsText(text);
      console.log('[Nutrition OCR] parsed', parsed);
      setNutritionFactsText(text);
      applyParsedNutritionFacts(parsed);
      setNutritionFactsOcrMessage('Detected from label with OCR. Please review before saving.');
      setNutritionFactsStep('review');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const normalizedMessage = message.toLowerCase();
      const isExpectedOcrFallback =
        normalizedMessage.includes('ocr is not available') ||
        normalizedMessage.includes('cannot find native module') ||
        normalizedMessage.includes('expotextextractor') ||
        normalizedMessage.includes('no text was detected');
      const fallbackMessage = normalizedMessage.includes('no text')
        ? 'No text was detected. You can paste or type the nutrition values manually.'
        : 'OCR is not available in this build. Paste nutrition text to continue.';

      if (isExpectedOcrFallback) {
        console.warn('[Nutrition OCR fallback]', message);
      } else {
        console.error('Unexpected nutrition OCR error', error);
      }

      setNutritionFactsOcrMessage(fallbackMessage);
      setNutritionFactsStep('manualPaste');
    } finally {
      setIsExtractingNutritionText(false);
    }
  }

  async function pickNutritionFactsFromGallery(barcode: string) {
    beginNutritionFactsScan(barcode);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow access to pick a nutrition label image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [4, 3],
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (result.canceled) {
      return;
    }

    const imageUri = result.assets?.[0]?.uri;

    if (!imageUri) {
      setNutritionFactsError('Could not read selected image. Try again.');
      setNutritionFactsStep('error');
      return;
    }

    await handleNutritionLabelImageSelected(imageUri);
  }

  function handleParseNutritionFactsText() {
    const parsed = parseNutritionFactsText(nutritionFactsText);
    console.log('[Nutrition OCR] parsed', parsed);
    applyParsedNutritionFacts(parsed);
    Keyboard.dismiss();
    setNutritionFactsOcrMessage('We filled what we could read. Please review before saving.');
    setNutritionFactsError(null);
    setNutritionFactsStep('review');
  }

  async function handleSaveNutritionFactsProduct() {
    if (!nutritionFactsBarcode) {
      return;
    }

    if (!nutritionProductName.trim()) {
      Alert.alert('Product name required', 'Enter a product name before saving.');
      return;
    }

    if (
      !isReviewNumberInRange(nutritionCalories, 0, 1000) ||
      !isReviewNumberInRange(nutritionProtein, 0, 100) ||
      !isReviewNumberInRange(nutritionCarbs, 0, 100) ||
      !isReviewNumberInRange(nutritionFat, 0, 100)
    ) {
      Alert.alert('Nutrition incomplete', 'Complete the missing nutrition values to save this product.');
      return;
    }

    if (!canSpendTokens(2)) {
      showNotEnoughTokensAlert();
      return;
    }

    if (isSavingNutritionProduct) {
      return;
    }

    setIsSavingNutritionProduct(true);

    const baseQuantity = nutritionServingBasis === 'serving' ? 1 : 100;
    const servingUnit =
      nutritionServingBasis === '100ml' ? 'ml' : nutritionServingBasis === 'serving' ? 'serving' : 'g';
    const food: FoodDefinition = {
      id: nutritionFactsBarcode,
      barcode: nutritionFactsBarcode,
      name: nutritionProductName.trim(),
      category: 'Scanned food',
      baseQuantity,
      unit: servingUnit,
      calories: Math.round(parseReviewNumber(nutritionCalories) ?? 0),
      baseCalories: Math.round(parseReviewNumber(nutritionCalories) ?? 0),
      protein: round(parseReviewNumber(nutritionProtein) ?? 0),
      carbs: round(parseReviewNumber(nutritionCarbs) ?? 0),
      fat: round(parseReviewNumber(nutritionFat) ?? 0),
      sugar: nutritionSugar ? round(parseReviewNumber(nutritionSugar) ?? 0) : undefined,
      salt: nutritionSalt ? round(parseReviewNumber(nutritionSalt) ?? 0) : undefined,
      saturatedFat: nutritionSaturatedFat ? round(parseReviewNumber(nutritionSaturatedFat) ?? 0) : undefined,
      keywords: [nutritionProductName.trim(), nutritionFactsBarcode],
      source: 'barcode',
    };

    try {
      const cachedTemplate = await addFoodTemplate({
        barcode: nutritionFactsBarcode,
        name: food.name,
        category: food.category,
        baseQuantity: food.baseQuantity,
        unit: food.unit,
        baseCalories: food.baseCalories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        sugar: food.sugar,
        salt: food.salt,
        saturatedFat: food.saturatedFat,
        keywords: food.keywords,
        source: 'barcode',
      });
      const cachedFood = templateToFoodDefinition(cachedTemplate);

      await saveScannedFoodToSupabase(nutritionFactsBarcode, cachedFood);
      await spendTokens(2, 'scan_food');
      resetNutritionFactsFlow();
      setPendingScannedFood(cachedFood);
      showToast({
        title: t('toast.productSaved'),
        type: 'success',
      });
    } finally {
      setIsSavingNutritionProduct(false);
    }
  }

  async function handleSaveMealPhotoEstimate() {
    const estimate = estimateMealFromPhoto({
      cookingFat: mealPhotoCookingFat,
      foodType: mealPhotoFoodType,
      portionSize: mealPhotoPortion,
      sauce: mealPhotoSauce,
    });

    if (!canSpendTokens(MEAL_PHOTO_TOKEN_COST)) {
      showNotEnoughTokensAlert();
      return;
    }

    await addFood({
      name: estimate.name,
      foodKey: 'meal_photo:estimated_meal',
      source: 'meal_photo',
      calories: estimate.calories,
      quantity: '1 plate',
      quantityValue: 1,
      unit: 'plate',
      protein: estimate.protein,
      carbs: estimate.carbs,
      fat: estimate.fat,
      baseQuantity: 1,
      baseCalories: estimate.calories,
      baseProtein: estimate.protein,
      baseCarbs: estimate.carbs,
      baseFat: estimate.fat,
      mealLabel: effectiveMealLabel,
    });
    await spendTokens(MEAL_PHOTO_TOKEN_COST, 'meal_photo_estimate');
    resetMealPhotoFlow();
    router.push('/');
  }

  function closeDetails() {
    if (!isEditing) {
      setDetailsOpen(false);
      setManualMode(false);
      setSelectedFood(null);
    } else {
      resetTransientAddState();
      router.replace('/');
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
    if (manualMode) {
      setUnit(preset.unit);
      setQuantity(String(preset.quantity));

      const base = originalAiBase ?? {
        quantity: toNumber(quantity),
        unit,
        calories: toNumber(calories),
        protein: toNumber(protein),
        carbs: toNumber(carbs),
        fat: toNumber(fat),
      };
      const scaled = scaleNutrition(
        {
          calories: base.calories,
          protein: base.protein,
          carbs: base.carbs,
          fat: base.fat,
        },
        base.quantity,
        preset.quantity,
      );

      setCalories(String(scaled.calories));
      setProtein(String(scaled.protein));
      setCarbs(String(scaled.carbs));
      setFat(String(scaled.fat));
      return;
    }

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
    Keyboard.dismiss();
    setSelectedIngredient(food);
    setIngredientSearch('');
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

  function startMealNameEdit() {
    setIsMealNameEditing(true);
    setTimeout(() => {
      mealNameInputRef.current?.focus();
    }, 50);
  }

  function finishMealNameEdit() {
    const trimmedName = mealName.trim();

    if (!trimmedName) {
      setMealName(committedMealName);
      setIsMealNameEditing(!committedMealName);
      return;
    }

    if (mealNameError) {
      setIsMealNameEditing(true);
      return;
    }

    setMealName(trimmedName);
    setCommittedMealName(trimmedName);
    setIsMealNameEditing(false);
  }

  function handleAddIngredient() {
    const activeIngredient = selectedIngredient;

    if (!activeIngredient || !hasValidIngredient) {
      Alert.alert('Check ingredient', 'Select an ingredient and fix the highlighted fields.');
      return;
    }

    const nextIngredient: MealIngredient = {
      foodId: getFoodKey(activeIngredient),
      name: activeIngredient.name,
      quantity: round(toNumber(ingredientQuantity)),
      unit: ingredientUnit.trim(),
      calories: Math.round(toNumber(ingredientCalories)),
      protein: round(toNumber(ingredientProtein)),
      carbs: round(toNumber(ingredientCarbs)),
      fat: round(toNumber(ingredientFat)),
      baseQuantity: activeIngredient.baseQuantity,
      baseCalories: activeIngredient.baseCalories,
      baseProtein: activeIngredient.protein,
      baseCarbs: activeIngredient.carbs,
      baseFat: activeIngredient.fat,
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

  function showNotEnoughTokensAlert() {
    Alert.alert('Not enough tokens', 'Add tokens to continue', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Get tokens',
        onPress: () => {
          router.push('/settings');
        },
      },
    ]);
  }

  async function handleSaveMealTemplate() {
    if (!hasValidMeal) {
      Alert.alert('Check meal', 'Enter a valid meal name and add at least one ingredient.');
      return null;
    }

    if (!canSpendTokens(1)) {
      showNotEnoughTokensAlert();
      return null;
    }

    const nextMeal = await addMealTemplate({
      name: mealName.trim(),
      ingredients: mealIngredients,
      calories: Math.round(mealTotals.calories),
      protein: round(mealTotals.protein),
      carbs: round(mealTotals.carbs),
      fat: round(mealTotals.fat),
    });
    setSavedMealId(nextMeal.supabaseId ?? nextMeal.id);
    setCommittedMealName(nextMeal.name);
    setMealName(nextMeal.name);
    setIsMealNameEditing(false);
    await spendTokens(1, 'add_meal');
    Alert.alert('Meal saved', `${mealName.trim()} will appear in food search.`);
    return nextMeal;
  }

  async function handleAddMealToToday() {
    if (!hasValidMeal) {
      Alert.alert('Check meal', 'Enter a valid meal name and add at least one ingredient.');
      return;
    }

    if (!canSpendTokens(1)) {
      showNotEnoughTokensAlert();
      return;
    }

    await addFood({
      name: mealName.trim(),
      foodKey: `meal:${mealName.trim().toLowerCase()}`,
      source: 'meal',
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
      mealLabel: effectiveMealLabel,
    });
    await spendTokens(1, 'add_meal');
    router.push('/');
  }

  async function handleSaveCustomFood() {
    if (!hasValidCustomFood) {
      Alert.alert('Check custom food', 'Fix the highlighted fields before saving.');
      return;
    }

    if (manualBarcode && !canSpendTokens(2)) {
      showNotEnoughTokensAlert();
      return;
    }

    const nextTemplate = await addFoodTemplate({
      barcode: manualBarcode ?? undefined,
      name,
      category: manualBarcode ? 'Scanned food' : undefined,
      baseQuantity: round(toNumber(quantity)),
      unit: unit.trim(),
      baseCalories: Math.round(toNumber(calories)),
      protein: round(toNumber(protein)),
      carbs: round(toNumber(carbs)),
      fat: round(toNumber(fat)),
      keywords: manualBarcode ? [name.trim(), manualBarcode] : undefined,
      source: manualBarcode ? 'barcode' : 'custom',
    });
    const nextFood = templateToFoodDefinition(nextTemplate);

    if (manualBarcode) {
      await saveScannedFoodToSupabase(manualBarcode, nextFood);
      await spendTokens(2, 'scan_food');
    }

    setSelectedFood(nextFood);
    setManualMode(false);
    setManualBarcode(null);
    Alert.alert('Food saved', `${name.trim()} will appear in search results.`);
  }

  async function handleSave() {
    if (!hasValidFood || isSaving) {
      Alert.alert('Check food details', 'Fix the highlighted fields before saving.');
      return;
    }

    if (manualBarcode && !canSpendTokens(2)) {
      showNotEnoughTokensAlert();
      return;
    }

    setIsSaving(true);

    try {
      const baseQuantity = round(toNumber(quantity));
      const baseCalories = Math.round(toNumber(calories));
      const baseProtein = round(toNumber(protein));
      const baseCarbs = round(toNumber(carbs));
      const baseFat = round(toNumber(fat));
      const input = {
        name,
        foodKey: selectedFood ? getFoodKey(selectedFood) : manualBarcode ? `barcode:${manualBarcode}` : undefined,
        source: selectedFood?.source ?? (manualBarcode ? 'barcode' : manualMode ? 'manual' : undefined),
        calories: baseCalories,
        quantity: `${baseQuantity} ${unit.trim()}`,
        quantityValue: baseQuantity,
        unit: unit.trim(),
        protein: baseProtein,
        carbs: baseCarbs,
        fat: baseFat,
        baseQuantity: selectedFood?.baseQuantity ?? (manualMode ? baseQuantity : undefined),
        baseCalories: selectedFood?.baseCalories ?? (manualMode ? baseCalories : undefined),
        baseProtein: selectedFood?.protein ?? (manualMode ? baseProtein : undefined),
        baseCarbs: selectedFood?.carbs ?? (manualMode ? baseCarbs : undefined),
        baseFat: selectedFood?.fat ?? (manualMode ? baseFat : undefined),
        mealLabel: effectiveMealLabel,
      };

      if (editingEntry) {
        await updateFood(editingEntry.id, input);
        resetTransientAddState();
      } else {
        await addFood(input);
        if (manualBarcode) {
          const scannedFood: FoodDefinition = {
            id: manualBarcode,
            barcode: manualBarcode,
            name: name.trim(),
            category: 'Scanned food',
            baseQuantity,
            unit: unit.trim(),
            calories: baseCalories,
            baseCalories,
            protein: baseProtein,
            carbs: baseCarbs,
            fat: baseFat,
            keywords: [name.trim(), manualBarcode],
            source: 'barcode',
          };

          await saveScannedFoodToSupabase(manualBarcode, scannedFood);
          await spendTokens(2, 'scan_food');
        }
        resetForm();
      }

      router.replace('/');
    } finally {
      setIsSaving(false);
    }
  }

  function renderFoodResult({ item: food }: { item: FoodDefinition }) {
    const foodKey = getFoodKey(food);
    const isPinned = pinnedFoodKeys.includes(foodKey);

    return (
      <View style={[styles.foodResult, surfaceStyle]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => openFoodDetails(food)}
          style={({ pressed }) => [styles.foodResultMain, pressed && styles.foodResultPressed]}>
          <View style={styles.foodResultHeader}>
            <Text style={[styles.foodResultName, textStyle]}>{food.name}</Text>
            <Text style={[styles.foodResultCalories, { color: theme.success }]}>{food.baseCalories} cal</Text>
          </View>
          <Text style={[styles.foodResultMeta, mutedTextStyle]}>
            {food.category} · per {food.baseQuantity}
            {food.unit}
          </Text>
          <Text style={[styles.foodResultMeta, mutedTextStyle]}>
            P {food.protein}g / C {food.carbs}g / F {food.fat}g
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => togglePinnedFood(foodKey)}
          style={({ pressed }) => [
            styles.pinButton,
            { backgroundColor: theme.chipBackground, borderLeftColor: theme.cardBorder },
            isPinned && styles.pinButtonActive,
            pressed && styles.pinButtonPressed,
          ]}>
          <Text style={[styles.pinButtonText, { color: isPinned ? theme.primary : theme.mutedText }]}>
            {isPinned ? 'Pinned' : 'Pin'}
          </Text>
        </Pressable>
      </View>
    );
  }

  function renderPremiumFoodResult({ item: food }: { item: FoodDefinition }) {
    const foodKey = getFoodKey(food);
    const isPinned = pinnedFoodKeys.includes(foodKey);

    return (
      <FoodBrowseCard
        food={food}
        isFavorite={isPinned}
        onPress={openFoodDetails}
        onToggleFavorite={() => togglePinnedFood(foodKey)}
      />
    );
  }

  function renderDropdownFoodResult(food: FoodDefinition) {
    const foodKey = getFoodKey(food);
    const isPinned = pinnedFoodKeys.includes(foodKey);

    return (
      <Pressable
        accessibilityRole="button"
        key={foodKey}
        onPress={() => openFoodDetails(food)}
        style={({ pressed }) => [
          styles.dropdownResultRow,
          pressed && styles.foodResultPressed,
        ]}>
        <View style={[styles.dropdownFoodAvatar, { backgroundColor: theme.chipBackground }]}>
          <Text style={styles.dropdownFoodAvatarText}>{getFoodAvatar(food)}</Text>
        </View>
        <View style={styles.dropdownFoodMain}>
          <Text numberOfLines={1} style={[styles.dropdownFoodName, textStyle]}>
            {food.name}
          </Text>
          <Text numberOfLines={1} style={[styles.dropdownFoodMeta, mutedTextStyle]}>
            {food.category} · per {food.baseQuantity}
            {food.unit}
          </Text>
        </View>
        <View style={styles.dropdownFoodTrailing}>
          <Text style={[styles.dropdownFoodCalories, { color: theme.success }]}>
            {food.baseCalories}
          </Text>
          <Text style={[styles.dropdownFoodCalLabel, mutedTextStyle]}>cal</Text>
        </View>
        <Pressable
          accessibilityLabel={isPinned ? 'Unpin food' : 'Pin food'}
          accessibilityRole="button"
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation();
            togglePinnedFood(foodKey);
          }}
          style={({ pressed }) => [
            styles.dropdownPinButton,
            { backgroundColor: isPinned ? theme.primary : theme.chipBackground },
            pressed && styles.pinButtonPressed,
          ]}>
          <Text style={[styles.dropdownPinText, { color: isPinned ? '#FFFFFF' : theme.mutedText }]}>
            {isPinned ? '★' : '☆'}
          </Text>
        </Pressable>
      </Pressable>
    );
  }

  function renderIngredientSearchResult({ item: food }: { item: FoodDefinition }) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => openIngredientDetails(food)}
        style={({ pressed }) => [styles.ingredientResult, surfaceStyle, pressed && styles.foodResultPressed]}>
        <View style={styles.foodResultHeader}>
          <Text style={[styles.foodResultName, textStyle]}>{food.name}</Text>
          <Text style={[styles.foodResultCalories, { color: theme.success }]}>{food.baseCalories} cal</Text>
        </View>
        <Text style={[styles.foodResultMeta, mutedTextStyle]}>
          {food.category} · per {food.baseQuantity}
          {food.unit}
        </Text>
      </Pressable>
    );
  }

  function renderAiAutofillScreen(kind: 'meal' | 'food') {
    const isMeal = kind === 'meal';
    const result = isMeal ? aiMealResult : aiFoodResult;
    const hasEnoughTokens = canSpendTokens(AI_AUTOFILL_TOKEN_COST);
    const canGenerate = aiDescription.trim().length >= 5 && hasEnoughTokens && !isGeneratingAiAutofill;
    const title = isMeal ? t('add.buildMeal') : t('add.addCustom');
    const placeholder = isMeal
      ? 'Example: chicken breast with rice, olive oil, and salad'
      : 'Example: homemade turkey sandwich with whole wheat bread';
    const providerLabel = getAiProviderLabel(result);

    if (isMeal) {
      return (
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', android: undefined })}
          style={styles.keyboardView}>
          <Screen scroll={false}>
            <View style={styles.scanProductScreen}>
              <View style={styles.scanFixedHeader}>
                <View style={styles.scanHeaderTopRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setActiveMode('find')}
                    style={({ pressed }) => [styles.scanBackButton, pressed && styles.buttonPressed]}>
                    <Ionicons name="chevron-back" size={16} color={theme.primary} />
                    <Text style={[styles.scanBackText, { color: theme.primary }]}>{t('common.back')}</Text>
                  </Pressable>
                  <View style={[styles.scanTokenPill, { backgroundColor: theme.success + '18' }]}>
                    <Ionicons name="leaf-outline" size={14} color={theme.success} />
                    <Text style={[styles.scanTokenText, { color: theme.success }]}>Tokens: {tokenBalance}</Text>
                  </View>
                </View>
                <View style={styles.scanHeaderTextBlock}>
                  <Text style={[styles.scanHeaderTitle, { color: theme.text }]}>{t('add.buildMeal')}</Text>
                  <Text style={[styles.scanHeaderSubtitle, { color: theme.mutedText }]}>
                    Describe your meal and review the ingredients before saving.
                  </Text>
                </View>
              </View>

              <ScrollView
                contentContainerStyle={styles.buildMealAiScrollContent}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <View style={styles.buildMealIntroRow}>
                  <View style={[styles.buildMealIntroIcon, { backgroundColor: theme.success + '18' }]}>
                    <Ionicons name="sparkles-outline" size={16} color={theme.success} />
                  </View>
                  <View style={styles.buildMealIntroCopy}>
                    <Text style={[styles.buildMealIntroTitle, { color: theme.text }]}>AI meal builder</Text>
                    <Text style={[styles.buildMealIntroSubtitle, { color: theme.mutedText }]}>
                      Write what you ate. We will draft editable ingredients.
                    </Text>
                  </View>
                </View>

                <View style={[styles.mealComposerPanel, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                  <Text style={[styles.mealComposerLabel, { color: theme.text }]}>What did you eat?</Text>
                  <TextInput
                    multiline
                    onChangeText={setAiDescription}
                    placeholder={placeholder}
                    placeholderTextColor={theme.mutedText}
                    style={[styles.mealComposerInput, { color: theme.text }]}
                    value={aiDescription}
                  />
                  <View style={styles.mealComposerFooter}>
                    <View style={[styles.mealComposerPill, { backgroundColor: theme.success + '10' }]}>
                      <Ionicons name="sparkles-outline" size={15} color={theme.success} />
                      <Text style={[styles.mealComposerPillText, { color: theme.mutedText }]}>
                        Editable before saving
                      </Text>
                    </View>
                    <Text style={[styles.mealComposerCount, { color: theme.mutedText }]}>
                      {aiDescription.length}/500
                    </Text>
                  </View>
                </View>

                <View style={styles.buildMealHelperChips}>
                  {['+ portions', '+ sauces', '+ drinks', '+ cooking method'].map((label) => (
                      <View key={label} style={[styles.buildMealHelperChip, { backgroundColor: theme.chipBackground }]}>
                        <Text style={[styles.buildMealHelperChipText, { color: theme.mutedText }]}>{label}</Text>
                      </View>
                  ))}
                </View>

                {!hasEnoughTokens ? (
                  <View style={[styles.buildMealTokenNotice, { backgroundColor: theme.warning + '12' }]}>
                    <Text style={[styles.buildMealTokenText, { color: theme.warning }]}>{t('ai.notEnoughTokens')}</Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.push({ pathname: '/settings', params: { panel: 'tokens' } })}
                      style={({ pressed }) => [
                        styles.buildMealTokenButton,
                        { backgroundColor: theme.primary },
                        pressed && styles.buttonPressed,
                      ]}>
                      <Text style={styles.buildMealTokenButtonText}>{t('settings.tokens')}</Text>
                    </Pressable>
                  </View>
                ) : null}

                <View style={styles.buildMealActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canGenerate}
                    onPress={handleGenerateAiMeal}
                    style={({ pressed }) => [
                      styles.buildMealGenerateButton,
                      { backgroundColor: canGenerate ? theme.success : theme.chipBackground, shadowColor: theme.success },
                      pressed && canGenerate ? styles.buttonPressed : null,
                    ]}>
                    <Ionicons name="sparkles-outline" size={18} color={canGenerate ? '#FFFFFF' : theme.mutedText} />
                    <Text style={[styles.buildMealGenerateText, { color: canGenerate ? '#FFFFFF' : theme.mutedText }]}>
                      {isGeneratingAiAutofill
                        ? t('ai.creatingEstimate')
                        : aiDescription.trim().length < 5
                          ? 'Describe your meal first'
                          : t('ai.generateIngredients')}
                    </Text>
                  </Pressable>
                  <View style={styles.buildMealOrRow}>
                    <View style={[styles.buildMealOrLine, { backgroundColor: theme.cardBorder }]} />
                    <Text style={[styles.buildMealOrText, { color: theme.mutedText }]}>or</Text>
                    <View style={[styles.buildMealOrLine, { backgroundColor: theme.cardBorder }]} />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={openMealBuilderManually}
                    style={({ pressed }) => [
                      styles.buildMealManualButton,
                      { backgroundColor: theme.card, borderColor: theme.cardBorder },
                      pressed && styles.buttonPressed,
                    ]}>
                    <Ionicons name="create-outline" size={18} color={theme.text} />
                    <Text style={[styles.buildMealManualText, { color: theme.text }]}>{t('ai.buildManually')}</Text>
                  </Pressable>
                </View>

                <View style={styles.buildMealExamples}>
                  <Text style={[styles.buildMealExamplesTitle, { color: theme.text }]}>Try describing</Text>
                  {[
                    '2 eggs, toast, and coffee',
                    'Chicken bowl with rice and avocado',
                    'Greek yogurt with banana and honey',
                  ].map((example) => (
                    <View key={example} style={styles.buildMealExampleRow}>
                      <View style={[styles.buildMealExampleDot, { backgroundColor: theme.success }]} />
                      <Text style={[styles.buildMealExampleText, { color: theme.mutedText }]}>{example}</Text>
                    </View>
                  ))}
                </View>

                {aiMealResult ? (
                  <View style={[styles.card, surfaceStyle]}>
                    <Text style={[styles.resultsTitle, textStyle]}>{t('ai.reviewBeforeSaving')}</Text>
                    {providerLabel ? (
                      <View style={[styles.aiProviderBadge, { backgroundColor: theme.chipBackground }]}>
                        <Text style={[styles.aiProviderBadgeText, { color: aiMealResult.isDemo ? theme.warning : theme.primary }]}>
                          {providerLabel}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={[styles.foodResultName, textStyle]}>{aiMealResult.mealName}</Text>
                    <View style={styles.aiResultList}>
                      {aiMealResult.ingredients.map((ingredient) => (
                        <View key={`${ingredient.name}-${ingredient.quantityValue}`} style={[styles.ingredientRow, softSurfaceStyle]}>
                          <View style={styles.flexField}>
                            <Text style={[styles.foodResultName, textStyle]}>
                              {ingredient.name} · {ingredient.quantityValue}
                              {ingredient.unit}
                            </Text>
                            <Text style={[styles.foodResultMeta, mutedTextStyle]}>
                              {ingredient.calories} cal · P {ingredient.protein}g / C {ingredient.carbs}g / F {ingredient.fat}g
                            </Text>
                          </View>
                        </View>
                      ))}
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => applyAiMealEstimate(aiMealResult)}
                        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
                        <Text style={styles.buttonText}>Use this estimate</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setAiMealResult(null)}
                        style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
                        <Text style={styles.secondaryButtonText}>Edit description</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </ScrollView>
            </View>
          </Screen>
        </KeyboardAvoidingView>
      );
    }

    return (
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.keyboardView}>
        <Screen>
          <AddModeHeader onBack={() => setActiveMode('find')} title={title} />
          <View style={[styles.card, surfaceStyle]}>
            <Text style={[styles.title, textStyle]}>{t('ai.describeWithAi')}</Text>
            <Text style={[styles.subtitle, mutedTextStyle]}>
              {isMeal
                ? 'Tell us what you ate and we will draft ingredients for you.'
                : 'Describe your food and we will draft nutrition values for you.'}
            </Text>
            <Text style={[styles.aiNote, { color: theme.warning }]}>{t('ai.estimateWarning')}</Text>
            <View style={styles.field}>
              <Text style={styles.label}>{isMeal ? 'Describe your meal' : 'Describe your food'}</Text>
              <TextInput
                multiline
                onChangeText={setAiDescription}
                placeholder={placeholder}
                placeholderTextColor="#9A9FA6"
                style={[styles.input, styles.aiDescriptionInput, inputStyle]}
                value={aiDescription}
              />
            </View>
            {!hasEnoughTokens ? (
              <View style={[styles.aiWarningCard, { backgroundColor: theme.chipBackground }]}>
                <Text style={[styles.foodResultMeta, { color: theme.warning }]}>{t('ai.notEnoughTokens')}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/settings', params: { panel: 'tokens' } })}
                  style={({ pressed }) => [styles.aiInlineButton, { backgroundColor: theme.primary }, pressed && styles.buttonPressed]}>
                  <Text style={styles.aiInlineButtonText}>{t('settings.tokens')}</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={!canGenerate}
              onPress={isMeal ? handleGenerateAiMeal : handleGenerateAiFood}
              style={({ pressed }) => [
                styles.button,
                !canGenerate && styles.buttonDisabled,
                pressed && canGenerate ? styles.buttonPressed : null,
              ]}>
              <Text style={styles.buttonText}>
                {isGeneratingAiAutofill
                  ? t('ai.creatingEstimate')
                  : isMeal
                    ? t('ai.generateIngredients')
                    : t('ai.generateFood')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={isMeal ? openMealBuilderManually : openCustomFoodManually}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
              <Text style={styles.secondaryButtonText}>
                {isMeal ? t('ai.buildManually') : t('ai.addManually')}
              </Text>
            </Pressable>
          </View>

          {result ? (
            <View style={[styles.card, surfaceStyle]}>
              <Text style={[styles.resultsTitle, textStyle]}>{t('ai.reviewBeforeSaving')}</Text>
              {providerLabel ? (
                <View style={[styles.aiProviderBadge, { backgroundColor: theme.chipBackground }]}>
                  <Text style={[styles.aiProviderBadgeText, { color: result?.isDemo ? theme.warning : theme.primary }]}>
                    {providerLabel}
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.foodResultMeta, mutedTextStyle]}>
                {t('ai.estimateWarning')} Confidence: {result.confidence}
              </Text>
              {isMeal && aiMealResult ? (
                <View style={styles.aiResultList}>
                  <Text style={[styles.foodResultName, textStyle]}>{aiMealResult.mealName}</Text>
                  {aiMealResult.ingredients.map((ingredient) => (
                    <View key={`${ingredient.name}-${ingredient.quantityValue}`} style={[styles.ingredientRow, softSurfaceStyle]}>
                      <View style={styles.flexField}>
                        <Text style={[styles.foodResultName, textStyle]}>
                          {ingredient.name} · {ingredient.quantityValue}
                          {ingredient.unit}
                        </Text>
                        <Text style={[styles.foodResultMeta, mutedTextStyle]}>
                          {ingredient.calories} cal · P {ingredient.protein}g / C {ingredient.carbs}g / F {ingredient.fat}g
                        </Text>
                      </View>
                    </View>
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => applyAiMealEstimate(aiMealResult)}
                    style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
                    <Text style={styles.buttonText}>Use this estimate</Text>
                  </Pressable>
                </View>
              ) : aiFoodResult ? (
                <View style={styles.aiResultList}>
                  <Text style={[styles.foodResultName, textStyle]}>{aiFoodResult.name}</Text>
                  <Text style={[styles.foodResultMeta, mutedTextStyle]}>
                    {aiFoodResult.servingSize} · {aiFoodResult.calories} cal · P {aiFoodResult.protein}g / C {aiFoodResult.carbs}g / F {aiFoodResult.fat}g
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => applyAiFoodEstimate(aiFoodResult)}
                    style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
                    <Text style={styles.buttonText}>Use this estimate</Text>
                  </Pressable>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setAiMealResult(null);
                  setAiFoodResult(null);
                }}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
                <Text style={styles.secondaryButtonText}>Edit description</Text>
              </Pressable>
            </View>
          ) : null}
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  if (activeMode === 'mealAi') {
    return renderAiAutofillScreen('meal');
  }

  if (activeMode === 'customAi') {
    return renderAiAutofillScreen('food');
  }

  if (activeMode === 'mealPhoto') {
    const mealPhotoEstimate = estimateMealFromPhoto({
      cookingFat: mealPhotoCookingFat,
      foodType: mealPhotoFoodType,
      portionSize: mealPhotoPortion,
      sauce: mealPhotoSauce,
    });

    return (
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.keyboardView}>
        <Screen scroll={false}>
          <View style={styles.scanProductScreen}>
            <View style={styles.scanFixedHeader}>
              <View style={styles.scanHeaderTopRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setActiveMode('find')}
                  style={({ pressed }) => [styles.scanBackButton, pressed && styles.buttonPressed]}>
                  <Ionicons name="chevron-back" size={16} color={theme.primary} />
                  <Text style={[styles.scanBackText, { color: theme.primary }]}>{t('common.back')}</Text>
                </Pressable>
                <View style={[styles.scanTokenPill, { backgroundColor: theme.success + '18' }]}>
                  <Ionicons name="leaf-outline" size={14} color={theme.success} />
                  <Text style={[styles.scanTokenText, { color: theme.success }]}>Tokens: {tokenBalance}</Text>
                </View>
              </View>
              <View style={styles.scanHeaderTextBlock}>
                <Text style={[styles.scanHeaderTitle, { color: theme.text }]}>Scan meal</Text>
                <Text style={[styles.scanHeaderSubtitle, { color: theme.mutedText }]}>
                  Take or choose a meal photo, then review the estimated calories and macros before saving.
                </Text>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={styles.scanMealScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {!mealPhotoUri ? (
                <>
                  <View style={[styles.scanMealHeroPanel, { backgroundColor: theme.cardAlt, shadowColor: theme.shadow }]}>
                    <View style={[styles.scanMealHeroIcon, { backgroundColor: theme.success + '18' }]}>
                      <Ionicons name="restaurant-outline" size={26} color={theme.success} />
                    </View>
                    <View style={styles.scanMealHeroText}>
                      <Text style={[styles.scanMealHeroTitle, { color: theme.text }]}>
                        Estimate a meal from a photo
                      </Text>
                      <Text style={[styles.scanMealHeroDescription, { color: theme.mutedText }]}>
                        Take a clear photo of your plate or choose one from your gallery.
                      </Text>
                    </View>
                    <View style={styles.scanMealBadgeRow}>
                      {['Calories', 'Macros', 'Portion estimate'].map((label) => (
                        <View key={label} style={[styles.scanMealBadge, { backgroundColor: theme.card }]}>
                          <Text style={[styles.scanMealBadgeText, { color: theme.success }]}>{label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={styles.scanMealActionGroup}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => selectMealPhoto('camera')}
                      style={({ pressed }) => [
                        styles.scanMealPrimaryButton,
                        { backgroundColor: theme.primary, shadowColor: theme.primary },
                        pressed && styles.buttonPressed,
                      ]}>
                      <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.scanMealPrimaryText}>Take photo</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => selectMealPhoto('library')}
                      style={({ pressed }) => [
                        styles.scanMealSecondaryButton,
                        { backgroundColor: theme.cardAlt },
                        pressed && styles.buttonPressed,
                      ]}>
                      <Ionicons name="image-outline" size={18} color={theme.text} />
                      <Text style={[styles.scanMealSecondaryText, { color: theme.text }]}>Pick image</Text>
                    </Pressable>
                  </View>

                  <View style={styles.scanMealTipsSection}>
                    <Text style={[styles.scanMealTipsTitle, { color: theme.text }]}>For better results</Text>
                    <View style={[styles.scanMealTipsPanel, { backgroundColor: theme.success + '0F' }]}>
                      {[
                        ['sunny-outline', 'Good lighting'],
                        ['scan-outline', 'Show the whole plate'],
                        ['phone-portrait-outline', 'Avoid blurry photos'],
                        ['eye-outline', 'Keep food visible'],
                      ].map(([icon, label]) => (
                        <View key={label} style={styles.scanMealTipRow}>
                          <View style={[styles.scanMealTipIcon, { backgroundColor: theme.success + '18' }]}>
                            <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={14} color={theme.success} />
                          </View>
                          <Text style={[styles.scanMealTipText, { color: theme.text }]}>{label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </>
              ) : null}

              {mealPhotoUri && !mealPhotoEstimateVisible ? (
                <View style={[styles.ingredientEditor, softSurfaceStyle]}>
                  <Text style={[styles.resultsTitle, textStyle]}>We need a few details to improve the estimate.</Text>
                  <MealPhotoChoiceGroup
                    label="Portion size"
                    options={[
                      ['small', 'Small'],
                      ['medium', 'Medium'],
                      ['large', 'Large'],
                    ]}
                    selectedValue={mealPhotoPortion}
                    onSelect={(value) => setMealPhotoPortion(value as MealPhotoPortionSize)}
                  />
                  <MealPhotoChoiceGroup
                    label="Cooking fat"
                    options={[
                      ['none', 'No/unknown'],
                      ['little', 'A little oil'],
                      ['lot', 'A lot of oil'],
                    ]}
                    selectedValue={mealPhotoCookingFat}
                    onSelect={(value) => setMealPhotoCookingFat(value as MealPhotoCookingFat)}
                  />
                  <MealPhotoChoiceGroup
                    label="Sauce"
                    options={[
                      ['none', 'No sauce'],
                      ['light', 'Light sauce'],
                      ['heavy', 'Heavy sauce'],
                    ]}
                    selectedValue={mealPhotoSauce}
                    onSelect={(value) => setMealPhotoSauce(value as MealPhotoSauce)}
                  />
                  <MealPhotoChoiceGroup
                    label="Main food type"
                    options={[
                      ['rice_chicken', 'Rice/chicken'],
                      ['pasta', 'Pasta'],
                      ['salad', 'Salad'],
                      ['sandwich', 'Sandwich'],
                      ['mixed', 'Mixed meal'],
                      ['other', 'Other'],
                    ]}
                    selectedValue={mealPhotoFoodType}
                    onSelect={(value) => setMealPhotoFoodType(value as MealPhotoFoodType)}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setMealPhotoEstimateVisible(true)}
                    style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
                    <Text style={styles.buttonText}>Generate estimate</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={resetMealPhotoFlow}>
                    <Text style={[styles.closeButtonText, { color: theme.mutedText }]}>Cancel</Text>
                  </Pressable>
                </View>
              ) : null}

              {mealPhotoUri && mealPhotoEstimateVisible ? (
                <View style={styles.estimateStack}>
                  <View style={[styles.ingredientEditor, softSurfaceStyle]}>
                    {renderMealLabelSelector()}
                  </View>
                  <MealPhotoEstimateCard
                    canSave={canSpendTokens(MEAL_PHOTO_TOKEN_COST)}
                    estimate={mealPhotoEstimate}
                    imageUri={mealPhotoUri}
                    onCancel={resetMealPhotoFlow}
                    onEdit={() => setMealPhotoEstimateVisible(false)}
                    onGetTokens={() => router.push({ pathname: '/settings', params: { panel: 'tokens' } })}
                    onRetake={resetMealPhotoFlow}
                    onSave={handleSaveMealPhotoEstimate}
                  />
                </View>
              ) : null}
            </ScrollView>
          </View>
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  if (activeMode === 'scan') {
    return (
      <ScanProductScreen
        onBack={() => {
          setPendingScannedFood(null);
          setIncompleteScannedProduct(null);
          setNetworkErrorBarcode(null);
          setActiveMode('find');
        }}
        onDismissReview={handleDismissReviewedProduct}
        onAddReviewedProduct={handleAddReviewedProduct}
        onAddScannedProductManually={handleAddScannedProductManually}
        onCompleteScannedProduct={handleCompleteScannedProduct}
        onParseNutritionFactsText={handleParseNutritionFactsText}
        incompleteProduct={incompleteScannedProduct}
        networkErrorBarcode={networkErrorBarcode}
        nutritionFactsBarcode={nutritionFactsBarcode}
        nutritionFactsImageUri={nutritionFactsImageUri}
        nutritionFactsText={nutritionFactsText}
        nutritionFactsOcrMessage={nutritionFactsOcrMessage}
        nutritionFactsStep={nutritionFactsStep}
        nutritionFactsError={nutritionFactsError}
        isExtractingNutritionText={isExtractingNutritionText}
        isSavingNutritionProduct={isSavingNutritionProduct}
        nutritionServingBasis={nutritionServingBasis}
        nutritionProductName={nutritionProductName}
        nutritionCalories={nutritionCalories}
        nutritionProtein={nutritionProtein}
        nutritionCarbs={nutritionCarbs}
        nutritionFat={nutritionFat}
        nutritionSugar={nutritionSugar}
        nutritionSalt={nutritionSalt}
        nutritionSaturatedFat={nutritionSaturatedFat}
        onLookupBarcode={handleBarcodeScanned}
        onInternetLookup={handleInternetProductLookup}
        pendingFood={pendingScannedFood}
        onBeginNutritionFactsScan={beginNutritionFactsScan}
        onBackToNutritionPaste={() => setNutritionFactsStep('manualPaste')}
        onNutritionLabelImageSelected={handleNutritionLabelImageSelected}
        onPickNutritionFactsFromGallery={pickNutritionFactsFromGallery}
        onCancelNutritionFacts={resetNutritionFactsFlow}
        onFillNutritionFactsManually={handleFillNutritionFactsManually}
        onSaveNutritionFactsProduct={handleSaveNutritionFactsProduct}
        parsedNutritionFacts={parsedNutritionFacts}
        setNutritionCalories={setNutritionCalories}
        setNutritionCarbs={setNutritionCarbs}
        setNutritionFactsText={setNutritionFactsText}
        setNutritionFat={setNutritionFat}
        setNutritionProductName={setNutritionProductName}
        setNutritionProtein={setNutritionProtein}
        setNutritionServingBasis={setNutritionServingBasis}
        setNutritionSalt={setNutritionSalt}
        setNutritionSaturatedFat={setNutritionSaturatedFat}
        setNutritionSugar={setNutritionSugar}
        tokenBalance={tokenBalance}
      />
    );
  }

  if (activeMode === 'meal') {
    return (
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.keyboardView}>
        <Screen>
          <AddModeHeader onBack={() => setActiveMode('find')} title="Prepare meal" />

          <View style={[styles.card, surfaceStyle]}>
            <Text style={[styles.title, textStyle]}>Prepare meal</Text>
            <Text style={[styles.tokenText, { color: theme.success }]}>Tokens: {tokenBalance}</Text>
            {isMealNameEditing || !mealName.trim() ? (
              <View style={styles.field}>
                <Text style={styles.label}>Meal name</Text>
                <View style={styles.nameEditRow}>
                  <TextInput
                    ref={mealNameInputRef}
                    autoCapitalize="words"
                    onBlur={finishMealNameEdit}
                    onChangeText={setMealName}
                    placeholder="Chicken rice bowl"
                    placeholderTextColor="#9A9FA6"
                    selectTextOnFocus
                    style={[
                      styles.input,
                      styles.nameEditInput,
                      inputStyle,
                      mealNameError && styles.inputError,
                    ]}
                    value={mealName}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={Boolean(mealNameError)}
                    onPress={finishMealNameEdit}
                    style={({ pressed }) => [
                      styles.doneButton,
                      mealNameError && styles.buttonDisabled,
                      pressed && !mealNameError ? styles.buttonPressed : null,
                    ]}>
                    <Text style={styles.doneButtonText}>Done</Text>
                  </Pressable>
                </View>
                <FieldError message={mealNameError} />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={startMealNameEdit}
                style={({ pressed }) => [
                  styles.mealNameCard,
                  softSurfaceStyle,
                  pressed && styles.foodResultPressed,
                ]}>
                <Text style={[styles.mealNameTitle, textStyle]}>{mealName.trim()}</Text>
                <Text style={[styles.mealNameHint, mutedTextStyle]}>Tap to rename</Text>
              </Pressable>
            )}

            <View style={[styles.totalCard, softSurfaceStyle]}>
              <Text style={[styles.totalTitle, textStyle]}>{Math.round(mealTotals.calories)} cal</Text>
              <Text style={styles.macroSummary}>
                P {round(mealTotals.protein)}g / C {round(mealTotals.carbs)}g / F{' '}
                {round(mealTotals.fat)}g
              </Text>
            </View>
          </View>

          <View style={[styles.card, surfaceStyle]}>
            <Text style={[styles.resultsTitle, textStyle]}>Add ingredient</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Search ingredient</Text>
              <TextInput
                autoCapitalize="words"
                onChangeText={setIngredientSearch}
                placeholder="Rice, chicken, olive oil"
                placeholderTextColor="#9A9FA6"
                style={[styles.input, inputStyle]}
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
              <View style={[styles.ingredientEditor, softSurfaceStyle]}>
                <Text style={[styles.resultsTitle, textStyle]}>{selectedIngredient.name}</Text>
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
                      style={[styles.input, inputStyle, ingredientErrors.quantity && styles.inputError]}
                      value={ingredientQuantity}
                    />
                    <FieldError message={ingredientErrors.quantity} />
                  </View>
                  <View style={[styles.field, styles.unitField]}>
                    <Text style={styles.label}>Unit</Text>
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={setIngredientUnit}
                      placeholder="g"
                      placeholderTextColor="#9A9FA6"
                      style={[styles.input, inputStyle, ingredientErrors.unit && styles.inputError]}
                      value={ingredientUnit}
                    />
                    <FieldError message={ingredientErrors.unit} />
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
                    style={[styles.input, inputStyle, ingredientErrors.calories && styles.inputError]}
                    value={ingredientCalories}
                  />
                  <FieldError message={ingredientErrors.calories} />
                </View>

                <Text style={styles.macroSummary}>
                  P {round(toNumber(ingredientProtein))}g / C {round(toNumber(ingredientCarbs))}g / F{' '}
                  {round(toNumber(ingredientFat))}g
                </Text>
                <FieldError
                  message={
                    ingredientErrors.protein ?? ingredientErrors.carbs ?? ingredientErrors.fat
                  }
                />

                <Pressable
                  accessibilityRole="button"
                  disabled={!hasValidIngredient}
                  onPress={handleAddIngredient}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    !hasValidIngredient && styles.buttonDisabled,
                    pressed && hasValidIngredient ? styles.buttonPressed : null,
                  ]}>
                  <Text style={styles.secondaryButtonText}>
                    {editingIngredientIndex === null ? 'Add ingredient' : 'Update ingredient'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={[styles.card, surfaceStyle]}>
            <Text style={[styles.resultsTitle, textStyle]}>Ingredients</Text>
            {mealIngredients.length === 0 ? (
              <Text style={[styles.foodResultMeta, mutedTextStyle]}>No ingredients yet.</Text>
            ) : (
              mealIngredients.map((ingredient, index) => (
                <View key={`${ingredient.foodId}-${index}`} style={[styles.ingredientRow, softSurfaceStyle]}>
                  <View style={styles.flexField}>
                    <Text style={[styles.foodResultName, textStyle]}>
                      {ingredient.name} — {ingredient.quantity}
                      {ingredient.unit} — {ingredient.calories} cal
                    </Text>
                    <Text style={[styles.foodResultMeta, mutedTextStyle]}>
                      P {ingredient.protein}g / C {ingredient.carbs}g / F {ingredient.fat}g
                    </Text>
                  </View>
                  <View style={styles.ingredientActions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleEditIngredient(ingredient, index)}
                      style={[styles.smallAction, chipStyle]}>
                      <Text style={styles.smallActionText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleRemoveIngredient(index)}
                      style={[styles.smallAction, chipStyle]}>
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
            {mealIngredients.length === 0 ? (
              <FieldError message="Add at least one ingredient before saving." />
            ) : null}

            {renderMealLabelSelector()}

            <Pressable
              accessibilityRole="button"
              disabled={!hasValidMeal}
              onPress={handleSaveMealTemplate}
              style={({ pressed }) => [
                styles.secondaryButton,
                !hasValidMeal && styles.buttonDisabled,
                pressed && hasValidMeal ? styles.buttonPressed : null,
              ]}>
              <Text style={styles.secondaryButtonText}>Save meal</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!hasValidMeal}
              onPress={handleAddMealToToday}
              style={({ pressed }) => [
                styles.button,
                !hasValidMeal && styles.buttonDisabled,
                pressed && hasValidMeal ? styles.buttonPressed : null,
              ]}>
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
              style={({ pressed }) => [
                styles.closeButton,
                { backgroundColor: theme.card },
                pressed && styles.buttonPressed,
              ]}>
              <Text style={styles.closeButtonText}>{isEditing ? t('common.cancel') : t('common.back')}</Text>
            </Pressable>
          </View>

          <View style={[styles.card, surfaceStyle]}>
            <Text style={[styles.title, textStyle]}>{manualMode ? 'Add my food' : name}</Text>
            {!manualMode && selectedFood ? (
              <Text style={[styles.subtitle, mutedTextStyle]}>
                {selectedFood.baseCalories} cal · base serving {selectedFood.baseQuantity}
                {selectedFood.unit}
              </Text>
            ) : (
              <Text style={[styles.subtitle, mutedTextStyle]}>Create a reusable food and save it locally.</Text>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>{t('add.foodName')}</Text>
              <TextInput
                autoCapitalize="words"
                onChangeText={setName}
                placeholder="Food name"
                placeholderTextColor="#9A9FA6"
                style={[styles.input, inputStyle, foodErrors.name && styles.inputError]}
                value={name}
              />
              <FieldError message={foodErrors.name} />
            </View>

            {servingPresets.length > 0 ? (
              <View style={styles.field}>
                <Text style={styles.label}>{t('add.servings')}</Text>
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
                <Text style={styles.label}>{t('add.quantity')}</Text>
                <TextInput
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  onChangeText={handleQuantityChange}
                  placeholder="100"
                  placeholderTextColor="#9A9FA6"
                  style={[
                    styles.input,
                    inputStyle,
                    foodErrors.quantity && styles.inputError,
                  ]}
                  value={quantity}
                />
                <FieldError message={foodErrors.quantity} />
              </View>
              <View style={[styles.field, styles.unitField]}>
                <Text style={styles.label}>{t('add.unit')}</Text>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setUnit}
                  placeholder="g"
                  placeholderTextColor="#9A9FA6"
                  style={[
                    styles.input,
                    inputStyle,
                    foodErrors.unit && styles.inputError,
                  ]}
                  value={unit}
                />
                <FieldError message={foodErrors.unit} />
              </View>
            </View>

            <View style={styles.field}>
                <Text style={styles.label}>{t('add.calories')}</Text>
              <TextInput
                inputMode="numeric"
                keyboardType="number-pad"
                onChangeText={handleCaloriesChange}
                placeholder="250"
                placeholderTextColor="#9A9FA6"
                style={[
                  styles.input,
                  inputStyle,
                  foodErrors.calories && styles.inputError,
                ]}
                value={calories}
              />
              <FieldError message={foodErrors.calories} />
            </View>

            <View style={styles.macroGrid}>
              <View style={styles.macroField}>
                <Text style={styles.label}>{t('nutrition.protein')}</Text>
                <TextInput
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  onChangeText={setProtein}
                  placeholder="0"
                  placeholderTextColor="#9A9FA6"
                  style={[
                    styles.input,
                    inputStyle,
                    foodErrors.protein && styles.inputError,
                  ]}
                  value={protein}
                />
                <FieldError message={foodErrors.protein} />
              </View>
              <View style={styles.macroField}>
                <Text style={styles.label}>{t('nutrition.carbs')}</Text>
                <TextInput
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  onChangeText={setCarbs}
                  placeholder="0"
                  placeholderTextColor="#9A9FA6"
                  style={[
                    styles.input,
                    inputStyle,
                    foodErrors.carbs && styles.inputError,
                  ]}
                  value={carbs}
                />
                <FieldError message={foodErrors.carbs} />
              </View>
              <View style={styles.macroField}>
                <Text style={styles.label}>{t('nutrition.fat')}</Text>
                <TextInput
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  onChangeText={setFat}
                  placeholder="0"
                  placeholderTextColor="#9A9FA6"
                  style={[
                    styles.input,
                    inputStyle,
                    foodErrors.fat && styles.inputError,
                  ]}
                  value={fat}
                />
                <FieldError message={foodErrors.fat} />
              </View>
            </View>

            <Text style={styles.macroSummary}>
              P {round(toNumber(protein))}g / C {round(toNumber(carbs))}g / F{' '}
              {round(toNumber(fat))}g
            </Text>

            {renderMealLabelSelector()}

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
                <Text style={styles.secondaryButtonText}>{t('add.saveToMyFoods')}</Text>
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
                {isSaving ? t('common.saving') : isEditing ? t('add.saveChanges') : t('add.saveFood')}
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
          keyboardDismissMode="none"
          keyboardShouldPersistTaps="always"
          renderItem={renderPremiumFoodResult}
          ListHeaderComponent={
            <View style={styles.addHubStack}>
              <View
                style={[
                  styles.addIntroCard,
                  surfaceStyle,
                  { borderWidth: 0, shadowColor: theme.shadow },
                ]}>
                <View style={styles.addHubTitleGroup}>
                  <Text style={[styles.title, textStyle]}>{t('add.title')}</Text>
                  <Text style={[styles.subtitle, mutedTextStyle]}>{t('add.subtitle')}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSearchSheetVisible(true)}
                  style={({ pressed }) => [
                    styles.searchLauncher,
                    inputStyle,
                    pressed && styles.buttonPressed,
                  ]}>
                  <Ionicons color={theme.mutedText} name="search" size={19} />
                  <Text style={[styles.searchLauncherText, { color: theme.mutedText }]}>
                    {t('add.searchPlaceholder')}
                  </Text>
                </Pressable>
                <View style={styles.categorySection}>
                  <ScrollView
                    horizontal
                    contentContainerStyle={styles.categoryRow}
                    keyboardShouldPersistTaps="always"
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
                            chipStyle,
                            isSelected && styles.categoryButtonSelected,
                            pressed && styles.buttonPressed,
                          ]}>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.categoryButtonText,
                              { color: isSelected ? '#FFFFFF' : theme.mutedText },
                            ]}>
                            {category}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <View pointerEvents="none" style={[styles.categoryMoreHint, { backgroundColor: theme.card }]}>
                    <Text style={[styles.categoryMoreHintText, { color: theme.mutedText }]}>›</Text>
                  </View>
                </View>
              </View>

              <View
                style={[
                  styles.addSectionCard,
                  surfaceStyle,
                  { borderWidth: 0, shadowColor: theme.shadow },
                ]}>
                <Text style={[styles.resultsTitle, textStyle]}>{t('add.scanOptions')}</Text>
                <View style={styles.primaryScanGrid}>
                  <AddQuickActionCard
                    accentColor="#2563EB"
                    delay={0}
                    icon="barcode-outline"
                    onPress={() => {
                      Keyboard.dismiss();
                      setActiveMode('scan');
                    }}
                    style={styles.quickActionGridCard}
                    subtitle={t('add.barcodeNutrition')}
                    title={t('add.scanProduct')}
                  />
                  <AddQuickActionCard
                    accentColor="#16A34A"
                    delay={70}
                    icon="camera-outline"
                    onPress={() => {
                      Keyboard.dismiss();
                      setActiveMode('mealPhoto');
                    }}
                    style={styles.quickActionGridCard}
                    subtitle={t('add.photoEstimate')}
                    title={t('add.scanMeal')}
                  />
                  <AddQuickActionCard
                    accentColor="#F97316"
                    delay={140}
                    icon="restaurant-outline"
                    onPress={() => {
                      Keyboard.dismiss();
                      openMealAiFlow();
                    }}
                    style={styles.quickActionGridCard}
                    subtitle={t('ai.recipeBuilder')}
                    title={t('add.buildMeal')}
                  />
                  <AddQuickActionCard
                    accentColor="#7C3AED"
                    delay={210}
                    icon="create-outline"
                    onPress={() => {
                      Keyboard.dismiss();
                      openCustomAiFlow();
                    }}
                    style={styles.quickActionGridCard}
                    subtitle={t('ai.createYourOwn')}
                    title={t('add.addCustom')}
                  />
                </View>
              </View>

              <View style={styles.categoryBlock}>
                <View style={styles.detachedCategorySection}>
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
                            chipStyle,
                            isSelected && styles.categoryButtonSelected,
                            pressed && styles.buttonPressed,
                          ]}>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.categoryButtonText,
                              { color: isSelected ? '#FFFFFF' : theme.mutedText },
                            ]}>
                            {category}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <View pointerEvents="none" style={[styles.categoryMoreHint, { backgroundColor: theme.background }]}>
                    <Text style={[styles.categoryMoreHintText, { color: theme.mutedText }]}>›</Text>
                  </View>
                </View>
                <Text style={[styles.resultsTitle, textStyle]}>{t('add.recentlyLogged')}</Text>
              </View>
            </View>
          }
        />
        <SearchFoodBottomSheet
          categories={categories}
          getFoodKey={getFoodKey}
          isFavorite={(food) => pinnedFoodKeys.includes(getFoodKey(food))}
          onClose={() => closeSearchSheet({ clearSearch: true })}
          onSelectFood={handleSelectFoodFromSearch}
          onToggleFavorite={(food) => togglePinnedFood(getFoodKey(food))}
          results={visibleFoods}
          searchQuery={search}
          selectedCategory={selectedCategory}
          setSearchQuery={setSearch}
          setSelectedCategory={setSelectedCategory}
          title={t('add.searchFood')}
          visible={searchSheetVisible}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function MealPhotoChoiceGroup({
  label,
  onSelect,
  options,
  selectedValue,
}: {
  label: string;
  onSelect: (value: string) => void;
  options: Array<[string, string]>;
  selectedValue: string;
}) {
  const theme = useAppTheme();

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <View style={styles.presets}>
        {options.map(([value, optionLabel]) => {
          const isSelected = selectedValue === value;

          return (
            <Pressable
              accessibilityRole="button"
              key={value}
              onPress={() => onSelect(value)}
              style={({ pressed }) => [
                styles.presetButton,
                { backgroundColor: isSelected ? theme.primary : theme.chipBackground },
                pressed && styles.buttonPressed,
              ]}>
              <Text
                style={[
                  styles.presetButtonText,
                  { color: isSelected ? '#FFFFFF' : theme.text },
                ]}>
                {optionLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function AddModeHeader({ onBack, title }: { onBack: () => void; title: string }) {
  const theme = useAppTheme();

  return (
    <View style={[styles.modeHeader, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <View style={styles.modeHeaderText}>
        <Text style={[styles.modeHeaderTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.modeHeaderSubtitle, { color: theme.mutedText }]}>Review and save when ready</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [
          styles.backToAddButton,
          { backgroundColor: theme.chipBackground },
          pressed && styles.buttonPressed,
        ]}>
        <Text style={[styles.backToAddText, { color: theme.text }]}>Back to Add</Text>
      </Pressable>
    </View>
  );
}

function NutritionFactsField({
  error,
  label,
  onChangeText,
  required,
  unit,
  value,
  variant = 'half',
}: {
  error?: string | null;
  label: string;
  onChangeText: (value: string) => void;
  required?: boolean;
  unit?: string;
  value: string;
  variant?: 'full' | 'half';
}) {
  return (
    <View style={[styles.nutritionFieldCard, variant === 'full' ? styles.nutritionFieldFull : styles.nutritionFieldHalf, error && styles.nutritionFieldCardError]}>
      <View style={styles.nutritionFieldHeader}>
        <Text numberOfLines={1} style={styles.nutritionInputLabel}>{label}</Text>
        {required ? <Text style={styles.nutritionRequiredBadge}>Required</Text> : null}
      </View>
      <View style={styles.nutritionInputRow}>
        <TextInput
          inputMode="decimal"
          keyboardType="decimal-pad"
          onChangeText={onChangeText}
          placeholder="0"
          placeholderTextColor="#9A9FA6"
          style={styles.nutritionReviewInput}
          value={value}
        />
        {unit ? <Text style={styles.nutritionUnitText}>{unit}</Text> : null}
      </View>
    </View>
  );
}

type ScanProductScreenProps = {
  onAddReviewedProduct: () => void;
  onAddScannedProductManually: (barcode: string) => void;
  onBack: () => void;
  onCompleteScannedProduct: (product: IncompleteScannedProduct) => void;
  onDismissReview: () => void;
  onInternetLookup: (barcode: string) => Promise<'found' | 'not_found' | 'error'>;
  onParseNutritionFactsText: () => void;
  onLookupBarcode: (barcode: string) => Promise<BarcodeLookupStatus>;
  incompleteProduct: IncompleteScannedProduct | null;
  networkErrorBarcode: string | null;
  nutritionFactsBarcode: string | null;
  nutritionFactsImageUri: string | null;
  nutritionFactsText: string;
  nutritionFactsOcrMessage: string | null;
  nutritionFactsStep: NutritionFactsStep;
  nutritionFactsError: string | null;
  isExtractingNutritionText: boolean;
  isSavingNutritionProduct: boolean;
  nutritionServingBasis: NutritionServingBasis;
  nutritionProductName: string;
  nutritionCalories: string;
  nutritionProtein: string;
  nutritionCarbs: string;
  nutritionFat: string;
  nutritionSugar: string;
  nutritionSalt: string;
  nutritionSaturatedFat: string;
  onBeginNutritionFactsScan: (barcode: string) => void;
  onBackToNutritionPaste: () => void;
  onCancelNutritionFacts: () => void;
  onFillNutritionFactsManually: () => void;
  onNutritionLabelImageSelected: (imageUri: string) => Promise<void>;
  onPickNutritionFactsFromGallery: (barcode: string) => Promise<void>;
  onSaveNutritionFactsProduct: () => void;
  parsedNutritionFacts: ParsedNutritionFacts | null;
  pendingFood: FoodDefinition | null;
  setNutritionCalories: (value: string) => void;
  setNutritionCarbs: (value: string) => void;
  setNutritionFactsText: (value: string) => void;
  setNutritionFat: (value: string) => void;
  setNutritionProductName: (value: string) => void;
  setNutritionProtein: (value: string) => void;
  setNutritionServingBasis: (value: NutritionServingBasis) => void;
  setNutritionSalt: (value: string) => void;
  setNutritionSaturatedFat: (value: string) => void;
  setNutritionSugar: (value: string) => void;
  tokenBalance: number;
};

function ScanProductScreen({
  onAddReviewedProduct,
  onAddScannedProductManually,
  onBack,
  onCompleteScannedProduct,
  onDismissReview,
  onInternetLookup,
  onParseNutritionFactsText,
  onLookupBarcode,
  incompleteProduct,
  networkErrorBarcode,
  nutritionFactsBarcode,
  nutritionFactsImageUri,
  nutritionFactsText,
  nutritionFactsOcrMessage,
  nutritionFactsStep,
  nutritionFactsError,
  isExtractingNutritionText,
  isSavingNutritionProduct,
  nutritionServingBasis,
  nutritionProductName,
  nutritionCalories,
  nutritionProtein,
  nutritionCarbs,
  nutritionFat,
  nutritionSugar,
  nutritionSalt,
  nutritionSaturatedFat,
  onBeginNutritionFactsScan,
  onBackToNutritionPaste,
  onCancelNutritionFacts,
  onFillNutritionFactsManually,
  onNutritionLabelImageSelected,
  onPickNutritionFactsFromGallery,
  onSaveNutritionFactsProduct,
  parsedNutritionFacts,
  pendingFood,
  setNutritionCalories,
  setNutritionCarbs,
  setNutritionFactsText,
  setNutritionFat,
  setNutritionProductName,
  setNutritionProtein,
  setNutritionServingBasis,
  setNutritionSalt,
  setNutritionSaturatedFat,
  setNutritionSugar,
  tokenBalance,
}: ScanProductScreenProps) {
  const theme = useAppTheme();
  const { t } = useLanguage();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [scanMode, setScanMode] = useState<ScanMode>('barcode');
  const [scannedValue, setScannedValue] = useState<string | null>(null);
  const [notFoundValue, setNotFoundValue] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isInternetLookingUp, setIsInternetLookingUp] = useState(false);
  const [onlineLookupMessage, setOnlineLookupMessage] = useState<string | null>(null);
  const [isCapturingNutritionLabel, setIsCapturingNutritionLabel] = useState(false);
  const [cameraPreviewLayout, setCameraPreviewLayout] = useState<LayoutRect | null>(null);
  const [nutritionFrameLayout, setNutritionFrameLayout] = useState<LayoutRect | null>(null);
  const nutritionReviewMissingFields = [
    !nutritionProductName.trim() ? 'product name' : null,
    !nutritionFactsBarcode ? 'barcode' : null,
    !isReviewNumberInRange(nutritionCalories, 0, 1000) ? 'calories' : null,
    !isReviewNumberInRange(nutritionProtein, 0, 100) ? 'protein' : null,
    !isReviewNumberInRange(nutritionCarbs, 0, 100) ? 'carbs' : null,
    !isReviewNumberInRange(nutritionFat, 0, 100) ? 'fat' : null,
  ].filter((field): field is string => Boolean(field));
  const isNutritionReviewSaveEnabled =
    nutritionFactsStep === 'review' &&
    nutritionReviewMissingFields.length === 0 &&
    tokenBalance >= 2 &&
    !isSavingNutritionProduct;
  const hasEnoughNutritionTextToParse = nutritionFactsText.trim().length >= 5;
  const hasScanResult = Boolean(scannedValue || pendingFood || incompleteProduct || networkErrorBarcode || notFoundValue);
  const hasCapturedNutritionImage = Boolean(nutritionFactsImageUri);
  const shouldShowNutritionReviewSection =
    Boolean(nutritionFactsBarcode) && hasCapturedNutritionImage && nutritionFactsStep === 'review';
  const shouldShowNutritionFallbackSection =
    Boolean(nutritionFactsBarcode) &&
    hasCapturedNutritionImage &&
    nutritionFactsStep !== 'review';
  const shouldShowNutritionReadSection = shouldShowNutritionReviewSection || shouldShowNutritionFallbackSection;
  const shouldShowCamera =
    scanMode === 'nutritionLabel'
      ? Boolean(nutritionFactsBarcode) &&
        !hasCapturedNutritionImage &&
        !shouldShowNutritionReviewSection
      : !hasScanResult;

  async function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (scannedValue) {
      return;
    }

    setScannedValue(result.data);
    setIsLookingUp(true);
    const status = await onLookupBarcode(result.data);
    setIsLookingUp(false);

    if (status === 'not_found') {
      setNotFoundValue(result.data);
    }
  }

  function resetBarcodeScanState() {
    setScanMode('barcode');
    setScannedValue(null);
    setNotFoundValue(null);
    setIsLookingUp(false);
    setIsInternetLookingUp(false);
    setOnlineLookupMessage(null);
    onDismissReview();
    onCancelNutritionFacts();
  }

  function handleScanAgain() {
    resetBarcodeScanState();
  }

  function handleStartNutritionFactsScan(barcode: string) {
    onBeginNutritionFactsScan(barcode);
    setScanMode('nutritionLabel');
  }

  function getImageSize(imageUri: string) {
    return new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(
        imageUri,
        (width, height) => resolve({ width, height }),
        (error) => reject(error),
      );
    });
  }

  async function handleCaptureNutritionLabel() {
    if (!cameraRef.current || isCapturingNutritionLabel) {
      return;
    }

    setIsCapturingNutritionLabel(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: true,
      });

      if (!photo?.uri) {
        throw new Error('Could not capture nutrition label image.');
      }

      let imageUri = photo.uri;

      try {
        const photoSize =
          photo.width && photo.height
            ? { width: photo.width, height: photo.height }
            : await getImageSize(photo.uri);

        if (!cameraPreviewLayout || !nutritionFrameLayout) {
          throw new Error('Nutrition crop layout is not ready.');
        }

        imageUri = await cropCameraImageToFrame({
          imageUri: photo.uri,
          imageWidth: photoSize.width,
          imageHeight: photoSize.height,
          previewWidth: cameraPreviewLayout.width,
          previewHeight: cameraPreviewLayout.height,
          frameX: nutritionFrameLayout.x,
          frameY: nutritionFrameLayout.y,
          frameWidth: nutritionFrameLayout.width,
          frameHeight: nutritionFrameLayout.height,
        });
      } catch (error) {
        console.error('Nutrition label crop failed', error);
      }

      await onNutritionLabelImageSelected(imageUri);
    } catch (error) {
      console.error('Nutrition label capture failed', error);
      Alert.alert('Could not capture label', 'Try again or pick a label from your gallery.');
    } finally {
      setIsCapturingNutritionLabel(false);
    }
  }

  function handleBackToBarcodeScan() {
    setScanMode('barcode');
    onCancelNutritionFacts();
  }

  function handleNotNow() {
    handleScanAgain();
  }

  async function handleTryAgain() {
    const barcode = networkErrorBarcode ?? scannedValue;

    if (!barcode) {
      handleScanAgain();
      return;
    }

    setIsLookingUp(true);
    const status = await onLookupBarcode(barcode);
    setIsLookingUp(false);

    if (status === 'not_found') {
      setNotFoundValue(barcode);
    }
  }

  async function handleInternetLookup() {
    const barcode = notFoundValue ?? networkErrorBarcode ?? scannedValue;

    if (!barcode || isInternetLookingUp) {
      return;
    }

    setIsInternetLookingUp(true);
    setOnlineLookupMessage(null);

    try {
      const status = await onInternetLookup(barcode);

      if (status === 'found') {
        setNotFoundValue(null);
      } else if (status === 'not_found') {
        setOnlineLookupMessage(t('barcode.productNotFoundOnline'));
      } else {
        setOnlineLookupMessage(t('barcode.lookupFailed'));
      }
    } finally {
      setIsInternetLookingUp(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={styles.keyboardView}>
      <Screen scroll={false}>
        <View style={styles.scanProductScreen}>
          <View style={styles.scanFixedHeader}>
            <View style={styles.scanHeaderTopRow}>
              <Pressable
                accessibilityRole="button"
                onPress={onBack}
                style={({ pressed }) => [styles.scanBackButton, pressed && styles.buttonPressed]}>
                <Ionicons name="chevron-back" size={16} color={theme.primary} />
                <Text style={[styles.scanBackText, { color: theme.primary }]}>{t('common.back')}</Text>
              </Pressable>
              <View style={[styles.scanTokenPill, { backgroundColor: theme.success + '18' }]}>
                <Ionicons name="leaf-outline" size={14} color={theme.success} />
                <Text style={[styles.scanTokenText, { color: theme.success }]}>
                  {t('scanProduct.tokens', { count: tokenBalance })}
                </Text>
              </View>
            </View>
            <View style={styles.scanHeaderTextBlock}>
              <Text style={[styles.scanHeaderTitle, { color: theme.text }]}>{t('scanProduct.title')}</Text>
              <Text style={[styles.scanHeaderSubtitle, { color: theme.mutedText }]}>
                {t('scanProduct.scanDescription')}
              </Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.scanProductScrollContent}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>

          {!permission ? (
            <Text style={[styles.foodResultMeta, { color: theme.mutedText }]}>{t('scanProduct.checkingPermission')}</Text>
          ) : !permission.granted ? (
            <View style={[styles.manualPrompt, { backgroundColor: theme.cardAlt }]}>
              <Text style={[styles.manualPromptText, { color: theme.text }]}>{t('scanProduct.cameraPermissionRequired')}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={requestPermission}
                style={({ pressed }) => [styles.manualButton, pressed && styles.buttonPressed]}>
                <Text style={styles.manualButtonText}>{t('scanProduct.allowCamera')}</Text>
              </Pressable>
            </View>
          ) : !shouldShowCamera ? null : (
            <>
              <View
                onLayout={(event) => setCameraPreviewLayout(event.nativeEvent.layout)}
                style={[styles.cameraContainer, { shadowColor: theme.shadow }]}>
                <CameraView
                  ref={cameraRef}
                  barcodeScannerSettings={{
                    barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
                  }}
                  onBarcodeScanned={
                    scanMode === 'barcode' && !scannedValue ? handleBarcodeScanned : undefined
                  }
                  style={styles.camera}
                />
                <View pointerEvents="none" style={styles.cameraDimOverlay} />
                {scanMode === 'nutritionLabel' ? (
                  <View pointerEvents="box-none" style={styles.nutritionCameraOverlay}>
                    <View
                      onLayout={(event) => setNutritionFrameLayout(event.nativeEvent.layout)}
                      style={styles.nutritionFrame}>
                      <View style={[styles.frameCorner, styles.frameCornerTopLeft]} />
                      <View style={[styles.frameCorner, styles.frameCornerTopRight]} />
                      <View style={[styles.frameCorner, styles.frameCornerBottomLeft]} />
                      <View style={[styles.frameCorner, styles.frameCornerBottomRight]} />
                      <View style={styles.nutritionFramePill}>
                        <Ionicons name="document-text-outline" size={14} color="#FFFFFF" />
                        <Text style={styles.nutritionFrameText}>{t('scanProduct.nutritionFacts')}</Text>
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>

              {scanMode === 'nutritionLabel' ? (
                <View style={styles.captureLabelSection}>
                  <View style={styles.captureInstructionRow}>
                    <View style={[styles.captureInstructionIcon, { backgroundColor: theme.success + '18' }]}>
                      <Ionicons name="sparkles-outline" size={15} color={theme.success} />
                    </View>
                    <Text style={[styles.captureInstructionText, { color: theme.mutedText }]}>
                      {t('scanProduct.labelFrameTip')}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isCapturingNutritionLabel || isExtractingNutritionText}
                    onPress={handleCaptureNutritionLabel}
                    style={({ pressed }) => [
                      styles.capturePrimaryButton,
                      { backgroundColor: theme.primary, shadowColor: theme.primary },
                      (isCapturingNutritionLabel || isExtractingNutritionText) && styles.buttonDisabled,
                      pressed && styles.buttonPressed,
                    ]}>
                    <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.capturePrimaryButtonText}>
                      {isCapturingNutritionLabel || isExtractingNutritionText
                        ? t('scanProduct.readingNutritionLabel')
                        : t('scanProduct.captureNutritionLabel')}
                    </Text>
                  </Pressable>
                  <View style={styles.captureSecondaryRow}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        const barcode = nutritionFactsBarcode ?? notFoundValue ?? incompleteProduct?.barcode;

                        if (barcode) {
                          void onPickNutritionFactsFromGallery(barcode);
                        }
                      }}
                      style={({ pressed }) => [
                        styles.captureSecondaryButton,
                        { backgroundColor: theme.cardAlt },
                        pressed && styles.buttonPressed,
                      ]}>
                      <Text style={[styles.captureSecondaryText, { color: theme.text }]}>
                        {t('scanProduct.pickLabelFromGallery')}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={handleBackToBarcodeScan}
                      style={({ pressed }) => [
                        styles.captureSecondaryButton,
                        { backgroundColor: theme.cardAlt },
                        pressed && styles.buttonPressed,
                      ]}>
                      <Text style={[styles.captureSecondaryText, { color: theme.text }]}>
                        {t('scanProduct.backToBarcode')}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={[styles.captureTipsRow, { backgroundColor: theme.success + '0F' }]}>
                    {[
                      ['sunny-outline', 'Good lighting'],
                      ['resize-outline', 'Keep text flat'],
                      ['eye-off-outline', 'Avoid glare'],
                    ].map(([icon, label]) => (
                      <View key={label} style={styles.captureTipChip}>
                        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={13} color={theme.success} />
                        <Text style={[styles.captureTipText, { color: theme.text }]}>{label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          )}

          {isLookingUp ? (
            <View style={[styles.manualPrompt, { backgroundColor: theme.cardAlt }]}>
              <Text style={[styles.manualPromptText, { color: theme.text }]}>{t('scanProduct.lookingUpProduct')}</Text>
              <Text style={[styles.foodResultMeta, { color: theme.mutedText }]}>{t('scanProduct.checkingCacheAndOff')}</Text>
            </View>
          ) : null}

          {pendingFood && !isLookingUp ? (
            <ProductRatingCard
              food={pendingFood}
              onAddToToday={onAddReviewedProduct}
              onDismiss={handleNotNow}
            />
          ) : null}

          {incompleteProduct && !isLookingUp && !nutritionFactsBarcode ? (
            <View style={[styles.notFoundBox, { backgroundColor: theme.cardAlt }]}>
              <Text style={[styles.manualPromptText, { color: theme.text }]}>
                {t('scanProduct.productDataIncomplete')}
              </Text>
              <Text style={[styles.foodResultMeta, { color: theme.mutedText }]}>
                {incompleteProduct.name}
                {incompleteProduct.brand ? ` - ${incompleteProduct.brand}` : ''}
              </Text>
              <Text style={[styles.foodResultMeta, { color: theme.mutedText }]}>
                {t('scanProduct.barcode', { barcode: incompleteProduct.barcode })}
              </Text>
              <Text style={[styles.foodResultMeta, { color: theme.mutedText }]}>
                {incompleteProduct.validation.reason}
              </Text>
              <View style={styles.actionColumn}>
                <Pressable
                  accessibilityRole="button"
                  disabled={nutritionFactsStep === 'loading' || isExtractingNutritionText}
                  onPress={() => handleStartNutritionFactsScan(incompleteProduct.barcode)}
                  style={({ pressed }) => [
                    styles.manualButton,
                    styles.fullWidthButton,
                    (nutritionFactsStep === 'loading' || isExtractingNutritionText) && styles.buttonDisabled,
                    pressed && styles.buttonPressed,
                  ]}>
                  <Text style={styles.manualButtonText}>{t('scanProduct.scanNutritionFacts')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onCompleteScannedProduct(incompleteProduct)}
                  style={({ pressed }) => [styles.secondaryButton, styles.fullWidthButton, pressed && styles.buttonPressed]}>
                  <Text style={styles.manualButtonText}>{t('scanProduct.completeManually')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleScanAgain}
                  style={({ pressed }) => [styles.manualButton, styles.fullWidthButton, pressed && styles.buttonPressed]}>
                  <Text style={styles.secondaryButtonText}>{t('scanProduct.scanAgain')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {networkErrorBarcode && !isLookingUp ? (
            <View style={[styles.notFoundBox, { backgroundColor: theme.isDark ? '#3B241D' : '#F8EDE9' }]}>
              <Text style={[styles.manualPromptText, { color: theme.text }]}>
                {t('barcode.couldNotCheckDatabase')}
              </Text>
              <Text style={[styles.foodResultMeta, { color: theme.mutedText }]}>
                {t('scanProduct.barcode', { barcode: networkErrorBarcode })}
              </Text>
              {onlineLookupMessage ? (
                <Text style={[styles.foodResultMeta, { color: theme.warning }]}>{onlineLookupMessage}</Text>
              ) : null}
              <View style={styles.actionColumn}>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleTryAgain}
                  style={({ pressed }) => [styles.manualButton, styles.fullWidthButton, pressed && styles.buttonPressed]}>
                  <Text style={styles.manualButtonText}>{t('scanProduct.tryAgain')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isInternetLookingUp}
                  onPress={handleInternetLookup}
                  style={({ pressed }) => [
                    styles.manualButton,
                    styles.fullWidthButton,
                    isInternetLookingUp && styles.buttonDisabled,
                    pressed && styles.buttonPressed,
                  ]}>
                  <Text style={styles.manualButtonText}>
                    {isInternetLookingUp ? t('common.loading') : t('barcode.internetLookupTokens')}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={nutritionFactsStep === 'loading' || isExtractingNutritionText}
                  onPress={() => handleStartNutritionFactsScan(networkErrorBarcode)}
                  style={({ pressed }) => [
                    styles.manualButton,
                    styles.fullWidthButton,
                    (nutritionFactsStep === 'loading' || isExtractingNutritionText) && styles.buttonDisabled,
                    pressed && styles.buttonPressed,
                  ]}>
                  <Text style={styles.manualButtonText}>{t('barcode.scanNutritionLabel')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onAddScannedProductManually(networkErrorBarcode)}
                  style={({ pressed }) => [styles.secondaryButton, styles.fullWidthButton, pressed && styles.buttonPressed]}>
                  <Text style={styles.secondaryButtonText}>{t('scanProduct.addManually')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {notFoundValue && !nutritionFactsBarcode ? (
            <View style={[styles.notFoundBox, { backgroundColor: theme.isDark ? '#3B241D' : '#F8EDE9' }]}>
              <Text style={[styles.manualPromptText, { color: theme.text }]}>{t('barcode.couldNotCheckDatabase')}</Text>
              <Text style={[styles.foodResultMeta, { color: theme.mutedText }]}>{t('scanProduct.barcode', { barcode: notFoundValue })}</Text>
              {onlineLookupMessage ? (
                <Text style={[styles.foodResultMeta, { color: theme.warning }]}>{onlineLookupMessage}</Text>
              ) : null}
              <View style={styles.actionColumn}>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleScanAgain}
                  style={({ pressed }) => [styles.manualButton, styles.fullWidthButton, pressed && styles.buttonPressed]}>
                  <Text style={styles.manualButtonText}>{t('scanProduct.tryAgain')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isInternetLookingUp}
                  onPress={handleInternetLookup}
                  style={({ pressed }) => [
                    styles.manualButton,
                    styles.fullWidthButton,
                    isInternetLookingUp && styles.buttonDisabled,
                    pressed && styles.buttonPressed,
                  ]}>
                  <Text style={styles.manualButtonText}>
                    {isInternetLookingUp ? t('common.loading') : t('barcode.internetLookupTokens')}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={nutritionFactsStep === 'loading' || isExtractingNutritionText}
                  onPress={() => handleStartNutritionFactsScan(notFoundValue)}
                  style={({ pressed }) => [
                    styles.manualButton,
                    styles.fullWidthButton,
                    (nutritionFactsStep === 'loading' || isExtractingNutritionText) && styles.buttonDisabled,
                    pressed && styles.buttonPressed,
                  ]}>
                  <Text style={styles.manualButtonText}>
                    {nutritionFactsStep === 'loading' || isExtractingNutritionText
                      ? 'Reading nutrition label...'
                      : t('barcode.scanNutritionLabel')}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onAddScannedProductManually(notFoundValue)}
                  style={({ pressed }) => [styles.secondaryButton, styles.fullWidthButton, pressed && styles.buttonPressed]}>
                  <Text style={styles.secondaryButtonText}>{t('scanProduct.addManually')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {shouldShowNutritionReadSection && nutritionFactsBarcode ? (
            <View style={nutritionFactsStep === 'review' ? styles.nutritionFlow : styles.nutritionReadFlow}>
              {nutritionFactsStep === 'review' ? (
                <>
                  <View style={styles.nutritionFlowHeader}>
                    <Pressable accessibilityRole="button" onPress={onBackToNutritionPaste}>
                      <Text style={styles.nutritionBackText}>{t('common.back')}</Text>
                    </Pressable>
                    <Text style={styles.nutritionFlowTitle}>{t('scanProduct.reviewNutrition')}</Text>
                    <Text style={styles.nutritionFlowSubtitle}>{t('scanProduct.checkValuesBeforeSaving')}</Text>
                  </View>

                  <View style={styles.nutritionSummaryCard}>
                    {nutritionFactsImageUri ? (
                      <Image source={{ uri: nutritionFactsImageUri }} style={styles.nutritionThumbnail} />
                    ) : (
                      <View style={styles.nutritionThumbnailPlaceholder} />
                    )}
                    <View style={styles.nutritionSummaryText}>
                      <TextInput
                        onChangeText={setNutritionProductName}
                        placeholder={t('scanProduct.scannedProduct')}
                        placeholderTextColor="#9A9FA6"
                        style={styles.nutritionNameInput}
                        value={nutritionProductName}
                      />
                      <Text style={styles.nutritionBarcodeText}>{t('scanProduct.barcode', { barcode: nutritionFactsBarcode })}</Text>
                    </View>
                  </View>

                  {parsedNutritionFacts?.missingFields.length ? (
                    <Text style={styles.nutritionInlineWarning}>
                      {t('scanProduct.missing', { fields: parsedNutritionFacts.missingFields.join(', ') })}
                    </Text>
                  ) : null}

                  <View style={styles.nutritionGrid}>
                    <NutritionFactsField
                      error={!isReviewNumberInRange(nutritionCalories, 0, 1000) ? 'Required' : null}
                      label={t('nutrition.calories')}
                      required
                      unit="kcal"
                      variant="full"
                      value={nutritionCalories}
                      onChangeText={setNutritionCalories}
                    />
                    <NutritionFactsField
                      error={!isReviewNumberInRange(nutritionProtein, 0, 100) ? 'Required' : null}
                      label={t('nutrition.protein')}
                      required
                      unit="g"
                      value={nutritionProtein}
                      onChangeText={setNutritionProtein}
                    />
                    <NutritionFactsField
                      error={!isReviewNumberInRange(nutritionCarbs, 0, 100) ? 'Required' : null}
                      label={t('nutrition.carbs')}
                      required
                      unit="g"
                      value={nutritionCarbs}
                      onChangeText={setNutritionCarbs}
                    />
                    <NutritionFactsField
                      error={!isReviewNumberInRange(nutritionFat, 0, 100) ? 'Required' : null}
                      label={t('nutrition.fat')}
                      required
                      unit="g"
                      value={nutritionFat}
                      onChangeText={setNutritionFat}
                    />
                    <NutritionFactsField label={t('nutrition.sugar')} unit="g" value={nutritionSugar} onChangeText={setNutritionSugar} />
                    <NutritionFactsField label={t('nutrition.salt')} unit="g" value={nutritionSalt} onChangeText={setNutritionSalt} />
                    <NutritionFactsField
                      label={t('nutrition.saturatedFat')}
                      unit="g"
                      value={nutritionSaturatedFat}
                      onChangeText={setNutritionSaturatedFat}
                    />
                  </View>

                  <View style={styles.nutritionSectionCard}>
                    <Text style={styles.nutritionSectionTitle}>{t('nutrition.servingBasis')}</Text>
                    <View style={styles.nutritionSegment}>
                      {(['100g', '100ml', 'serving'] as NutritionServingBasis[]).map((basis) => {
                        const active = nutritionServingBasis === basis;
                        const label = basis === '100g'
                          ? t('nutrition.per100g')
                          : basis === '100ml'
                            ? t('nutrition.per100ml')
                            : t('nutrition.perServing');

                        return (
                          <Pressable
                            accessibilityRole="button"
                            key={basis}
                            onPress={() => setNutritionServingBasis(basis)}
                            style={[styles.nutritionSegmentButton, active && styles.nutritionSegmentButtonActive]}>
                            <Text style={[styles.nutritionSegmentText, active && styles.nutritionSegmentTextActive]}>
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {nutritionReviewMissingFields.length > 0 ? (
                    <Text style={styles.nutritionInlineWarning}>
                      Complete required values: {nutritionReviewMissingFields.join(', ')}.
                    </Text>
                  ) : null}
                  {tokenBalance < 2 ? (
                    <Text style={styles.nutritionInlineWarning}>Not enough tokens</Text>
                  ) : null}

                  <View style={styles.nutritionActionBar}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!isNutritionReviewSaveEnabled}
                      onPress={onSaveNutritionFactsProduct}
                      style={({ pressed }) => [
                        styles.nutritionPrimaryButton,
                        !isNutritionReviewSaveEnabled && styles.buttonDisabled,
                        pressed && styles.buttonPressed,
                      ]}>
                      <Text style={styles.nutritionPrimaryText}>
                        {isSavingNutritionProduct
                          ? t('common.saving')
                          : t('scanProduct.saveProductTokens', { count: 2 })}
                      </Text>
                    </Pressable>
                    <View style={styles.nutritionSecondaryActions}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => handleStartNutritionFactsScan(nutritionFactsBarcode)}
                        style={({ pressed }) => [styles.nutritionGhostButton, styles.flexField, pressed && styles.buttonPressed]}>
                        <Text style={styles.nutritionGhostText}>{t('common.retake')}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={onCancelNutritionFacts}
                        style={({ pressed }) => [styles.nutritionGhostButton, styles.flexField, pressed && styles.buttonPressed]}>
                        <Text style={styles.nutritionGhostText}>{t('common.cancel')}</Text>
                      </Pressable>
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.nutritionFlowHeader}>
                    <Pressable accessibilityRole="button" onPress={handleBackToBarcodeScan}>
                      <Text style={styles.nutritionBackText}>{t('common.back')}</Text>
                    </Pressable>
                    <Text style={styles.nutritionFlowTitle}>Read nutrition label</Text>
                    <Text style={styles.nutritionFlowSubtitle}>
                      We couldn't read this product automatically.
                    </Text>
                  </View>

                  <View style={styles.nutritionImageCard}>
                    {nutritionFactsImageUri ? (
                      <Image source={{ uri: nutritionFactsImageUri }} style={styles.nutritionFactsImage} />
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleStartNutritionFactsScan(nutritionFactsBarcode)}
                      style={styles.nutritionRetakePill}>
                      <Text style={styles.nutritionRetakeText}>{t('common.retake')}</Text>
                    </Pressable>
                  </View>

                  <View style={styles.nutritionInfoNotice}>
                    <View style={styles.nutritionInfoIcon}>
                      <Ionicons name="information-circle-outline" size={18} color="#2E7D57" />
                    </View>
                    <View style={styles.nutritionInfoTextBlock}>
                      <Text style={styles.nutritionInfoTitle}>Manual entry needed</Text>
                      <Text style={styles.nutritionInfoBody}>
                        OCR is not available in this build. You can add this food manually.
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={onFillNutritionFactsManually}
                    style={({ pressed }) => [
                      styles.nutritionPrimaryButton,
                      pressed && styles.buttonPressed,
                    ]}>
                    <Text style={styles.nutritionPrimaryText}>Add my food manually</Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : null}
          </ScrollView>
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
    gap: 12,
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
  addHubStack: {
    gap: 14,
  },
  addIntroCard: {
    zIndex: 5,
    gap: 12,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 16,
    shadowColor: '#1E1F24',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 22,
    elevation: 1,
  },
  addSectionCard: {
    gap: 12,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: 14,
    shadowColor: '#1E1F24',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.035,
    shadowRadius: 16,
    elevation: 1,
  },
  categoryBlock: {
    gap: 12,
    paddingTop: 2,
  },
  addHubHeader: {
    gap: 18,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 20,
    shadowColor: '#1E1F24',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 26,
    elevation: 3,
  },
  addHubTitleGroup: {
    gap: 3,
  },
  addHubSearchInput: {
    minHeight: 56,
    borderRadius: 20,
    paddingHorizontal: 18,
    fontSize: 16,
    fontWeight: '800',
  },
  searchLauncher: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  searchLauncherText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  addHubSectionHeader: {
    marginBottom: -6,
  },
  primaryScanGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickActionGridCard: {
    width: '48%',
    minHeight: 86,
  },
  aiDescriptionInput: {
    minHeight: 116,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  aiNote: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
  },
  aiWarningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 12,
    padding: 12,
  },
  aiProviderBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  aiProviderBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  aiInlineButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  aiInlineButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  aiResultList: {
    gap: 10,
  },
  buildMealAiScrollContent: {
    gap: 18,
    paddingBottom: 140,
  },
  buildMealIntroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 2,
  },
  buildMealIntroIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  buildMealIntroCopy: {
    flex: 1,
    gap: 3,
  },
  buildMealIntroTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  buildMealIntroSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  mealComposerPanel: {
    gap: 10,
    borderRadius: 22,
    padding: 16,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 1,
  },
  mealComposerLabel: {
    fontSize: 14,
    fontWeight: '900',
  },
  mealComposerInput: {
    minHeight: 132,
    padding: 0,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  mealComposerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  mealComposerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mealComposerPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  mealComposerCount: {
    fontSize: 12,
    fontWeight: '800',
  },
  buildMealHelperChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  buildMealHelperChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  buildMealHelperChipText: {
    fontSize: 11,
    fontWeight: '900',
  },
  buildMealTokenNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 16,
    padding: 12,
  },
  buildMealTokenText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
  },
  buildMealTokenButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
  },
  buildMealTokenButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  buildMealActions: {
    gap: 10,
  },
  buildMealGenerateButton: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 16,
    paddingHorizontal: 18,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 2,
  },
  buildMealGenerateText: {
    fontSize: 15,
    fontWeight: '900',
  },
  buildMealManualButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 18,
  },
  buildMealManualText: {
    fontSize: 15,
    fontWeight: '900',
  },
  buildMealOrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  buildMealOrLine: {
    height: 1,
    flex: 1,
  },
  buildMealOrText: {
    fontSize: 12,
    fontWeight: '800',
  },
  buildMealExamples: {
    gap: 10,
    paddingTop: 4,
  },
  buildMealExamplesTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  buildMealExampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  buildMealExampleDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  buildMealExampleText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryActionButton: {
    minHeight: 42,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '900',
  },
  searchDropdown: {
    maxHeight: 320,
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 8,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  searchDropdownHeader: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
  },
  searchDropdownTitle: {
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  dropdownClearButton: {
    minHeight: 30,
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 8,
  },
  dropdownClearText: {
    fontSize: 12,
    fontWeight: '900',
  },
  searchDropdownList: {
    maxHeight: 260,
  },
  dropdownResultRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dropdownFoodAvatar: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  dropdownFoodAvatarText: {
    fontSize: 19,
  },
  dropdownFoodMain: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  dropdownFoodName: {
    fontSize: 14,
    fontWeight: '900',
  },
  dropdownFoodMeta: {
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownFoodTrailing: {
    alignItems: 'flex-end',
    minWidth: 42,
  },
  dropdownFoodCalories: {
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 19,
  },
  dropdownFoodCalLabel: {
    fontSize: 10,
    fontWeight: '900',
  },
  dropdownPinButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
  },
  dropdownPinText: {
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18,
  },
  dropdownEmptyState: {
    gap: 10,
    alignItems: 'center',
    padding: 18,
  },
  dropdownEmptyTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  dropdownAddButton: {
    minHeight: 42,
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  dropdownAddButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  modeHeader: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  modeHeaderText: {
    flex: 1,
    gap: 3,
  },
  modeHeaderTitle: {
    fontSize: 22,
    fontWeight: '900',
  },
  modeHeaderSubtitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  backToAddButton: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  backToAddText: {
    fontSize: 13,
    fontWeight: '900',
  },
  scanProductScreen: {
    flex: 1,
  },
  scanFixedHeader: {
    gap: 10,
    paddingBottom: 14,
  },
  scanHeaderTopRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  scanBackButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingRight: 10,
  },
  scanBackText: {
    fontSize: 13,
    fontWeight: '900',
  },
  scanTokenPill: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
  },
  scanTokenText: {
    fontSize: 12,
    fontWeight: '900',
  },
  scanHeaderTextBlock: {
    gap: 4,
  },
  scanHeaderTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
  },
  scanHeaderSubtitle: {
    maxWidth: 330,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  scanProductScrollContent: {
    gap: 18,
    paddingBottom: 140,
  },
  scanMealScrollContent: {
    gap: 18,
    paddingBottom: 140,
  },
  scanMealHeroPanel: {
    gap: 16,
    borderRadius: 24,
    padding: 20,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.05,
    shadowRadius: 22,
    elevation: 2,
  },
  scanMealHeroIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  scanMealHeroText: {
    gap: 6,
  },
  scanMealHeroTitle: {
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 27,
  },
  scanMealHeroDescription: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  scanMealBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scanMealBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  scanMealBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  scanMealActionGroup: {
    gap: 10,
  },
  scanMealPrimaryButton: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 16,
    paddingHorizontal: 18,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 3,
  },
  scanMealPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  scanMealSecondaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 16,
    paddingHorizontal: 18,
  },
  scanMealSecondaryText: {
    fontSize: 15,
    fontWeight: '900',
  },
  scanMealTipsSection: {
    gap: 10,
  },
  scanMealTipsTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  scanMealTipsPanel: {
    gap: 10,
    borderRadius: 18,
    padding: 12,
  },
  scanMealTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scanMealTipIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  scanMealTipText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
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
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: -8,
    color: '#6B6F76',
    fontSize: 14,
    lineHeight: 20,
  },
  tokenText: {
    color: '#2E7D57',
    fontSize: 15,
    fontWeight: '900',
  },
  mealNameCard: {
    gap: 4,
    borderRadius: 8,
    backgroundColor: '#F7F7F2',
    padding: 14,
  },
  mealNameTitle: {
    color: '#1E1F24',
    fontSize: 24,
    fontWeight: '900',
  },
  mealNameHint: {
    color: '#6B6F76',
    fontSize: 13,
    fontWeight: '800',
  },
  nameEditRow: {
    flexDirection: 'row',
    gap: 10,
  },
  nameEditInput: {
    flex: 1,
  },
  doneButton: {
    minWidth: 78,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
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
  nutritionTextInput: {
    minHeight: 112,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  nutritionFactsImage: {
    width: '100%',
    height: 150,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
  },
  nutritionFlow: {
    gap: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 24,
    backgroundColor: '#FAFBFC',
    padding: 18,
    paddingBottom: 28,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 2,
  },
  nutritionReadFlow: {
    gap: 18,
    paddingBottom: 28,
  },
  nutritionFlowHeader: {
    gap: 5,
  },
  nutritionBackText: {
    alignSelf: 'flex-start',
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '900',
  },
  nutritionFlowTitle: {
    color: '#111827',
    fontSize: 25,
    fontWeight: '900',
  },
  nutritionFlowSubtitle: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  nutritionImageCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
  },
  nutritionRetakePill: {
    position: 'absolute',
    top: 16,
    right: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  nutritionRetakeText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '900',
  },
  nutritionSectionCard: {
    gap: 7,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  nutritionSectionTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
  },
  nutritionHelpText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
  },
  nutritionInputLabel: {
    color: '#1F2937',
    fontSize: 13,
    fontWeight: '900',
  },
  nutritionPasteInput: {
    minHeight: 150,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    color: '#111827',
    paddingHorizontal: 14,
    paddingTop: 14,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  nutritionPrimaryButton: {
    minHeight: 52,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
  },
  nutritionPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  nutritionTextButton: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  nutritionSubtleNote: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
  },
  nutritionInfoNotice: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 18,
    backgroundColor: '#ECF7F0',
    padding: 14,
  },
  nutritionInfoIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
  },
  nutritionInfoTextBlock: {
    flex: 1,
    gap: 3,
  },
  nutritionInfoTitle: {
    color: '#1F2937',
    fontSize: 14,
    fontWeight: '900',
  },
  nutritionInfoBody: {
    color: '#5F6B64',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  nutritionSummaryCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 12,
  },
  nutritionThumbnail: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  nutritionThumbnailPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  nutritionSummaryText: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  nutritionNameInput: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    color: '#111827',
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '900',
  },
  nutritionBarcodeText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
  },
  nutritionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  nutritionFieldCard: {
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: 12,
  },
  nutritionFieldCardError: {
    borderColor: '#D97706',
    backgroundColor: '#FFFBEB',
  },
  nutritionFieldFull: {
    width: '100%',
  },
  nutritionFieldHalf: {
    width: '47.8%',
    minWidth: 132,
    flexGrow: 1,
  },
  nutritionFieldHeader: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  nutritionReviewInput: {
    minHeight: 42,
    flex: 1,
    color: '#111827',
    fontSize: 20,
    fontWeight: '900',
    padding: 0,
  },
  nutritionInputRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
  },
  nutritionRequiredBadge: {
    color: '#B45309',
    fontSize: 10,
    fontWeight: '900',
  },
  nutritionUnitText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '900',
  },
  nutritionInlineWarning: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
  },
  nutritionSegment: {
    flexDirection: 'row',
    gap: 8,
  },
  nutritionSegmentButton: {
    minHeight: 40,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 6,
  },
  nutritionSegmentButtonActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  nutritionSegmentText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '900',
  },
  nutritionSegmentTextActive: {
    color: '#2563EB',
  },
  nutritionActionBar: {
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 8,
  },
  nutritionSecondaryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  nutritionGhostButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
  },
  nutritionGhostText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '900',
  },
  inputError: {
    borderColor: '#B95C3A',
    backgroundColor: '#FFF7F4',
  },
  errorText: {
    color: '#B95C3A',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  categoryRow: {
    gap: 8,
    paddingRight: 42,
  },
  categorySection: {
    position: 'relative',
    marginTop: -2,
  },
  detachedCategorySection: {
    display: 'none',
  },
  categoryMoreHint: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 32,
    height: 36,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 2,
  },
  categoryMoreHintText: {
    fontSize: 22,
    fontWeight: '900',
  },
  categoryButton: {
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: '#F1F3EF',
    paddingHorizontal: 14,
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
    backgroundColor: '#1E1F24',
  },
  cameraContainer: {
    minHeight: 360,
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#1E1F24',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 4,
  },
  cameraDimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3,10,8,0.24)',
  },
  nutritionCameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  nutritionFrame: {
    width: '88%',
    height: 198,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  frameCorner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  frameCornerTopLeft: {
    top: -1,
    left: -1,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopLeftRadius: 22,
  },
  frameCornerTopRight: {
    top: -1,
    right: -1,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderTopRightRadius: 22,
  },
  frameCornerBottomLeft: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderBottomLeftRadius: 22,
  },
  frameCornerBottomRight: {
    right: -1,
    bottom: -1,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderBottomRightRadius: 22,
  },
  nutritionFramePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.56)',
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  nutritionFrameText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  nutritionCameraTip: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  nutritionCameraActions: {
    gap: 8,
    marginTop: 12,
  },
  captureLabelSection: {
    gap: 14,
  },
  captureInstructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 2,
  },
  captureInstructionIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  captureInstructionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  capturePrimaryButton: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 16,
    paddingHorizontal: 18,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 3,
  },
  capturePrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  captureSecondaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  captureSecondaryButton: {
    minHeight: 44,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  captureSecondaryText: {
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  captureTipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderRadius: 18,
    padding: 10,
  },
  captureTipChip: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
  },
  captureTipText: {
    fontSize: 11,
    fontWeight: '800',
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
  actionColumn: {
    gap: 10,
  },
  fullWidthButton: {
    width: '100%',
    minHeight: 48,
  },
  flexField: {
    flex: 1,
  },
  unitField: {
    width: 96,
  },
  estimateStack: {
    gap: 12,
  },
  mealLabelChips: {
    gap: 8,
    paddingRight: 8,
  },
  mealLabelChip: {
    minHeight: 36,
    maxWidth: 132,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
  },
  mealLabelChipText: {
    fontSize: 13,
    fontWeight: '900',
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
