alter table public.submission_evidence
  drop constraint if exists submission_evidence_mime_type_check;

alter table public.submission_evidence
  add constraint submission_evidence_mime_type_check
  check (mime_type in ('image/jpeg', 'image/png', 'image/webp'))
  not valid;

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'submission-evidence';
