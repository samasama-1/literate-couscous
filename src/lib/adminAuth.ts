import 'server-only';
import { createClient } from "@/lib/supabaseServer";

export async function verifyAdminAccess() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !user.email) {
    throw new Error("Unauthorized: No active session.");
  }

  const allowedEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const userEmail = user.email.trim().toLowerCase();

  if (!allowedEmails.includes(userEmail)) {
    throw new Error("Unauthorized: Email not approved for admin access.");
  }

  return { email: userEmail };
}
