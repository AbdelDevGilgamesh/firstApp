import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ComponentProps, PropsWithChildren } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';

import { useTokens } from '@/src/context/TokenContext';
import { useAppTheme } from '@/src/theme/appTheme';

type AppCardProps = PropsWithChildren<{
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
}>;

type AppButtonVariant = 'primary' | 'success' | 'secondary' | 'ghost' | 'danger';

type AppButtonProps = {
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: AppButtonVariant;
};

type AppChipProps = PropsWithChildren<{
  active?: boolean;
  tone?: 'neutral' | 'success' | 'warning';
  style?: StyleProp<ViewStyle>;
}>;

type AppHeaderProps = {
  onBack?: () => void;
  showTokenPill?: boolean;
  subtitle?: string;
  title: string;
};

type AppTextInputProps = TextInputProps & {
  error?: string | null;
  helperText?: string;
  label: string;
  unit?: string;
};

type SectionHeaderProps = {
  caption?: string;
  title: string;
};

type MacroDisplayProps = {
  color?: string;
  label: string;
  value: string;
};

export function AppCard({ children, muted = false, style }: AppCardProps) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: muted ? theme.cardAlt : theme.card,
          borderColor: theme.cardBorder,
          borderRadius: theme.radii.xl,
          padding: theme.spacing.cardPadding,
          shadowColor: theme.shadow,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function AppButton({
  disabled = false,
  icon,
  label,
  onPress,
  style,
  variant = 'primary',
}: AppButtonProps) {
  const theme = useAppTheme();
  const isFilled = variant === 'primary' || variant === 'success' || variant === 'danger';
  const backgroundColor =
    variant === 'success'
      ? theme.success
      : variant === 'danger'
        ? theme.danger
        : variant === 'secondary'
          ? theme.card
          : variant === 'ghost'
            ? theme.chipBackground
            : theme.primary;
  const foregroundColor = isFilled ? '#FFFFFF' : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: disabled ? theme.chipBackground : backgroundColor,
          borderColor: isFilled ? 'transparent' : theme.cardBorder,
          borderRadius: theme.radii.large,
          shadowColor: isFilled ? backgroundColor : theme.shadow,
        },
        disabled && styles.disabled,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}>
      {icon ? (
        <Ionicons color={disabled ? theme.mutedText : foregroundColor} name={icon} size={18} />
      ) : null}
      <Text style={[styles.buttonText, { color: disabled ? theme.mutedText : foregroundColor }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function AppChip({ active = false, children, style, tone = 'neutral' }: AppChipProps) {
  const theme = useAppTheme();
  const toneColor = tone === 'success' ? theme.success : tone === 'warning' ? theme.warning : theme.primary;

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: active ? toneColor : theme.chipBackground,
          borderColor: active ? toneColor : theme.cardBorder,
          borderRadius: theme.radii.full,
        },
        style,
      ]}>
      <Text style={[styles.chipText, { color: active ? '#FFFFFF' : theme.mutedText }]}>
        {children}
      </Text>
    </View>
  );
}

export function TokenPill() {
  const theme = useAppTheme();
  const { tokenBalance } = useTokens();

  return (
    <Pressable
      accessibilityLabel={`Buy tokens. Current balance ${tokenBalance} tokens.`}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/settings', params: { panel: 'tokens' } })}
      style={({ pressed }) => [
        styles.tokenPill,
        { backgroundColor: theme.successSoft },
        pressed && styles.pressed,
      ]}>
      <Ionicons color={theme.successDark} name="leaf-outline" size={14} />
      <Text style={[styles.tokenPillText, { color: theme.successDark }]}>Tokens: {tokenBalance}</Text>
    </Pressable>
  );
}

export function AppHeader({ onBack, showTokenPill = false, subtitle, title }: AppHeaderProps) {
  const theme = useAppTheme();

  return (
    <View style={styles.header}>
      <View style={styles.headerTopRow}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [styles.headerBack, pressed && styles.pressed]}>
            <Ionicons color={theme.primary} name="chevron-back" size={17} />
            <Text style={[styles.headerBackText, { color: theme.primary }]}>Back</Text>
          </Pressable>
        ) : (
          <View />
        )}
        {showTokenPill ? <TokenPill /> : null}
      </View>
      <View style={styles.headerTextBlock}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.headerSubtitle, { color: theme.mutedText }]}>{subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function SectionHeader({ caption, title }: SectionHeaderProps) {
  const theme = useAppTheme();

  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      {caption ? <Text style={[styles.sectionCaption, { color: theme.mutedText }]}>{caption}</Text> : null}
    </View>
  );
}

export function AppTextInput({
  error,
  helperText,
  label,
  multiline,
  style,
  unit,
  ...props
}: AppTextInputProps) {
  const theme = useAppTheme();
  const hasError = Boolean(error);

  return (
    <View style={styles.inputField}>
      <View style={styles.inputLabelRow}>
        <Text style={[styles.inputLabel, { color: theme.text }]}>{label}</Text>
        {unit ? <Text style={[styles.inputUnit, { color: theme.mutedText }]}>{unit}</Text> : null}
      </View>
      <TextInput
        multiline={multiline}
        placeholderTextColor={theme.textTertiary}
        style={[
          styles.textInput,
          multiline && styles.textArea,
          {
            backgroundColor: theme.inputBackground,
            borderColor: hasError ? theme.warning : theme.cardBorder,
            color: theme.text,
          },
          style,
        ]}
        textAlignVertical={multiline ? 'top' : props.textAlignVertical}
        {...props}
      />
      {error || helperText ? (
        <Text style={[styles.inputHelper, { color: error ? theme.warning : theme.mutedText }]}>
          {error ?? helperText}
        </Text>
      ) : null}
    </View>
  );
}

export function MacroPill({ color, label, value }: MacroDisplayProps) {
  const theme = useAppTheme();
  const activeColor = color ?? theme.primary;

  return (
    <View style={[styles.macroPill, { backgroundColor: `${activeColor}14` }]}>
      <Text style={[styles.macroLabel, { color: activeColor }]}>{label}</Text>
      <Text style={[styles.macroValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

export function MacroRow({ color, label, value }: MacroDisplayProps) {
  const theme = useAppTheme();
  const activeColor = color ?? theme.primary;

  return (
    <View style={styles.macroRow}>
      <View style={[styles.macroDot, { backgroundColor: activeColor }]} />
      <Text style={[styles.macroRowLabel, { color: theme.text }]}>{label}</Text>
      <Text style={[styles.macroRowValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

export function ErrorState({
  children,
  style,
  ...props
}: PropsWithChildren<ViewProps>) {
  const theme = useAppTheme();

  return (
    <View
      {...props}
      style={[
        styles.errorState,
        {
          backgroundColor: theme.warningSoft,
          borderColor: theme.cardBorder,
          borderRadius: theme.radii.large,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.045,
    shadowRadius: 18,
    elevation: 1,
  },
  button: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 2,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '900',
  },
  chip: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '900',
  },
  errorState: {
    gap: 8,
    borderWidth: 1,
    padding: 14,
  },
  header: {
    gap: 12,
    paddingBottom: 18,
  },
  headerTopRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerBack: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingRight: 12,
  },
  headerBackText: {
    fontSize: 13,
    fontWeight: '900',
  },
  headerTextBlock: {
    gap: 5,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
  },
  headerSubtitle: {
    maxWidth: 380,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  inputField: {
    gap: 8,
  },
  inputHelper: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '900',
  },
  inputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  inputUnit: {
    fontSize: 12,
    fontWeight: '900',
  },
  macroDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  macroLabel: {
    fontSize: 11,
    fontWeight: '900',
  },
  macroPill: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
  },
  macroRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  macroRowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  macroRowValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  macroValue: {
    fontSize: 12,
    fontWeight: '900',
  },
  sectionCaption: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 24,
  },
  textArea: {
    minHeight: 140,
    paddingTop: 14,
  },
  textInput: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '800',
  },
  tokenPill: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
  },
  tokenPillText: {
    fontSize: 12,
    fontWeight: '900',
  },
  disabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  pressed: {
    opacity: 0.86,
  },
});
