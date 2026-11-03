import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { AccessStatus } from '../../../shared/api';
import { api } from '../lib/api';
import { Btn, ErrorText } from '../styles/shared.styles';
import * as S from './AccessGate.styles';

type Quota = Extract<AccessStatus, { granted: true }>;
const AccessContext = createContext<{ quota: Quota | null; refresh: () => void }>({ quota: null, refresh: () => undefined });

/** The code's questions (production) or null (local development), and a re-check after each question. */
export const useAccess = () => useContext(AccessContext);

/**
 * Production asks for the reviewer's access code before the app loads; the server keeps it in an HttpOnly cookie, so
 * the code is never stored by the page. Locally the server answers `required: false` and the app renders directly.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccessStatus | 'loading' | 'unknown'>('loading');
  const refresh = useCallback(() => {
    api.access().then(setStatus, () => setStatus((s) => (s === 'loading' ? 'unknown' : s))); // offline: let the app show its own errors
  }, []);
  useEffect(refresh, [refresh]);

  if (status === 'loading') return null;
  if (status !== 'unknown' && status.required && !status.granted) return <CodeForm onGranted={setStatus} />;
  const quota = status !== 'unknown' && status.required ? status : null;
  return <AccessContext.Provider value={{ quota, refresh }}>{children}</AccessContext.Provider>;
}

function CodeForm({ onGranted }: { onGranted: (s: AccessStatus) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      onGranted(await api.enterCode(code));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <S.Screen>
      <S.Card onSubmit={submit} aria-labelledby="access-title" noValidate>
        <S.Mark src="/logo.svg" width={36} height={36} alt="Airport Investment Intelligence Agent" />
        <h1 id="access-title">Enter your access code</h1>
        <p>This review deployment answers with a paid Claude model, so each reviewer has a personal access code with a fixed number of questions.</p>
        <label htmlFor="access-code">Access code</label>
        <S.Input
          id="access-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="AIA-XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={64}
          autoFocus
          aria-invalid={!!error}
          aria-describedby={error ? 'access-error' : undefined}
        />
        {error && (
          <ErrorText id="access-error" role="alert">
            {error}
          </ErrorText>
        )}
        <Btn type="submit" $variant="primary" disabled={!code.trim() || busy}>
          {busy ? 'Checking…' : 'Continue'}
        </Btn>
        <S.Note>Running the project locally needs no code: it uses your own API key (see the README).</S.Note>
      </S.Card>
    </S.Screen>
  );
}
