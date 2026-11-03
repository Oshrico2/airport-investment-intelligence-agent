import { useMemo, useState } from 'react';
import type { RankingRow } from '../../../shared/api';
import { ScoreBar } from '../charts/charts';
import { CodeTile } from '../components/CodeTile';
import { Delta } from '../components/ui';
import { compact, int } from '../lib/format';
import { Icon } from '../components/Icon';
import { VisuallyHidden } from '../styles/shared.styles';
import * as S from './RankingTable.styles';

type SortKey = 'rank' | 'passengers' | 'growth' | 'lf' | 'score';
const VALUE: Record<SortKey, (r: RankingRow) => number> = {
  rank: (r) => r.nationalRank,
  passengers: (r) => r.passengers2025,
  growth: (r) => r.score.growthPercent,
  lf: (r) => r.score.loadFactorPercent,
  score: (r) => r.score.overallScore,
};

/** Departure-board table: fixed columns, code tiles, sortable headers (real <table>, aria-sort). */
export function RankingTable({ rows, caption, onSelect, sortable = false }: { rows: RankingRow[]; caption: string; onSelect?: (code: string) => void; sortable?: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'rank', dir: 'asc' });
  const sorted = useMemo(() => {
    const v = VALUE[sort.key];
    return [...rows].sort((a, b) => (sort.dir === 'asc' ? v(a) - v(b) : v(b) - v(a)));
  }, [rows, sort]);
  const header = (key: SortKey, label: string, col: S.Col, hideSm = false) => {
    const active = sort.key === key;
    const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    return (
      <S.Th scope="col" $col={col} $hideSm={hideSm} aria-sort={sortable ? ariaSort : undefined}>
        {sortable ? (
          <S.ThSort type="button" $active={active} onClick={() => setSort({ key, dir: active ? (sort.dir === 'asc' ? 'desc' : 'asc') : key === 'rank' ? 'asc' : 'desc' })}>
            {label}
            <Icon name="sort" size={14} />
          </S.ThSort>
        ) : (
          label
        )}
      </S.Th>
    );
  };
  return (
    <S.BoardWrap>
      <S.Board>
        <VisuallyHidden as="caption">{caption}</VisuallyHidden>
        <thead>
          <tr>
            {header('rank', 'Rank', 'rank')}
            <th scope="col">Airport</th>
            {header('passengers', 'Pax 2025', 'num', true)}
            {header('growth', 'Growth', 'num')}
            {header('lf', 'Load', 'num', true)}
            {header('score', 'Score', 'score')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <S.Row key={r.airport.id} $clickable={!!onSelect} onClick={onSelect ? () => onSelect(r.airport.code) : undefined}>
              <S.Td $col="rank" $num>{r.nationalRank}</S.Td>
              <th scope="row">
                {onSelect ? (
                  <S.AirportBtn type="button" onClick={(e) => { e.stopPropagation(); onSelect(r.airport.code); }} aria-label={`Open profile of ${r.airport.code} ${r.airport.name}`}>
                    <CodeTile code={r.airport.code} delay={i * 30} animate={i < 12} />
                    <AirportName r={r} />
                  </S.AirportBtn>
                ) : (
                  <S.AirportBtn as="span">
                    <CodeTile code={r.airport.code} delay={i * 30} animate={i < 12} />
                    <AirportName r={r} />
                  </S.AirportBtn>
                )}
              </th>
              <S.Td $col="num" $num $hideSm title={int(r.passengers2025)}>{compact(r.passengers2025)}</S.Td>
              <S.Td $col="num"><Delta value={r.score.growthPercent} /></S.Td>
              <S.Td $col="num" $num $hideSm>{r.score.loadFactorPercent.toFixed(1)}%</S.Td>
              <S.Td $col="score">
                <ScoreBar growth={r.score.growthContribution} load={r.score.loadContribution} total={r.score.overallScore} label={r.airport.code} />
              </S.Td>
            </S.Row>
          ))}
        </tbody>
      </S.Board>
    </S.BoardWrap>
  );
}

function AirportName({ r }: { r: RankingRow }) {
  return (
    <S.AirportName>
      <S.AirportMain>{r.airport.name}</S.AirportMain>
      <S.AirportSub>
        {r.airport.city}, {r.airport.state}
      </S.AirportSub>
    </S.AirportName>
  );
}
