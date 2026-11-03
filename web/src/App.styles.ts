import styled, { css, keyframes } from 'styled-components';
import { Form as Composer, Hint as ComposerHint } from './components/Composer.styles';
import { National } from './components/NationalBoard.styles';
import { enter, fade } from './styles/shared.styles';

/* ───────────── Load choreography ─────────────
   One pass on first paint, about 1 s end to end: the mark flaps down like a board tile, the rail and evidence
   panel slide in from their edges, the home question rises, the composer's runway lights sweep once, and the
   departures and national rows settle top to bottom. Transform and opacity only; nothing waits on it. */
const markFlap = keyframes`
  from {
    opacity: 0;
    transform: perspective(120px) rotateX(-90deg);
  }
  60% {
    opacity: 1;
    transform: perspective(120px) rotateX(14deg);
  }
`;
const runway = keyframes`
  0% {
    opacity: 0;
    transform: scaleX(0);
  }
  30% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: scaleX(1);
  }
`;
/** Entrance with the given timing; with reduced motion the same element fades in, briefly (`delay` kept only where asked). */
const entrance = (timing: string, reducedDelay = '') => css`
  animation: ${enter} ${timing} backwards;
  @media (prefers-reduced-motion: reduce) {
    animation: ${fade} 200ms ease ${reducedDelay} backwards;
  }
`;
const fromRail = css`
  --enter-x: -10px;
  --enter-y: 0;
`;

/* ───────────── Shell ───────────── */
export const Shell = styled.div`
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr) 392px;
  height: 100dvh;
  overflow: hidden;
  @media (max-width: 1179px) {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
`;
export const Skip = styled.a`
  position: absolute;
  left: var(--s3);
  top: -40px;
  z-index: 10;
  padding: var(--s2) var(--s3);
  background: var(--signal);
  color: var(--signal-ink);
  border-radius: var(--radius);
  font-weight: 600;
  &:focus {
    top: var(--s3);
  }
`;

export const Rail = styled.aside`
  display: flex;
  flex-direction: column;
  gap: var(--s5);
  padding: var(--s5) var(--s3) var(--s4);
  background: var(--rail);
  border-right: 1px solid var(--line);
  @media (max-width: 1179px) {
    flex-direction: row;
    align-items: center;
    gap: var(--s3);
    padding: var(--s2) var(--s4);
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  @media (max-width: 759px) {
    flex-wrap: wrap;
    row-gap: var(--s2);
    padding: var(--s3);
    nav {
      order: 3;
      flex-basis: 100%;
    }
  }
`;
export const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: 0 var(--s2);
`;
export const BrandMark = styled.img`
  display: block;
  flex: none;
  width: 30px;
  height: 30px;
  transform-origin: 50% 0;
  animation: ${markFlap} 620ms var(--ease-out) backwards;
  @media (prefers-reduced-motion: reduce) {
    animation: ${fade} 200ms ease backwards;
  }
`;
export const BrandName = styled.span`
  font-size: var(--fs-sm);
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: 0.01em;
  ${fromRail}
  ${entrance('520ms var(--ease-out) 120ms')}
  @media (max-width: 1179px) {
    display: none;
  }
  @media (max-width: 759px) {
    display: inline;
    font-size: var(--fs-xs);
  }
`;
export const BrandAgent = styled.span`
  color: var(--text-2);
  font-weight: 500;
`;
export const Nav = styled.ul`
  list-style: none;
  padding: 0;
  display: grid;
  gap: 2px;
  @media (max-width: 1179px) {
    display: flex;
  }
`;
export const NavEntry = styled.li<{ $i: number }>`
  ${fromRail}
  ${(p) => entrance(`520ms var(--ease-out) ${180 + 40 * p.$i}ms`, `${180 + 40 * p.$i}ms`)}
`;
export const NavItem = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: var(--s3);
  width: 100%;
  padding: var(--s2) var(--s3);
  min-height: 40px;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-2);
  font-size: var(--fs-md);
  text-align: left;
  transition: background-color var(--t-fast) ease, color var(--t-fast) ease;
  &:hover {
    background: var(--raised);
    color: var(--text);
  }
  ${(p) =>
    p.$active &&
    css`
      && {
        background: var(--signal-soft);
        color: var(--signal);
      }
      font-weight: 600;
    `}
  @media (max-width: 1179px) {
    min-height: 36px;
    padding: var(--s1) var(--s3);
    white-space: nowrap;
  }
  @media (max-width: 759px) {
    span {
      font-size: var(--fs-sm);
    }
  }
`;
export const RailFoot = styled.div`
  margin-top: auto;
  display: grid;
  gap: var(--s3);
  padding: 0 var(--s2);
  font-size: var(--fs-xs);
  color: var(--text-2);
  ${fromRail}
  ${entrance('520ms var(--ease-out) 420ms')}
  @media (max-width: 1179px) {
    margin: 0 0 0 auto;
    display: flex;
  }
`;
const railStatus = css`
  display: flex;
  align-items: center;
  gap: var(--s2);
  flex-wrap: wrap;
  @media (max-width: 1179px) {
    white-space: nowrap;
  }
`;
const statusDot = css`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
`;
export const Mode = styled.span`
  ${railStatus}
`;
export const ModeDot = styled.span<{ $ai: boolean }>`
  ${statusDot}
  background: ${(p) => (p.$ai ? 'var(--signal)' : 'var(--muted)')};
`;
export const Freshness = styled.span`
  ${railStatus}
  @media (max-width: 999px) {
    display: none;
  }
`;
export const FreshnessDot = styled.span<{ $state: string }>`
  ${statusDot}
  background: ${(p) => (p.$state === 'current' ? 'var(--up)' : p.$state === 'newer-available' || p.$state === 'unreachable' ? 'var(--warning)' : 'var(--muted)')};
`;
export const FreshnessNote = styled.small`
  flex-basis: 100%;
  padding-left: 14px;
  color: var(--muted);
  @media (max-width: 1179px) {
    display: none;
  }
`;

export const Main = styled.main`
  overflow-y: auto;
  scroll-padding-bottom: 180px;
  &:focus-visible {
    outline: 2px solid var(--signal);
    outline-offset: -2px;
  }
`;
export const Side = styled.aside`
  overflow-y: auto;
  padding: var(--s5) var(--s5) var(--s6);
  background: var(--rail);
  border-left: 1px solid var(--line);
  --enter-x: 16px;
  --enter-y: 0;
  ${entrance('600ms var(--ease-out) 200ms')}
`;
export const SideHint = styled.div`
  display: grid;
  gap: var(--s3);
  color: var(--text-2);
  font-size: var(--fs-sm);
  h2 {
    color: var(--text);
    font-size: var(--fs-lg);
  }
`;

/* ───────────── Ask: first viewport ───────────── */
export const Disclosure = styled.p<{ $home?: boolean }>`
  margin-top: var(--s2);
  color: var(--muted);
  font-size: var(--fs-xs);
  ${(p) => p.$home && entrance('520ms var(--ease-out) 340ms')}
`;
export const QuotaNote = styled.p<{ $out?: boolean }>`
  margin-top: var(--s1);
  color: var(--text-2);
  font-size: var(--fs-xs);
  ${(p) =>
    p.$out &&
    css`
      margin-top: var(--s2);
      padding: var(--s2) var(--s3);
      border: 1px solid var(--signal-line);
      border-radius: var(--radius);
      background: var(--signal-soft);
      color: var(--text);
      font-size: var(--fs-sm);
    `}
`;
export const Ask = styled.div<{ $home: boolean }>`
  max-width: 900px;
  margin: 0 auto;
  padding: var(--s6) var(--s6) var(--s7);
  ${(p) => p.$home && 'padding-top: clamp(var(--s6), 9vh, 6rem);'}
  ${National} {
    margin-top: var(--s6);
  }
  @media (max-width: 759px) {
    padding: var(--s5) var(--s4) var(--s6);
    ${(p) => p.$home && 'padding-top: var(--s5);'}
  }
  ${(p) =>
    p.$home &&
    css`
      > ${Composer} {
        position: relative;
        ${entrance('640ms var(--ease-out) 250ms')}
      }
      > ${Composer}::before {
        content: '';
        position: absolute;
        top: -1px;
        left: var(--s3);
        right: var(--s3);
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--signal) 35%, var(--signal-hover) 70%, transparent);
        transform-origin: left;
        pointer-events: none;
        animation: ${runway} 1100ms var(--ease-out) 520ms both;
        @media (prefers-reduced-motion: reduce) {
          display: none;
        }
      }
    `}
`;
export const Hero = styled.header`
  h1 {
    font-size: var(--fs-3xl);
    font-weight: 600;
    letter-spacing: -0.025em;
    max-width: 18ch;
    --enter-y: 18px;
    ${entrance('700ms var(--ease-out) 80ms')}
  }
  @media (max-width: 759px) {
    h1 {
      font-size: var(--fs-2xl);
    }
  }
`;
export const HeroSub = styled.p`
  margin-top: var(--s3);
  max-width: 62ch;
  color: var(--text-2);
  font-size: var(--fs-lg);
  ${entrance('640ms var(--ease-out) 170ms')}
  @media (max-width: 759px) {
    font-size: var(--fs-md);
  }
`;

/* ───────────── Thread ───────────── */
export const ThreadHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--s4);
`;
export const ThreadTitle = styled.h1`
  font-size: var(--fs-xl);
`;
export const Thread = styled.div`
  display: grid;
  gap: var(--s6);
  padding-bottom: var(--s4);
`;
export const Dock = styled.div`
  position: sticky;
  bottom: 0;
  padding: var(--s3) 0 var(--s4);
  background: linear-gradient(to bottom, transparent, var(--ground) 18px);
  @media (max-width: 759px) {
    padding-bottom: calc(var(--s3) + env(safe-area-inset-bottom));
    ${Disclosure}, ${ComposerHint} {
      display: none;
    }
  }
`;
