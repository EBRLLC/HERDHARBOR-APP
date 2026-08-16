# HerdHarbor Alpha v1.0.0 Pedigree Visual Update

- Corrected the print layout so a four-generation pedigree remains on one US Letter landscape page instead of splitting the lower ancestry onto a second page.
- Replaced the inconsistent print typography with a compact Segoe UI system-font stack and restored the intended small, readable generation hierarchy.
- Limited long-field wrapping to COLOR and BREEDER values themselves so other labels and pedigree details no longer enlarge or distort the cards.
- Added pale blue buck and pale rose doe pedigree card accents while retaining sex symbols and labels.
- Added a Pedigree appearance settings card with Off, Compact, and Visual photo modes plus a separate printed-photo option.
- Uses stored animal profile/primary photos when available and collapses photo space when no photo exists.
- Protects COLOR and BREEDER from ellipsis/truncation and allows long values to wrap.
- Suppresses empty ID, DOB, and REG rows in fourth-generation cards before protected pedigree fields are compressed.
- Keeps the existing subject header photo and uses compact generation-sized thumbnails for parents, grandparents, and great-grandparents.
- Preserves existing animal records, ancestry relationships, cloud sync, storage keys, imports, exports, and transfer data.
- Adds installed-app/offline caching and regression coverage for the new pedigree visual layer.
