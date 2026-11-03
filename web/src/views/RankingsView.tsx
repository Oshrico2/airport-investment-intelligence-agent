import { useEffect, useState } from 'react';
import type { RankingResult } from '../../../shared/api';
import { RankingTable } from '../cards/RankingTable';
import { Legend } from '../charts/charts';
import { CodeTile } from '../components/CodeTile';
import { SourceChips } from '../components/ui';
import { api, type RegionOption } from '../lib/api';
import { int } from '../lib/format';
import { ErrorText, LinkBtn, Num, Skeleton, View, ViewHead, ViewLede } from '../styles/shared.styles';
import * as S from './RankingsView.styles';

/** Full, sortable national board with deterministic regional filtering; no AI involved. */
export function RankingsView({ onAirport }: { onAirport: (code: string) => void }) {
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [region, setRegion] = useState('us');
  const [data, setData] = useState<RankingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.regions().then(setRegions, () => setRegions([]));
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setError(null);
    api.rankings(region === 'us' ? undefined : region, 200, c.signal).then(setData, (e: Error) => !c.signal.aborted && setError(e.message));
    return () => c.abort();
  }, [region]);

  return (
    <View>
      <ViewHead>
        <div>
          <h1>Investment ranking</h1>
          <ViewLede>
            OverallScore = 0.6 × growth score (2025 vs 2024 departing passengers) + 0.4 × load-factor score (2025). Airports need ≥{int(500_000)} departing passengers in 2025 and complete 2024–2025 data.
          </ViewLede>
        </div>
        <S.Select>
          <span>Region</span>
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            {(regions.length ? regions : [{ id: 'us', label: 'United States (incl. territories)', states: [] }]).map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </S.Select>
      </ViewHead>
      {error && <ErrorText>{error}</ErrorText>}
      {data && (
        <S.Card as="div" $kind="ranking" $flat data-testid="card-ranking">
          <S.Meta>
            <span>
              <Num as="b">{data.eligibleCount}</Num> ranked{data.region.id !== 'us' ? ` in ${data.region.label} (national ranks shown)` : ''}
            </span>
            <Legend items={[{ label: 'Growth × 0.6', color: 'var(--series-1)' }, { label: 'Load factor × 0.4', color: 'var(--series-3)' }]} />
          </S.Meta>
          <RankingTable rows={data.rows} caption={`Investment ranking, ${data.region.label}`} onSelect={onAirport} sortable />
          {data.excludedCount > 0 && (
            <S.Excluded>
              <summary>{data.excludedCount} airports in this region are not ranked. See why for the largest</summary>
              <ul>
                {data.excluded.map((e) => (
                  <li key={e.airport.id}>
                    <CodeTile code={e.airport.code} size="sm" />
                    <LinkBtn type="button" onClick={() => onAirport(e.airport.code)}>{e.airport.name}</LinkBtn>
                    <S.ExcludedReason>{e.reasons.map((r) => r.message).join(' ')}</S.ExcludedReason>
                  </li>
                ))}
              </ul>
            </S.Excluded>
          )}
          <SourceChips sources={data.sources} />
        </S.Card>
      )}
      {!data && !error && <Skeleton $tall aria-label="Loading ranking" />}
    </View>
  );
}
