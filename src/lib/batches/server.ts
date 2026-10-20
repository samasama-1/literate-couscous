import 'server-only';
// Request-time defaults for dynamic Server Components; never run in client renders.
export function batchPageTime() {
  const now = Date.now();
  return {now, defaultClosing: new Date(now + 14 * 86400000 + 8 * 3600000).toISOString().slice(0,16)};
}
