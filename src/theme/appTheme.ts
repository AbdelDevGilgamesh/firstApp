import { useCalories } from '@/src/context/CalorieContext';
import { TodayDashboardStyle } from '@/src/types';

export type AppThemeMode = TodayDashboardStyle;

export type AppTheme = {
  mode: AppThemeMode;
  isDark: boolean;
  background: string;
  card: string;
  cardAlt: string;
  cardBorder: string;
  text: string;
  mutedText: string;
  primary: string;
  warning: string;
  success: string;
  inputBackground: string;
  chipBackground: string;
  tabBarBackground: string;
  tabBarBorder: string;
  shadow: string;
};

export const classicTheme: AppTheme = {
  mode: 'classic',
  isDark: false,
  background: '#F7F7F2',
  card: '#FFFFFF',
  cardAlt: '#F7F7F2',
  cardBorder: '#E5E7DD',
  text: '#1E1F24',
  mutedText: '#6B6F76',
  primary: '#2563eb',
  warning: '#B95C3A',
  success: '#2E7D57',
  inputBackground: '#FAFAF7',
  chipBackground: '#F1F3EF',
  tabBarBackground: '#FFFFFF',
  tabBarBorder: '#ECEDE8',
  shadow: '#1E1F24',
};

export const premiumDarkTheme: AppTheme = {
  mode: 'premiumDark',
  isDark: true,
  background: '#0A1020',
  card: '#101827',
  cardAlt: '#141B2D',
  cardBorder: '#253047',
  text: '#F8FAFC',
  mutedText: '#94A3B8',
  primary: '#38BDF8',
  warning: '#F97316',
  success: '#86EFAC',
  inputBackground: '#172033',
  chipBackground: '#1E293B',
  tabBarBackground: '#0F172A',
  tabBarBorder: '#1E293B',
  shadow: '#020617',
};

export function getAppTheme(mode: AppThemeMode): AppTheme {
  return mode === 'premiumDark' ? premiumDarkTheme : classicTheme;
}

export function useAppTheme() {
  const { todayDashboardStyle } = useCalories();

  return getAppTheme(todayDashboardStyle);
}
