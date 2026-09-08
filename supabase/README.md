# Supabase production setup

The migrations in `migrations/` provide the backend foundation for authenticated users, households, submissions, evidence photos, review queues, notifications, postage batches, security hardening, household limits, and deduplicated scraper leads.

## Apply it

1. Create a Supabase project.
2. Run the migration in the Supabase SQL editor or with the Supabase CLI.
3. Enable the authentication providers required by the application.
4. Keep the service-role key server-side only. It must never be placed in `index.html`.

The second migration adds the `record_submission` RPC. When an authenticated user marks an opportunity mailed, the client uses this RPC to create or update a private submission record and a default household/member. It is safe to call repeatedly for the same user and opportunity.

After the first user signs in, provision the first administrator from the Supabase SQL editor with `insert into public.profiles (id, role) values ('USER_UUID_HERE', 'admin') on conflict (id) do update set role = 'admin';`. Browser clients cannot self-assign this role.

## Runtime configuration

The eventual authenticated application needs:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` only in a trusted worker
- `RESEND_API_KEY` or another email provider
- `RESEND_FROM` for the verified sender identity
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` for SMS
- `USPS_CLIENT_ID` and `USPS_CLIENT_SECRET` for live postage rates
- `USPS_PRICES_URL` set to the approved Domestic Prices API endpoint for the USPS account
- `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY` for Web Push
- `WORKER_SECRET` shared only by the scheduled worker trigger and the Edge Functions

GitHub Pages can continue serving the public read-only dashboard. Authenticated writes and workers should run through Supabase Edge Functions or another server-side runtime.

## GitHub Pages secrets

The Pages workflow creates `public-config.js` during deployment. Add these repository or environment secrets to enable the browser client:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `VAPID_PUBLIC_KEY`

When they are absent, the deployment uses the example configuration and cloud sync remains disabled.

The daily investigator also runs `scripts/sync_public_data.py` when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured as GitHub Actions secrets. That bridge upserts the JSON opportunity and radar records into Postgres without exposing the service-role key to Pages.

Run the `Deploy Supabase backend` GitHub Actions workflow after adding the Supabase, provider, USPS, VAPID, and worker secrets as repository secrets. It applies all migrations, configures Edge Function secrets, and deploys the three Edge Functions.

The `Run NPN workers` workflow invokes the protected producer and notification worker every 15 minutes. The producer creates deduplicated seven-day deadline jobs; the worker delivers them and retries transient provider failures up to two times.
