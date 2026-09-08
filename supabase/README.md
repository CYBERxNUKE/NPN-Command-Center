# Supabase production setup

The migration in `migrations/001_production_foundation.sql` is the backend foundation for authenticated users, households, submissions, evidence photos, review queues, notifications, and postage batches.

## Apply it

1. Create a Supabase project.
2. Run the migration in the Supabase SQL editor or with the Supabase CLI.
3. Enable the authentication providers required by the application.
4. Keep the service-role key server-side only. It must never be placed in `index.html`.

## Runtime configuration

The eventual authenticated application needs:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` only in a trusted worker
- `RESEND_API_KEY` or another email provider
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` for SMS
- `USPS_CLIENT_ID` and `USPS_CLIENT_SECRET` for live postage rates

GitHub Pages can continue serving the public read-only dashboard. Authenticated writes and workers should run through Supabase Edge Functions or another server-side runtime.
