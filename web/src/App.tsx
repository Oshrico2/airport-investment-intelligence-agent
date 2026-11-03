import { useCallback, useEffect, useRef, useState } from 'react';
import type { AirportProfileResult, ChatProvider, ProviderInfo, SourcesResult } from '../../shared/api';
import type { CardActions } from './cards/cards';
import { useAccess } from './components/AccessGate';
import { Composer } from './components/Composer';
import { AirportPanel, EvidenceBody, Sheet } from './components/Evidence';
import { Icon, type IconName } from './components/Icon';
import { NationalBoard } from './components/NationalBoard';
import { ProviderPicker } from './components/ProviderPicker';
import { SuggestionBoard } from './components/SuggestionBoard';
import { TurnView } from './components/TurnView';
import { api, type Suggestion } from './lib/api';
import { coverageLabel, dateLabel } from './lib/format';
import { useChat } from './lib/useChat';
import { useMediaQuery } from './lib/useMediaQuery';
import { Btn, Muted, PanelHead } from './styles/shared.styles';
import * as S from './App.styles';
import { MethodView } from './views/MethodView';
import { RankingsView } from './views/RankingsView';

type View = 'ask' | 'rankings' | 'method';
const NAV: { id: View; label: string; icon: IconName }[] = [
  { id: 'ask', label: 'Ask', icon: 'ask' },
  { id: 'rankings', label: 'Rankings', icon: 'board' },
  { id: 'method', label: 'Method & sources', icon: 'method' },
];
const BRAND = 'Airport Investment Intelligence Agent';
const viewFromHash = (): View => (['rankings', 'method'].includes(location.hash.slice(2)) ? (location.hash.slice(2) as View) : 'ask');

export function App() {
  const chat = useChat();
  const access = useAccess();
  const wide = useMediaQuery('(min-width: 1180px)');
  const finePointer = useMediaQuery('(pointer: fine)'); // no auto-focus on touch: it would raise the keyboard over the answer
  const [view, setView] = useState<View>(viewFromHash);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [chosen, setChosen] = useState<ChatProvider | null>(null);
  const [sources, setSources] = useState<SourcesResult | null>(null);
  const [airport, setAirport] = useState<{ code: string; data?: AirportProfileResult; error?: string } | null>(null);
  const [evidenceFor, setEvidenceFor] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'evidence' | 'airport' | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.suggestions().then(setSuggestions, () => setSuggestions([]));
    api.providers().then((r) => {
      setProviders(r.providers);
      setChosen(r.default);
    }, () => setProviders([])); // unknown: the server picks its default
    api.sources().then(setSources, () => setSources(null));
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.title = view === 'ask' ? BRAND : `${NAV.find((n) => n.id === view)!.label} · ${BRAND}`;
  }, [view]);

  const lastTurn = chat.turns.at(-1);
  // Production: re-read the code's remaining questions after each question (unfinished questions are not charged); a revoked or unknown
  // code brings back the access screen.
  const settled = lastTurn && lastTurn.status !== 'streaming' ? lastTurn.id : null;
  useEffect(() => {
    if (settled && (access.quota || lastTurn?.errorCode === 'access_required' || lastTurn?.errorCode === 'access_revoked')) access.refresh();
  }, [settled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (lastTurn) endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [chat.turns.length, lastTurn?.tools.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (v: View) => {
    location.hash = v === 'ask' ? '' : `/${v}`;
    setView(v);
  };

  const openAirport = useCallback(
    (code: string) => {
      setAirport({ code });
      if (!wide) setSheet('airport');
      api.airport(code).then((data) => setAirport({ code, data }), (e: Error) => setAirport({ code, error: e.message }));
    },
    [wide],
  );
  // A conversation stays with the provider of its first answer (each provider keeps its own context). Until a
  // turn succeeds, e.g. after "Claude is overloaded", the user can still switch.
  const threadProvider = chat.turns.find((t) => t.status === 'done')?.provider;
  const provider = threadProvider ?? chosen;
  const info = providers.find((p) => p.id === provider);
  const ask = useCallback((q: string) => {
    setAirport(null);
    setEvidenceFor(null);
    go('ask');
    void chat.send(q, provider ?? undefined);
  }, [chat, provider]);
  const actions: CardActions = { onAirport: openAirport };
  const picker = provider && <ProviderPicker providers={providers} value={provider} onChange={setChosen} locked={!!threadProvider} />;

  // Evidence follows the chosen answer, else the latest answer with data: a text-only reply (a clarifying question,
  // the Demo free-text notice) keeps the previous evidence on screen instead of reverting to the national board.
  const selected = chat.turns.find((t) => t.id === evidenceFor) ?? chat.turns.findLast((t) => t.tools.some((x) => x.result)) ?? lastTurn;
  const r495 = sources?.sources.find((s) => s.id === 'r495');
  const delays = sources?.sources.find((s) => s.id === 'delayCauses');
  const home = chat.turns.length === 0;

  const side = airport ? (
    <AirportPanel state={airport} onClose={() => setAirport(null)} />
  ) : view === 'ask' && selected && selected.tools.some((t) => t.result) ? (
    <>
      <PanelHead><h2>Evidence</h2></PanelHead>
      <EvidenceBody turn={selected} live={sources?.live ?? null} />
    </>
  ) : view === 'ask' ? (
    <NationalBoard onAirport={openAirport} onOpenRankings={() => go('rankings')} />
  ) : view === 'rankings' ? (
    <S.SideHint>
      <h2>Airport profile</h2>
      <p>Select any airport in the ranking to open its profile here: traffic for 2019, 2024 and 2025, growth, load factor, charter share and the latest 2026 months.</p>
      {r495 && <Muted as="p">BTS data through {coverageLabel(r495.coverage).split(' – ').at(-1)} · snapshot {dateLabel(r495.retrievedAt)}</Muted>}
    </S.SideHint>
  ) : (
    <NationalBoard onAirport={openAirport} onOpenRankings={() => go('rankings')} />
  );

  return (
    <S.Shell>
      <S.Skip href="#main">Skip to content</S.Skip>
      <S.Rail aria-label="Primary">
        <S.Brand>
          {/* The mark carries the name for assistive tech, so it stays named when the text is hidden at mid widths. */}
          <S.BrandMark src="/logo.svg" width={30} height={30} alt={BRAND} />
          <S.BrandName aria-hidden="true">
            Airport Investment
            <br />
            Intelligence <S.BrandAgent>Agent</S.BrandAgent>
          </S.BrandName>
        </S.Brand>
        <nav>
          <S.Nav>
            {NAV.map((n, i) => (
              <S.NavEntry key={n.id} $i={i}>
                <S.NavItem type="button" $active={view === n.id} aria-current={view === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
                  <Icon name={n.icon} />
                  <span>{n.label}</span>
                </S.NavItem>
              </S.NavEntry>
            ))}
          </S.Nav>
        </nav>
        <S.RailFoot>
          {info && (
            <S.Mode data-testid="mode" title={info.id === 'demo' ? 'Demo mode: only the listed analyses are available' : `${info.label} tool-calling agent · ${info.model}`}>
              <S.ModeDot $ai={info.id !== 'demo'} aria-hidden="true" />
              {info.id === 'demo' ? 'Demo mode · no AI' : `AI agent · ${info.label}`}
            </S.Mode>
          )}
          {r495 && (
            <S.Freshness title={sources?.live.message}>
              <S.FreshnessDot $state={sources?.live.state ?? 'not-checked'} aria-hidden="true" />
              BTS data to {coverageLabel(r495.coverage).split(' – ').at(-1)}
              <S.FreshnessNote>Snapshot {dateLabel(r495.retrievedAt)}</S.FreshnessNote>
            </S.Freshness>
          )}
        </S.RailFoot>
      </S.Rail>

      <S.Main id="main" tabIndex={0} aria-label="Workspace">
        {view === 'rankings' && <RankingsView onAirport={openAirport} />}
        {view === 'method' && <MethodView />}
        {view === 'ask' && (
          <S.Ask $home={home}>
            {home ? (
              <>
                <S.Hero>
                  <h1>Which U.S. airports deserve capital next?</h1>
                  <S.HeroSub>
                    Ask in plain language. Every figure is computed from BTS T-100 traffic{r495 ? ` through ${coverageLabel(r495.coverage).split(' – ').at(-1)}` : ''}
                    {delays ? ` and on-time data through ${coverageLabel(delays.coverage).split(' – ').at(-1)}` : ''}.
                  </S.HeroSub>
                </S.Hero>
                <Composer busy={chat.busy} onSend={ask} onStop={chat.stop} placeholder="e.g. Rank New England airports and explain who is excluded" tools={picker} />
                <Disclosure provider={provider} providers={providers} home />
                <Quota />
                <SuggestionBoard suggestions={suggestions} onAsk={ask} disabled={chat.busy} demo={provider === 'demo'} />
                {!wide && <NationalBoard onAirport={openAirport} onOpenRankings={() => go('rankings')} />}
              </>
            ) : (
              <>
                <S.ThreadHead>
                  <S.ThreadTitle>Analysis</S.ThreadTitle>
                  <Btn type="button" $variant="ghost" $size="sm" onClick={chat.reset}>
                    <Icon name="plus" size={15} /> New analysis
                  </Btn>
                </S.ThreadHead>
                <S.Thread aria-live="off">
                  {chat.turns.map((t) => (
                    <TurnView
                      key={t.id}
                      turn={t}
                      actions={actions}
                      selected={wide && selected?.id === t.id}
                      onEvidence={() => {
                        setAirport(null);
                        setEvidenceFor(t.id);
                        if (!wide) setSheet('evidence');
                      }}
                    />
                  ))}
                  <div ref={endRef} />
                </S.Thread>
                <S.Dock>
                  <Composer compact autoFocus={finePointer} busy={chat.busy} onSend={ask} onStop={chat.stop} placeholder="Ask a follow-up, e.g. And how does BDL compare?" tools={picker} />
                  <Disclosure provider={provider} providers={providers} />
                  <Quota />
                </S.Dock>
              </>
            )}
          </S.Ask>
        )}
      </S.Main>

      {wide && <S.Side aria-label="Evidence and details">{side}</S.Side>}
      {!wide && (
        <Sheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet === 'airport' ? 'Airport profile' : 'Sources & limits'}>
          {sheet === 'airport' && airport ? <AirportPanel state={airport} onClose={() => setSheet(null)} /> : selected ? <EvidenceBody turn={selected} live={sources?.live ?? null} /> : null}
        </Sheet>
      )}
    </S.Shell>
  );
}

/** Production only: the access code's remaining questions, or the friendly message once they are used up. */
function Quota() {
  const { quota } = useAccess();
  if (!quota) return null;
  if (quota.message) return <S.QuotaNote $out role="status" data-testid="quota">{quota.message}</S.QuotaNote>;
  return <S.QuotaNote data-testid="quota">{quota.remaining} of {quota.limit} questions left on your access code.</S.QuotaNote>;
}

function Disclosure({ provider, providers, home = false }: { provider: ChatProvider | null; providers: ProviderInfo[]; home?: boolean }) {
  const off = home ? `${providers.filter((p) => !p.available).map((p) => ` ${p.label} is off: ${p.reason}.`).join('')} Voice input is transcribed by your browser’s speech service.` : '';
  if (provider === 'demo') return <S.Disclosure $home={home} data-testid="disclosure">Demo mode: only the listed analyses run, with template summaries.{off}</S.Disclosure>;
  if (provider === 'gemini') return <S.Disclosure $home={home} data-testid="disclosure">Questions are sent to Google Gemini (free tier; Google may use them to improve its products). Numbers come only from BTS tools.{off}</S.Disclosure>;
  if (provider === 'claude') return <S.Disclosure $home={home} data-testid="disclosure">Questions are sent to Anthropic Claude (paid API, billed to this server's key). Numbers come only from BTS tools.{off}</S.Disclosure>;
  return null;
}
