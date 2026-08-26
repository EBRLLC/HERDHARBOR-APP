# HerdHarbor Alpha v1.5.0 — Shows

## Shows

- Adds **Shows** directly beneath **Births & Litters** in the existing Records navigation without moving or redesigning any existing navigation item.
- Tracks show name, dates, location, organization, show type, notes, archive status, and attachments.
- Supports 4-H, FFA, county/state fairs, ARBA, breed clubs, rabbit, poultry, livestock, beef, dairy, goat, sheep, swine, horse, open, youth, and custom show types.
- Adds private exhibitor records for account owners, adults, children, 4-H members, FFA members, and other exhibitors without creating separate HerdHarbor logins or public profiles.
- Links show entries to the existing canonical HerdHarbor animal record. Shows does not create a separate show-animal database.
- Supports multiple entries/classes for the same animal at one show.
- Records placements from 1st–10th, numeric placements beyond 10th, participation/DNP/DQ, and custom placement terminology.
- Supports multiple awards per entry/result, including championships, Best of Breed, Best in Show, ribbons, showmanship awards, and custom awards.
- Records judge, score, comments, strengths, areas for improvement, show-specific weight, body condition, and condition notes without overwriting general animal weight history.
- Adds show/result attachments for photos, ribbons, trophies, scorecards, judge sheets, programs, receipts, and paperwork using HerdHarbor's existing state/cloud storage path.
- Adds Animal Show History and private Exhibitor Achievement History with totals and filters.
- Adds year, show, exhibitor, animal, species, breed, organization, show type, placement, award, and project filtering.
- Adds pagination/record limiting so large show histories are not rendered without bounds.

## 4-H / FFA Projects

- Adds optional project records linked to an Exhibitor + existing Animal + Year + Project Type.
- Supports 4-H, FFA, youth livestock, and other project workflows without creating a separate 4-H application.
- Adds project goals, dated notes, project photos, status, goals/summary, and project timeline.
- Growth summaries reuse canonical HerdHarbor Health weight records and calculate average daily gain only when elapsed days are valid.
- Project timelines are views over existing Health, Finance, Shows, goals, notes, and photos rather than a duplicate timeline database.

## Finance Integration

- **HerdHarbor Finance remains the single source of truth.**
- Shows does not create a separate expense, income, or budget system.
- Show and project expenses/income are stored as canonical HerdHarbor `transactions` with optional `showId`, `showEntryId`, `animalId`, `exhibitorId`, and `projectId` relationships.
- Show/Project financial summaries are calculated from those canonical transactions, so Finance edits, reclassification, or deletion are reflected automatically.

## Health Integration

- **HerdHarbor Health remains the single source of truth.**
- Shows/Projects display canonical Health records for the selected animal.
- Health records added from a Shows/Project workflow are created in the canonical HerdHarbor `health` collection.

## Reports

- Adds **HerdHarbor Project Record** with project, exhibitor, animal, goals, growth, health, finance, shows, placements, awards, photos, and notes.
- Project Record explicitly states that it is not automatically an official state or county 4-H record book.
- Adds **Show & Awards Report** with year, exhibitor, animal, species, and organization filters, placements, awards, judge comments, and achievement totals.
- Reports support Print / Save PDF through the current browser/PWA report path.

## Privacy & Data Safety

- Show and exhibitor records remain private to the authenticated HerdHarbor account/workspace.
- No public youth profiles, public award pages, or public competition histories are introduced.
- Schema/state changes are additive. Existing animals, pedigrees, breeding, births/litters, genetics, health, tasks, finance, sales, production, reports, settings, and cloud records remain intact.
- Shows, projects, and exhibitors use archive/inactive behavior rather than destructive deletion in this release.
- No second Animal, Health, Finance/Budget, or media storage system is created.

## Release Status

This v1.5.0 build is a **review build only**. It must pass the complete HerdHarbor regression suite and Android bundle build and be reviewed before any production merge/deployment.