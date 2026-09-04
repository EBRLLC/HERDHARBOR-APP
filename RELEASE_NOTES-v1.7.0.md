# HerdHarbor Alpha v1.7.0 — Optional Standards, Judging & Youth Show Guides

Alpha v1.7.0 adds optional rabbit standards, judging-reference, and youth-show tools while preserving HerdHarbor as a general animal-management and genetics platform for breeders who do not use ARBA, 4-H, or FFA.

### ARBA standards registry

- Indexes the 53 currently recognized ARBA rabbit breeds.
- Stores recognized/public variety references where verified, current working-standard entries separately, 4-class/6-class structure where publicly verified, public breed maximum weights where available, breed reference sections, physical-characteristic summaries, and source/licensing metadata.
- Exact class/sex weight ranges and measurements are used only when the bundled rule has been verified from a public reference. Unknown or incomplete rules fail closed instead of being guessed.
- Proprietary Standard of Perfection prose and complete breed point schedules are not reproduced.

### More useful public ARBA reference

The Standards browser now surfaces the public information HerdHarbor can verify instead of stopping at a purchase/consult warning:

- Public classification and maximum-weight references already present in the structured registry.
- Public variety/group coverage and current working-standard counts.
- Official links to ARBA recognized breeds, Standards Committee materials, show rules, showmanship resources, and the current 2026–2030 corrections document.
- Structured summaries of public show-rule concepts relevant to exhibitors and fairs.
- Current correction notices when an official ARBA correction affects a breed, including English Angora Broken status and Argente Brun Commercial Normal Fur eligibility.
- A compact copyright notice remains only where exact copyrighted judging language would otherwise be required.

### Standards browser

Adds a `Standards` area with the path Rabbit → Breed → Variety, structured search, recognized/working-standard status, class model, public weight references, breed considerations, judging terminology, and official-source links.

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

### Kentucky 4-H rabbit guide inside Shows

Shows now receives a `Youth Guides` area with a summarized Kentucky 4-H rabbit reference based on the publicly posted Kentucky State Fair 4-H Rabbit Division guide.

It includes:

- Entry/tattoo/check-in preparation reminders.
- Travel-cage, health, substitution, and show-day preparation summaries.
- Junior and Senior showmanship class references from the public guide.
- Best of Breed / Best Opposite, Best 4-Class, Best 6-Class, Best in Show, and Reserve Best in Show context.
- A separate HerdHarbor pre-show checklist.
- Direct links to the official Kentucky 4-H rabbit guide and project overview.

The official fair guide and county Extension instructions remain controlling for dates, eligibility, entry limits, and event-specific requirements.

### FFA / local youth-show profiles

FFA rabbit rules vary by fair, state, and local program rather than using one universal national rabbit-show rulebook. HerdHarbor therefore provides a configurable FFA/local-show guide instead of inventing one standard.

Users can save:

- Show/fair or profile name
- Organization and state
- Official rules URL
- Eligibility notes
- Class notes
- Showmanship notes
- Date the local rules were verified

Kentucky FFA State Fair exhibit links and the relevant public ARBA fair-show rules are provided as starting references.

### Showmanship practice

The Youth Guides area includes a breeder/youth-friendly practice checklist covering safe handling, posing, identification, terminology, body/fur knowledge, health observation, daily care, and project-record questions. It is a practice aid, not an official scoring sheet.

### Genetics + Standards Intelligence

The Standards area can combine existing HerdHarbor genetics output, available three-generation pedigree context, show history, and saved standards evaluations. It reports evidence separately rather than creating an unsupported composite score or treating standards observations as genetic facts.

### Optional by design

`settings.arbaStandardsEnabled` defaults to `false`. With the feature disabled, HerdHarbor's normal animals, pedigrees, breeding/genetics, health, sales, production, finance, and Shows workflows continue independently. Youth Guides are reference tools inside Shows and do not require ARBA mode.

### Release identity

- Version: Alpha 1.7.0
- Build: `arba-standards-1`
- Android version code: 13
