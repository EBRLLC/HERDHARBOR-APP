# HerdHarbor Pre-Alpha v0.1

This is a functional, mobile-responsive, installable pre-alpha prototype for HerdHarbor.

## Included functions

- Local onboarding for a farm, rabbitry, or homestead
- Dashboard with live record counts and upcoming dates
- Animal profiles with parent links and a pedigree preview
- Breeding records with automatic 28-day nest-box and 31-day rabbit due-date suggestions
- Litter records
- Health, treatment, medication, observation, and weight records
- Tasks and reminders
- Search and filters
- Demo data
- JSON backup export and import
- Installable PWA files and offline shell caching

## Important limitation

All records are stored in the visitor's browser using `localStorage`.

This means:

- There are no secure user accounts.
- Data does not sync between devices.
- Clearing browser data can erase records.
- Multiple users cannot collaborate.
- This build should be used only for private workflow testing.
- Testers should export regular JSON backups.

The next development milestone is replacing local storage with a secure backend such as Supabase, including authentication and row-level access controls.

## Test locally

Open `index.html` directly, or run a local web server:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

A local server is preferred because service workers do not run from `file://` URLs.

## Deploy to GitHub Pages

Use a **separate repository** from the public HerdHarbor landing page.

Suggested repository name:

`HERDHARBOR-APP`

1. Create the public repository.
2. Upload all extracted files and folders to the repository root.
3. Go to **Settings → Pages**.
4. Choose **Deploy from a branch**.
5. Select `main` and `/ (root)`.
6. Save.
7. Test the GitHub Pages URL before adding a custom domain.

## Connect app.herdharbor.com later

After the GitHub Pages deployment works:

1. Add a file named `CNAME` containing:

```text
app.herdharbor.com
```

2. In the repository's **Settings → Pages**, set the custom domain to `app.herdharbor.com`.
3. In Porkbun DNS, add:

```text
Type: CNAME
Host: app
Answer: ebrllc.github.io
TTL: 600
```

Do not change the existing records for `herdharbor.com` or `www`.

## Suggested private test plan

1. Load demo data and test every screen.
2. Add real sample animals without using sensitive customer data.
3. Export a backup.
4. Test on a phone and desktop.
5. Ask 3–5 trusted breeders to complete specific workflows:
   - add an animal
   - add parents
   - record a breeding
   - record a litter
   - add a health note
   - complete a task
6. Record where they hesitate or make mistakes.
7. Do not advertise this build as a finished or secure production app.
