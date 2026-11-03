import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { streamChat } from '../lib/api';
import { AccessGate, useAccess } from './AccessGate';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function Remaining() {
  const { quota } = useAccess();
  return <p>{quota ? `${quota.remaining} left` : 'no quota'}</p>;
}

afterEach(() => vi.unstubAllGlobals());

describe('AccessGate', () => {
  it('renders the app directly when the server needs no code (local development)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { required: false })));
    render(<AccessGate><Remaining /></AccessGate>);
    expect(await screen.findByText('no quota')).toBeInTheDocument();
    expect(screen.queryByLabelText('Access code')).toBeNull();
  });

  it('asks for a code, shows the server error for a wrong one, and opens the app with the right one', async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') return json(200, { required: true, granted: false });
      const { code } = JSON.parse(String(init.body)) as { code: string };
      return code === 'AIA-GOOD-CODE-0000-0000' ? json(201, { required: true, granted: true, used: 3, limit: 20, remaining: 17 }) : json(401, { error: 'That access code is not valid. Check it and try again.', code: 'access_required' });
    });
    vi.stubGlobal('fetch', fetch);
    render(<AccessGate><Remaining /></AccessGate>);
    const input = await screen.findByLabelText('Access code');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await userEvent.type(input, 'AIA-WRONG');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That access code is not valid');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    await userEvent.clear(input);
    await userEvent.type(input, 'AIA-GOOD-CODE-0000-0000{Enter}');
    expect(await screen.findByText('17 left')).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith('/api/access', expect.objectContaining({ method: 'POST' }));
    expect(localStorage.length + sessionStorage.length).toBe(0); // the code is never stored by the page
  });
});

describe('streamChat', () => {
  it('sends the question id and surfaces the quota error code with its friendly message', async () => {
    const message = 'You have used all 20 questions for this access code. Please contact the developer for additional access.';
    const fetch = vi.fn(async () => json(403, { error: message, code: 'quota_exhausted' }));
    vi.stubGlobal('fetch', fetch);
    const err = await streamChat({ message: 'q', questionId: 'qid-1' }, () => undefined, new AbortController().signal).catch((e: unknown) => e);
    expect(err).toMatchObject({ message, code: 'quota_exhausted' });
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ message: 'q', questionId: 'qid-1' });
  });
});
