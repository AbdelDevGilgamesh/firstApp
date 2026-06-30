export type ParsedNutritionFacts = {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  sugar?: number;
  salt?: number;
  saturatedFat?: number;
  servingSize?: string;
  baseQuantity?: number;
  unit?: 'g' | 'ml';
  confidence: 'low' | 'medium';
  missingFields: string[];
  rawText: string;
};

type NutritionKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'sugar' | 'salt' | 'saturatedFat';

const LABELS: Record<NutritionKey, string[]> = {
  calories: ['valeur energetique', 'calories', 'kcal', 'energy', 'energie'],
  protein: ['proteines', 'proteine', 'protein', 'proteins'],
  carbs: ['carbohydrate', 'carbohydrates', 'carbs', 'glucides'],
  fat: ['lipides', 'matieres grasses', 'fat'],
  sugar: ['sugar', 'sugars', 'sucres', 'dont sucres'],
  salt: ['salt', 'sel'],
  saturatedFat: ['saturated fat', 'saturates', 'acides gras satures', 'dont satures'],
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTextPreservingLines(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n');
}

function parseNumber(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidValue(key: NutritionKey, value: number) {
  if (key === 'calories') {
    return value >= 0 && value <= 1000;
  }

  if (key === 'salt') {
    return value >= 0 && value <= 20;
  }

  return value >= 0 && value <= 100;
}

function parseField(text: string, key: NutritionKey) {
  const searchableText = normalizeTextPreservingLines(text);
  const lines = searchableText.split(/\n|;/).map(normalizeText).filter(Boolean);

  for (const label of LABELS[key]) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const directPattern = new RegExp(
      `\\b${escapedLabel}\\b[^\\d]{0,40}(\\d+(?:[.,]\\d+)?)\\s*(?:g|kcal|kj)?\\b`,
      'i',
    );
    const lineMatch = lines
      .filter((line) => new RegExp(`\\b${escapedLabel}\\b`, 'i').test(line))
      .map((line) => line.match(directPattern))
      .find(Boolean);
    const textMatch = searchableText.match(directPattern);
    const match = lineMatch ?? textMatch;
    const value = match?.[1] ? parseNumber(match[1]) : null;

    if (value !== null && isValidValue(key, value)) {
      return key === 'calories' ? Math.round(value) : Math.round(value * 10) / 10;
    }
  }

  return undefined;
}

function parseServingSize(text: string) {
  const per100Match = text.match(/(?:per|pour)\s*100\s*(g|ml)|100\s*(g|ml)/i);

  if (per100Match) {
    const unit: 'g' | 'ml' = (per100Match[1] ?? per100Match[2])?.toLowerCase() === 'ml' ? 'ml' : 'g';

    return {
      servingSize: `100${unit}`,
      baseQuantity: 100,
      unit,
    };
  }

  const servingMatch = text.match(/(?:serving size|portion)\s*[:\-]?\s*([^.;]+)/i);

  if (servingMatch?.[1]) {
    return { servingSize: servingMatch[1].trim(), baseQuantity: 100, unit: 'g' as const };
  }

  return { baseQuantity: 100, unit: 'g' as const };
}

export function parseNutritionFactsText(text: string): ParsedNutritionFacts {
  const normalizedText = normalizeText(text);
  const calories = parseField(text, 'calories');
  const protein = parseField(text, 'protein');
  const carbs = parseField(text, 'carbs');
  const fat = parseField(text, 'fat');
  const sugar = parseField(text, 'sugar');
  const salt = parseField(text, 'salt');
  const saturatedFat = parseField(text, 'saturatedFat');
  const missingFields = [
    calories === undefined ? 'calories' : null,
    protein === undefined ? 'protein' : null,
    carbs === undefined ? 'carbs' : null,
    fat === undefined ? 'fat' : null,
  ].filter((field): field is string => Boolean(field));

  return {
    calories,
    protein,
    carbs,
    fat,
    sugar,
    salt,
    saturatedFat,
    ...parseServingSize(normalizedText),
    confidence: missingFields.length === 0 ? 'medium' : 'low',
    missingFields,
    rawText: text,
  };
}

/*
Example:
parseNutritionFactsText(`
VALEURS NUTRITIONNELLES MOYENNES POUR 100G
VALEUR ENERGETIQUE 239.2 KCAL
PROTEINES 26.2G
LIPIDES 4.5G
GLUCIDES 1.2G
`)
=> calories 239, protein 26.2, fat 4.5, carbs 1.2, baseQuantity 100, unit "g", confidence "medium"
*/
