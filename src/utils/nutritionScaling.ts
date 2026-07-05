export type NutritionValues = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number;
  sodium?: number;
};

export function roundNutrition(value: number, digits = 1) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function scaleNutrition(
  nutrition: NutritionValues,
  fromQuantity: number,
  toQuantity: number,
): NutritionValues {
  if (!Number.isFinite(fromQuantity) || fromQuantity <= 0 || !Number.isFinite(toQuantity) || toQuantity < 0) {
    return {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      sugar: nutrition.sugar === undefined ? undefined : 0,
      sodium: nutrition.sodium === undefined ? undefined : 0,
    };
  }

  const scale = toQuantity / fromQuantity;

  return {
    calories: Math.round(nutrition.calories * scale),
    protein: roundNutrition(nutrition.protein * scale),
    carbs: roundNutrition(nutrition.carbs * scale),
    fat: roundNutrition(nutrition.fat * scale),
    sugar: nutrition.sugar === undefined ? undefined : roundNutrition(nutrition.sugar * scale),
    sodium: nutrition.sodium === undefined ? undefined : roundNutrition(nutrition.sodium * scale),
  };
}

export function parseServingSize(servingSize?: string | null) {
  if (!servingSize) {
    return { quantity: null, unit: null };
  }

  const match = servingSize.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);

  if (!match) {
    return { quantity: null, unit: servingSize.trim() || null };
  }

  const quantity = Number(match[1].replace(',', '.'));

  return {
    quantity: Number.isFinite(quantity) ? quantity : null,
    unit: match[2].trim() || null,
  };
}
