import { z } from 'zod';
import type { LiveStatus, ToolResult } from '../../../shared/api';
import { airportByCode, resolveAirport } from '../analytics/airports';
import { capacityPressure } from '../analytics/capacity';
import { compareDelays } from '../analytics/delays';
import { longHaulShare } from '../analytics/long-haul';
import { dataSources, describeMethodology, METHODOLOGY_TOPICS } from '../analytics/methodology';
import { airportProfile } from '../analytics/profile';
import { rankAirports, type NationalRanking } from '../analytics/ranking';
import { REGION_IDS } from '../analytics/regions';
import type { DataIndex } from '../data/data-index';
import type { AirportRecord } from '../data/snapshot.types';
import { ToolError } from './tool-error';

export interface ToolContext {
  index: DataIndex;
  national: NationalRanking;
  live: () => LiveStatus;
}

export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run: (ctx: ToolContext, args: z.infer<S>) => ToolResult;
}

const code = z.string().trim().min(2).max(5).describe('Airport code as used by BTS, e.g. "BOS". Use resolve_airport first if only a city or name is known.');
const codes = (min: number, max: number) => z.array(code).min(min).max(max);

function lookup(ctx: ToolContext, c: string): AirportRecord {
  try {
    return airportByCode(ctx.index, c);
  } catch (e) {
    throw new ToolError((e as Error).message, 404);
  }
}
const guard = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ToolError) throw e;
    throw new ToolError((e as Error).message, 400);
  }
};
const def = <S extends z.ZodType>(d: ToolDefinition<S>) => d;

/**
 * The agent's tools. Every number a user sees is produced here, deterministically, from the
 * in-memory BTS snapshot. Descriptions are written for the model: what the tool answers and its definitions.
 */
export const TOOLS = [
  def({
    name: 'rank_airports',
    description:
      'Investment ranking of U.S. airports (incl. territories) by OverallScore = 0.6 × GrowthScore (2025 vs 2024 departing passengers) + 0.4 × LoadScore (2025 seat load factor). Only airports with ≥500,000 departing passengers in 2025 and complete 2024/2025 data are ranked; the result also lists the largest excluded airports with reasons. Optional region filter keeps national ranks.',
    schema: z.object({
      region: z.string().trim().max(80).optional().describe(`Region id or label (${REGION_IDS.join(', ')}) or comma-separated state codes such as "MA,NH". Omit for the whole United States.`),
      limit: z.number().int().min(1).max(50).optional().describe('Number of ranked rows to return (default 25).'),
    }),
    run: (ctx, a) => guard(() => rankAirports(ctx.index, ctx.national, { ...(a.region ? { region: a.region } : {}), ...(a.limit ? { limit: a.limit } : {}) })),
  }),
  def({
    name: 'get_airport_profile',
    description:
      'Profile of one airport: departing passengers, seats, load factor and departures for 2019, 2024 and 2025; growth 2025 vs 2024; domestic share; charter / non-scheduled share; ranking eligibility, score and reasons; latest 2026 months compared with the same months of 2025. Works for any airport, including ones below the ranking threshold.',
    schema: z.object({ airport: code }),
    run: (ctx, a) => airportProfile(ctx.index, ctx.national, lookup(ctx, a.airport)),
  }),
  def({
    name: 'compare_airports',
    description: 'Side-by-side airport profiles (same fields as get_airport_profile) for 2 to 6 airports.',
    schema: z.object({ airports: codes(2, 6) }),
    run: (ctx, a) => {
      const found: AirportRecord[] = [];
      const notFound: string[] = [];
      for (const c of a.airports) {
        try {
          found.push(airportByCode(ctx.index, c));
        } catch {
          notFound.push(c);
        }
      }
      if (!found.length) throw new ToolError(`None of the airports were found: ${notFound.join(', ')}`, 404);
      return { kind: 'compareAirports', airports: found.map((x) => airportProfile(ctx.index, ctx.national, x)), notFound, sources: [ctx.index.sources.r495, ctx.index.sources.fmg] };
    },
  }),
  def({
    name: 'get_long_haul_share',
    description:
      'Long-haul share of an airport: passenger-flight departures performed (BTS service class F or L with reported passengers; cargo-only service excluded) with segment distance ≥ min_miles, default 3,000 statute miles, for a full year (default 2025). Also returns the all-departures share including cargo as context and the top long-haul destinations.',
    schema: z.object({
      airport: code,
      year: z.number().int().min(2019).max(2025).optional().describe('Full year: 2019, 2024 or 2025 (default 2025).'),
      min_miles: z.number().int().min(500).max(8000).optional().describe('Threshold in statute miles; a multiple of 500. Default 3000 (the approved long-haul definition).'),
    }),
    run: (ctx, a) => guard(() => longHaulShare(ctx.index, lookup(ctx, a.airport), { ...(a.year ? { year: a.year } : {}), ...(a.min_miles ? { minMiles: a.min_miles } : {}) })),
  }),
  def({
    name: 'compare_delays',
    description:
      'Arrival delay comparison from BTS On-Time / Delay Causes data (domestic flights of U.S. reporting carriers): arrivals, share delayed ≥15 min, cancellations, diversions, delay minutes per arrival and delay cause shares (carrier, weather, NAS, security, late aircraft). Periods: "2025" (full year, the primary comparison), "2026-ytd" (latest 2026 months), "2025-same-months" (the same months of 2025, for comparing with 2026-ytd). Delays are a diagnostic, not part of the investment score, and not a direct measure of terminal congestion.',
    schema: z.object({
      airports: codes(1, 6),
      period: z.enum(['2025', '2026-ytd', '2025-same-months']).optional(),
    }),
    run: (ctx, a) => compareDelays(ctx.index, a.airports.map((c) => lookup(ctx, c)), a.period ?? '2025'),
  }),
  def({
    name: 'get_capacity_pressure',
    description:
      'Capacity-pressure proxies for an airport (e.g. SFO unmet-demand questions): 2025 vs 2019 and 2024 passengers, seats, load factor, peak-month load factor, passenger-service departures separated from cargo-only departures, and seats per passenger departure. Also returns what BTS data can and cannot infer about unmet demand.',
    schema: z.object({ airport: code }),
    run: (ctx, a) => capacityPressure(ctx.index, lookup(ctx, a.airport)),
  }),
  def({
    name: 'resolve_airport',
    description: 'Find airports by code, city or name. Returns every candidate when the query is ambiguous (e.g. "Hartford" → BDL and HFD); never pick one silently, ask the user instead.',
    schema: z.object({ query: z.string().trim().min(2).max(80) }),
    run: (ctx, a) => resolveAirport(ctx.index, a.query),
  }),
  def({
    name: 'describe_methodology',
    description: 'Explains the method and definitions: scoring, eligibility, passenger-classification, data-quality, delays, long-haul, unmet-demand, sources.',
    schema: z.object({ topic: z.enum(METHODOLOGY_TOPICS) }),
    run: (ctx, a) => describeMethodology(ctx.index, a.topic),
  }),
  def({
    name: 'get_data_sources',
    description: 'Data sources with coverage periods, retrieval dates, BTS data vintage, snapshot version and whether BTS has published newer data.',
    schema: z.object({}),
    run: (ctx) => dataSources(ctx.index, ctx.live()),
  }),
] as const satisfies readonly ToolDefinition[];

export type ToolName = (typeof TOOLS)[number]['name'];

/** Validates arguments, runs the tool and times it. Throws ToolError for expected failures. */
export function runTool(ctx: ToolContext, name: string, rawArgs: unknown): { result: ToolResult; ms: number } {
  const tool = TOOLS.find((t) => t.name === name) as ToolDefinition | undefined;
  if (!tool) throw new ToolError(`Unknown tool "${name}"`);
  const parsed = tool.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) throw new ToolError(`Invalid arguments for ${name}: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'args'} ${i.message}`).join('; ')}`);
  const start = performance.now();
  const result = tool.run(ctx, parsed.data);
  return { result, ms: Math.round((performance.now() - start) * 100) / 100 };
}
