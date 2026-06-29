import { Database, supabase } from '@/src/lib/supabase';

type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
type TokenWalletInsert = Database['public']['Tables']['token_wallets']['Insert'];
type TokenWalletUpdate = Database['public']['Tables']['token_wallets']['Update'];
type TokenTransactionInsert = Database['public']['Tables']['token_transactions']['Insert'];

function warnNotConfigured() {
  console.warn('Supabase is not configured. Token database service skipped.');
}

export async function listByUserId(userId: string) {
  if (!supabase) {
    warnNotConfigured();
    return { wallet: null, transactions: [] };
  }

  const [{ data: wallet, error: walletError }, { data: transactions, error: transactionsError }] =
    await Promise.all([
      supabase.from('token_wallets').select('*').eq('user_id', userId).maybeSingle(),
      supabase
        .from('token_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
    ]);

  if (walletError) {
    console.warn('Failed to load token wallet from Supabase.', walletError);
  }

  if (transactionsError) {
    console.warn('Failed to load token transactions from Supabase.', transactionsError);
  }

  return { wallet, transactions: transactions ?? [] };
}

export async function createProfile(profile: ProfileInsert = {}) {
  if (!supabase) {
    warnNotConfigured();
    return null;
  }

  const { data, error } = await supabase.from('profiles').insert(profile).select('*').single();

  if (error) {
    console.warn('Failed to create test profile in Supabase.', error);
    return null;
  }

  return data;
}

export async function getProfile(id: string) {
  if (!supabase) {
    warnNotConfigured();
    return null;
  }

  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();

  if (error) {
    console.warn('Failed to load test profile from Supabase.', error);
    return null;
  }

  return data;
}

export async function create(wallet: TokenWalletInsert, transaction?: TokenTransactionInsert) {
  if (!supabase) {
    warnNotConfigured();
    return null;
  }

  const { data, error } = await supabase.from('token_wallets').insert(wallet).select('*').single();

  if (error) {
    console.warn('Failed to create token wallet in Supabase.', error);
    return null;
  }

  if (transaction) {
    const { error: transactionError } = await supabase
      .from('token_transactions')
      .insert({ ...transaction, wallet_id: transaction.wallet_id ?? data.id });

    if (transactionError) {
      console.warn('Failed to create token transaction in Supabase.', transactionError);
    }
  }

  return data;
}

export async function update(id: string, changes: TokenWalletUpdate) {
  if (!supabase) {
    warnNotConfigured();
    return null;
  }

  const { data, error } = await supabase
    .from('token_wallets')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.warn('Failed to update token wallet in Supabase.', error);
    return null;
  }

  return data;
}

export async function createTransaction(transaction: TokenTransactionInsert) {
  if (!supabase) {
    warnNotConfigured();
    return null;
  }

  const { data, error } = await supabase
    .from('token_transactions')
    .insert(transaction)
    .select('*')
    .single();

  if (error) {
    console.warn('Failed to create token transaction in Supabase.', error);
    return null;
  }

  return data;
}

export async function remove(id: string) {
  if (!supabase) {
    warnNotConfigured();
    return false;
  }

  const { error } = await supabase.from('token_wallets').delete().eq('id', id);

  if (error) {
    console.warn('Failed to delete token wallet in Supabase.', error);
    return false;
  }

  return true;
}
