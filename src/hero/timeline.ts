import { WALL_HEIGHT } from './framing';

// Hero build choreography as pure functions of time t (seconds): no clocks and no randomness, so any
// frame can be rendered by scrubbing (?hero-t=). Timings and eases come from the approved animatic
// (docs/hero-animation/animatic-reference.html: tierH(), pitch() and frameA()). The renderer's shaders
// read the same table through uniforms, so this file is the only source of the numbers.
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeO = (x: number) => 1 - (1 - clamp01(x)) ** 3;       // cubic ease-out: fast start, soft landing
export const easeQ = (x: number) => 1 - (1 - clamp01(x)) ** 2;       // quadratic ease-out
export const smooth = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k); };
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

export const BUILD = {
  pitch: { start: .05, end: .6, stripes: 14, gain: 1.15, lag: .9, fade: .25 }, // wipe w: stripe i shows (w·gain − (i/n)·lag) / fade, far → near
  markings: { start: .57, end: .85 },            // white lines fade in once the last stripe is down (animatic: w ≥ .95)
  // start = .55 + 1.5u' + .91ρ, then easeO over .7 s (animatic: .13 per ring × 7 rings). u' = (u − lead) / (1 − lead) measures
  // the sweep from the Südtribüne's front row (u ≈ .2, as in the animatic's tierH), so the first tiers rise at .55 s
  // rather than .85 s, which left the pitch alone for 0.3 s. The last tier still lands at 3.66 s, overlapping the façade.
  tiers: { start: .55, perU: 1.5, perRho: .91, rise: .7, lead: .2 },
  facade: { start: 3.4, end: 4.6 },               // uniform easeQ rise to full wall height
  roof: { start: 4.6, end: 5.8, drop: .75, fade: .45, rest: .10 }, // easeQ descent from rest + .75 × wall; fades in over the first 45% of the time (≈ 70% of the travel, opaque by 5.14 s); lands .10 × wall up, where the idle lift begins
  streaks: { in: .25, out: .55, length: [1.4, .3] }, // share of roof progress; length = (1.4·(1 − p) + .3) animatic units (1 unit = wall / 4.2)
  // Per-mast easeO rise, staggered North → South (near → far) by u; stays string from the tip after 45% of it. The rise
  // starts while the roof is still settling, and the near masts, standing clear of the façade, lead: the far masts are
  // hidden behind the roof until ≈ 5.85 s, so a 5.8 s South-first start left a dead beat after the landing.
  pylons: { start: 5.6, rise: .75, stagger: .15, stays: .45 },
  accent: { start: 6, peak: 6.25, end: 6.65 },    // --hero-pulse and the pylon flash: 0 → 1 → 0, about 650 ms
  ring: { start: 6.2, end: 7.3, from: 1, to: 14, peak: .6 }, // yellow ring on the plinth, metres beyond the façade; gone by 7.4 s. Peak .6: at full strength it read as a selection outline
  settled: 6.5,                                   // build complete; the idle state takes over from here
  end: 7.4,                                       // last frame that differs from the settled pose
} as const;
export const ANIMATIC_UNIT = WALL_HEIGHT / 4.2;   // the animatic's wall is 4.2 units tall

// Idle state, from BUILD.settled onwards (τ = t − 6.5). Every loop leaves 6.5 s with zero velocity, and the
// periods are deliberately unrelated (16 s against 21 s repeats only every 336 s), so no repeat is visible.
const DEG = Math.PI / 180;
export const IDLE = {
  start: BUILD.settled,
  roof: { mid: .18, swing: .08, period: 16 },    // lift = (mid − swing·cos(2πτ/16)) × wall: .10 → .26 → .10, the animatic's final frame is ≈ .26
  sway: { azimuth: 4 * DEG, period: 21, ease: 5 }, // camera azimuth ±4°; the amplitude eases in over 5 s, so the camera leaves 6.5 s at rest
  glint: { period: 28 / 3, offset: 4, sweep: .3, from: -.35, to: 1.35, width: .09, strength: .8 }, // highlight up the pylon masts every ≈ 9.3 s, first at t ≈ 10.5; travels over 30% of the period
  crowd: { start: 6, spread: .6, rise: .35 },     // South terrace marks stand up from 6.0 s, staggered by seed over .6 s, each over .35 s
  parallax: { azimuth: 3.5 * DEG, elevation: 1.5 * DEG, tau: .25, from: 6, to: 7 }, // pointer offset, critically damped (τ = 250 ms); influence eases in over 6–7 s
  underline: { start: 5.9, end: 6.6 },            // the yellow bar under "from every angle." sweeps in as the pylons land
  fps: 30,                                        // idle frame-rate cap; the build renders at the display rate
} as const;
// The one still pose shared by the poster, reduced motion, pausing and session-skip. It sits on the idle
// curve (τ = 84 s = 16·5.25 = 21·4 = 9⅓·9), so idle resumes from it without a jump: roof at mid-lift and
// rising, camera sway at zero, and the pylon glint resting above the masts.
export const STATIC_T = IDLE.start + 84;

export type BuildPhase = 'build' | 'settled' | 'idle';
export interface BuildState {
  t: number; phase: BuildPhase;
  pitch: number;          // wipe progress w in [0, 1]; per-stripe reveal is stripeReveal(w, order)
  markings: number;       // opacity of the white pitch lines
  facade: number;         // façade height as a share of the wall
  roofOffset: number;     // metres above the roof's rest position (ROOF_Y)
  roofOpacity: number;
  streakLength: number;   // metres
  streakOpacity: number;
  pulse: number;          // accent pulse (glow and pylon flash)
  ringRadius: number;     // metres beyond the façade outline
  ringOpacity: number;
  sway: number;           // camera azimuth offset, radians
  parallax: number;       // share of the pointer parallax let through, 0 during the build
  glint: number;          // pylon highlight centre as a share of mast height (off the mast outside the sweep)
  underline: number;      // accent underline scaleX
}

// Per-instance helpers, mirrored in the renderer's vertex shaders.
export const tierStart = (u: number, rho: number) => BUILD.tiers.start + BUILD.tiers.perU * Math.max(0, u - BUILD.tiers.lead) / (1 - BUILD.tiers.lead) + BUILD.tiers.perRho * rho;
export const tierProgress = (t: number, u: number, rho: number) => easeO((t - tierStart(u, rho)) / BUILD.tiers.rise);
export const stripeReveal = (w: number, order: number) => clamp01((w * BUILD.pitch.gain - order * BUILD.pitch.lag) / BUILD.pitch.fade);
export const pylonProgress = (t: number, u: number) => clamp01((t - BUILD.pylons.start - BUILD.pylons.stagger * (1 - u)) / BUILD.pylons.rise);
export const mastHeight = (p: number) => easeO(p);
export const stayReach = (p: number) => easeO((p - BUILD.pylons.stays) / (1 - BUILD.pylons.stays));

export const crowdRise = (t: number, delay: number) => easeO((t - IDLE.crowd.start - IDLE.crowd.spread * delay) / IDLE.crowd.rise);

// accentAt moves the accent (pulse, pylon flash and ring) so session-skip can play it once after its cross-fade.
export function buildState(t: number, accentAt: number = BUILD.accent.start): BuildState {
  const { roof, streaks, accent, ring } = BUILD, { roof: lift, sway, glint } = IDLE;
  const rp = ramp(t, roof.start, roof.end), travel = easeQ(rp), tau = Math.max(0, t - IDLE.start), a = t - (accentAt - accent.start);
  const pulse = a < accent.peak ? smooth(ramp(a, accent.start, accent.peak)) : 1 - smooth(ramp(a, accent.peak, accent.end));
  const q = ramp(a, ring.start, ring.end), cycle = ((tau - glint.offset) / glint.period % 1 + 1) % 1;
  return {
    t, phase: t < BUILD.settled ? 'build' : t < BUILD.end ? 'settled' : 'idle',
    pitch: ramp(t, BUILD.pitch.start, BUILD.pitch.end),
    markings: smooth(ramp(t, BUILD.markings.start, BUILD.markings.end)),
    facade: easeQ(ramp(t, BUILD.facade.start, BUILD.facade.end)),
    // The build lands the roof at rest (.10 × wall) with zero velocity by 5.8 s; the idle lift starts from the same value.
    roofOffset: WALL_HEIGHT * (t < IDLE.start ? roof.rest + roof.drop * (1 - travel) : lift.mid - lift.swing * Math.cos(2 * Math.PI * tau / lift.period)),
    // Smoothstep over time rather than travel: easeQ travel is fastest at the start, so a travel-based fade
    // put the whole 0 → 1 of this large, pale shape into 0.4 s (the largest frame difference of the build).
    roofOpacity: smooth(rp / roof.fade),
    streakLength: ANIMATIC_UNIT * (streaks.length[0] * (1 - travel) + streaks.length[1]),
    streakOpacity: .4 * smooth(rp / streaks.in) * (1 - smooth((rp - streaks.out) / (1 - streaks.out))),
    pulse,
    ringRadius: ring.from + (ring.to - ring.from) * easeO(q),
    ringOpacity: ring.peak * smooth(q / .08) * (1 - q) ** 2,
    sway: sway.azimuth * smooth(tau / sway.ease) * Math.sin(2 * Math.PI * tau / sway.period),
    parallax: smooth(ramp(t, IDLE.parallax.from, IDLE.parallax.to)),
    glint: glint.from + (glint.to - glint.from) * smooth(cycle / glint.sweep),
    underline: smooth(ramp(t, IDLE.underline.start, IDLE.underline.end)),
  };
}
