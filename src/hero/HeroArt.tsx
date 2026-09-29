import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { fitView, plinthFaces, PLINTH_COLORS, SLOT_ASPECT, type P2 } from './framing';
import type { HeroStage, HeroStart } from './renderer';

// Spoiler-free first-paint placeholder: only the plinth silhouette (plus the CSS glow), never the
// finished stadium, so the build never appears to restart from a completed state.
const pts = (poly: readonly P2[]) => poly.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(' ');
function Plinth({ layout, aspect }: { layout: 'wide' | 'stacked'; aspect: number }) {
  const { top, sides } = plinthFaces(fitView(aspect));
  return <g className={`hero-placeholder__${layout}`}>
    {sides.map((side, i) => <polygon key={i} fill={PLINTH_COLORS.sides[i]} points={pts(side)}/>)}
    <polygon fill={PLINTH_COLORS.top} points={pts(top)}/>
  </g>;
}

// The poster is rendered for the 3:2 slot (scripts/render-hero-poster.cjs). In the 8:5 stacked slot it is
// scaled and cropped so its metres-per-pixel and centre match that slot's own camera fit exactly.
const WIDE = fitView(SLOT_ASPECT.wide), STACKED = fitView(SLOT_ASPECT.stacked);
const POSTER_FIT = { '--poster-w': `${WIDE.width / STACKED.width * 100}%`, '--poster-h': `${WIDE.height / STACKED.height * 100}%` } as CSSProperties;
const POSTER = './media/hero-stadium-poster.webp';

// Session state. Storage can be blocked (privacy modes): then every load is a first visit, with no errors.
const PLAYED = 'terrace:hero:played:v1', PAUSED = 'terrace:hero:paused:v1';
const read = (key: string) => { try { return sessionStorage.getItem(key) === '1'; } catch { return false; } };
const write = (key: string, on: boolean) => { try { if (on) sessionStorage.setItem(key, '1'); else sessionStorage.removeItem(key); } catch { /* blocked */ } };

// ?hero-t=<seconds> freezes the timeline at that time and renders one frame (tests, filmstrips, poster).
function frozenTime(search: string): number | null {
  const raw = new URLSearchParams(search).get('hero-t'), t = raw === null || raw.trim() === '' ? NaN : Number(raw);
  return Number.isFinite(t) && t >= 0 ? t : null;
}
// Devices that get the poster and never load WebGL: no WebGL2, Save-Data, or very low core count / memory.
function posterOnly() {
  const n = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  return typeof WebGL2RenderingContext === 'undefined' || n.connection?.saveData === true || (n.hardwareConcurrency ?? 8) <= 2 || (n.deviceMemory ?? 8) <= 2;
}
const reducedQuery = () => matchMedia('(prefers-reduced-motion: reduce)');

// Runs once the first frame has painted, on requestIdleCallback (≤ 1200 ms) or window load, whichever
// comes first, so the WebGL chunk never delays the headline or competes with the explorer chunk.
function afterFirstPaint(run: () => void) {
  let done = false, timer = 0, idle = 0;
  const idleApi = typeof requestIdleCallback === 'function';
  const cancel = () => {
    done = true; cancelAnimationFrame(frame); clearTimeout(timer); removeEventListener('load', go);
    if (idle) { if (idleApi) cancelIdleCallback(idle); else clearTimeout(idle); }
  };
  const go = () => { if (done) return; cancel(); run(); };
  const frame = requestAnimationFrame(() => { timer = window.setTimeout(() => {
    if (document.readyState === 'complete') return go();
    addEventListener('load', go);
    idle = idleApi ? requestIdleCallback(go, { timeout: 1200 }) : window.setTimeout(go, 1200);
  }); });
  return cancel;
}

// The explorer below starts its own WebGL engine shortly after the hero: an ≈ 80 ms model build, then a first
// 640k-triangle frame, which dropped two frames early in the pitch wipe. The hero mounts after the explorer's
// first frame (its data-draw-calls, read only) and one more frame, capped so a missing or failed explorer never
// holds it back. The placeholder is identical to the first frame and the build clock starts on that frame, so
// the wait shows nothing and costs no beats.
const EXPLORER_WAIT_MS = 1200;
function explorerStarted() {
  return new Promise<void>(resolve => {
    const drawn = () => document.querySelector<HTMLElement>('.scene-host')?.dataset.drawCalls !== undefined;
    let timer = 0;
    const done = () => { observer.disconnect(); clearTimeout(timer); requestAnimationFrame(() => requestAnimationFrame(() => resolve())); };
    const observer = new MutationObserver(() => { if (drawn()) done(); });
    if (drawn()) return done();
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-draw-calls'] });
    timer = window.setTimeout(done, EXPLORER_WAIT_MS);
  });
}

// Decorative slot for the hero stadium, plus its pause / replay controls (the only focusable content).
// The WebGL stage mounts its canvas here after first paint and cross-fades over the placeholder, or over
// the poster when the build is skipped (see .hero-art in refinements.css).
export function HeroArt() {
  const ref = useRef<HTMLDivElement>(null), stage = useRef<HeroStage | null>(null);
  // Decided once per page load. The first load in a session builds; later loads start settled.
  const [plan] = useState(() => {
    const frozen = frozenTime(location.search), dpr = Number(new URLSearchParams(location.search).get('hero-dpr')) || undefined;
    const paused = frozen === null && read(PAUSED), skip = frozen === null && read(PLAYED), reduced = frozen === null && reducedQuery().matches;
    // Reduced motion shows the still pose; if motion is allowed later, idle continues from it with no build.
    return { frozen, dpr, paused, reduced, start: (paused || reduced ? 'settled' : skip ? 'skip' : 'build') as HeroStart };
  });
  const [paused, setPaused] = useState(plan.paused);
  const [reduced, setReduced] = useState(plan.reduced);
  // Poster fallback: 'pending' shows the poster over the live canvas; 'done' once it has loaded (stage gone).
  const [fallback, setFallback] = useState<false | 'pending' | 'done'>(() => plan.frozen === null && posterOnly() ? 'done' : false);
  // The stage loads unless the poster has taken over; under reduced motion it waits until motion is allowed.
  const [live, setLive] = useState(() => plan.frozen !== null || !plan.reduced);
  const [ready, setReady] = useState(false);
  const pausedNow = useRef(paused); pausedNow.current = paused;

  useEffect(() => {
    const query = reducedQuery(), change = () => { setReduced(query.matches); if (!query.matches) setLive(true); };
    query.addEventListener('change', change); return () => query.removeEventListener('change', change);
  }, []);

  const mounted = live && fallback !== 'done';
  useEffect(() => {
    const host = ref.current; if (!host || !mounted) return;
    let alive = true;
    // Setup and teardown are idempotent, so StrictMode's double mount leaves exactly one context.
    const cancel = afterFirstPaint(() => void import('./renderer').then(async m => {
      if (plan.frozen === null) await explorerStarted();
      if (!alive) return;
      // Paused before the stage loaded: start on the settled composition rather than mid-build.
      stage.current = m.mountHero(host, {
        start: pausedNow.current && plan.start === 'build' ? 'settled' : plan.start, paused: pausedNow.current, frozen: plan.frozen, dpr: plan.dpr,
        onReady: () => { if (alive) setReady(true); },
        onPlayed: () => write(PLAYED, true),
        onFallback: () => { if (alive) setFallback(f => f || 'pending'); },
      });
      if (!stage.current) setFallback('done');
    }).catch(() => { if (alive) setFallback('done'); }));
    return () => { alive = false; cancel(); stage.current?.dispose(); stage.current = null; setReady(false); };
  }, [mounted, plan]);
  useEffect(() => { stage.current?.setPaused(paused); }, [paused]);
  useEffect(() => { stage.current?.motionChanged(); }, [reduced]);
  // Hand over to the poster: once it has loaded, let it fade in over the live canvas, then drop the stage.
  const [posterLoaded, setPosterLoaded] = useState(false);
  useEffect(() => {
    if (fallback !== 'pending' || !posterLoaded) return;
    const timer = window.setTimeout(() => setFallback('done'), 220); return () => clearTimeout(timer);
  }, [fallback, posterLoaded]);

  // Still states the stage does not draw: the poster stands for the settled build, so the underline is present.
  const still = fallback === 'done' || (!mounted && reduced);
  const settledStart = plan.start !== 'build';
  useLayoutEffect(() => {
    const section = ref.current?.closest<HTMLElement>('.intro');
    if (section && plan.frozen === null && (still || settledStart || fallback)) section.style.setProperty('--hero-underline', '1');
  }, [still, settledStart, fallback, plan.frozen]);
  // Passive, and declared after the mount effect, so it runs after the stage's disposal has reset the phase.
  useEffect(() => {
    const host = ref.current; if (!host || plan.frozen !== null || !still) return;
    host.dataset.heroPhase = 'static'; if (fallback) host.dataset.heroQuality = 'poster';
  }, [still, fallback, plan.frozen]);

  const posterWanted = plan.frozen === null && (settledStart || reduced || fallback !== false);
  const posterOn = fallback !== false || (!ready && (settledStart || reduced));
  const controls = plan.frozen === null && fallback === false;
  const togglePause = () => { const next = !paused; setPaused(next); write(PAUSED, next); };
  const replay = () => { setPaused(false); write(PAUSED, false); stage.current?.replay(); };

  return <div ref={ref} className="hero-art" data-hero-phase="placeholder" data-hero-poster={posterOn ? 'on' : undefined} data-hero-poster-loaded={posterLoaded || undefined} data-hero-start={plan.start}>
    <svg className="hero-placeholder" viewBox="0 0 1 1" preserveAspectRatio="none" focusable="false" aria-hidden="true">
      <Plinth layout="wide" aspect={SLOT_ASPECT.wide}/>
      <Plinth layout="stacked" aspect={SLOT_ASPECT.stacked}/>
    </svg>
    {posterWanted && <img className="hero-poster" src={POSTER} alt="" aria-hidden="true" decoding="async" style={POSTER_FIT}
      onLoad={() => setPosterLoaded(true)} onError={() => setFallback(f => f && 'done')}/>}
    {controls && <div className="hero-controls" role="group" aria-label="Stadium animation">
      <button type="button" aria-pressed={paused} onClick={togglePause}>
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">{paused ? <path d="M4 2.5v11l9-5.5z"/> : <path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z"/>}</svg>
        <span className="hero-controls__label">{paused ? 'Play animation' : 'Pause animation'}</span>
      </button>
      <button type="button" className="hero-replay" onClick={replay}>
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 2.5a5.5 5.5 0 1 1-5.2 3.7l1.4.5A4 4 0 1 0 8 4v2L4.5 3.25 8 .5z"/></svg>
        <span className="hero-controls__label">Replay</span>
      </button>
    </div>}
  </div>;
}
