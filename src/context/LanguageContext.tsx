import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { AppLanguage, translate } from '@/src/i18n';

const LANGUAGE_STORAGE_KEY = 'app.language';
const DEFAULT_LANGUAGE: AppLanguage = 'en';
const SUPPORTED_LANGUAGES: AppLanguage[] = ['en', 'fr', 'es', 'ar', 'zh', 'pt', 'de'];

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function isAppLanguage(value: string | null): value is AppLanguage {
  return Boolean(value && SUPPORTED_LANGUAGES.includes(value as AppLanguage));
}

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<AppLanguage>(DEFAULT_LANGUAGE);

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => {
        if (isMounted && isAppLanguage(storedLanguage)) {
          setLanguageState(storedLanguage);
        }
      })
      .catch((error) => {
        console.warn('Failed to load app language.', error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function setLanguage(nextLanguage: AppLanguage) {
    setLanguageState(nextLanguage);

    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch (error) {
      console.warn('Failed to save app language.', error);
    }
  }

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key: string, params?: Record<string, string | number>) =>
        translate(language, key, params),
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider');
  }

  return context;
}
