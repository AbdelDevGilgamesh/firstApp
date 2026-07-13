import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppDialog, AppDialogAction, AppDialogState } from '@/src/components/AppDialog';

type AppDialogContextValue = {
  hideDialog: () => void;
  showDialog: (dialog: AppDialogState) => void;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

export function AppDialogProvider({ children }: PropsWithChildren) {
  const [dialog, setDialog] = useState<AppDialogState | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);

  const hideDialog = useCallback(() => {
    if (isActionPending) {
      return;
    }

    setDialog(null);
  }, [isActionPending]);

  const showDialog = useCallback((nextDialog: AppDialogState) => {
    setIsActionPending(false);
    setDialog(nextDialog);
  }, []);

  const handleActionPress = useCallback(
    async (action: AppDialogAction) => {
      if (isActionPending) {
        return;
      }

      setIsActionPending(true);

      try {
        await action.onPress?.();
        setDialog(null);
      } catch (error) {
        console.warn('App dialog action failed.', error);
      } finally {
        setIsActionPending(false);
      }
    },
    [isActionPending],
  );

  const value = useMemo<AppDialogContextValue>(
    () => ({
      hideDialog,
      showDialog,
    }),
    [hideDialog, showDialog],
  );

  return (
    <AppDialogContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        <AppDialog
          dialog={dialog}
          isActionPending={isActionPending}
          onActionPress={handleActionPress}
          onDismiss={hideDialog}
        />
      </View>
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);

  if (!context) {
    throw new Error('useAppDialog must be used within AppDialogProvider');
  }

  return context;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
