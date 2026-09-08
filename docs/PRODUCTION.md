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
| Multi-device history | `submissions` | Connect the authenticated UI |
| Authentication | Supabase Auth and `profiles` | Add login and invite screens |
| Email, SMS, push | `notification_preferences`, `notification_jobs` | Add provider workers and web push registration |
| Package evidence | `submission_evidence` and `submission-evidence` bucket | Add image upload and signed URL viewer |
| Checklist and odds | `opportunities.checklist_url`, `opportunities.odds_url` | Add admin editing and validation |
| Prize intelligence | `opportunity_prizes` | Add review and source citation UI |
| Household limits | `household_members.limits` | Add rule evaluation before submission creation |
| USPS manifests | `postage_batches` and `postage_batch_items` | Add USPS API worker and address validation |
| Admin review | `review_queue` | Add protected reviewer role and queue UI |
| Extension/share sheet | `review_queue` | Add browser extension and authenticated intake endpoint |

## Safety requirements before launch

- Do not expose the Supabase service-role key in the browser.
- Keep evidence storage private and serve only short-lived signed URLs.
- Require official-source review before promoting a secondary lead to verified.
- Test household-limit rules against each opportunity's current official rules.
- Treat USPS prices as estimates until the live API response is stored.
