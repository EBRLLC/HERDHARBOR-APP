# Profitability and Production Analytics — v1.8.3

Phase 9E adds read-only profitability views to the existing Production/Reporting surface.

## Recorded-data rule

HerdHarbor only calculates from canonical recorded transactions, completed sales, received payments, production records, litters, breedings, and animals.

It does not assume that an unrecorded expense is zero, that an unpaid invoice is received revenue, or that a shared operation expense belongs to a specific animal, litter, species, or breeding pair.

## Revenue semantics

- **Received revenue** uses recorded payments tied to completed sales.
- **Invoiced sales** uses the completed sale value and is displayed separately.
- Multi-item payments without a sale-item allocation remain unallocated rather than being divided automatically.
- A single-item completed sale can safely allocate an unscoped payment to that one animal.

## Cost semantics

- Whole-operation recorded net uses all recorded operating expenses in the selected period.
- Animal/litter/pair rows use only directly recorded animal costs for exact allocation.
- Species and operation-wide costs remain shared and cause lower-level margins to be marked partial.
- A species-filtered view excludes operation-wide costs from the species total rather than assigning the whole cost to one species.
- Capital purchases remain outside operating profitability, consistent with the existing Budget contract.

## Product margin

A product margin is calculated only when a cost is explicitly linked by product or by production-record source. If no linked cost exists, margin is intentionally unavailable rather than treating cost as zero.

## Canonical ownership

- Transactions/Budget remain the cost owner.
- Sales and Payments remain revenue owners.
- Production records remain the production owner.
- Litters/Breedings/Animals provide read-only grouping context.
- `profitability-analytics-v1.8.3.js` is a pure derived calculator and creates no canonical state.

## Migration

No database/schema migration, Edge Function, secret, or environment-variable change is required.
