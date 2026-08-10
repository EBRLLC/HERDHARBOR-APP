# Data safety form preparation

These answers summarize the current HerdHarbor Alpha v1.0.0 behavior. Confirm them in Play Console against the final production configuration before submission.

## Security and control

- Data is encrypted in transit with HTTPS.
- Users can request deletion from Settings and at `https://herdharbor.com/delete-account/`.
- Users can export a portable JSON backup and Excel reports.
- HerdHarbor does not sell user data and does not contain advertising SDKs.

## Data collected for app functionality

| Google Play category | Examples in HerdHarbor | Required | Purpose |
|---|---|---:|---|
| Personal info | Email address, owner/operation name, optional phone and address | Account email required; profile fields optional | Account management, cloud sync, documents, support |
| User IDs | Supabase account ID | Required for signed-in cloud accounts | Authentication, synchronization, deletion verification |
| Photos and videos | Optional animal photos, farm logo, pedigree images | Optional | Farm records and documents |
| Files and documents | Optional pedigree PDFs and exported/imported files | Optional | Pedigrees, backup, restore, and reporting |
| Financial info | User-entered budgets, expenses, income, sale totals, and payment records; no card numbers | Optional | Farm budgeting and recordkeeping |
| App activity | Farm and livestock records, tasks, production, customers, sales, and transfers entered by the user | Optional except the account itself | Core app functionality |
| App info and performance | Device/browser details and error context included when a user submits feedback | Optional | Support and troubleshooting |

## Service providers

- Supabase processes authentication and synchronized cloud records.
- GitHub Pages delivers the web app and website.
- Formspree processes feedback, update-list, and account-deletion forms submitted by users.

Treat these as service providers in the Play Console answers according to Google Play's current definition of collection and sharing. Do not answer from this summary alone if the production provider configuration changes.
