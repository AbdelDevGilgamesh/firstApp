export type ValidationErrors<T extends string> = Partial<Record<T, string>>;

export function validateName(value: string, label = 'Food name') {
  const trimmed = value.trim();

  if (!trimmed) {
    return `${label} is required.`;
  }

  if (trimmed.length > 80) {
    return `${label} must be 80 characters or less.`;
  }

  return null;
}

export function validateNumberRange(
  value: string,
  label: string,
  min: number,
  max: number,
  options: { inclusiveMin?: boolean } = {},
) {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  const inclusiveMin = options.inclusiveMin ?? true;

  if (!trimmed || !Number.isFinite(parsed)) {
    return `${label} must be a number.`;
  }

  if (inclusiveMin ? parsed < min : parsed <= min) {
    return inclusiveMin ? `${label} must be at least ${min}.` : `${label} must be greater than ${min}.`;
  }

  if (parsed > max) {
    return `${label} must be ${max} or less.`;
  }

  return null;
}

export function validateUnit(value: string) {
  if (!value.trim()) {
    return 'Unit is required.';
  }

  return null;
}

export function getFoodFormErrors(values: {
  name: string;
  quantity: string;
  unit: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}) {
  return {
    name: validateName(values.name),
    quantity: validateNumberRange(values.quantity, 'Quantity', 0, 10000, { inclusiveMin: false }),
    unit: validateUnit(values.unit),
    calories: validateNumberRange(values.calories, 'Calories', 0, 5000),
    protein: validateNumberRange(values.protein, 'Protein', 0, 1000),
    carbs: validateNumberRange(values.carbs, 'Carbs', 0, 1000),
    fat: validateNumberRange(values.fat, 'Fat', 0, 1000),
  };
}

export function hasErrors(errors: Record<string, string | null | undefined>) {
  return Object.values(errors).some(Boolean);
}
