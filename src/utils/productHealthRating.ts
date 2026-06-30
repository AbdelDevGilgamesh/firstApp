export type ProductHealthFood = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number;
  salt?: number;
  saturatedFat?: number;
};

export type ProductHealthRating = {
  score: number;
  label: 'Good choice' | 'Okay choice' | 'Limit often';
  colorType: 'success' | 'warning' | 'danger';
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

export function rateProductHealth(food: ProductHealthFood): ProductHealthRating {
  let score = 70;
  const reasons: string[] = [];

  if (food.calories <= 150) {
    score += 10;
    reasons.push('Lower calories per 100g');
  } else if (food.calories <= 300) {
    reasons.push('Moderate calories');
  } else if (food.calories <= 500) {
    score -= 10;
    reasons.push('High calories per 100g');
  } else {
    score -= 20;
    reasons.push('Very high calories per 100g');
  }

  if (food.protein >= 15) {
    score += 10;
    reasons.push('High protein');
  } else if (food.protein >= 8) {
    score += 5;
    reasons.push('Good protein');
  } else if (food.protein < 3) {
    score -= 5;
    reasons.push('Low protein');
  }

  if (food.fat > 40) {
    score -= 20;
    reasons.push('Very high fat');
  } else if (food.fat > 25) {
    score -= 10;
    reasons.push('High fat');
  }

  if (food.carbs > 75) {
    score -= 10;
    reasons.push('Very high carbs');
  } else if (food.carbs > 60) {
    score -= 5;
    reasons.push('High carbs');
  }

  if (hasValue(food.sugar)) {
    if (food.sugar > 25) {
      score -= 20;
      reasons.push('Very high sugar');
    } else if (food.sugar > 15) {
      score -= 10;
      reasons.push('High sugar');
    }
  }

  if (hasValue(food.salt)) {
    if (food.salt > 3) {
      score -= 20;
      reasons.push('Very high salt');
    } else if (food.salt > 1.5) {
      score -= 10;
      reasons.push('High salt');
    }
  }

  const finalScore = clampScore(score);
  const label = finalScore >= 75 ? 'Good choice' : finalScore >= 50 ? 'Okay choice' : 'Limit often';
  const colorType = finalScore >= 75 ? 'success' : finalScore >= 50 ? 'warning' : 'danger';
  const finalReasons = [...reasons];

  if (finalReasons.length < 2) {
    finalReasons.push('Standard macro profile');
  }

  if (finalReasons.length < 2) {
    finalReasons.push('Review serving size');
  }

  return {
    score: finalScore,
    label,
    colorType,
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

  if (rating.label === 'Good choice') {
    findings.push({
      type: 'positive',
      title: 'Suitable for most goals',
      description: 'The available nutrition values look balanced for regular tracking.',
    });
  } else if (rating.label === 'Okay choice') {
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

  if (food.calories <= 150) {
    findings.push({
      type: 'positive',
      title: 'Low energy density',
      description: 'Calories per 100g are on the lighter side.',
    });
  } else if (food.calories <= 300) {
    findings.push({
      type: 'neutral',
      title: 'Moderate calories',
      description: 'Calories are in a middle range for packaged foods.',
    });
  } else {
    findings.push({
      type: 'warning',
      title: 'High calorie density',
      description: 'Calories per 100g are elevated, so portions matter.',
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

  if (food.carbs > 60) {
    findings.push({
      type: 'warning',
      title: 'High carbohydrates',
      description: 'Carbohydrates make up a large part of this product.',
    });
  }

  if (hasValue(food.sugar)) {
    if (food.sugar > 15) {
      findings.push({
        type: 'warning',
        title: 'High sugar',
        description: 'Sugar is elevated in the available nutrition data.',
      });
    } else {
      findings.push({
        type: 'neutral',
        title: 'Sugar data available',
        description: 'Sugar is included in this product review.',
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

  const headline =
    rating.label === 'Good choice'
      ? 'Suitable for most goals'
      : rating.label === 'Okay choice'
        ? 'Fine in moderation'
        : 'Best as an occasional choice';
  const subtitle =
    rating.label === 'Good choice'
      ? 'Balanced macro profile based on available data.'
      : rating.label === 'Okay choice'
        ? 'Watch portions and balance with whole foods.'
        : 'Consider smaller portions when logging this product.';

  return {
    headline,
    subtitle,
    findings: findings.slice(0, 5),
    availableDataLabels,
  };
}
