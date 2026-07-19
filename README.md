# HerdHarbor Pre-Alpha v0.2.2

## Budgeting and Cost-per-Head Update

This version adds the budgeting system requested by HerdHarbor testers while preserving the existing animals, pedigrees, breedings, litters, health records, tasks, theme settings, and tester-feedback form.

The browser storage key remains unchanged, so existing tester data should carry forward. Every tester should still export a backup before updating.

## New in v0.2.2

### Budget tab

- New **Budget** section under Management
- Record income and expenses
- Edit or delete transactions
- Monthly filtering
- Species filtering
- Transaction filtering for:
  - all records
  - income
  - operating expenses
  - capital expenses
- CSV export for the selected month and species
- Financial snapshot added to the dashboard

### Transaction assignment

Transactions may be assigned to:

- the whole operation
- a livestock species
- one specific animal

Income categories include animal sales, stud fees, meat sales, egg sales, milk/fiber, show winnings, and other income.

Expense categories include feed, hay/fodder, bedding, veterinary care, medication, breeding fees, registration, show expenses, equipment, utilities, housing/cages, supplies, processing, transportation, and other expenses.

### Operating vs. capital expenses

- **Operating expenses** are included in cost-per-head calculations.
- **Capital purchases** remain visible in total expenses and net results but are excluded from operating cost per head.

This prevents a major cage, barn, or equipment purchase from distorting ordinary monthly animal costs.

### Monthly budgets

- Set planned spending by month and category
- Create whole-operation or species-specific budgets
- Compare actual operating expenses with planned amounts
- View category variances
- Remove or replace category budgets
- Optionally enter an average monthly active head count for more accurate whole-operation cost per head

### Cost-per-head reporting

HerdHarbor now calculates:

- whole-operation operating cost per head
- cost per head by species
- estimated cost by individual animal
- direct animal costs
- allocated species costs
- allocated whole-operation costs

Whole-operation costs are allocated by active head count. Species costs are divided among active animals of that species. Animal-assigned costs remain linked directly to that animal.

## Important limitations

- Budget data is stored only in the browser
- There are no cloud accounts or cross-device synchronization
- Cost-per-head values are management estimates, not tax accounting
- Current active-animal counts are used unless an average monthly head-count override is entered
- Historical inventory counts are not yet tracked
- Users should export regular JSON backups

## Install on the tester site

1. Open `https://app.herdharbor.com`.
2. Go to **Settings → Export backup**.
3. Open the `HERDHARBOR-APP` GitHub repository.
4. Upload this package's `index.html` to the repository root.
5. Replace the existing `index.html`.
6. Commit directly to `main` with:

   `Release v0.2.2 budgeting and cost per head`

7. Wait for GitHub Pages to redeploy.
8. Open:

   `https://app.herdharbor.com/?v=22`

9. Press `Ctrl + F5` if an older version appears.

## Rollback

Keep the existing v0.2.1 and v0.2.0 GitHub releases available as rollback copies.
