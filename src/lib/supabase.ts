import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Rather than throwing immediately (which breaks the dev server if env isn't set yet),
  // we warn the console so the user knows they need to set up Supabase.
  console.warn("Supabase URL or Anon Key is missing. Check your .env.local file.");
}

export const supabase = createClient<Database>(
  supabaseUrl || 'http://localhost:54321', // Fallback to local dev URL to prevent crashes
  supabaseAnonKey || 'dummy_key_to_prevent_crash'
);
