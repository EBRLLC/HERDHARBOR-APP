# Photo-Assisted Record Entry Production Contract — v1.8.3

Phase 9B adds a review-only document-photo workflow for four supported classes: animal registration documents, veterinary documents, weight sheets, and medication labels.

## Security boundary

- Browser code never contains the AI provider key.
- The browser calls the authenticated Supabase Edge Function `record-photo-extract`.
- `supabase/config.toml` keeps `verify_jwt = true`.
- The Edge Function validates the signed-in user and reads provider credentials only from server-side environment variables.
- Provider response storage remains disabled with `store: false`.
- Only JPG and PNG are submitted automatically in this phase.
- No database/schema migration is required.

## Review and mutation boundary

The provider response is always a draft. It never authorizes direct farm-state changes.

- Registration drafts hand off to the existing Animal form.
- Veterinary, weight, and medication drafts hand off to the existing Health form.
- The existing Animal and Health runtimes remain the only canonical save owners.
- Multi-row weight sheets require the member to choose one extracted row before continuing.
- Ambiguous or missing animal matches remain unresolved for review.
- Missing dates, measurements, identity fields, or other required values must be supplied by the member before the canonical form can save.

## Medical safety

The extractor is limited to transcription/extraction from visible document content. It does not diagnose, recommend treatment, calculate medication doses, reinterpret veterinary instructions, or invent missing values.

## Privacy and telemetry

Browser telemetry records only coarse action/result/document-class metadata. It does not include document text, extracted values, animal identifiers, file contents, or image data.

## Failure behavior

Authentication errors, unsupported images, oversized payloads, provider timeout/rate-limit/failure, malformed structured output, and unsupported document classes fail closed. Farm records are not changed on any provider or parsing failure.

## Deferred work

Camera-first capture, image compression/orientation hardening, queued uploads, connectivity-aware retries, and broader mobile/offline capture remain Phase 9G responsibilities.
