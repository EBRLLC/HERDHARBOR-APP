# Paper Pedigree AI Production Contract — v1.8.3 Development Stack

This document records the production contract for the existing Paper Pedigree AI feature. It does not enable a new AI mutation path. The whole-app release is Alpha v1.8.3.

## Security and configuration

- Browser code never contains the AI provider key.
- The browser invokes the authenticated Supabase Edge Function `paper-pedigree-extract`.
- `supabase/config.toml` requires JWT verification for that function.
- The function independently validates the bearer token with Supabase Auth before provider use.
- Required server configuration: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_API_KEY`.
- Optional server configuration: `OPENAI_PEDIGREE_MODEL`, `PAPER_PEDIGREE_DAILY_LIMIT`, `AI_IMAGE_GLOBAL_DAILY_LIMIT`, and `PAPER_PEDIGREE_PROVIDER_TIMEOUT_MS`.
- Default Paper Pedigree allowance is **10 scans per authenticated user per UTC day**.
- Paper Pedigree and general Photo Entry share a default **50 AI-image provider calls per UTC day** global backstop.
- Provider response storage remains disabled with `store: false`.
- JPG and PNG are the only automatic-reader formats currently supported.
- Oversized/invalid requests fail before the paid provider call.
- Per-user and shared-global daily quota reservation is atomic and service-role-only through `herdharbor_reserve_ai_image_request`.
- Aggregate production metrics are service-role-only and contain counters only.

## Diagnostic contract

The Edge Function returns a sanitized stable `code` plus a user-safe message. Supported categories include:

- `configuration_unavailable`
- `authentication_required`
- `authentication_invalid`
- `unsupported_image`
- `invalid_image_payload`
- `image_too_large`
- `usage_ledger_unavailable`
- `quota_exceeded`
- `global_quota_exceeded`
- `provider_rate_limit`
- `provider_timeout`
- `provider_error`
- `extraction_incomplete`
- `empty_extraction`
- `malformed_structured_result`
- `no_pedigree_detected`
- `service_error`

Provider response bodies, document text, pedigree values, image data, and complete farm state are not written to monitoring/metrics.

## Review and mutation boundary

The AI result is always a draft. Per-field confidence remains provider extraction provenance even after the member edits a value. Low-confidence values remain visually marked. The member must explicitly confirm that the draft was reviewed before the canonical import button enables.

The existing import core remains authoritative for:

- strong identifier matching
- ambiguous-match blocking
- field conflict blocking
- canonical `sireId` / `damId`
- ancestor-only records
- linebreeding deduplication
- no silent overwrite
- no farm-state mutation before the explicit reviewed import

## Layout tolerance

Extraction instructions support common rabbit pedigrees printed as vertical ancestry trees, horizontal ancestry trees, grids/columns, and branch/relationship layouts. Moderate rotation, perspective, glare, cropping, and partial-but-usable documents are treated as reviewable conditions, not permission to guess.

Handwriting is not claimed reliable. Unclear handwritten or printed values must be blank/low-confidence with a warning rather than invented.

## Aggregate metrics

After applying `supabase/v1.8.3-paper-pedigree-ai-metrics.sql`, the service-role-only daily aggregate provides:

- extraction requests
- successful structured drafts
- correction-required drafts
- rejected outputs
- rate-limit hits
- provider failures

Correction-required rate is derived from `correction_required_drafts / structured_drafts`. The aggregate contains no user id or pedigree/farm content.

## Multi-photo decision

Multi-photo/page merge is intentionally **deferred** from this phase. The current canonical provenance model associates one reviewed import draft with one prepared source image. Adding multiple images safely requires deterministic per-image field provenance, duplicate-role resolution across images, explicit conflicting-value presentation, and source-image association for every merged field. Forcing a merge without those contracts could silently corrupt ancestry, so Phase 5 leaves the single-photo workflow intact.
