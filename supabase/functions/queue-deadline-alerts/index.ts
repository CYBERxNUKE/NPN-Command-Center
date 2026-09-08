import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async () => {
  const today = new Date();
  const end = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startDate = today.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const preferences = await supabase.from('notification_preferences').select('owner_id,channel').eq('enabled', true).contains('event_types', ['deadline_soon']);
  if (preferences.error) return Response.json({ error: preferences.error.message }, { status: 500 });
  const opportunities = await supabase.from('opportunities').select('external_key,product,postmark_deadline').eq('status', 'OPEN').gte('postmark_deadline', startDate).lte('postmark_deadline', endDate);
  if (opportunities.error) return Response.json({ error: opportunities.error.message }, { status: 500 });
  const jobs = [];
  for (const preference of preferences.data || []) {
    for (const opportunity of opportunities.data || []) {
      const dedupe = `deadline:${preference.owner_id}:${preference.channel}:${opportunity.external_key}:${opportunity.postmark_deadline}`;
      jobs.push({ owner_id: preference.owner_id, channel: preference.channel, event_type: 'deadline_soon', dedupe_key: dedupe, payload: { subject: `NPN deadline: ${opportunity.product}`, message: `${opportunity.product} has a postmark deadline of ${opportunity.postmark_deadline}.`, url: '/NPN-Command-Center/' } });
    }
  }
  if (jobs.length) {
    const result = await supabase.from('notification_jobs').upsert(jobs, { onConflict: 'dedupe_key', ignoreDuplicates: true });
    if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  }
  return Response.json({ queued: jobs.length, startDate, endDate });
});
