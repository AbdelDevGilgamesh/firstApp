export const designColors = {
  appBackground: '#F6F5EF',
  surface: '#FFFCF6',
  surfaceSoft: '#F1F4ED',
  surfaceMuted: '#ECEFE8',
  textPrimary: '#20231F',
  textSecondary: '#686E67',
  textMuted: '#8C928A',
  border: '#E2DED2',
  primary: '#2F6DF6',
  primarySoft: '#EAF0FF',
  success: '#2F855A',
  successDark: '#1F5E3F',
  successSoft: '#E7F3EA',
  warning: '#B96935',
  warningSoft: '#FFF0E6',
  danger: '#C2413A',
  dangerSoft: '#FDECEC',
  purple: '#7C4DFF',
  purpleSoft: '#EFE9FF',
} as const;

export const designRadii = {
  small: 10,
  medium: 14,
  large: 18,
  xl: 24,
  full: 999,
} as const;

export const designSpacing = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  screenHorizontal: 20,
  cardPadding: 18,
  sectionGap: 22,
  bottomPaddingWithTabs: 120,
} as const;

export const designTypography = {
  screenTitle: {
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 24,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
  },
  body: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  caption: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  badge: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
} as const;
