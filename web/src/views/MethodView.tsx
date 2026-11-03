import { useEffect, useState } from 'react';
import type { MethodologyResult, SourcesResult } from '../../../shared/api';
import { SourcesCard } from '../cards/cards';
import { api } from '../lib/api';
import { View, ViewHead, ViewLede } from '../styles/shared.styles';
import * as S from './MethodView.styles';

const TOPICS = ['scoring', 'eligibility', 'passenger-classification', 'data-quality', 'long-haul', 'delays', 'unmet-demand'];

export function MethodView() {
  const [sources, setSources] = useState<SourcesResult | null>(null);
  const [topics, setTopics] = useState<MethodologyResult[]>([]);
  useEffect(() => {
    api.sources().then(setSources, () => setSources(null));
    Promise.all(TOPICS.map((t) => api.methodology(t))).then(setTopics, () => setTopics([]));
  }, []);
  return (
    <View>
      <ViewHead>
        <div>
          <h1>Method & sources</h1>
          <ViewLede>Every figure in this workspace is computed by deterministic code from official BTS data. The AI chooses which analysis to run and writes the summary; it never produces numbers.</ViewLede>
        </div>
      </ViewHead>
      <S.Grid>
        {sources && <SourcesCard r={sources} />}
        {topics.map((t) => (
          <S.Card $kind="method" data-testid="card-method" key={t.topic}>
            <S.CardTitle as="h2">{t.title}</S.CardTitle>
            <S.Points>{t.points.map((p) => <li key={p}>{p}</li>)}</S.Points>
          </S.Card>
        ))}
      </S.Grid>
    </View>
  );
}
