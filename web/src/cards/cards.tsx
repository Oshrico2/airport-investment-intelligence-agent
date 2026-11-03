import type { AirportProfileResult, CapacityResult, CompareAirportsResult, DelayComparisonResult, LongHaulResult, MethodologyResult, RankingResult, ResolveResult, SourcesResult } from '../../../shared/api';
import { Figure, Legend, MiniColumns, PairedBars, SERIES, ShareBar, TrendChart } from '../charts/charts';
import { CodeTile } from '../components/CodeTile';
import { Card, Delta, Note, QualityBadge, Reasons, SourceChips } from '../components/ui';
import { compact, coverageLabel, dateLabel, int, monthLabel, pct } from '../lib/format';
import type { ToolOutput } from '../lib/useChat';
import { Muted, Num, VisuallyHidden } from '../styles/shared.styles';
import * as S from './cards.styles';
import { RankingTable } from './RankingTable';

export interface CardActions {
  onAirport?: (code: string) => void;
}

/**
 * Renders a tool result as its deterministic card: every figure here comes from the tool payload.
 * `repeat`: an earlier card of the same kind in this answer already shows the shared caveat.
 */
export function ToolCard({ result, actions, repeat = false }: { result: ToolOutput; actions: CardActions; repeat?: boolean }) {
  switch (result.kind) {
    case 'ranking': return <RankingCard r={result} actions={actions} />;
    case 'airportProfile': return <AirportCard r={result} />;
    case 'compareAirports': return <CompareCard r={result} actions={actions} />;
    case 'longHaul': return <LongHaulCard r={result} />;
    case 'delays': return <DelayCard r={result} caveat={!repeat} />;
    case 'capacity': return <CapacityCard r={result} />;
    case 'resolve': return <ResolveCard r={result} actions={actions} />;
    case 'methodology': return <MethodCard r={result} />;
    case 'sources': return <SourcesCard r={result} />;
    case 'error': return <Card kind="error" title="This analysis could not run"><Note tone="warn">{result.message}</Note></Card>;
  }
}

export function RankingCard({ r, actions }: { r: RankingResult; actions: CardActions }) {
  const national = r.region.id === 'us';
  return (
    <Card
      kind="ranking"
      title={national ? 'Investment ranking · United States' : `Investment ranking · ${r.region.label}`}
      meta={`${r.eligibleCount} ranked${national ? '' : ` here, of ${r.nationalEligibleCount} nationally`} · ≥${int(r.method.threshold)} departing passengers in 2025 · growth 2025 vs 2024`}
    >
      <Legend items={[{ label: 'Growth × 0.6', color: 'var(--series-1)' }, { label: 'Load factor × 0.4', color: 'var(--series-3)' }]} />
      <RankingTable rows={r.rows} caption={`Investment ranking, ${r.region.label}`} {...(actions.onAirport ? { onSelect: actions.onAirport } : {})} />
      {r.rows.length < r.eligibleCount && <S.CardFoot>Showing the top {r.rows.length} of {r.eligibleCount}. The Rankings view lists every airport.</S.CardFoot>}
      {r.excludedCount > 0 && (
        <S.Excluded>
          <summary>
            {r.excludedCount} airports in {national ? 'the U.S.' : r.region.label} are not ranked. See why
          </summary>
          <ul>
            {r.excluded.map((e) => (
              <li key={e.airport.id}>
                <CodeTile code={e.airport.code} size="sm" />
                <S.ExcludedName>{e.airport.name}</S.ExcludedName>
                <S.ExcludedReason>{e.reasons.map((x) => x.message).join(' ')}</S.ExcludedReason>
              </li>
            ))}
          </ul>
          {r.excludedCount > r.excluded.length && <S.CardFoot>Largest {r.excluded.length} shown by 2025 passengers.</S.CardFoot>}
        </S.Excluded>
      )}
      <SourceChips sources={r.sources} />
    </Card>
  );
}

export function AirportCard({ r }: { r: AirportProfileResult }) {
  const y25 = r.years.find((y) => y.year === 2025);
  const months2025 = r.monthly.filter((m) => m.month.startsWith('2025'));
  const months2026 = r.monthly.filter((m) => !m.month.startsWith('2025'));
  return (
    <Card
      kind="airport"
      title={
        <S.TitleWithTile>
          <CodeTile code={r.airport.code} size="lg" tone="signal" />
          <span>
            {r.airport.name}
            <S.CardSub>{r.airport.city}, {r.airport.state}{r.airport.aliases.length ? ` · also reported as ${r.airport.aliases.join(', ')}` : ''}</S.CardSub>
          </span>
        </S.TitleWithTile>
      }
      actions={r.ranking.eligible ? <S.RankPill>#{r.ranking.nationalRank} <small>national</small></S.RankPill> : <QualityBadge quality={{ status: 'excluded', reasons: r.ranking.reasons }} />}
    >
      <S.Figures>
        <Figure label="Passengers 2025" value={y25 ? compact(y25.passengers) : '—'} sub={<Delta value={r.growthPercent2025} suffix="vs 2024" />} />
        <Figure label="Load factor 2025" value={pct(y25?.loadFactorPercent)} />
        <Figure label="Investment score" value={r.ranking.score ? r.ranking.score.overallScore.toFixed(1) : '—'} sub={r.ranking.score ? `${r.ranking.score.growthContribution} growth + ${r.ranking.score.loadContribution} load` : 'not ranked'} />
        <Figure label="Domestic share" value={pct(r.domesticSharePercent2025)} />
        {r.charter && <Figure label="Charter share" value={pct(r.charter.charterSharePercent)} sub={`${int(r.charter.charterPassengers)} passengers`} />}
      </S.Figures>
      {r.charter && <S.CardFoot>{r.charter.label}: {r.charter.btsDefinition}. Share of 2025 passenger-flight passengers.</S.CardFoot>}
      {!r.ranking.eligible && <Reasons reasons={r.ranking.reasons} />}
      {r.ytd && (
        <S.Ytd>
          <h4>{r.ytd.label}</h4>
          <p>
            <Num as="b">{int(r.ytd.current.passengers)}</Num> departing passengers vs <Num>{int(r.ytd.previous.passengers)}</Num> <Delta value={r.ytd.passengerChangePercent} />
            {r.ytd.missingMonths.length > 0 && <Muted> · missing {r.ytd.missingMonths.map(monthLabel).join(', ')}</Muted>}
          </p>
        </S.Ytd>
      )}
      {months2025.length > 1 && (
        <TrendChart
          series={[
            { label: '2025', color: 'var(--series-muted)', points: months2025.map((m) => ({ month: m.month, value: m.passengers })) },
            ...(months2026.length ? [{ label: months2026[0]!.month.slice(0, 4), color: 'var(--series-1)', points: months2026.map((m) => ({ month: m.month, value: m.passengers })) }] : []),
          ]}
          format={compact}
          tableFormat={int}
        />
      )}
      <S.MiniTable>
        <VisuallyHidden as="caption">Annual totals</VisuallyHidden>
        <thead><tr><th scope="col">Year</th><th scope="col">Passengers</th><th scope="col">Seats</th><th scope="col">Load factor</th><th scope="col">Departures*</th></tr></thead>
        <tbody>
          {r.years.map((y) => (
            <tr key={y.year}>
              <S.NumCell as="th" scope="row">{y.year}</S.NumCell>
              <S.NumCell>{int(y.passengers)}</S.NumCell>
              <S.NumCell>{int(y.seats)}</S.NumCell>
              <S.NumCell>{pct(y.loadFactorPercent)}</S.NumCell>
              <S.NumCell>{int(y.departures)}</S.NumCell>
            </tr>
          ))}
        </tbody>
      </S.MiniTable>
      <S.CardFoot>*All departures incl. cargo flights (BTS T-100). Departing passengers are enplanements, not total airport footfall.</S.CardFoot>
      {r.quality.reasons.filter((q) => q.code === 'MONTHLY_LF_ABOVE_100' || q.code === 'INCONSISTENT_ROWS').length > 0 && <Reasons reasons={r.quality.reasons.filter((q) => q.code === 'MONTHLY_LF_ABOVE_100' || q.code === 'INCONSISTENT_ROWS')} />}
      <SourceChips sources={r.sources} />
    </Card>
  );
}

function CompareCard({ r, actions }: { r: CompareAirportsResult; actions: CardActions }) {
  return (
    <Card kind="compare" title={`Comparison · ${r.airports.map((a) => a.airport.code).join(' · ')}`}>
      <S.BoardWrap>
        <S.Board>
          <VisuallyHidden as="caption">Airport comparison</VisuallyHidden>
          <thead><tr><th scope="col">Airport</th><S.Th scope="col" $col="num">Pax 2025</S.Th><S.Th scope="col" $col="num">Growth</S.Th><S.Th scope="col" $col="num">Load</S.Th><S.Th scope="col" $col="num">Rank</S.Th></tr></thead>
          <tbody>
            {r.airports.map((a) => {
              const y25 = a.years.find((y) => y.year === 2025);
              return (
                <tr key={a.airport.id}>
                  <th scope="row">
                    <S.AirportBtn type="button" onClick={() => actions.onAirport?.(a.airport.code)}>
                      <CodeTile code={a.airport.code} />
                      <S.AirportName><S.AirportMain>{a.airport.name}</S.AirportMain><S.AirportSub>{a.airport.city}, {a.airport.state}</S.AirportSub></S.AirportName>
                    </S.AirportBtn>
                  </th>
                  <S.Td $col="num" $num>{y25 ? compact(y25.passengers) : '—'}</S.Td>
                  <S.Td $col="num"><Delta value={a.growthPercent2025} /></S.Td>
                  <S.Td $col="num" $num>{pct(y25?.loadFactorPercent)}</S.Td>
                  <S.Td $col="num" $num>{a.ranking.nationalRank ? `#${a.ranking.nationalRank}` : 'not ranked'}</S.Td>
                </tr>
              );
            })}
          </tbody>
        </S.Board>
      </S.BoardWrap>
      {r.notFound.length > 0 && <Note tone="warn">Not found in BTS data: {r.notFound.join(', ')}</Note>}
      <SourceChips sources={r.sources} />
    </Card>
  );
}

function LongHaulCard({ r }: { r: LongHaulResult }) {
  return (
    <Card kind="longhaul" title={<S.TitleWithTile><CodeTile code={r.airport.code} size="lg" tone="signal" /><span>Long-haul share · {r.year}<S.CardSub>{r.airport.name}</S.CardSub></span></S.TitleWithTile>} actions={<QualityBadge quality={r.quality} />}>
      {r.longHaulSharePercent === null ? (
        <Reasons reasons={r.quality.reasons} />
      ) : (
        <>
          <S.Headline>
            <S.HeadlineValue data-testid="headline-value">{r.longHaulSharePercent}%</S.HeadlineValue>
            <S.HeadlineText>of passenger-flight departures flew {int(r.minMiles)}+ statute miles</S.HeadlineText>
          </S.Headline>
          <ShareBar part={r.longHaulPassengerDepartures} total={r.passengerDepartures} partLabel={`≥${int(r.minMiles)} mi`} restLabel="Shorter" />
          <Note>
            Including cargo-only service, <Num as="b">{pct(r.allLongHaulSharePercent)}</Num> of all {int(r.allDepartures)} departures would count as long-haul ({int(r.cargoOnlyDepartures)} cargo-only departures). Cargo is excluded by definition.
          </Note>
          {r.topDestinations.length > 0 && (
            <S.Dests>
              <h4>Top long-haul passenger destinations</h4>
              <ol>
                {r.topDestinations.slice(0, 8).map((d) => (
                  <li key={d.dest}>
                    <CodeTile code={d.dest} size="sm" />
                    <Num>{int(d.departures)}</Num> departures
                    <S.MutedNum> · {int(d.distance)} mi</S.MutedNum>
                  </li>
                ))}
              </ol>
            </S.Dests>
          )}
        </>
      )}
      <S.Method>
        <summary>Definition and limitations</summary>
        <p>{r.definition}</p>
        <ul>{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      </S.Method>
      <SourceChips sources={r.sources} />
    </Card>
  );
}

function DelayCard({ r, caveat }: { r: DelayComparisonResult; caveat: boolean }) {
  const codes = r.airports.map((a) => a.airport.code);
  const metric = (f: (m: NonNullable<(typeof r.airports)[number]['metrics']>) => number) => r.airports.map((a) => (a.metrics ? f(a.metrics) : null));
  return (
    <Card kind="delays" title={`Delays · ${codes.join(' vs ')}`} meta={`${r.period.label} · arrivals of U.S. reporting carriers, domestic flights`}>
      <Legend items={codes.map((c, i) => ({ label: c, color: SERIES[i % SERIES.length]! }))} />
      <PairedBars
        entities={codes}
        rows={[
          { label: 'Arrivals delayed 15+ min', values: metric((m) => m.delayedPercent), format: (n) => `${n.toFixed(1)}%` },
          { label: 'Delay minutes per arrival', values: metric((m) => m.delayMinutesPerArrival), format: (n) => n.toFixed(1) },
          { label: 'Cancelled', values: metric((m) => m.cancelledPercent), format: (n) => `${n.toFixed(2)}%` },
          { label: 'NAS share of delays', values: metric((m) => m.causeSharePercent.nas), format: (n) => `${n.toFixed(1)}%` },
          { label: 'Late-aircraft share of delays', values: metric((m) => m.causeSharePercent.lateAircraft), format: (n) => `${n.toFixed(1)}%` },
        ]}
      />
      <S.CardFoot>
        Arrivals: {r.airports.map((a) => `${a.airport.code} ${a.metrics ? int(a.metrics.arrivals) : '—'}`).join(' · ')}
      </S.CardFoot>
      {r.airports.filter((a) => a.quality.status !== 'complete').map((a) => <Reasons key={a.airport.id} reasons={a.quality.reasons} />)}
      {caveat && <Note>{r.notes[1]}</Note>}
      <SourceChips sources={r.sources} />
    </Card>
  );
}

function CapacityCard({ r }: { r: CapacityResult }) {
  const years = [...r.baselines, r.current].sort((a, b) => a.year - b.year);
  const items = (f: (y: (typeof years)[number]) => number | null) => years.map((y) => ({ label: String(y.year), value: f(y), emphasis: y.year === r.current.year }));
  return (
    <Card kind="capacity" title={<S.TitleWithTile><CodeTile code={r.airport.code} size="lg" tone="signal" /><span>Capacity pressure<S.CardSub>{r.airport.name} · {r.current.year} vs {r.baselines.map((b) => b.year).join(' and ')}</S.CardSub></span></S.TitleWithTile>} actions={<QualityBadge quality={r.quality} />}>
      <S.Multiples>
        <MiniColumns title="Departing passengers" items={items((y) => y.passengers)} format={compact} />
        <MiniColumns title="Passenger flights" items={items((y) => y.passengerServiceDepartures)} format={compact} />
        <MiniColumns title="Cargo-only flights" items={items((y) => y.cargoOnlyDepartures)} format={compact} />
        <MiniColumns title="Seats per departure" items={items((y) => y.seatsPerPassengerDeparture)} format={(n) => n.toFixed(0)} />
        <MiniColumns title="Seat load factor" items={items((y) => y.loadFactorPercent)} format={(n) => `${n.toFixed(1)}%`} />
      </S.Multiples>
      <S.Changes>
        {r.changes.map((c) => (
          <li key={c.vsYear}>
            <S.ChangesVs>vs {c.vsYear}</S.ChangesVs>
            passengers <Delta neutral value={c.passengersPercent} /> · passenger-service departures <Delta neutral value={c.passengerServiceDeparturesPercent} /> · seats per departure <Delta neutral value={c.seatsPerDeparturePercent} />
          </li>
        ))}
      </S.Changes>
      <S.CardFoot>
        Peak months: {years.map((y) => (y.peakMonth ? `${y.year} ${monthLabel(y.peakMonth.month).split(' ')[0]} ${y.peakMonth.loadFactorPercent}% (${y.monthsAtOrAbove90} month${y.monthsAtOrAbove90 === 1 ? '' : 's'} ≥90%)` : `${y.year} —`)).join(' · ')}
      </S.CardFoot>
      <S.Infer>
        <div>
          <h4>BTS data can show</h4>
          <ul>{r.canInfer.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
        <div>
          <h4>It cannot show</h4>
          <ul>{r.cannotInfer.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      </S.Infer>
      <SourceChips sources={r.sources} />
    </Card>
  );
}

function ResolveCard({ r, actions }: { r: ResolveResult; actions: CardActions }) {
  return (
    <Card kind="resolve" title={r.status === 'none' ? `No airport matches "${r.query}"` : r.status === 'ambiguous' ? `"${r.query}" matches ${r.matches.length} airports` : `Found ${r.matches[0]?.code}`}>
      <S.Candidates>
        {r.matches.map((m) => (
          <li key={m.id}>
            <S.AirportBtn type="button" onClick={() => actions.onAirport?.(m.code)}>
              <CodeTile code={m.code} size="sm" />
              <S.AirportName><S.AirportMain>{m.name}</S.AirportMain><S.AirportSub>{m.city}, {m.state}</S.AirportSub></S.AirportName>
            </S.AirportBtn>
          </li>
        ))}
      </S.Candidates>
    </Card>
  );
}

function MethodCard({ r }: { r: MethodologyResult }) {
  return (
    <Card kind="method" title={r.title}>
      <S.Points>{r.points.map((p) => <li key={p}>{p}</li>)}</S.Points>
      <SourceChips sources={r.sources} />
    </Card>
  );
}

export function SourcesCard({ r }: { r: SourcesResult }) {
  return (
    <Card kind="sources" title="Data sources" meta={`Snapshot ${r.snapshotVersion}`}>
      <S.SourceList>
        {r.sources.map((s) => (
          <li key={s.id}>
            <b>{s.name}</b>
            <span>{s.coverage.from ? `${coverageLabel(s.coverage)} · ` : ''}retrieved {dateLabel(s.retrievedAt)}{s.id === 'r495' ? ` · BTS update ${dateLabel(s.vintage)}` : ''}</span>
          </li>
        ))}
      </S.SourceList>
      <Note tone={r.live.state === 'unreachable' || r.live.state === 'newer-available' ? 'warn' : 'info'}>{r.live.message}</Note>
    </Card>
  );
}
