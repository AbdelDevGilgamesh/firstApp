import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/src/theme/appTheme';
import { FoodEntry } from '@/src/types';

type FoodActionSheetProps = {
  entry: FoodEntry | null;
  onCancel: () => void;
  onDelete: (entry: FoodEntry) => void;
  onDuplicate?: (entry: FoodEntry) => void;
  onEdit: (entry: FoodEntry) => void;
  visible: boolean;
};

export function FoodActionSheet({
  entry,
  onCancel,
  onDelete,
  onDuplicate,
  onEdit,
  visible,
}: FoodActionSheetProps) {
  const theme = useAppTheme();

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
            },
          ]}>
          <View style={styles.handle} />
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {entry?.name ?? 'Food'}
          </Text>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>Choose an action</Text>

          <View style={styles.actions}>
            <ActionRow label="Edit food" onPress={() => entry && onEdit(entry)} />
            {onDuplicate ? (
              <ActionRow label="Duplicate food" onPress={() => entry && onDuplicate(entry)} />
            ) : null}
            <ActionRow danger label="Delete food" onPress={() => entry && onDelete(entry)} />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={({ pressed }) => [
              styles.cancelButton,
              { backgroundColor: theme.chipBackground },
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.cancelText, { color: theme.text }]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionRow({ danger, label, onPress }: { danger?: boolean; label: string; onPress: () => void }) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        { borderColor: theme.cardBorder },
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.actionText, { color: danger ? '#EF4444' : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
  },
  sheet: {
    gap: 8,
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
    paddingBottom: 28,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.55)',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  actions: {
    overflow: 'hidden',
    borderRadius: 14,
  },
  actionRow: {
    minHeight: 52,
    justifyContent: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 14,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '900',
  },
  cancelButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    marginTop: 8,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
  },
});
