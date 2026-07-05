import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  create as createTokenWallet,
  createProfile,
  createTransaction as createDbTokenTransaction,
  getProfile,
  listByUserId,
  update as updateTokenWallet,
} from '@/src/services/tokenDbService';

export type TokenTransaction = {
  id: string;
  type: 'initial' | 'spend' | 'purchase_test';
  amount: number;
  reason: string;
  createdAt: string;
};

type SpendReason =
  | 'scan_food'
  | 'add_meal'
  | 'unlock_water_intake'
  | 'meal_photo_estimate'
  | 'ai_meal_autofill'
  | 'ai_food_autofill'
  | 'internet_product_lookup';

type TokenContextValue = {
  addTokens: (amount: number) => Promise<void>;
  canSpendTokens: (amount: number) => boolean;
  getTokenBalance: () => number;
  isLoading: boolean;
  spendTokens: (amount: number, reason: SpendReason) => Promise<boolean>;
  tokens: number;
  tokenBalance: number;
  transactions: TokenTransaction[];
};

const TOKEN_BALANCE_KEY = 'calorie-tracker.token-balance';
const TOKEN_TRANSACTIONS_KEY = 'calorie-tracker.token-transactions';
const TEST_PROFILE_ID_KEY = 'testProfileId';
const LEGACY_TEST_PROFILE_ID_KEY = 'calorie-tracker.test-profile-id';
const INITIAL_TOKENS = 50;
const INITIAL_REASON = 'Free starter tokens';

const TokenContext = createContext<TokenContextValue | undefined>(undefined);

function createTransaction(
  type: TokenTransaction['type'],
  amount: number,
  reason: string,
): TokenTransaction {
  const now = new Date();

  return {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    amount,
    reason,
    createdAt: now.toISOString(),
  };
}

function createUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const nextValue = char === 'x' ? value : (value & 0x3) | 0x8;
    return nextValue.toString(16);
  });
}

async function safeGetItem(key: string) {
  try {
    return await AsyncStorage.getItem(key);
  } catch (error) {
    console.warn(`Failed to read token storage key "${key}".`, error);
    return null;
  }
}

async function safeSetItem(key: string, value: string) {
  try {
    await AsyncStorage.setItem(key, value);
  } catch (error) {
    console.warn(`Failed to write token storage key "${key}".`, error);
  }
}

async function saveTokenState(balance: number, transactions: TokenTransaction[]) {
  await Promise.all([
    safeSetItem(TOKEN_BALANCE_KEY, String(balance)),
    safeSetItem(TOKEN_TRANSACTIONS_KEY, JSON.stringify(transactions)),
  ]);
}

function parseTransactions(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as TokenTransaction[]) : [];
  } catch (error) {
    console.warn('Failed to parse token transactions.', error);
    return [];
  }
}

function hasInitialTransaction(transactions: TokenTransaction[]) {
  return transactions.some((transaction) => transaction.type === 'initial');
}

function mapDbTransaction(transaction: {
  id: string;
  type: TokenTransaction['type'];
  amount: number;
  reason: string;
  created_at: string;
}): TokenTransaction {
  return {
    id: transaction.id,
    type: transaction.type,
    amount: transaction.amount,
    reason: transaction.reason,
    createdAt: transaction.created_at,
  };
}

async function loadOrCreateTestProfileId() {
  const storedProfileId =
    (await safeGetItem(TEST_PROFILE_ID_KEY)) ?? (await safeGetItem(LEGACY_TEST_PROFILE_ID_KEY));

  if (storedProfileId) {
    const existingProfile =
      (await getProfile(storedProfileId)) ??
      (await createProfile({
        id: storedProfileId,
        display_name: 'Local Test User',
      }));

    if (existingProfile) {
      await safeSetItem(TEST_PROFILE_ID_KEY, storedProfileId);
      return storedProfileId;
    }
  }

  const requestedProfileId = createUuid();
  const profile = await createProfile({
    id: requestedProfileId,
    display_name: 'Local Test User',
  });

  if (!profile) {
    return null;
  }

  await safeSetItem(TEST_PROFILE_ID_KEY, profile.id);
  return profile.id;
}

async function syncWalletFromSupabase(
  localBalance: number,
  localTransactions: TokenTransaction[],
) {
  const profileId = await loadOrCreateTestProfileId();

  if (!profileId) {
    return null;
  }

  const { wallet, transactions: dbTransactions } = await listByUserId(profileId);

  if (wallet) {
    return {
      profileId,
      walletId: wallet.id,
      balance: wallet.balance,
      transactions: dbTransactions.map(mapDbTransaction),
    };
  }

  const nextWallet = await createTokenWallet(
    {
      user_id: profileId,
      balance: INITIAL_TOKENS,
    },
    {
      user_id: profileId,
      type: 'initial',
      amount: INITIAL_TOKENS,
      reason: INITIAL_REASON,
    },
  );

  if (!nextWallet) {
    return null;
  }

  const { transactions: nextDbTransactions } = await listByUserId(profileId);

  return {
    profileId,
    walletId: nextWallet.id,
    balance: nextWallet.balance,
    transactions: nextDbTransactions.map(mapDbTransaction),
  };
}

export function TokenProvider({ children }: PropsWithChildren) {
  const [tokenBalance, setTokenBalance] = useState(INITIAL_TOKENS);
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [testProfileId, setTestProfileId] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const mutationVersionRef = useRef(0);

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      try {
        const [rawBalance, rawTransactions] = await Promise.all([
          safeGetItem(TOKEN_BALANCE_KEY),
          safeGetItem(TOKEN_TRANSACTIONS_KEY),
        ]);
        const parsedTransactions = parseTransactions(rawTransactions);

        let localBalance = INITIAL_TOKENS;
        let localTransactions = parsedTransactions;

        if (rawBalance === null || rawBalance === undefined) {
          const initialTransaction = createTransaction('initial', INITIAL_TOKENS, INITIAL_REASON);
          localTransactions = [initialTransaction];

          if (isMounted) {
            setTokenBalance(INITIAL_TOKENS);
            setTransactions(localTransactions);
          }

          await saveTokenState(INITIAL_TOKENS, localTransactions);
        } else {
          const savedBalance = Number(rawBalance);

          if (Number.isFinite(savedBalance)) {
            localBalance = savedBalance;
          }

          if (localBalance === 0 && !hasInitialTransaction(parsedTransactions)) {
            localBalance = INITIAL_TOKENS;
            localTransactions = [
              createTransaction('initial', INITIAL_TOKENS, INITIAL_REASON),
              ...parsedTransactions,
            ];
            await saveTokenState(localBalance, localTransactions);
          }

          if (isMounted) {
            setTokenBalance(localBalance);
            setTransactions(localTransactions);
          }
        }

        if (!Number.isFinite(Number(rawBalance)) && rawBalance !== null && rawBalance !== undefined) {
          const initialTransaction = createTransaction('initial', INITIAL_TOKENS, INITIAL_REASON);
          localBalance = INITIAL_TOKENS;
          localTransactions = [initialTransaction, ...parsedTransactions];

          if (isMounted) {
            setTokenBalance(localBalance);
            setTransactions(localTransactions);
          }

          await saveTokenState(localBalance, localTransactions);
        }

        if (isMounted) {
          setIsLoading(false);
        }

        const syncMutationVersion = mutationVersionRef.current;
        const remoteState = await syncWalletFromSupabase(localBalance, localTransactions);

        if (remoteState && isMounted) {
          setTestProfileId(remoteState.profileId);
          setWalletId(remoteState.walletId);

          if (mutationVersionRef.current !== syncMutationVersion) {
            return;
          }

          setTokenBalance(remoteState.balance);
          setTransactions(remoteState.transactions.length > 0 ? remoteState.transactions : localTransactions);
          await saveTokenState(
            remoteState.balance,
            remoteState.transactions.length > 0 ? remoteState.transactions : localTransactions,
          );
        }
      } catch (error) {
        console.warn('Failed to load token state.', error);
        const initialTransaction = createTransaction('initial', INITIAL_TOKENS, INITIAL_REASON);

        if (isMounted) {
          setTokenBalance(INITIAL_TOKENS);
          setTransactions([initialTransaction]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    hydrate();

    return () => {
      isMounted = false;
    };
  }, []);

  function getTokenBalance() {
    return tokenBalance;
  }

  function canSpendTokens(amount: number) {
    return tokenBalance >= amount;
  }

  async function addTokens(amount: number) {
    mutationVersionRef.current += 1;
    const transaction = createTransaction('purchase_test', amount, 'Test purchase');
    const nextBalance = tokenBalance + amount;
    const nextTransactions = [transaction, ...transactions];

    setTokenBalance(nextBalance);
    setTransactions(nextTransactions);
    await saveTokenState(nextBalance, nextTransactions);

    if (!testProfileId || !walletId) {
      console.warn('Supabase token wallet unavailable. Saved token purchase locally only.');
      return;
    }

    try {
      const updatedWallet = await updateTokenWallet(walletId, { balance: nextBalance });

      if (!updatedWallet) {
        return;
      }

      const dbTransaction = await createDbTokenTransaction({
        user_id: testProfileId,
        wallet_id: walletId,
        type: 'purchase_test',
        amount,
        reason: 'Test purchase',
      });

      if (dbTransaction) {
        const syncedTransactions = [mapDbTransaction(dbTransaction), ...transactions];
        setTransactions(syncedTransactions);
        await saveTokenState(nextBalance, syncedTransactions);
      }
    } catch (error) {
      console.warn('Failed to sync token purchase to Supabase.', error);
    }
  }

  async function spendTokens(amount: number, reason: SpendReason) {
    if (!canSpendTokens(amount)) {
      return false;
    }

    mutationVersionRef.current += 1;
    const label =
      reason === 'scan_food'
        ? 'Scan food'
        : reason === 'add_meal'
          ? 'Add meal'
          : reason === 'meal_photo_estimate'
            ? 'Meal photo estimate'
            : 'Unlock water intake';
    const transaction = createTransaction('spend', -amount, label);
    const nextBalance = tokenBalance - amount;
    const nextTransactions = [transaction, ...transactions];

    setTokenBalance(nextBalance);
    setTransactions(nextTransactions);
    await saveTokenState(nextBalance, nextTransactions);

    if (!testProfileId || !walletId) {
      console.warn('Supabase token wallet unavailable. Saved token spend locally only.');
      return true;
    }

    try {
      const updatedWallet = await updateTokenWallet(walletId, { balance: nextBalance });

      if (!updatedWallet) {
        return true;
      }

      const dbTransaction = await createDbTokenTransaction({
        user_id: testProfileId,
        wallet_id: walletId,
        type: 'spend',
        amount: -amount,
        reason: label,
      });

      if (dbTransaction) {
        const syncedTransactions = [mapDbTransaction(dbTransaction), ...transactions];
        setTransactions(syncedTransactions);
        await saveTokenState(nextBalance, syncedTransactions);
      }
    } catch (error) {
      console.warn('Failed to sync token spend to Supabase.', error);
    }

    return true;
  }

  const value = useMemo(
    () => ({
      addTokens,
      canSpendTokens,
      getTokenBalance,
      isLoading,
      spendTokens,
      tokens: tokenBalance,
      tokenBalance,
      transactions,
    }),
    [isLoading, testProfileId, tokenBalance, transactions, walletId],
  );

  return <TokenContext.Provider value={value}>{children}</TokenContext.Provider>;
}

export function useTokens() {
  const context = useContext(TokenContext);

  if (!context) {
    throw new Error('useTokens must be used inside TokenProvider');
  }

  return context;
}
