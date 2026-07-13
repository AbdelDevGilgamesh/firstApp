import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/src/theme/appTheme';

export type AppDialogVariant = 'success' | 'info' | 'warning' | 'danger';
export type AppDialogActionVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export type AppDialogAction = {
  label: string;
  onPress?: () => void | Promise<void>;
  variant?: AppDialogActionVariant;
};

export type AppDialogState = {
  actions?: AppDialogAction[];
  dismissOnBackdropPress?: boolean;
  helperText?: string;
  message?: string;
  title: string;
  variant?: AppDialogVariant;
};

type AppDialogProps = {
  dialog: AppDialogState | null;
  isActionPending?: boolean;
  onActionPress: (action: AppDialogAction) => void;
  onDismiss: () => void;
};

const ICON_BY_VARIANT: Record<AppDialogVariant, keyof typeof Ionicons.glyphMap> = {
  danger: 'alert-circle-outline',
  info: 'information-circle-outline',
  success: 'checkmark-circle-outline',
  warning: 'alert-circle-outline',
};

export function AppDialog({ dialog, isActionPending = false, onActionPress, onDismiss }: AppDialogProps) {
  const theme = useAppTheme();
  const variant = dialog?.variant ?? 'info';
  const tone = getVariantTone(variant, theme);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onDismiss}
      transparent
      visible={Boolean(dialog)}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          disabled={!dialog?.dismissOnBackdropPress || isActionPending}
          onPress={onDismiss}
          style={styles.backdrop}
        />
        {dialog ? (
          <View style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
            <View style={[styles.iconBadge, { backgroundColor: tone.soft }]}>
              <Ionicons name={ICON_BY_VARIANT[variant]} size={26} color={tone.strong} />
            </View>
            <Text style={[styles.title, { color: theme.text }]}>{dialog.title}</Text>
            {dialog.message ? (
              <Text style={[styles.message, { color: theme.mutedText }]}>{dialog.message}</Text>
            ) : null}
            {dialog.helperText ? (
              <View style={[styles.helperBox, { backgroundColor: theme.cardAlt }]}>
                <Text style={[styles.helperText, { color: theme.mutedText }]}>{dialog.helperText}</Text>
              </View>
            ) : null}
            <View style={styles.actions}>
              {(dialog.actions?.length
                ? dialog.actions
                : ([{ label: 'Done', variant: 'primary' }] satisfies AppDialogAction[])).map((action) => {
                const actionVariant = action.variant ?? 'primary';
                const actionColors = getActionColors(actionVariant, theme);

                return (
                  <Pressable
                    accessibilityRole="button"
                    disabled={isActionPending}
                    key={`${action.label}-${actionVariant}`}
                    onPress={() => onActionPress(action)}
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        backgroundColor: actionColors.background,
                        borderColor: actionColors.border,
                      },
                      pressed && !isActionPending ? styles.pressed : null,
                      isActionPending ? styles.disabled : null,
                    ]}>
                    {isActionPending && actionVariant === 'primary' ? (
                      <ActivityIndicator color={actionColors.text} size="small" />
                    ) : null}
                    <Text style={[styles.actionText, { color: actionColors.text }]}>{action.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function getVariantTone(variant: AppDialogVariant, theme: ReturnType<typeof useAppTheme>) {
  if (variant === 'success') {
    return { soft: theme.successSoft, strong: theme.success };
  }

  if (variant === 'warning') {
    return { soft: theme.warningSoft, strong: theme.warning };
  }

  if (variant === 'danger') {
    return { soft: theme.dangerSoft, strong: theme.danger };
  }

  return { soft: theme.primarySoft, strong: theme.primary };
}

function getActionColors(variant: AppDialogActionVariant, theme: ReturnType<typeof useAppTheme>) {
  if (variant === 'secondary') {
    return {
      background: theme.cardAlt,
      border: theme.cardBorder,
      text: theme.text,
    };
  }

  if (variant === 'danger') {
    return {
      background: theme.danger,
      border: theme.danger,
      text: '#FFFFFF',
    };
  }

  if (variant === 'ghost') {
    return {
      background: 'transparent',
      border: 'transparent',
      text: theme.mutedText,
    };
  }

  return {
    background: theme.success,
    border: theme.success,
    text: '#FFFFFF',
  };
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20, 23, 20, 0.42)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    borderRadius: 24,
    padding: 22,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.14,
    shadowRadius: 30,
    elevation: 12,
  },
  iconBadge: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  message: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    textAlign: 'center',
  },
  helperBox: {
    width: '100%',
    borderRadius: 18,
    marginTop: 16,
    padding: 13,
  },
  helperText: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    gap: 10,
    marginTop: 18,
  },
  actionButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.65,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
});
