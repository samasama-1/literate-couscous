import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn("Supabase URL or Service Role Key is missing. Check your .env.local file.");
}

// The admin client uses the service role key to bypass RLS.
// WARNING: This should NEVER be used in Client Components or exposed to the frontend.
// Only use this in Server Actions or API routes where the user is authenticated.
export const supabaseAdmin = createClient<Database>(
  supabaseUrl || 'http://localhost:54321',
  supabaseServiceRoleKey || 'dummy_admin_key'
);
