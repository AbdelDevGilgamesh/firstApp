export type ProductHealthFood = {
  name?: string;
  category?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  salt?: number;
  saturatedFat?: number;
};

type ProductFoodContext = 'grain_staple' | 'general';

export type ProductHealthRating = {
  score: number;
  label:
    | 'Excellent choice'
    | 'Good choice'
    | 'Good staple choice'
    | 'Fine in moderation'
    | 'Limited choice'
    | 'Poor choice';
  colorType: 'success' | 'warning' | 'danger';
  context: ProductFoodContext;
  reasons: string[];
};

export type ProductNutritionFinding = {
  type: 'positive' | 'neutral' | 'warning';
  title: string;
  description: string;
};

export type ProductNutritionDescription = {
  headline: string;
  subtitle: string;
  findings: ProductNutritionFinding[];
  availableDataLabels: string[];
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function hasValue(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const grainStapleKeywords = [
  'rice',
  'riz',
  'pasta',
  'pâtes',
  'pates',
  'bread',
  'pain',
  'oats',
  'avoine',
  'couscous',
  'quinoa',
  'semolina',
  'potato',
  'potatoes',
];

function getFoodContext(food: ProductHealthFood): ProductFoodContext {
  const searchable = `${food.name ?? ''} ${food.category ?? ''}`.toLowerCase();
  return grainStapleKeywords.some((keyword) => searchable.includes(keyword)) ? 'grain_staple' : 'general';
}

function getScoreLabel(score: number, context: ProductFoodContext): ProductHealthRating['label'] {
  if (score >= 85) {
    return 'Excellent choice';
  }

  if (score >= 75) {
    return context === 'grain_staple' ? 'Good staple choice' : 'Good choice';
  }

  if (score >= 60) {
    return 'Fine in moderation';
  }

  if (score >= 40) {
    return 'Limited choice';
  }

  return 'Poor choice';
}

export function rateProductHealth(food: ProductHealthFood): ProductHealthRating {
  let score = 70;
  const reasons: string[] = [];
  const context = getFoodContext(food);

  if (food.calories > 500) {
    score -= 12;
    reasons.push('Very high calories per 100g');
  } else if (food.calories > 400) {
    score -= 8;
    reasons.push('High calories per 100g');
  } else if (food.calories > 300) {
    score -= 4;
    reasons.push('Moderate to high calories per 100g');
  }

  if (food.protein >= 15) {
    score += 8;
    reasons.push('High protein');
  } else if (food.protein >= 8) {
    score += 5;
    reasons.push('Good protein');
  } else if (food.protein >= 4) {
    score += 2;
    reasons.push('Some protein');
  }

  if (food.fat <= 3) {
    score += 4;
    reasons.push('Low fat');
  } else if (food.fat <= 10) {
    score += 2;
  } else if (food.fat >= 20) {
    score -= 10;
    reasons.push('High fat');
  }

  if (context === 'grain_staple' && food.carbs > 50) {
    reasons.push('Mainly carbohydrate-based');
  } else if (food.carbs > 70) {
    score -= 6;
    reasons.push('High carbohydrates');
  } else if (food.carbs > 50) {
    score -= 3;
    reasons.push('Moderate carbohydrates');
  }

  if (hasValue(food.sugar)) {
    if (food.sugar <= 2) {
      score += 10;
      reasons.push('Very low sugar');
    } else if (food.sugar <= 5) {
      score += 6;
      reasons.push('Low sugar');
    } else if (food.sugar <= 10) {
      score += 2;
    } else if (food.sugar > 22.5) {
      score -= 15;
      reasons.push('Very high sugar');
    } else if (food.sugar > 10) {
      score -= 8;
      reasons.push('High sugar');
    } else if (food.sugar > 5) {
      score -= 3;
      reasons.push('Moderate sugar');
    }
  }

  if (hasValue(food.saturatedFat)) {
    if (food.saturatedFat <= 0.5) {
      score += 8;
      reasons.push('Very low saturated fat');
    } else if (food.saturatedFat <= 1.5) {
      score += 5;
      reasons.push('Low saturated fat');
    } else if (food.saturatedFat <= 3) {
      score += 2;
    } else if (food.saturatedFat > 5) {
      score -= 12;
      reasons.push('High saturated fat');
    } else if (food.saturatedFat > 3) {
      score -= 7;
      reasons.push('Elevated saturated fat');
    } else if (food.saturatedFat > 1.5) {
      score -= 3;
    }
  }

  if (hasValue(food.fiber)) {
    if (food.fiber >= 6) {
      score += 8;
      reasons.push('High fiber');
    } else if (food.fiber >= 3) {
      score += 5;
      reasons.push('Good fiber');
    } else if (food.fiber >= 1.5) {
      score += 2;
    }
  }

  if (hasValue(food.salt)) {
    if (food.salt <= 0.3) {
      score += 5;
      reasons.push('Low salt');
    } else if (food.salt <= 1) {
      score += 2;
    } else if (food.salt > 1.5) {
      score -= 10;
      reasons.push('High salt');
    } else if (food.salt > 1) {
      score -= 5;
      reasons.push('Moderate salt');
    }
  }

  if (food.calories > 300 && food.protein < 4) {
    score -= 5;
    reasons.push('Lower protein for the calories');
  }

  if (context === 'grain_staple' && food.calories > 300 && food.carbs > 60) {
    score = Math.min(score, 82);
    reasons.push('Portion balance matters');
  }

  const finalScore = clampScore(score);
  const label = getScoreLabel(finalScore, context);
  const colorType = finalScore >= 75 ? 'success' : finalScore >= 60 ? 'warning' : 'danger';
  const finalReasons = [...reasons];

  if (finalReasons.length < 2) {
    finalReasons.push('Based on available nutrition data');
  }

  if (finalReasons.length < 2) {
    finalReasons.push('Review serving size');
  }

  return {
    score: finalScore,
    label,
    colorType,
    context,
    reasons: finalReasons.slice(0, 4),
  };
}

export function describeProductNutrition(
  food: ProductHealthFood,
  rating: ProductHealthRating,
): ProductNutritionDescription {
  const availableDataLabels = ['Calories', 'Protein', 'Carbs', 'Fat'];
  const findings: ProductNutritionFinding[] = [];

  if (hasValue(food.sugar)) {
    availableDataLabels.push('Sugar');
  }

  if (hasValue(food.salt)) {
    availableDataLabels.push('Salt');
  }

  if (hasValue(food.saturatedFat)) {
    availableDataLabels.push('Saturated fat');
  }

  if (rating.context === 'grain_staple' && rating.score >= 75) {
    findings.push({
      type: 'positive',
      title: 'Good staple choice',
      description: 'Low sugar and low saturated fat make this a solid base food.',
    });
  } else if (rating.score >= 75) {
    findings.push({
      type: 'positive',
      title: 'Suitable for most goals',
      description: 'The available nutrition values look balanced for regular tracking.',
    });
  } else if (rating.score >= 60) {
    findings.push({
      type: 'neutral',
      title: 'Fine in moderation',
      description: 'This can fit well when portion size is managed.',
    });
  } else {
    findings.push({
      type: 'warning',
      title: 'Best as an occasional choice',
      description: 'Consider a smaller portion or balance it with lighter foods.',
    });
  }

  if (rating.context === 'grain_staple' && food.carbs > 50) {
    findings.push({
      type: 'neutral',
      title: 'Mainly carbohydrate-based',
      description: 'This is expected for rice and similar grain or starch foods.',
    });
  }

  if (food.calories > 300) {
    findings.push({
      type: rating.context === 'grain_staple' ? 'neutral' : 'warning',
      title: 'Portion size matters',
      description: 'Calories per 100g are moderate to high, so portions matter.',
    });
  } else if (food.calories <= 150) {
    findings.push({
      type: 'positive',
      title: 'Low energy density',
      description: 'Calories per 100g are on the lighter side.',
    });
  }

  if (food.protein >= 15) {
    findings.push({
      type: 'positive',
      title: 'High protein efficiency',
      description: 'Protein is strong compared with the calorie level.',
    });
  } else if (food.protein < 3) {
    findings.push({
      type: 'warning',
      title: 'Low protein',
      description: 'Protein is low for the calories shown.',
    });
  }

  if (food.fat <= 3) {
    findings.push({
      type: 'positive',
      title: 'Low fat content',
      description: 'Fat is low based on the available data.',
    });
  } else if (food.fat > 25) {
    findings.push({
      type: 'warning',
      title: 'High fat',
      description: 'Fat is elevated, which can raise calorie density.',
    });
  }

  if (rating.context !== 'grain_staple' && food.carbs > 60) {
    findings.push({
      type: 'warning',
      title: 'High carbohydrates',
      description: 'Carbohydrates make up a large part of this product.',
    });
  }

  if (hasValue(food.sugar)) {
    if (food.sugar > 10) {
      findings.push({
        type: 'warning',
        title: 'High sugar',
        description: 'Sugar is elevated in the available nutrition data.',
      });
    } else if (food.sugar <= 5) {
      findings.push({
        type: 'positive',
        title: 'Low sugar',
        description: 'Sugar is low based on the available data.',
      });
    }
  }

  if (!hasValue(food.sugar) || !hasValue(food.salt)) {
    findings.push({
      type: 'neutral',
      title: 'Nutrition data is incomplete',
      description: 'Some optional values like sugar or salt may be missing.',
    });
  }

  const headline = rating.label;
  const subtitle =
    rating.context === 'grain_staple' && rating.score >= 75
      ? 'Low sugar and low saturated fat. Best when portions are balanced.'
      : rating.score >= 75
        ? 'Balanced macro profile based on available data.'
        : rating.score >= 60
          ? 'Watch portions and balance with whole foods.'
          : 'Consider smaller portions when logging this product.';

  return {
    headline,
    subtitle,
    findings: findings.slice(0, 4),
    availableDataLabels,
  };
}
