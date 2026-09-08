# Production roadmap

## Implemented foundation

- Supabase/Postgres schema with row-level security.
- Auth user profiles and household members.
- Multi-device submission records.
- Private evidence storage bucket policies.
- Product checklist, odds, prize, and card-pool fields.
- Review queue for secondary-source and share-sheet leads.
- Notification preferences and durable notification jobs.
- Postage batch and manifest records.

## Feature mapping

| Requested feature | Backend location | Remaining runtime work |
| --- | --- | --- |
| Multi-device history | `submissions` and `record_submission` | Apply migrations and configure Supabase |
| Authentication | Supabase Auth and `profiles` | Configure providers and redirect URLs |
| Email, SMS, push | `notification_preferences`, `notification_jobs` | Deploy worker, provider credentials, and scheduler |
| Package evidence | `submission_evidence` and `submission-evidence` bucket | Signed viewer is included; configure storage |
| Checklist and odds | `opportunities.checklist_url`, `opportunities.odds_url` | Admin editing is included; validate official URLs |
| Prize intelligence | `opportunity_prizes` | Add review and source citation UI |
| Household limits | `households.limits`, `household_members.limits` | Configure limits per household and member |
| USPS manifests | `postage_batches` and `postage_batch_items` | Configure USPS endpoint and address validation |
| Admin review | `review_queue` | Apply migrations and configure admin role |
| Extension/share sheet | `review_queue` | Load extension and configure Supabase |

The repository now includes the authenticated account, admin, postage, and manifest pages; the browser extension; the notification and USPS Edge Function sources; and the JSON-to-Supabase sync worker. External provider credentials and a Supabase project are still required for live execution.

## Safety requirements before launch

- Do not expose the Supabase service-role key in the browser.
- Keep evidence storage private and serve only short-lived signed URLs.
- Require official-source review before promoting a secondary lead to verified.
- Test household-limit rules against each opportunity's current official rules.
- Treat USPS prices as estimates until the live API response is stored.
