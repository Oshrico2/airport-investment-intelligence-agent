import { useEffect, useState } from 'react';
import type { RankingResult } from '../../../shared/api';
import { ScoreBar } from '../charts/charts';
import { api } from '../lib/api';
import { CodeTile } from './CodeTile';
import { ErrorText, LinkBtn, PanelHead, Skeleton } from '../styles/shared.styles';
import { Icon } from './Icon';
import * as S from './NationalBoard.styles';
import { SourceChips } from './ui';

/** The national board shown before any question: deterministic, straight from /api/rankings (no AI). */
export function NationalBoard({ onAirport, onOpenRankings }: { onAirport: (code: string) => void; onOpenRankings: () => void }) {
  const [data, setData] = useState<RankingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const c = new AbortController();
    api.rankings(undefined, 10, c.signal).then(setData, (e: Error) => !c.signal.aborted && setError(e.message));
    return () => c.abort();
  }, []);
  return (
    <S.National aria-labelledby="national-title">
      <PanelHead>
        <h2 id="national-title">National board</h2>
        <LinkBtn type="button" onClick={onOpenRankings}>
          All {data?.nationalEligibleCount ?? ''} <Icon name="chevron" size={14} />
        </LinkBtn>
      </PanelHead>
      <S.Sub>Top airports by investment score · 2025 vs 2024</S.Sub>
      {error && <ErrorText>{error}</ErrorText>}
      {!data && !error && <Skeleton $tall aria-label="Loading ranking" />}
      {data && (
        <S.List>
          {data.rows.map((r, i) => (
            <S.Item key={r.airport.id} $i={i}>
              <S.Row type="button" onClick={() => onAirport(r.airport.code)} aria-label={`#${r.nationalRank} ${r.airport.code} ${r.airport.name}, score ${r.score.overallScore}`}>
                <S.Rank>{r.nationalRank}</S.Rank>
                <CodeTile code={r.airport.code} delay={300 + i * 35} />
                <S.City>{r.airport.city}</S.City>
                <ScoreBar growth={r.score.growthContribution} load={r.score.loadContribution} total={r.score.overallScore} label={r.airport.code} />
              </S.Row>
            </S.Item>
          ))}
        </S.List>
      )}
      {data && <SourceChips sources={data.sources.slice(0, 1)} />}
    </S.National>
  );
}
