import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppToast, AppToastType } from '@/src/components/AppToast';

type ToastPayload = {
  type?: AppToastType;
  title: string;
  message?: string | null;
  duration?: number;
};

type ActiveToast = ToastPayload & {
  id: number;
};

type ToastContextValue = {
  showToast: (toast: ToastPayload) => void;
  hideToast: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ActiveToast | null>(null);

  const value = useMemo<ToastContextValue>(
    () => ({
      hideToast: () => setToast(null),
      showToast: (nextToast) =>
        setToast({
          ...nextToast,
          id: Date.now(),
        }),
    }),
    [],
  );

  return (
    <ToastContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        <ToastHost toast={toast} onDismiss={value.hideToast} />
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }

  return context;
}

function ToastHost({ onDismiss, toast }: { onDismiss: () => void; toast: ActiveToast | null }) {
  return (
    <View pointerEvents="box-none" style={styles.host}>
      <AppToast
        duration={toast?.duration}
        key={toast?.id ?? 'empty-toast'}
        message={toast?.message}
        onDismiss={onDismiss}
        position="top"
        title={toast?.title}
        type={toast?.type ?? 'info'}
        visible={Boolean(toast)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    elevation: 99999,
  },
});
