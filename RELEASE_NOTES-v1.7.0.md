# HerdHarbor Alpha v1.7.0 — Optional ARBA Standards & Judging

Alpha v1.7.0 introduces optional rabbit standards and judging-reference tools while preserving HerdHarbor as a general rabbit-management and genetics platform for breeders who do not use ARBA.

### ARBA standards registry

- Indexes the 53 currently recognized ARBA rabbit breeds.
- Stores recognized/public variety references where verified, current working-standard entries separately, 4-class/6-class structure where publicly verified, public breed maximum weights where available, breed reference sections, physical-characteristic summaries, fault/DQ reference placeholders, and source/licensing metadata.
- Exact class/sex weight ranges and measurements are used only when the bundled rule has been verified from a public reference. Unknown or incomplete rules fail closed and direct the breeder to the current Standard of Perfection instead of guessing.
- Proprietary Standard of Perfection prose and complete breed point schedules are not reproduced.

### Standards browser

Adds a `Standards` area with the path Rabbit → Breed → Variety, structured search, recognized/working-standard status, class model, public weight references, breed considerations, and judging terminology.

### Optional animal evaluation

Rabbit records can be evaluated against the bundled structured reference when ARBA tools are enabled. The tool can use age, sex, latest recorded weight, variety/color, supported breed measurements, and breeder-recorded faults/DQ concerns. Results identify weight/reference status, age-class eligibility, variety status, possible faults/DQs, and missing measurements.

Every evaluation is explicitly informational and does not claim to replace an ARBA judge, registrar, show rules, or the current Standard of Perfection. Saved evaluations become part of the user's HerdHarbor history.

### Shows integration

The existing Shows system remains intact. When ARBA tools are enabled, existing entry/result forms receive additive fields for:

- Standard edition
- Showroom variety/group
- Standards observations
- Leg/certificate reference
- Points
- BOV / BOSV / BOB / BOSB
- Best in Show / Reserve in Show

Existing judge, class, placement, score, comments, notes, attachments, and award workflows continue to operate normally.

### Genetics + Standards Intelligence

The Standards area can combine existing HerdHarbor genetics output, available three-generation pedigree context, show history, and saved standards evaluations. It reports evidence separately rather than creating an unsupported composite score or treating standards observations as genetic facts.

### Optional by design

`settings.arbaStandardsEnabled` defaults to `false`. With the feature disabled, HerdHarbor's normal animals, pedigrees, breeding/genetics, health, sales, production, finance, and Shows workflows continue independently.

### Release identity

- Version: Alpha 1.7.0
- Build: `arba-standards-1`
- Android version code: 13
