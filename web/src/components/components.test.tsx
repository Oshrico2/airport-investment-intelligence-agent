import { fireEvent, render, screen } from '@testing-library/react';
import type { ProviderInfo } from '../../../shared/api';
import { CodeTile } from './CodeTile';
import { ProviderPicker } from './ProviderPicker';
import { Delta, Narrative } from './ui';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener: () => {}, removeEventListener: () => {} }),
  });
});

describe('Narrative', () => {
  it('renders paragraphs, bullets and bold as text, never as HTML', () => {
    const { container } = render(<Narrative text={'HVN **leads**.\n\n- one\n- two <img src=x onerror=alert(1)>'} streaming={false} />);
    expect(container.querySelector('strong')?.textContent).toBe('leads');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/two <img/)).toBeInTheDocument();
  });
});

describe('Narrative mixed paragraphs', () => {
  it('keeps a list when a lead-in line precedes bullets (the Demo free-text reply)', () => {
    const demo = 'Demo mode (no AI) answers only the listed questions and does not interpret free text:\n- Which U.S. airports rank highest?\n- Rank the New England airports.\n- What share of Anchorage flights are long-haul?\nChoose Gemini or Claude to ask anything.';
    const { container } = render(<Narrative text={demo} streaming={false} />);
    expect([...screen.getByTestId('narrative').children].map((e) => e.tagName)).toEqual(['P', 'UL', 'P']);
    expect(container.querySelectorAll('li')).toHaveLength(3);
    expect(container.querySelector('li')?.textContent).toBe('Which U.S. airports rank highest?');
    expect(container.querySelector('p')?.textContent).toMatch(/^Demo mode \(no AI\) answers only/);
  });
  it('still joins wrapped prose lines into one paragraph and puts the caret at the very end', () => {
    const { container } = render(<Narrative text={'Line one\nline two\n- a\n- b'} streaming />);
    expect(container.querySelector('p')?.textContent).toBe('Line one line two');
    expect(container.querySelector('li:last-child [data-testid="caret"]')).not.toBeNull();
    expect(screen.getAllByTestId('caret')).toHaveLength(1);
  });
});

describe('CodeTile', () => {
  it('exposes the code to assistive tech and shows it immediately with reduced motion', () => {
    render(<CodeTile code="ANC" />);
    const tile = screen.getByRole('img', { name: 'ANC' });
    expect(tile.textContent).toBe('ANC');
  });
});

describe('Delta', () => {
  it('pairs the sign with an arrow so direction is not color-only', () => {
    const { container } = render(<Delta value={-0.76} />);
    expect(container.textContent).toContain('−0.76%');
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('ProviderPicker', () => {
  const providers: ProviderInfo[] = [
    { id: 'gemini', label: 'Gemini', available: true, model: 'gemini-3.5-flash-lite' },
    { id: 'claude', label: 'Claude', available: false, reason: 'Set ANTHROPIC_API_KEY in server/.env' },
    { id: 'demo', label: 'Demo', available: true },
  ];
  it('offers every provider, disables unconfigured ones with the reason, and reports the choice', () => {
    const picked: string[] = [];
    render(<ProviderPicker providers={providers} value="gemini" onChange={(p) => picked.push(p)} locked={false} />);
    expect(screen.getByRole('group', { name: 'Answer with' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'Gemini' })).toBeChecked();
    const claude = screen.getByRole('radio', { name: 'Claude' });
    expect(claude).toBeDisabled();
    expect(claude.closest('label')).toHaveAttribute('title', expect.stringContaining('ANTHROPIC_API_KEY'));
    fireEvent.click(screen.getByRole('radio', { name: 'Demo' }));
    expect(picked).toEqual(['demo']);
  });
  it('is locked once a conversation has an answer', () => {
    render(<ProviderPicker providers={providers} value="gemini" onChange={() => {}} locked />);
    expect(screen.getByRole('group', { name: /start a new analysis to switch/ })).toBeDisabled();
  });
});
