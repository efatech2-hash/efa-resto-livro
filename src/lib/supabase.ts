import {createClient, type SupabaseClient} from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('MY_SUPABASE_URL') &&
    !supabaseAnonKey.includes('MY_SUPABASE_ANON_KEY')
);

export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

export async function checkDatabaseInitialized(): Promise<{
  initialized: boolean;
  error?: string;
}> {
  if (!isSupabaseConfigured) {
    return {initialized: false, error: 'Variables .env VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes'};
  }
  try {
    const {error} = await supabase.from('formules').select('id').limit(1);
    if (error) {
      const msg = error.message || '';
      if (
        error.code === 'PGRST205' ||
        error.code === '42P01' ||
        msg.includes('schema cache') ||
        msg.includes('does not exist')
      ) {
        return {initialized: false, error: msg};
      }
    }
    return {initialized: true};
  } catch (err) {
    return {initialized: false, error: String(err)};
  }
}
