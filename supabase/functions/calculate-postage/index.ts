import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const pricesUrl = Deno.env.get('USPS_PRICES_URL');

async function token() {
  const clientId = Deno.env.get('USPS_CLIENT_ID');
  const clientSecret = Deno.env.get('USPS_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('USPS credentials are not configured');
  const response = await fetch('https://apis.usps.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' })
  });
  if (!response.ok) throw new Error(`USPS OAuth returned ${response.status}: ${await response.text()}`);
  return (await response.json()).access_token;
}

Deno.serve(async (request) => {
  if (!pricesUrl) return Response.json({ error: 'USPS_PRICES_URL is not configured' }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  const zip = (value: unknown) => /^\d{5}$/.test(String(value || ''));
  if (!zip(body.originZIPCode) || !zip(body.destinationZIPCode)) {
    return Response.json({ error: 'Origin and destination ZIP codes must be five digits' }, { status: 400 });
  }
  const weight = Number(body.weight);
  if (!Number.isFinite(weight) || weight <= 0 || weight > 70) {
    return Response.json({ error: 'Weight must be greater than zero and no more than 70 ounces' }, { status: 400 });
  }
  const accessToken = await token();
  const response = await fetch(pricesUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      originZIPCode: body.originZIPCode,
      destinationZIPCode: body.destinationZIPCode,
      weight,
      length: body.length || 10,
      width: body.width || 6,
      height: body.height || 1,
      mailClass: body.mailClass || 'USPS_GROUND_ADVANTAGE',
      priceType: body.priceType || 'RETAIL'
    })
  });
  const result = await response.json();
  if (!response.ok) return Response.json({ error: result }, { status: response.status });
  return Response.json({ quote: result, source: 'USPS Domestic Prices API' });
});
