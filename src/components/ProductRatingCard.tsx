import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/src/components/PressableScale';
import { useAppTheme } from '@/src/theme/appTheme';
import {
  ProductHealthFood,
  ProductHealthRating,
  describeProductNutrition,
  rateProductHealth,
} from '@/src/utils/productHealthRating';

type ProductRatingFood = ProductHealthFood & {
  name: string;
  baseCalories?: number;
  baseQuantity?: number;
  unit?: string;
  source?: string;
};

type ProductRatingCardProps = {
  food: ProductRatingFood;
  onAddToToday: () => void;
  onDismiss: () => void;
};

type NutrientCardProps = {
  label: string;
  maxValue: number;
  tone?: 'success' | 'warning' | 'neutral';
  unit?: string;
  value: number;
};

function getRatingColor(rating: ProductHealthRating, theme: ReturnType<typeof useAppTheme>) {
  if (rating.colorType === 'success') {
    return theme.success;
  }

  if (rating.colorType === 'warning') {
    return theme.warning;
  }

  return '#EF4444';
}

function getDataQualityLabel(food: ProductRatingFood) {
  const hasCoreData =
    Number.isFinite(food.calories) &&
    Number.isFinite(food.protein) &&
    Number.isFinite(food.carbs) &&
    Number.isFinite(food.fat);

  if (food.source === 'custom' || food.source === 'manual') {
    return 'Custom estimate';
  }

  if ((food.source === 'barcode' || food.source === 'local') && hasCoreData) {
    return typeof food.sugar === 'number' || typeof food.salt === 'number'
      ? 'Verified data'
      : 'Limited data';
  }

  return 'Limited data';
}

function formatValue(value: number) {
  return Math.round(value * 10) / 10;
}

export function ProductRatingCard({ food, onAddToToday, onDismiss }: ProductRatingCardProps) {
  const theme = useAppTheme();
  const rating = rateProductHealth(food);
  const description = describeProductNutrition(food, rating);
  const ratingColor = getRatingColor(rating, theme);
  const dataQualityLabel = getDataQualityLabel(food);
  const baseQuantity = food.baseQuantity ?? 100;
  const unit = food.unit ?? 'g';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.cardBorder,
          shadowColor: theme.shadow,
        },
      ]}>
      <View style={styles.summaryShell}>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: theme.chipBackground }]}>
            <Text style={[styles.badgeText, { color: theme.primary }]}>Nutrition Review</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: theme.chipBackground }]}>
            <Text style={[styles.badgeText, { color: theme.mutedText }]}>{dataQualityLabel}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryText}>
            <Text style={[styles.name, { color: theme.text }]}>{food.name}</Text>
            <Text style={[styles.meta, { color: theme.mutedText }]}>
              {food.baseCalories ?? food.calories} kcal per {baseQuantity}
              {unit}
            </Text>
          </View>
          <View style={[styles.scoreBadge, { borderColor: ratingColor, backgroundColor: theme.cardAlt }]}>
            <Text style={[styles.score, { color: ratingColor }]}>{rating.score}</Text>
            <Text style={[styles.scoreLabel, { color: theme.mutedText }]}>/ 100</Text>
          </View>
        </View>

        <Text style={[styles.scoreRating, { color: ratingColor }]}>{rating.label}</Text>
      </View>

      <View style={[styles.conclusion, { backgroundColor: theme.cardAlt, borderColor: ratingColor }]}>
        <View style={[styles.conclusionAccent, { backgroundColor: ratingColor }]} />
        <View style={styles.conclusionTextBlock}>
          <Text style={[styles.conclusionTitle, { color: ratingColor }]}>{description.headline}</Text>
          <Text style={[styles.conclusionText, { color: theme.text }]}>{description.subtitle}</Text>
        </View>
      </View>

      <View style={[styles.section, styles.macroSection]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Macronutrient profile</Text>
        <View style={styles.nutrientList}>
          <NutrientCard label="Protein" maxValue={30} tone="success" value={food.protein} />
          <NutrientCard label="Carbohydrates" maxValue={80} value={food.carbs} />
          <NutrientCard label="Fat" maxValue={45} tone={food.fat > 25 ? 'warning' : 'neutral'} value={food.fat} />
          {typeof food.sugar === 'number' ? (
            <NutrientCard label="Sugars" maxValue={35} tone={food.sugar > 15 ? 'warning' : 'neutral'} value={food.sugar} />
          ) : null}
          {typeof food.saturatedFat === 'number' ? (
            <NutrientCard
              label="Saturated fat"
              maxValue={20}
              tone={food.saturatedFat > 5 ? 'warning' : 'neutral'}
              value={food.saturatedFat}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Nutrition findings</Text>
        <View style={styles.findingList}>
          {description.findings.map((finding) => {
            const markerColor =
              finding.type === 'positive'
                ? theme.success
                : finding.type === 'warning'
                  ? theme.warning
                  : theme.primary;

            return (
              <View key={`${finding.title}-${finding.description}`} style={styles.findingRow}>
                <View style={[styles.findingMarker, { backgroundColor: markerColor }]} />
                <View style={styles.findingText}>
                  <Text style={[styles.findingTitle, { color: theme.text }]}>{finding.title}</Text>
                  <Text style={[styles.findingDescription, { color: theme.mutedText }]}>
                    {finding.description}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={[styles.dataBox, { backgroundColor: theme.cardAlt }]}>
        <Text style={[styles.dataTitle, { color: theme.text }]}>Based on available nutrition data</Text>
        <Text style={[styles.dataText, { color: theme.mutedText }]}>
          {description.availableDataLabels.join(', ')}
        </Text>
      </View>

      <Text style={[styles.disclaimer, { color: theme.mutedText }]}>
        Simple estimate based on available nutrition values. Not medical advice. Values are usually per 100g unless stated.
      </Text>

      <View style={styles.actions}>
        <PressableScale
          accessibilityRole="button"
          onPress={onAddToToday}
          style={[styles.primaryButton, { backgroundColor: theme.success }]}>
          <Text style={styles.primaryButtonText}>Add to today</Text>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          onPress={onDismiss}
          style={[
            styles.secondaryButton,
            { backgroundColor: theme.chipBackground },
          ]}>
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Not now</Text>
        </PressableScale>
      </View>
    </View>
  );
}

function NutrientCard({ label, maxValue, tone = 'neutral', unit = 'g', value }: NutrientCardProps) {
  const theme = useAppTheme();
  const progress = `${Math.min((value / maxValue) * 100, 100)}%` as const;
  const color =
    tone === 'success'
      ? theme.success
      : tone === 'warning'
        ? theme.warning
        : theme.primary;

  return (
    <View style={styles.nutrientRow}>
      <View style={[styles.nutrientDot, { backgroundColor: color }]} />
      <View style={styles.nutrientContent}>
        <View style={styles.nutrientHeader}>
          <Text style={[styles.nutrientLabel, { color: theme.text }]}>{label}</Text>
          <Text style={[styles.nutrientValue, { color: theme.text }]}>
            {formatValue(value)}
            {unit}
          </Text>
        </View>
        <View style={[styles.nutrientTrack, { backgroundColor: theme.chipBackground }]}>
          <View style={[styles.nutrientFill, { backgroundColor: color, width: progress }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
    borderRadius: 24,
    padding: 18,
    paddingBottom: 28,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.07,
    shadowRadius: 22,
    elevation: 2,
  },
  summaryShell: {
    gap: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  summaryText: {
    flex: 1,
    gap: 5,
  },
  name: {
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  meta: {
    fontSize: 14,
    fontWeight: '800',
  },
  scoreBadge: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderRadius: 42,
    padding: 8,
  },
  score: {
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 31,
  },
  scoreLabel: {
    fontSize: 11,
    fontWeight: '900',
  },
  scoreRating: {
    fontSize: 15,
    fontWeight: '900',
  },
  conclusion: {
    flexDirection: 'row',
    gap: 12,
    overflow: 'hidden',
    borderRadius: 16,
    padding: 14,
  },
  conclusionAccent: {
    width: 4,
    borderRadius: 999,
  },
  conclusionTextBlock: {
    flex: 1,
    gap: 4,
  },
  conclusionTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  conclusionText: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  macroSection: {
    paddingTop: 2,
  },
  nutrientList: {
    gap: 12,
  },
  nutrientRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  nutrientDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  nutrientContent: {
    flex: 1,
    gap: 7,
  },
  nutrientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  nutrientValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  nutrientLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  nutrientTrack: {
    height: 5,
    overflow: 'hidden',
    borderRadius: 6,
  },
  nutrientFill: {
    height: '100%',
    borderRadius: 6,
  },
  findingList: {
    gap: 9,
  },
  findingRow: {
    flexDirection: 'row',
    gap: 10,
  },
  findingMarker: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  findingText: {
    flex: 1,
    gap: 2,
  },
  findingTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  findingDescription: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  dataBox: {
    gap: 4,
    borderRadius: 14,
    padding: 12,
  },
  dataTitle: {
    fontSize: 13,
    fontWeight: '900',
  },
  dataText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  disclaimer: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'column',
    gap: 10,
    paddingTop: 4,
  },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingHorizontal: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '900',
  },
});
