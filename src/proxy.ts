import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  // Let Next.js continue the request naturally while we just peek at the auth state
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Protect /admin routes globally
  if (request.nextUrl.pathname.startsWith('/admin')) {
    
    // Explicitly allow the login page itself to avoid redirect loops
    if (request.nextUrl.pathname === '/admin/login') {
      // If they are already logged in and try to visit login, bounce them to the dashboard
      if (user) {
        const url = request.nextUrl.clone();
        url.pathname = '/admin';
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }

    // Require an active session for all other /admin routes
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      return NextResponse.redirect(url);
    }
    
    // Enforce the ADMIN_EMAILS allowlist
    const allowedEmailsStr = process.env.ADMIN_EMAILS || '';
    const allowedEmails = allowedEmailsStr.split(',').map(e => e.trim().toLowerCase());
    const userEmail = user.email?.trim().toLowerCase() || '';
    
    if (!allowedEmails.includes(userEmail)) {
      // User has an account, but is NOT on the admin list.
      // Bounce them out of the admin section entirely.
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
