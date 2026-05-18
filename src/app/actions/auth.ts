'use server';

import { createClient } from '@/lib/supabaseServer';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function signIn(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Please enter both email and password.' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Keep errors generic for security to prevent user enumeration
    return { error: 'Invalid login credentials.' };
  }

  // After successful login, redirect to the admin dashboard
  revalidatePath('/admin');
  redirect('/admin');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  
  // Revalidate to ensure stale layouts don't persist
  revalidatePath('/admin');
  redirect('/admin/login');
}
