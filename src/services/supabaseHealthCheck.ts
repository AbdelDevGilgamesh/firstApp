import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';

export type SupabaseHealthCheckResult = {
  ok: boolean;
  message: string;
};

export async function testSupabaseConnection(): Promise<SupabaseHealthCheckResult> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      ok: false,
      message:
        'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in the app environment.',
    };
  }

  try {
    const { error } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true });

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    return {
      ok: true,
      message: 'Supabase database connection is working.',
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Supabase connection error.',
    };
  }
}
