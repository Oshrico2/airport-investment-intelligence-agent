# Scoring Model

Implemented in `server/src/analytics/scoring.ts` and `ranking.ts`. The ranking of the committed snapshot is calculated at boot and pinned by golden tests (`server/src/analytics/golden.spec.ts`, §2.1).

## 1. Eligibility

- An airport enters the primary ranking only if its **full-year 2025 departing passengers** (sum of r495 `total_passengers`) are **≥ 500,000**.
- Growth also requires **valid 2024 data**.
- An airport is ranked only when all of these hold (rules R2′, R5′–R7′, §3); every failing reason is reported with a code:
  - 2025 passengers ≥ 500,000 (`BELOW_THRESHOLD`);
  - 12 monthly rows in 2025 (`INCOMPLETE_2025`) and in 2024 (`INCOMPLETE_2024`);
  - 2024 passengers > 0 (`NO_2024_BASELINE`);
  - 2025 seats > 0 (`LF_UNAVAILABLE`) and 2025 passengers ≤ 2025 seats (`INVALID_LOAD_FACTOR`).
- Airports that fail a test are **not ranked**, but they stay available for individual analysis through chat. Every exclusion states its reason, for example "below 500,000: 437,565 departing passengers in 2025" or "no valid 2024 baseline".
- **Ranking universe:** all US airports, including territories. A regional filter (e.g. New England) narrows the displayed ranking without changing scores. Regions (New England, US Census Bureau regions and divisions, territories) are defined by BTS state code in `server/src/analytics/regions.ts`.

## 2. Score

```
GrowthPercent     = (pax_2025 / pax_2024 − 1) × 100
LoadFactorPercent = sum(pax_2025) / sum(seats_2025) × 100

GrowthScore  = clamp(50 + 2.5 × GrowthPercent, 0, 100)
LoadScore    = clamp((LoadFactorPercent − 60) / 30 × 100, 0, 100)
OverallScore = 0.60 × GrowthScore + 0.40 × LoadScore
```

| GrowthPercent | GrowthScore | LoadFactorPercent | LoadScore |
|---|---|---|---|
| ≤ −20% | 0 | ≤ 60% | 0 |
| 0% | 50 | 75% | 50 |
| ≥ +20% | 100 | ≥ 90% | 100 |

- Inputs are passenger and seat counts from r495. They include scheduled and charter service and are unaffected by freighters.
- **Delays never enter the score.** They are a separate diagnostic.
- 2026 data is shown separately, with its period labelled. It never feeds the score.
- Scores are computed from unrounded inputs and rounded to one decimal only for display. Ties sort by 2025 passengers, then airport code, so the order is deterministic.

### 2.1 Results for snapshot 2026-11-03

- **144 airports are ranked** nationally (all ≥ 500k, all with 12 + 12 months).
- Inputs: growth runs from −14.7% (OAK) to +25.3% (ILM); three airports reach the cap at +20% or more (SBN, HVN, ILM); none reaches the −20% floor. Load factor runs from 65.8% (HRL) to 86.0% (PVU); none is clipped.
- Scores: PGD ranks first (90.7), PVU second (90.0), HVN seventh (80.3); OAK is last (25.5).
- New England: 7 ranked (HVN, PWM, BTV, PVD, MHT, BOS, BDL); BGR is excluded as below the threshold at 437,565.
- `golden.spec.ts` pins the 144 count, the input ranges, the New England set and the BGR exclusion; `web/e2e/flows.spec.ts` checks HVN's national rank #7 in the regional view.

## 3. Data-handling rules

### 3.1 Principles

1. Never fabricate missing data.
2. Distinguish true zero activity from missing records.
3. Do not compute misleading scores from incomplete data.
4. Flag invalid denominators and suspicious load factors.
5. Missing delay data must not exclude an otherwise eligible airport from the primary ranking.
6. Clearly explain unavailable analyses, excluded airports and limitations.

**Missing months.** r495 contains rows with 0 passengers and 0 seats (7,565 rows, which still report departures), and it has no row at all for some months of small seasonal airports (PVC: 7 of 12 in 2025). BTS documentation does not say whether a missing month means zero activity or a missing report, so the data cannot tell "no flights that month" apart from "not reported". The rules below never fill such a gap.

### 3.2 Rules

| # | Rule | Why |
|---|---|---|
| R1′ | Key airports by `origin_airport_id`, not by code or name. Delay data, which has only a code, is joined through a validated code→ID map; a code that maps to more than one ID is rejected, not guessed. | Code T4X maps to 2 IDs; city names repeat. |
| R2′ | Ranking requires 12 monthly rows in 2024 and in 2025. Otherwise the airport is unranked with the reason "month(s) X missing; BTS does not distinguish zero activity from a missing report". Individual chat analysis reports "sum of n of 12 reported months", never an "annual total". | A missing row is not a zero. |
| R3′ | Calculate every ratio (load factor, growth, delay rate, NAS share, long-haul share) from **sums** of counts, never by averaging monthly ratios. | Averaging per-month ratios weights small months too heavily. |
| R4′ | Treat a null *component* field (domestic or international) as 0 only if the row's identity `total = domestic + outbound` holds with that substitution; otherwise flag the row as inconsistent. Never null-fill a `total_*` field. | `domestic_passengers` is null in 1,040 rows. |
| R5′ | If 2025 seats sum to 0, the load factor is unavailable and the airport is unranked ("LF unavailable: no seats reported in 2025"). A zero-seat month inside a valid year is fine (cargo-only month). | Invalid denominator. |
| R6′ | Flag monthly load factors > 100% and keep them in the sums. If an airport's annual load factor is > 100%, it is unranked ("invalid load factor"). Values are never corrected. | 30 such monthly rows exist, all at very small airports. |
| R7′ | Growth requires 2024 passengers > 0 and a complete 2024 (R2′). Airports new in 2025 get "growth unavailable: no 2024 baseline". | Valid growth denominator. |
| R8′ | Every output lists, per source used: source name, coverage period, retrieval date and data vintage (`rowsUpdatedAt` or snapshot date). | BTS revision policy is unknown. |
| R9′ | Missing delay data never affects eligibility or ranking; the UI shows "delay data unavailable for this airport/period" instead. | Principle 5. |
| R10′ | Every ineligible or unranked airport carries a machine-readable reason code and a human-readable explanation, shown when the user asks about it. | Principles 3 and 6. |
| R11′ | No imputation, interpolation or estimation of any BTS value. | Principle 1. |
| R12′ | Route-level analyses (long-haul, charter share, passenger-only departures) require the snapshot to cover the full requested period; otherwise the analysis reports "unavailable: snapshot covers months X–Y". | Principles 1, 3 and 6. |

## 4. Passenger-activity classification

Applies to route-level rows (TranStats `FMG`). Codes come from the BTS lookups `L_SERVICE_CLASS` and `L_AIRCRAFT_CONFIG`, retrieved 2026-11-03 (DATA_SOURCES §4).

**Service class (`CLASS`)**

| Code | BTS definition | Our classification | Label in UI |
|---|---|---|---|
| F | Scheduled Passenger/ Cargo Service F | Passenger service | Scheduled passenger flights |
| L | Non-Scheduled Civilian Passenger/ Cargo Service L | Passenger service | **Charter / Non-scheduled Passenger Flights** |
| G | Scheduled All Cargo Service G | **Cargo-only** (excluded) | Cargo |
| P | Non-Scheduled Civilian All Cargo Service P | **Cargo-only** (excluded) | Cargo |
| A, C, E, H, K, N, Q, R, V, Z | Other or summary classes | Not observed in 2025 data. A snapshot containing them **fails validation** until a rule is added (R11′: no guessing) | n/a |

**Rule**
```
passengerRecord = CLASS ∈ {F, L}  AND  PASSENGERS > 0          (any AIRCRAFT_CONFIG)
cargoOnlyRecord = CLASS ∈ {G, P}
```

**Configuration (`AIRCRAFT_CONFIG`) is reported, not used as a filter**

| Code | BTS definition | Effect |
|---|---|---|
| 1 | Passenger Configuration | Included when the row is a passenger record |
| 3 | Combined Passenger and Freight on a main deck | Included only with `PASSENGERS > 0` |
| 4 | Seaplane | Included with `PASSENGERS > 0` |
| 2 | Freight Configuration | Included when the row is a passenger record. 36 F/L rows nationally in 2025 report passengers (5,509 passengers). |
| 0, 9 | Not relevant / expenses | Not observed in 2025 data. Validated at load time |

**Consequences (verified)**
- ANC 2025 long-haul share = **1,050 / 37,966 = 2.77%** of passenger-record departures ≥ 3,000 mi.
- F/L rows with seats but 0 passengers (e.g. Alaska Central Express) are excluded from passenger-flight departures.

**Limitation (shown in the UI):** BTS rows aggregate a month of flights per carrier, route, aircraft type, class and configuration. "Passengers carried" is confirmed per row, not per flight.

**Scope:** r495 airport-level passenger and seat totals stay as published, including scheduled and charter. r495 cannot apply this classification; it is used where the analysis needs departures or a class split: long-haul, charter share, SFO passenger vs cargo departures.
