import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AirportProfileResult, MethodologyResult, RankingResult, ResolveResult, SourcesResult } from '../../../shared/api';
import { METHODOLOGY_TOPICS } from '../analytics/methodology';
import { ALL_REGIONS } from '../analytics/regions';
import { rankAirports } from '../analytics/ranking';
import { DataService } from '../data/data.service';
import { runTool } from '../tools/registry';
import { ToolError } from '../tools/tool-error';

const RankingQuery = z.object({
  region: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** Deterministic REST endpoints used by the UI directly (e.g. the national board on first load; no AI involved). */
@Controller()
export class DataController {
  constructor(private readonly data: DataService) {}

  @Get('rankings')
  rankings(@Query() query: unknown): RankingResult {
    const q = RankingQuery.parse(query);
    // The REST view allows up to 200 rows (the full board); the agent's rank_airports tool caps at 50.
    try {
      return rankAirports(this.data.index, this.data.national, { ...(q.region ? { region: q.region } : {}), ...(q.limit ? { limit: q.limit } : {}) });
    } catch (e) {
      throw new ToolError((e as Error).message, 400);
    }
  }

  @Get('airports/search')
  search(@Query('q') q: unknown): ResolveResult {
    return runTool(this.data, 'resolve_airport', { query: z.string().parse(q) }).result as ResolveResult;
  }

  @Get('airports/:code')
  airport(@Param('code') code: string): AirportProfileResult {
    return runTool(this.data, 'get_airport_profile', { airport: code }).result as AirportProfileResult;
  }

  @Get('regions')
  regions(): { id: string; label: string; states: string[] }[] {
    return ALL_REGIONS;
  }

  @Get('methodology/:topic')
  methodology(@Param('topic') topic: string): MethodologyResult {
    return runTool(this.data, 'describe_methodology', { topic: z.enum(METHODOLOGY_TOPICS).parse(topic) }).result as MethodologyResult;
  }

  @Get('sources')
  sources(): SourcesResult {
    return runTool(this.data, 'get_data_sources', {}).result as SourcesResult;
  }
}
