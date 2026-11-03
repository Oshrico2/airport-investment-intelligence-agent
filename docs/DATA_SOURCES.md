# Data Sources

All sources are official U.S. DOT / Bureau of Transportation Statistics (BTS).
Access methods below were **verified by live requests on 2026-11-03** unless marked otherwise.
The app reads a versioned snapshot of these sources (`data/snapshots`), built and validated by `npm run refresh`; only a lightweight freshness check calls BTS at run time. How the data is scored is described in [SCORING.md](SCORING.md).

| # | Source | Used for | Access method | Latest month (as of 2026-11-03) |
|---|---|---|---|---|
| 1 | T-100 Segment Summary By Origin Airport (`r495-tyji`) | Primary: passengers, seats, load factor, departures, domestic/intl | Socrata REST API (JSON, SoQL) | Jul 2026 |
| 2 | T-100 Segment (All Carriers), TranStats table `FMG` | Route-level: distance, aircraft configuration, service class, state | ASP.NET form POST → ZIP/CSV | Jul 2026 |
| 3 | Airline On-Time Statistics and Delay Causes | LAX vs SNA delay diagnostic | HTTP GET → ZIP/CSV | Aug 2026 |
| 4 | TranStats lookup tables (`L_AIRPORT`, `L_AIRPORT_ID`, `L_AIRCRAFT_CONFIG`, `L_SERVICE_CLASS`) | Code decoding, airport→state cross-check | HTTP GET → CSV | n/a |
| 5 | T-100 Market (All Carriers), TranStats table `FMF` | Validation only (enplanements cross-check) | ASP.NET form POST → ZIP/CSV | Jul 2026 |
| 6 | Reporting Carrier On-Time Performance (flight-level) | Not used yet (optional: taxi-out / departure delay) | Pre-zipped monthly files | Aug 2026 |

---

## 1. T-100 Segment Summary By Origin Airport (`r495-tyji`), the primary source

- Dataset page: https://data.transportation.gov/d/r495-tyji
- Requested endpoint: `https://data.transportation.gov/resource/r495-tyji.json`
  - **Verified:** returns `302` to `https://data.bts.gov/api/id/r495-tyji.json`. Use **`https://data.bts.gov/resource/r495-tyji.json`** directly (or follow redirects).
- Metadata / schema: `https://data.bts.gov/api/views/r495-tyji.json`
- Title in metadata: "AFF - T100 Segment Summary By Origin Airport"; attribution: U.S. DOT/BTS; source link: `https://transtats.bts.gov/Fields.asp?gnoyr_VQ=FMG` (= source #2).
- No API key needed. SoQL `$select / $where / $group / $order / $limit / $having` all verified working (server-side aggregation).

**Freshness and coverage (verified, metadata + queries on 2026-11-03)**

| Item | Value |
|---|---|
| `rowsUpdatedAt` | 2026-10-27 17:02:56 UTC |
| `createdAt` | 2024-09-24 |
| Date range (`reporting_month`) | 2014-01-01 → 2026-07-01 |
| Rows | 134,619 |
| Distinct `origin_airport_code` | 2,104 |
| Grain | one row per `origin_airport_id` × `reporting_month` (0 duplicates found) |
| Reporting lag | ~3 months (Jul 2026 data published 2026-10-27) |
| Airports per month | 843–988, seasonal (not missing data) |

**Schema (verified).** All values arrive as **JSON strings** and must be cast. `reporting_month` is `calendar_date`, `year` is text.

| Group | API field names |
|---|---|
| Keys | `origin_airport_id`, `origin_airport_code`, `origin_city_name` (e.g. `"Boston (BOS)"`, **no state**), `origin_airport_name`, `year`, `reporting_month` |
| Total | `total_departures`, `total_passengers`, `total_seats`, `total_load_factor` (%), `total_passengers_flight`, `total_seats_flight`, `total_distance_flight_sm`, `total_distance_passenger`, `total_payload_lbs`, `total_freight_lbs`, `total_mail_lbs` |
| Domestic | same set with `domestic_` prefix (`domestic_distance_flight`, `domestic_distance_passenger` have no `_sm`) |
| Outbound intl (**mangled names**) | `outbound_international` = Departures, `_1` = Passengers, `_seats` = Seats, `_load` = Load Factor (%), `_2` = Passengers/Flight, `_seats_1` = Seats/Flight, `_3` = Distance/Flight (sm), `_4` = Distance/Passenger (sm), `_payload`, `_freight`, `_mail` (lbs) |
| Inbound intl (**mangled names**) | `inbound_international` = Departures, `_1` = Passengers, `_seats` = Seats, `_load` = Load Factor (%), `_2` = Passengers/Flight, `_seats_1` = Seats/Flight, `_distance` = Distance/Flight, `_distance_1` = Distance/Passenger, `_payload`, `_freight`, `_mail` |

The display name of every field is in the metadata endpoint (`columns[].name`). Use it as the source of truth for the mangled names.

**Field semantics (verified)**
- `total_* = domestic_* + outbound_international*` (0 mismatches over all rows for departures and passengers). **Inbound is not part of total.**
- `total_load_factor = total_passengers / total_seats × 100` (e.g. BOS Jul 2026: 2,013,353 / 2,363,679 = 85.2).
- `total_passengers` = passengers on board flights **departing** the airport. It is not airport footfall.
- r495 equals the sum of source #2 rows by origin (exact match: ANC Jul 2026, 23 New England airports for 2024 and 2025, and all 158 airports ≥400k nationally for 2025). It therefore **includes all service classes and freighter flights**.

**Data quirks (verified)**
- International fields are null in ~110k of 134,619 rows. Null means no international service.
- `total_load_factor` null in 7,565 rows. In all of them seats = 0 and passengers = 0.
- `total_load_factor > 100` in 30 rows (small airports, e.g. OFU, FAQ).
- Code `T4X` maps to 2 `origin_airport_id`s. Use `origin_airport_id` as the key.
- Small airports have months with no row at all (e.g. PVC 7 months in 2025). The data cannot tell a missing row apart from a zero-activity month (SCORING §3.3).
- `domestic_passengers` is null in 1,040 rows.
- **No service-class field.** Scheduled and charter cannot be separated in r495; use source #2.
- **Geographic scope (verified):** US airports including territories (GUM, SJU, STT present). Foreign airports are absent (LHR, NRT, YYZ, MEX, FRA return 0 rows).
- **Completeness (verified 2026-11-03):** all 144 airports with ≥500k 2025 passengers have 12 monthly rows in both 2024 and 2025. 2026 covers Jan–Jul.

## 2. T-100 Segment (All Carriers), TranStats `FMG`

- Download page: https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FMG&QO_fu146_anzr=Nv4%20Pn44vr45
- Page states "Latest Available Data: July 2026" (verified).
- **Access (verified):** no REST API, no pre-zipped file. ASP.NET form:
  1. GET the page with a cookie jar and collect all `<input type="hidden">` values (`__VIEWSTATE` etc.).
  2. POST back with `cboGeography` (`All` or a state name), `cboYear`, `cboPeriod` (`All` or `1`–`12`), `chkDownloadZip=on`, `btnDownload=Download`, and one `<FIELD>=on` per column.
  3. Response is `application/zip` containing `T_T100_SEGMENT_ALL_CARRIER.csv` and `Documentation.csv`.
- The geography filter returns rows where **either** endpoint is in the state (about half the rows had `ORIGIN_STATE_ABR` = that state). This is an inference from the row counts. Always filter on `ORIGIN_STATE_ABR`.
- This scripted use is undocumented by BTS. The form may change without notice.

**Fields used (verified):** `YEAR`, `MONTH`, `ORIGIN_AIRPORT_ID`, `ORIGIN`, `ORIGIN_CITY_NAME`, `ORIGIN_STATE_ABR`, `DEST`, `DEST_COUNTRY`, `DEST_STATE_ABR`, `DISTANCE` ("Distance between airports (miles)"), `DISTANCE_GROUP` (500-mile intervals), `DEPARTURES_PERFORMED`, `DEPARTURES_SCHEDULED`, `SEATS` ("Available Seats"), `PASSENGERS` ("Non-Stop Segment Passengers Transported"), `UNIQUE_CARRIER`, `CLASS`, `AIRCRAFT_CONFIG`.

**Verified on national 2025 data (571,205 rows):**
- Only `CLASS` values F, G, L and P occur.
- **`AIRCRAFT_CONFIG` and `CLASS` can disagree:** all-cargo flights (class P) are reported on config 1.
- Cargo-only identification therefore needs `CLASS`, not config alone.
- Passengers > 0 never occurs with seats = 0 on combi rows.
- A national full-year 2025 download (15 fields) is a 6.4 MB ZIP and took about 110 s.

Sibling tables seen (not used): `FIM` T-100 Domestic Segment (U.S. Carriers), `GEE` T-100 Domestic Segment (All Carriers), `GDM` T-100 Segment (US Carriers Only).

## 3. Airline On-Time Statistics and Delay Causes

- Page: https://www.transtats.bts.gov/OT_Delay/ot_delaycause1.asp ("Download Raw Data" link)
- **Access (verified):** plain GET, returns ZIP with `Airline_Delay_Cause.csv` and `Download_Column_Definitions.xlsx`:
  ```
  https://www.transtats.bts.gov/OT_Delay/ot_delaycause1_DL.aspx?8n4=9ur4r Brn4z106u or69rr0 {FROM} NaQ {TO}
  ```
  - The query is letter-substituted text for `where YearMonth between {FROM} and {TO}`.
  - `YearMonth = year × 12 + month`. Each digit is encoded as `0→D, 1→E, 2→F, … 9→M`. Example: Aug 2026 = 24320 = `FHGFD`.
  - **We reverse-engineered this encoding; BTS does not document it.** It was verified: Jan 2025–Aug 2026 returned exactly 20 months and 37,484 rows.
- Grain: carrier × airport × month (arrivals at `airport`).
- Fields (verified): `year, month, carrier, carrier_name, airport, airport_name, arr_flights, arr_del15, carrier_ct, weather_ct, nas_ct, security_ct, late_aircraft_ct, arr_cancelled, arr_diverted, arr_delay, carrier_delay, weather_delay, nas_delay, security_delay, late_aircraft_delay` (`*_delay` in minutes).
- Coverage: U.S. reporting carriers, domestic flights, arrival-based. 9 rows in the 2025–2026 pull had blank `arr_flights` (none at LAX or SNA).
- **Verified identities (2025, 22,687 rows):**
  - `arr_delay = carrier_delay + weather_delay + nas_delay + security_delay + late_aircraft_delay` in all but 12 rows, with no negative values. So `arr_delay` is delay minutes for arrivals ≥15 min late.
  - `arr_del15` equals the sum of the five `*_ct` cause counts in all but 12 rows. The cause counts are fractional. [ASSUMPTION, not verified this session] BTS splits a delayed flight's count across its causes.
- **[UNRESOLVED]** `Download_Column_Definitions.xlsx` stores its labels apart from the column names. One label reads "Early arrivals show negative numbers", which contradicts the observed data for `arr_delay`.
- **Completeness:** LAX and SNA have all 12 months of 2025 and Jan–Aug 2026.

## 4. TranStats lookup tables

`https://www.transtats.bts.gov/Download_Lookup.asp?Y11x72=<code>` returns CSV `Code,Description`. Verified codes:

| Table | `Y11x72` value | Notes |
|---|---|---|
| L_AIRPORT | `Y_NVecbeg` | 6,942 codes, description `"City, ST: Airport Name"` |
| L_AIRPORT_ID | `Y_NVecbeg_VQ` | 6,918 IDs |
| L_AIRCRAFT_CONFIG | `Y_NVePeNSg_PbaSVT` | 0 not relevant, **1 Passenger**, **2 Freight**, **3 Combined passenger+freight (main deck)**, 4 Seaplane, 9 expenses |
| L_SERVICE_CLASS | `Y_fReiVPR_PYNff` | F scheduled pax/cargo, G scheduled all-cargo, L non-scheduled civilian pax/cargo, P non-scheduled civilian all-cargo, N/R military, Q other non-scheduled (+ summary codes) |

The `Y11x72` value is case-sensitive. Copy it from the TranStats page links.

## 5. T-100 Market (All Carriers), TranStats `FMF`

Same form mechanism as #2 (`gnoyr_VQ=FMF`), file `T_T100_MARKET_ALL_CARRIER.csv`. `PASSENGERS` = "On-Flight Market Passengers Enplaned". Used only to validate what `total_passengers` measures.

## 6. Reporting Carrier On-Time Performance (flight-level)

- `https://transtats.bts.gov/PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_{YYYY}_{M}.zip`
- Verified: `2026_8` returns 200, 32,030,583 bytes, Last-Modified 2026-10-26. The PREZIP index lists months up to 2026_8.
- Not used in the current plan. It would only be needed for departure delay or taxi-out metrics.

## Checked and rejected

| Source | Why rejected (verified) |
|---|---|
| `rns4-gpqn` "U.S. Airport On-Time Performance", `eaz9-4bny` "U.S. Airport Delays by Cause" (data.bts.gov) | Chart views over `neuq-kfdt` (Pocket Guide table). National-level only, no airport rows. |
| `3xj5-daif` / `hkq8-2hmx` T100 Preliminary Estimates | National totals only (year, month, TSA checks, market, segment). |
| TranStats PREZIP for T-100 | No T-100 files exist in the PREZIP index. Only on-time and DB1B files are there. |

## Snapshot layout (implemented, Phase 1)

```
data/
  snapshots/current.json            -> { "version": "2026-11-03" }
  snapshots/2026-11-03/             committed, ~5.4 MB
    manifest.json                   sources (URL, params, coverage, retrievedAt, vintage, raw sha256, row count), checks, quality flags
    airports.json                   1,694 airports: BTS ID, code, aliases, name, city, state
    airport-months.json             r495 rows for 2019, 2024, 2025, 2026 (38,672 airport-months)
    route-origin-years.json         FMG per origin × year: passenger / cargo-only departures, charter passengers, 500-mile distance bands, top long-haul destinations
    delay-months.json               Delay Causes per airport × month, Jan 2025–Aug 2026
  raw/2026-11-03/                   gitignored, ~31 MB: r495.json, FMG-<year>.zip, Airline_Delay_Cause.zip, L_AIRPORT_ID.csv, meta.json
```

- `npm run refresh` downloads and derives (about 8 minutes, three national FMG downloads).
- `npm run refresh -w server -- --from-raw <version>` re-derives from saved raw files without network access.
- The server reads only `snapshots/`, and refuses a snapshot whose manifest records a failed check.
