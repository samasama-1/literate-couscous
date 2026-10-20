import type {MailMessage} from './zoho-transport';
export type Provider = 'resend' | 'zoho';
export type DeliveryJob = {id: string; status: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped'; attempted_at: string | null; provider: string | null; metadata: unknown};
export type DeliveryPatch = {status: 'sent' | 'failed'; metadata: Record<string, unknown>; error_message: string | null; provider_message_id?: string; sent_at?: string; failed_at?: string};
export type DeliveryStore = {
  claim(job: DeliveryJob, at: string, provider: Provider, metadata: Record<string, unknown>): Promise<boolean>;
  markSending(at: string, metadata: Record<string, unknown>): Promise<boolean>;
  finish(at: string, patch: DeliveryPatch): Promise<boolean>;
  block(job: DeliveryJob, message: string): Promise<void>;
};
export function metadataOf(job: DeliveryJob): Record<string, unknown> {
  return job.metadata && typeof job.metadata === 'object' && !Array.isArray(job.metadata) ? {...job.metadata as Record<string, unknown>} : {};
}
// Claims and send markers must be persisted before the external message POST.
// This prevents a crashed/ambiguous Zoho attempt from being sent again by retry.
export async function deliverOnce({job, provider, store, buildMessage, prepare, now = () => Date.now()}: {
  job: DeliveryJob; provider: Provider; store: DeliveryStore;
  buildMessage: () => MailMessage;
  prepare: () => Promise<(message: MailMessage) => Promise<string>>;
  now?: () => number;
}): Promise<'sent' | 'queued' | 'failed'> {
  if (job.status === 'sent') return 'sent';
  if (job.status === 'skipped') return 'queued';
  const attempted = job.attempted_at ? Date.parse(job.attempted_at) : 0;
  if (job.status === 'sending' && (!attempted || now() - attempted < 10 * 60 * 1000)) return 'queued';
  const metadata = metadataOf(job);
  let blocked: string | undefined;
  if (job.attempted_at && (!Number.isFinite(attempted) || now() - attempted > 23 * 60 * 60 * 1000))
    blocked = 'Retry stopped after 23 hours. Check the provider log before arranging a resend.';
  else if (job.attempted_at && (job.provider || 'resend') !== provider)
    blocked = 'Provider changed after an email attempt. Reconcile the original provider before arranging a resend.';
  else if (job.attempted_at && provider === 'zoho' && metadata._mail_outcome !== 'not_sent')
    blocked = 'Zoho send outcome requires review. Check Zoho Sent/provider records; another send is blocked to prevent duplicates.';
  if (blocked) { await store.block(job, blocked); return 'failed'; }
  // Resend must retain the original attempt time and immutable idempotency key.
  const at = provider === 'resend' && job.attempted_at ? job.attempted_at : new Date(now()).toISOString();
  if (!await store.claim(job, at, provider, {...metadata, _mail_outcome: 'preparing'})) return 'queued';
  let postStarted = false;
  try {
    const message = buildMessage();
    const send = await prepare();
    // A previous worker may have lost its lease. Never POST without an exclusive marker.
    if (!await store.markSending(at, {...metadata, _mail_outcome: 'unknown'})) throw new Error('MAIL_CLAIM_LOST');
    postStarted = true;
    const messageId = await send(message);
    const saved = await store.finish(at, {status: 'sent', metadata: {...metadata, _mail_outcome: 'accepted'},
      error_message: null, provider_message_id: messageId, sent_at: new Date(now()).toISOString()});
    if (!saved) throw new Error('MAIL_ACCEPTANCE_SAVE_FAILED');
    return 'sent';
  } catch {
    const outcome = postStarted ? 'unknown' : 'not_sent';
    const error = postStarted
      ? provider === 'zoho' ? 'Zoho send outcome requires review. Check Zoho Sent/provider records before any resend.' : 'Email send not confirmed. Retry with the same provider within 23 hours.'
      : 'Email preparation failed before sending. Check sender configuration, authorization, message content and account permissions; retry after correcting them.';
    try { await store.finish(at, {status: 'failed', metadata: {...metadata, _mail_outcome: outcome}, error_message: error, failed_at: new Date(now()).toISOString()}); }
    catch { /* The persisted pre-POST marker remains conservative if saving fails. */ }
    return 'failed';
  }
}
