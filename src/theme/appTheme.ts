import { useCalories } from '@/src/context/CalorieContext';
import { designColors, designRadii, designSpacing } from '@/src/theme/designSystem';
import { TodayDashboardStyle } from '@/src/types';

export type AppThemeMode = TodayDashboardStyle;

export type AppTheme = {
  mode: AppThemeMode;
  isDark: boolean;
  background: string;
  card: string;
  cardAlt: string;
  cardBorder: string;
  surfaceMuted: string;
  text: string;
  mutedText: string;
  textTertiary: string;
  primary: string;
  primarySoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  successDark: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  purple: string;
  purpleSoft: string;
  inputBackground: string;
  chipBackground: string;
  tabBarBackground: string;
  tabBarBorder: string;
  shadow: string;
  radii: {
    small: number;
    medium: number;
    large: number;
    xl: number;
    full: number;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    screenHorizontal: number;
    cardPadding: number;
    sectionGap: number;
    bottomPaddingWithTabs: number;
  };
};

export const classicTheme: AppTheme = {
  mode: 'classic',
  isDark: false,
  background: designColors.appBackground,
  card: designColors.surface,
  cardAlt: designColors.surfaceSoft,
  cardBorder: designColors.border,
  surfaceMuted: designColors.surfaceMuted,
  text: designColors.textPrimary,
  mutedText: designColors.textSecondary,
  textTertiary: designColors.textMuted,
  primary: designColors.primary,
  primarySoft: designColors.primarySoft,
  warning: designColors.warning,
  warningSoft: designColors.warningSoft,
  success: designColors.success,
  successDark: designColors.successDark,
  successSoft: designColors.successSoft,
  danger: designColors.danger,
  dangerSoft: designColors.dangerSoft,
  purple: designColors.purple,
  purpleSoft: designColors.purpleSoft,
  inputBackground: designColors.surface,
  chipBackground: designColors.surfaceMuted,
  tabBarBackground: designColors.surface,
  tabBarBorder: designColors.border,
  shadow: designColors.textPrimary,
  radii: designRadii,
  spacing: designSpacing,
};

export const premiumDarkTheme: AppTheme = {
  mode: 'premiumDark',
  isDark: true,
  background: '#09111E',
  card: '#111A29',
  cardAlt: '#172235',
  cardBorder: '#26344A',
  surfaceMuted: '#141F31',
  text: '#F8FAFC',
  mutedText: '#A3AEC0',
  textTertiary: '#748197',
  primary: '#38BDF8',
  primarySoft: '#102642',
  warning: '#F97316',
  warningSoft: '#3B2415',
  success: '#86EFAC',
  successDark: '#86EFAC',
  successSoft: '#123123',
  danger: '#FB7185',
  dangerSoft: '#3B1720',
  purple: '#A78BFA',
  purpleSoft: '#2E2355',
  inputBackground: '#172033',
  chipBackground: '#1E293B',
  tabBarBackground: '#0F172A',
  tabBarBorder: '#1E293B',
  shadow: '#020617',
  radii: designRadii,
  spacing: designSpacing,
};

export function getAppTheme(mode: AppThemeMode): AppTheme {
  return mode === 'premiumDark' ? premiumDarkTheme : classicTheme;
}

export function useAppTheme() {
  const { todayDashboardStyle } = useCalories();

  return getAppTheme(todayDashboardStyle);
}
