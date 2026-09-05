# HerdHarbor Phase 1 — Animal-First Workflow

## Status

Phase 1 is the workflow/usability layer built on the stable Alpha v1.7.1 domain engines.

This phase intentionally **does not replace or duplicate** Health, Breeding, Genetics, Pedigree, Shows, Production, Tasks, Sales, or Analytics records. It orchestrates the records and APIs HerdHarbor already owns.

## Hardlocked product contract

**Contract ID:** `HH-ANIMAL-FIRST-001`

**Status:** HARDLOCKED

> Animal-first workflow surfaces orchestrate existing HerdHarbor records and engines without duplicating domain state.

### Enter once, reuse everywhere

A factual value that already exists in canonical HerdHarbor state must be reused by downstream workflow surfaces. Phase 1 may preselect or display known values, but it must not silently invent missing values or create a second copy of a domain record merely to power the workflow UI.

### Current-farm context

`HH-SPECIES-CONTEXT-001` remains authoritative for operational species context. Sold, deceased, archived, and ancestor-only animals do not create operational species actions. Historical records remain visible where history is the explicit purpose of the surface.

## Phase 1 surfaces

### Animal Profile Hub

Opening an animal becomes the normal starting point for animal-specific work. The profile reuses the existing animal-detail view and adds contextual tabs and actions around it.

Supported tabs are shown only when relevant:

- Overview
- Health
- Breeding
- Genetics
- Pedigree
- Shows
- Production
- History

The hub delegates writes to existing forms/APIs. Examples:

- Add Weight → existing Health record form
- Start Health Episode / Add Care → Health Intelligence
- Breed → existing Breeding form
- Genetics → existing Rabbit/shared genetics router
- Pedigree → existing pedigree builder/print path
- Show Entry → existing Shows entry form
- Analytics / Production → existing Analytics surface
- Edit / status → existing animal editor

### Today Dashboard

The Dashboard gets one operational queue answering **What needs attention?**

The queue is derived from canonical data, including:

- open Tasks (including the existing breeding/weaning tasks already maintained by HerdHarbor)
- legacy Health follow-up dates
- Health Intelligence rechecks
- active quarantine
- booster/follow-up dates
- user-entered withdrawal end dates
- group Health follow-ups
- show entry deadlines and show start dates

The queue does not create a separate Today database.

### Contextual Quick Add

The existing Quick Add modal remains the canonical launcher. Phase 1 adds a small **Suggested here** section based on the user's current route and delegates each suggestion to the existing Quick Add action.

## Data ownership

Phase 1 owns no replacement domain collections. It reads existing state and calls existing engines.

The unified animal History tab is a derived chronological view over canonical records; it is not a new stored activity database.

## Explicitly outside Phase 1

These are intentionally deferred so this phase stays low-risk and focused on flow:

- Breeding lifecycle schema redesign
- farm-location hierarchy
- universal search
- broad new bulk-operation framework
- new species genetics libraries
- replacement Health, Breeding, Shows, Production, Sales, Pedigree, or Analytics engines

## Regression rule

Future changes should fail review if they:

1. make Phase 1 maintain a second copy of canonical Health/Breeding/Shows/etc. records;
2. bypass the current-farm species hardlock for operational actions;
3. invent factual defaults rather than reusing known state;
4. replace existing engines when delegation is possible; or
5. reintroduce the removed v1.7.5 workflow runtime as a dependency.
