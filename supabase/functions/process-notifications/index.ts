import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

function text(value: unknown) {
  return String(value ?? '');
}

async function sendEmail(destination: string, payload: Record<string, unknown>) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM') || 'NPN Command Center <onboarding@resend.dev>',
      to: [destination],
      subject: text(payload.subject || 'NPN Command Center alert'),
      text: text(payload.text || payload.message)
    })
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}: ${await response.text()}`);
}

async function sendSms(destination: string, payload: Record<string, unknown>) {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_FROM_NUMBER');
  if (!sid || !token || !from) throw new Error('Twilio credentials are not configured');
  const body = new URLSearchParams({ To: destination, From: from, Body: text(payload.message) });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) throw new Error(`Twilio returned ${response.status}: ${await response.text()}`);
}

async function sendPush(ownerId: string, payload: Record<string, unknown>) {
  const subject = Deno.env.get('VAPID_SUBJECT');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!subject || !publicKey || !privateKey) throw new Error('VAPID credentials are not configured');
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const { data: subscriptions, error } = await supabase.from('push_subscriptions').select('endpoint,p256dh,auth_key').eq('owner_id', ownerId);
  if (error) throw error;
  for (const subscription of subscriptions || []) {
    await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } }, JSON.stringify({ title: text(payload.subject || 'NPN Command Center'), body: text(payload.message) }));
  }
}

function authorized(request: Request) {
  const secret = Deno.env.get('WORKER_SECRET');
  return Boolean(secret && request.headers.get('x-worker-secret') === secret);
}

Deno.serve(async (request) => {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: jobs, error } = await supabase.rpc('claim_notification_jobs', { p_limit: 25 });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const results = [];
  for (const job of jobs || []) {
    try {
      if (job.channel === 'email' || job.channel === 'sms') {
        const { data: preference } = await supabase.from('notification_preferences').select('destination').eq('owner_id', job.owner_id).eq('channel', job.channel).eq('enabled', true).limit(1).maybeSingle();
        if (!preference?.destination) throw new Error(`No enabled ${job.channel} destination`);
        if (job.channel === 'email') await sendEmail(preference.destination, job.payload);
        else await sendSms(preference.destination, job.payload);
      } else if (job.channel === 'push') {
        await sendPush(job.owner_id, job.payload);
      } else {
        throw new Error(`Unsupported notification channel: ${job.channel}`);
      }
      await supabase.from('notification_jobs').update({ status: 'sent', sent_at: new Date().toISOString(), locked_at: null, last_error: null }).eq('id', job.id);
      results.push({ id: job.id, status: 'sent' });
    } catch (error) {
      const retry = job.attempts + 1 < 3;
      await supabase.from('notification_jobs').update({ status: retry ? 'queued' : 'failed', locked_at: null, available_at: retry ? new Date(Date.now() + (job.attempts + 1) * 5 * 60 * 1000).toISOString() : job.available_at, last_error: text(error) }).eq('id', job.id);
      results.push({ id: job.id, status: retry ? 'queued' : 'failed', error: text(error) });
    }
  }
  return Response.json({ processed: results.length, results });
});
