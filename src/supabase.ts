import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if Supabase is properly configured
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl !== 'your_supabase_url_here');

if (!isSupabaseConfigured) {
  console.warn('Supabase credentials missing or using placeholders. Auth features will be disabled.');
}

// Initialize the client with placeholders only if necessary to avoid crash, 
// but we'll use isSupabaseConfigured to guard calls.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);
