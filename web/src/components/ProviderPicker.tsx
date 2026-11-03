import type { ChatProvider, ProviderInfo } from '../../../shared/api';
import { VisuallyHidden } from '../styles/shared.styles';
import * as S from './ProviderPicker.styles';

const providerTitle = (p: ProviderInfo) => (p.available ? (p.id === 'demo' ? 'Fixed analyses with template summaries, no AI' : `${p.label} · ${p.model}`) : `${p.label} unavailable: ${p.reason}`);

/**
 * Which agent answers. A conversation stays with the provider of its first answer, because each keeps its own
 * context; "New analysis" unlocks the choice. Unconfigured providers stay visible but disabled, with the reason.
 */
export function ProviderPicker({ providers, value, onChange, locked }: { providers: ProviderInfo[]; value: ChatProvider; onChange: (p: ChatProvider) => void; locked: boolean }) {
  if (!providers.length) return null;
  return (
    <S.Provider disabled={locked} title={locked ? 'Start a new analysis to switch provider' : undefined}>
      <VisuallyHidden as="legend">Answer with{locked ? ' (start a new analysis to switch)' : ''}</VisuallyHidden>
      {providers.map((p) => (
        <S.Option key={p.id} title={providerTitle(p)}>
          <input type="radio" name="provider" value={p.id} checked={value === p.id} disabled={!p.available} onChange={() => onChange(p.id)} />
          <span>{p.label}</span>
        </S.Option>
      ))}
    </S.Provider>
  );
}
