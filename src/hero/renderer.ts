import * as THREE from 'three';
import { BOWL, HERO_VIEW, PLINTH, ROOF_Y, fitView, viewBasis } from './framing';
import { buildHeroStadium } from './heroStadium';
import { BUILD, IDLE, STATIC_T, buildState } from './timeline';

// WebGL stage for the hero stadium. Lazy-loaded by HeroArt after first paint. The build is a pure
// function of the clock t (timeline.ts): tiers, pitch, façade and pylons grow in vertex shaders from
// uT and each instance's aBuild = (u, rho, stand), so scrubbing any time costs one frame.
export type HeroPhase = 'placeholder' | 'build' | 'settled' | 'idle' | 'static' | 'paused';
const YELLOW = 0xffd900, EARLY = 0x4b514d; // animatic accent yellow; tier tops read dark until they have height
const FLASH = .55;                          // pylon emissive boost at the peak of the accent pulse
const GLOW = .6;                            // self-light on yellow surfaces (seats, steps, pylons)
const CAMERA_DISTANCE = 600;                // orthographic, so distance only places the depth range

// How the stage starts: the full build, the settled pose with the accent played once (session-skip), or
// the settled pose quietly (paused on load, or reduced motion switched off after a still frame).
export type HeroStart = 'build' | 'skip' | 'settled';
export interface HeroOptions {
  start: HeroStart; paused: boolean;
  frozen: number | null;      // ?hero-t: render that one time and nothing else
  dpr?: number;               // ?hero-dpr, frozen only: the poster is rendered at 2× the largest slot
  onReady(): void;            // first frame drawn (the canvas is showing)
  onPlayed(): void;           // the build passed PLAYED_AT: later loads this session skip it
  onFallback(): void;         // the context was lost, or the quality guard gave up: show the poster
}
const PLAYED_AT = 3;          // seconds of build after which the session counts as played
const FADE_MS = 200;          // cross-fade for pause-to-settled and replay
// Adaptive quality guard: frame-interval p95 over the first 1.5 s of the build, then 1 s more at DPR 1.
const GUARD = { first: 1500, second: 1000, p95: 50, skip: 3 };
const p95 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * .95))] ?? 0; };

// Shared uniforms: every patched material reads the same objects, so one write per frame drives them all.
const uniforms = () => ({
  uT: { value: 0 },
  uWave: { value: new THREE.Vector4(BUILD.tiers.start, BUILD.tiers.perU, BUILD.tiers.perRho, BUILD.tiers.rise) },
  uLead: { value: BUILD.tiers.lead },
  uFacade: { value: 0 },
  uPitch: { value: new THREE.Vector4() },  // wipe progress, u of the far and near stripes, last stripe order
  uPitchK: { value: new THREE.Vector3(BUILD.pitch.gain, BUILD.pitch.lag, BUILD.pitch.fade) },
  uPylon: { value: new THREE.Vector4(BUILD.pylons.start, BUILD.pylons.rise, BUILD.pylons.stagger, BUILD.pylons.stays) },
  uRoofLift: { value: 0 },
  uFlash: { value: 0 },
  uGlow: { value: GLOW },
  uEarly: { value: new THREE.Color(EARLY) },
  uCrowd: { value: new THREE.Vector3(IDLE.crowd.start, IDLE.crowd.spread, IDLE.crowd.rise) },
  uGlint: { value: new THREE.Vector3(IDLE.glint.from, IDLE.glint.width, IDLE.glint.strength) }, // centre (share of mast height), width, strength
});
type Uniforms = ReturnType<typeof uniforms>;

const VERTEX_HEAD = /* glsl */`
attribute vec3 aBuild;
uniform float uT, uFacade, uRoofLift, uLead;
uniform vec4 uWave, uPitch, uPylon;
uniform vec3 uPitchK, uCrowd;
varying float vReveal, vHero;
float heroEaseO(float x) { x = 1.0 - clamp(x, 0.0, 1.0); return 1.0 - x * x * x; }`;
const FRAGMENT_HEAD = /* glsl */`
uniform vec3 uEarly, uGlint;
uniform float uFlash, uGlow;
varying float vReveal, vHero;
// Linear-space yellow mask: seats, steps and pylons, but not the olive terrace risers or grey concrete.
float heroYellow(vec3 c) { return smoothstep(0.25, 0.45, min(c.r, c.g) - c.b); }`;
// Instances with no height yet are moved outside the clip volume, so nothing flat ever marks the plinth.
const PROJECT = /* glsl */`
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
  if (vReveal <= 0.0) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);`;
// Per-kind attribute declarations.
const HEAD: Partial<Record<keyof typeof VERTEX, string>> = { crowd: 'attribute vec4 aCrowd;' };
const VERTEX = {
  // Tier wave: each column grows from the plinth (world-Y scale about y = 0), start .55 + 1.5u' + .91ρ (tierStart).
  wave: /* glsl */`
  vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
  float k = heroEaseO((uT - (uWave.x + uWave.y * max(0.0, aBuild.x - uLead) / (1.0 - uLead) + uWave.z * aBuild.y)) / uWave.w);
  mvPosition.y *= k;
  vReveal = k;${PROJECT}`,
  // Façade: one uniform rise.
  facade: /* glsl */`
  vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
  mvPosition.y *= uFacade;
  vReveal = uFacade;${PROJECT}`,
  // Pitch: stripes fade in far → near, ordered by u; the surround takes the first stripe's slot.
  pitch: /* glsl */`
  vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
  float order = clamp((aBuild.x - uPitch.y) / (uPitch.z - uPitch.y), 0.0, 1.0) * uPitch.w;
  vReveal = clamp((uPitch.x * uPitchK.x - order * uPitchK.y) / uPitchK.z, 0.0, 1.0);${PROJECT}`,
  // Pylons: masts (rho 0) grow from the ground, North (near) first; stays (rho 1) string from the moving tip to their roof
  // anchor, which follows the roof lift. Cylinder local y runs -0.5 (tip) → +0.5 (anchor).
  pylon: /* glsl */`
  float p = clamp((uT - uPylon.x - uPylon.z * (1.0 - aBuild.x)) / uPylon.y, 0.0, 1.0), mast = heroEaseO(p); // near (North) masts lead
  vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
  if (aBuild.y < 0.5) { mvPosition.y *= mast; vReveal = mast; }
  else {
    vec3 tip = (instanceMatrix * vec4(0.0, -0.5, 0.0, 1.0)).xyz, anchor = (instanceMatrix * vec4(0.0, 0.5, 0.0, 1.0)).xyz;
    float s = transformed.y + 0.5, reach = heroEaseO((p - uPylon.w) / (1.0 - uPylon.w));
    vec3 radial = mvPosition.xyz - mix(tip, anchor, s);
    mvPosition.xyz = mix(vec3(tip.x, tip.y * mast, tip.z), anchor + vec3(0.0, uRoofLift, 0.0), s * reach) + radial;
    vReveal = reach;
  }
  vHero = aBuild.y < 0.5 ? transformed.y + 0.5 : -1.0; // mast height share for the idle glint (stays: none)${PROJECT}`,
  // Crowd: flecks stand up from 6.0 s (seeded stagger), then twinkle on two unrelated sines per fleck.
  crowd: /* glsl */`
  float k = heroEaseO((uT - uCrowd.x - uCrowd.y * aCrowd.x) / uCrowd.z);
  float s = sin(uT * (0.8 + 1.6 * aCrowd.w) + aCrowd.y) + 0.65 * sin(uT * (2.3 + 1.9 * fract(aCrowd.w * 7.31)) + aCrowd.z);
  vHero = smoothstep(0.55, 1.3, s);
  vec4 mvPosition = instanceMatrix * vec4(transformed.x, transformed.y * k, transformed.z, 1.0);
  vReveal = k;${PROJECT}`,
};
// ACES compresses saturated yellow toward olive, so yellow surfaces carry a little self-light (uGlow)
// to hold the brand yellow while concrete, roof and pitch keep the matte lighting.
const FRAGMENT: Partial<Record<keyof typeof VERTEX, [string, string][]>> = {
  wave: [['#include <color_fragment>', 'vec3 heroAlbedo = diffuseColor.rgb;\ndiffuseColor.rgb = mix(uEarly, diffuseColor.rgb, smoothstep(0.0, 0.3, vReveal));'],
    ['#include <emissivemap_fragment>', 'totalEmissiveRadiance += heroAlbedo * uGlow * heroYellow(heroAlbedo) * smoothstep(0.1, 0.6, vReveal);']],
  pitch: [['#include <color_fragment>', 'diffuseColor.a *= vReveal;']],
  pylon: [['#include <emissivemap_fragment>', 'totalEmissiveRadiance += diffuseColor.rgb * (uGlow + uFlash + uGlint.z * exp(-pow((vHero - uGlint.x) / uGlint.y, 2.0)));']],
  crowd: [['#include <color_fragment>', 'diffuseColor.rgb = mix(diffuseColor.rgb * 0.72, vec3(1.0, 0.95, 0.75), 0.3 * vHero);'],
    ['#include <emissivemap_fragment>', 'totalEmissiveRadiance += diffuseColor.rgb * 0.25 * vHero;']],
};

function patch(material: THREE.Material, key: keyof typeof VERTEX, shared: Uniforms) {
  material.customProgramCacheKey = () => `hero-${key}`;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>${VERTEX_HEAD}${HEAD[key] ?? ''}`).replace('#include <project_vertex>', VERTEX[key]);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>${FRAGMENT_HEAD}`);
    for (const [anchor, code] of FRAGMENT[key] ?? []) shader.fragmentShader = shader.fragmentShader.replace(anchor, `${anchor}\n${code}`);
  };
}

// The accent ring: a band on the plinth top at a fixed distance outside the rounded façade outline.
function accentRing() {
  const geometry = new THREE.PlaneGeometry(PLINTH.halfX * 2, PLINTH.halfZ * 2).rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(YELLOW) }, uRadius: { value: 0 }, uOpacity: { value: 0 }, uBowl: { value: new THREE.Vector3(BOWL.cornerX, BOWL.cornerZ, BOWL.wallRadius) }, uPlinth: { value: new THREE.Vector2(PLINTH.halfX, PLINTH.halfZ) } },
    vertexShader: /* glsl */`
      varying vec2 vXZ;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor, uBowl; uniform vec2 uPlinth; uniform float uRadius, uOpacity;
      varying vec2 vXZ;
      void main() {
        vec2 q = abs(vXZ) - uBowl.xy;
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uBowl.z, x = d - uRadius, aa = fwidth(d);
        float core = 1.0 - smoothstep(0.3, 0.3 + 0.5 + aa, abs(x)); // a fine line: a bold band read as a selection outline
        float trail = x < 0.0 ? 0.3 * exp(x / 2.5) : 0.0;
        float edge = smoothstep(0.0, 3.0, min(uPlinth.x - abs(vXZ.x), uPlinth.y - abs(vXZ.y))) * step(0.0, d);
        gl_FragColor = vec4(uColor, (core + trail) * uOpacity * edge);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'hero-accent-ring'; mesh.position.y = .03; mesh.renderOrder = -1;
  return mesh;
}

// Faint yellow speed lines rising from the roof rim while it descends. Each fades out along its length
// (vertex alpha), so they read as motion trails rather than a row of solid posts on the rim.
function roofStreaks() {
  const geometry = new THREE.BoxGeometry(.4, 1, .4).translate(0, .5, 0), y = geometry.getAttribute('position');
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: y.count }, (_, i) => [1, 1, 1, (1 - y.getY(i)) ** 1.6]).flat(), 4));
  const points: [number, number][] = [], per = 8, r = BOWL.roofRadius;
  for (const [sx, sz, a] of [[1, 1, 0], [-1, 1, .5], [-1, -1, 1], [1, -1, 1.5]]) for (let i = 0; i < per; i++) {
    const t = (a + (i + .5) / per * .5) * Math.PI; points.push([sx * BOWL.cornerX + r * Math.cos(t), sz * BOWL.cornerZ + r * Math.sin(t)]);
  }
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color: YELLOW, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }), points.length);
  const m = new THREE.Matrix4(); points.forEach(([x, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, 0, z)));
  mesh.name = 'hero-roof-streaks'; mesh.position.y = ROOF_Y + .35; mesh.renderOrder = 1; mesh.frustumCulled = false;
  return mesh;
}

// Critically damped follow (the exact solution, so any frame interval is stable): weighty, never overshoots.
function follow(x: number, v: number, target: number, omega: number, dt: number): [number, number] {
  const d = x - target, e = Math.exp(-omega * dt), k = (v + omega * d) * dt;
  return [target + (d + k) * e, (v - omega * k) * e];
}
const clamp1 = (x: number) => Math.min(1, Math.max(-1, x));

export class HeroStage {
  private renderer: THREE.WebGLRenderer; private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, CAMERA_DISTANCE - 300, CAMERA_DISTANCE + 300);
  private hero = buildHeroStadium(); private shared = uniforms();
  private ring = accentRing(); private streaks = roofStreaks();
  private roofMaterials: THREE.Material[];
  private frozen: number | null; private reduce = matchMedia('(prefers-reduced-motion: reduce)'); private stacked = matchMedia('(max-width: 959px)');
  private fine = matchMedia('(pointer: fine)');
  private paused: boolean; private reduced = this.reduce.matches; private accentAt: number = BUILD.accent.start; private played: boolean; private dprCap = Infinity;
  private guard = { stage: 0, from: 0, seen: 0, samples: [] as number[] }; // stage 0: full DPR, 1: DPR 1, 2: done
  private snapshot: HTMLCanvasElement | null = null; private ready = false; private warmed = false; private compiled = false;
  private clock = 0; private previous = 0; private raf = 0; private frames = 0; private onscreen = false; private sized = false; private disposed = false;
  private size = ''; private stale = true; // stale: the pose or the canvas changed since the last draw
  // Pointer parallax: target (tx, ty) in [-1, 1] across the hero section, followed by (x, y) with velocity (vx, vy).
  private pointer = { tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0 };
  private section: HTMLElement; private underline: HTMLElement; private glowHighlight: HTMLElement;
  private resize: ResizeObserver; private intersection: IntersectionObserver;
  constructor(private host: HTMLElement, private options: HeroOptions) {
    this.frozen = options.frozen; this.paused = options.paused; this.played = options.start !== 'build';
    this.section = host.closest<HTMLElement>('.intro') ?? host;
    this.underline = this.section.querySelector<HTMLElement>('.hero-underline')!;
    this.glowHighlight = host.querySelector<HTMLElement>('.hero-glow__highlight')!;
    // Session-skip, pause-on-load and a late reduced-motion switch-off all start on the still pose.
    if (options.start !== 'build') this.clock = STATIC_T;
    if (options.start === 'skip' && !options.paused) this.accentAt = STATIC_T + FADE_MS / 1000;
    if (this.frozen !== null && options.dpr) this.dprCap = options.dpr;
    host.dataset.heroQuality = 'full';
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0, 0); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.25;
    const canvas = this.renderer.domElement; canvas.className = 'hero-canvas'; canvas.setAttribute('aria-hidden', 'true');
    canvas.addEventListener('webglcontextlost', this.contextLost);
    const { parts, roofSlab, roof } = this.hero, s = this.shared;
    patch(parts.tiers.mesh.material as THREE.Material, 'wave', s);
    patch(parts.crowd.mesh.material as THREE.Material, 'crowd', s);
    patch(parts.facade.mesh.material as THREE.Material, 'facade', s);
    patch(parts.pitch.mesh.material as THREE.Material, 'pitch', s);
    patch(parts.pylons.mesh.material as THREE.Material, 'pylon', s);
    // The far stripe (z = 48.75) leads the wipe, the near stripe (z = −48.75) closes it.
    s.uPitch.value.set(0, this.hero.uAt(48.75), this.hero.uAt(-48.75), (BUILD.pitch.stripes - 1) / BUILD.pitch.stripes);
    // Pitch and roof stay in the transparent pass for the whole build (alpha reaches exactly 1), so
    // fading never swaps shader programs mid-animation. The roof writes depth once it is opaque.
    for (const part of [parts.pitch, parts.markings]) { const m = part.mesh.material as THREE.Material; m.transparent = true; part.mesh.renderOrder = -2; }
    this.roofMaterials = [roofSlab.material as THREE.Material, parts.roof.mesh.material as THREE.Material, parts.truss.mesh.material as THREE.Material];
    for (const m of this.roofMaterials) m.transparent = true;
    roof.add(this.streaks);
    this.scene.add(this.hero.group, this.ring);
    // The explorer's light colours and sun direction at lower intensity: its 2.7 / 3.1 rig lifts the roof
    // to near-white and washes the pitch out against the hero black (animatic roof ≈ #b5bbb6).
    this.scene.add(new THREE.HemisphereLight(0xd6e8f0, 0x444333, 1.3));
    const sun = new THREE.DirectionalLight(0xfff2ce, 2.6); sun.position.set(-70, 140, 80); this.scene.add(sun);
    host.appendChild(canvas);
    // Parallax listens on the whole hero section, not the canvas (which ignores the pointer).
    this.section.addEventListener('pointermove', this.point); this.section.addEventListener('pointerleave', this.leave);
    this.resize = new ResizeObserver(this.fit); this.resize.observe(host);
    this.intersection = new IntersectionObserver(entries => { this.onscreen = entries[entries.length - 1].isIntersecting; this.wake(); }); this.intersection.observe(host);
    document.addEventListener('visibilitychange', this.wake);
    this.reduce.addEventListener('change', this.motionChanged);
    if (this.frozen !== null) host.addEventListener('hero-capture', this.capture);
    // Link every shader program off the main thread (KHR_parallel_shader_compile) before the first frame.
    // The placeholder is identical to that frame and the build clock only starts on it, so waiting costs no beats.
    this.renderer.compileAsync(this.scene, this.camera).then(() => { this.compiled = true; this.request(); }, () => { this.compiled = true; this.request(); });
    this.fit();
  }
  // Pausing during the build (or the accents) cross-fades to the still pose; pausing in idle freezes the pose.
  setPaused(paused: boolean) {
    if (paused === this.paused || this.disposed) return;
    this.paused = paused;
    if (paused && this.clock < BUILD.end && this.frozen === null && !this.reduce.matches) this.cut(STATIC_T);
    this.stale = true; this.wake();
  }
  // Plays the full build again from 0, cross-fading away from the current pose.
  replay() {
    if (this.disposed || this.frozen !== null || this.reduce.matches) return;
    this.paused = false; this.cut(0); this.stale = true; this.wake();
  }
  // Jump to time t behind a 200 ms snapshot cross-fade (no hard cut). The underline eases with it.
  private cut(t: number) {
    if (this.ready) {
      const canvas = this.renderer.domElement, snap = this.snapshot ??= document.createElement('canvas');
      this.renderer.render(this.scene, this.camera); // redraw so the drawing buffer is valid in this task
      snap.className = 'hero-snapshot'; snap.setAttribute('aria-hidden', 'true'); snap.width = canvas.width; snap.height = canvas.height;
      snap.getContext('2d')?.drawImage(canvas, 0, 0); this.host.appendChild(snap);
      snap.getAnimations().forEach(a => a.cancel());
      snap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: 'forwards' }).onfinish = () => snap.remove();
      this.section.dataset.heroCut = ''; window.setTimeout(() => delete this.section.dataset.heroCut, FADE_MS);
    }
    this.clock = t; this.accentAt = BUILD.accent.start; this.previous = 0;
  }
  private get still() { return this.frozen !== null || this.reduce.matches || this.paused; }
  private get running() { return !this.still && this.onscreen && document.visibilityState === 'visible'; }
  private wake = () => { this.previous = 0; this.request(); };
  // Reduced motion switched on: an instant still frame (no fade). Switched off: idle resumes from that pose.
  // The media query's change event is not always delivered to this listener, so frames also compare the
  // value (see frame) and HeroArt calls motionChanged from its own listener.
  motionChanged = () => {
    this.reduced = this.reduce.matches;
    if (this.reduced && this.frozen === null) { this.clock = STATIC_T; this.accentAt = BUILD.accent.start; }
    this.stale = true; this.wake();
  };
  private request = () => { if (!this.disposed && !this.raf) this.raf = requestAnimationFrame(this.frame); };
  // Fine pointers only: touch and coarse pointers never move the camera.
  private point = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || !this.fine.matches) return;
    const r = this.section.getBoundingClientRect();
    this.pointer.tx = clamp1((e.clientX - r.left) / r.width * 2 - 1); this.pointer.ty = clamp1((e.clientY - r.top) / r.height * 2 - 1);
  };
  private leave = () => { this.pointer.tx = 0; this.pointer.ty = 0; };
  private fit = () => {
    const { width, height } = this.host.getBoundingClientRect();
    const dpr = this.frozen !== null && this.options.dpr ? this.options.dpr : Math.min(devicePixelRatio, this.stacked.matches ? 1.4 : 1.75, this.dprCap);
    const size = `${width}×${height}@${dpr}`; if (!width || !height || size === this.size) return;
    this.size = size; this.stale = true;
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(width, height, false);
    // The frustum fits every idle pose (framing.ts ENVELOPE) and stays fixed while the camera orbits the
    // stadium's vertical axis, so sway and parallax turn the diorama without ever zooming or clipping it.
    const view = fitView(width / height), c = this.camera, [cx, cy] = view.center;
    [c.left, c.right, c.top, c.bottom] = [cx - view.width / 2, cx + view.width / 2, cy + view.height / 2, cy - view.height / 2];
    c.updateProjectionMatrix();
    this.sized = true; this.request();
  };
  private frame = (now: number) => {
    this.raf = 0; if (this.disposed || !this.sized || !this.compiled) return;
    if (this.reduce.matches !== this.reduced) return this.motionChanged();
    let t: number, phase: HeroPhase, dt = 0;
    if (this.still) {
      // Frozen and reduced-motion poses only redraw when the canvas or the motion setting changed.
      if (!this.stale) return;
      if (this.frozen !== null) { t = this.frozen; phase = buildState(t).phase; }
      else if (this.reduce.matches) { t = STATIC_T; phase = 'static'; }
      else { t = this.clock; phase = 'paused'; }
    } else {
      // The clock starts on the first frame rendered while the slot is visible, and only runs while it is.
      if (!this.running) { this.previous = 0; return; }
      // Once the accents are over, idle draws at most 30 fps; the build draws every display frame.
      if (this.previous && this.clock >= BUILD.end && now - this.previous < 1000 / IDLE.fps - 4) return this.request();
      if (this.previous && this.clock < BUILD.settled && this.guardFrame(now - this.previous, now)) return;
      dt = this.previous ? Math.min((now - this.previous) / 1000, .06) : 0; this.previous = now;
      this.clock += dt; t = this.clock; phase = buildState(t, this.accentAt).phase;
      this.follow(dt);
      if (!this.played && t >= PLAYED_AT) { this.played = true; this.options.onPlayed(); }
    }
    this.apply(t); this.renderer.render(this.scene, this.camera); this.stale = false;
    const host = this.host; host.dataset.heroFrame = String(++this.frames); host.dataset.heroPhase = phase;
    if (!this.ready) { this.ready = true; host.dataset.heroReady = ''; this.options.onReady(); }
    if (!this.still) this.request();
  };
  // Returns true when the guard has given up: the stage jumps to the still pose and hands over to the poster.
  private guardFrame(interval: number, now: number) {
    const g = this.guard; if (g.stage > 1) return false;
    if (g.seen++ < GUARD.skip) { g.from = now; return false; } // the first frames carry shader compilation
    g.samples.push(interval);
    if (now - g.from < (g.stage ? GUARD.second : GUARD.first)) return false;
    const slow = p95(g.samples) > GUARD.p95; g.samples = []; g.from = now;
    if (!slow) { g.stage = 2; return false; }
    if (g.stage === 0) { g.stage = 1; this.dprCap = 1; this.host.dataset.heroQuality = 'reduced'; this.fit(); return false; }
    g.stage = 2; this.host.dataset.heroQuality = 'poster';
    this.paused = true; this.cut(STATIC_T); this.stale = true; this.request(); this.options.onFallback();
    return true;
  }
  private follow(dt: number) {
    const p = this.pointer, omega = 1 / IDLE.parallax.tau;
    [p.x, p.vx] = follow(p.x, p.vx, p.tx, omega, dt); [p.y, p.vy] = follow(p.y, p.vy, p.ty, omega, dt);
  }
  // Pose the scene at time t. Everything is continuous in t, so there is nothing to pop.
  private apply(t: number) {
    const s = buildState(t, this.accentAt), u = this.shared, { parts, roof } = this.hero;
    // The first frame draws every part, so each shader program (and its GPU pipeline) is built before the
    // canvas has faded in over the identical placeholder, not as a visible hitch when that part first
    // appears. Anything the visibility gates below would hide is culled in its vertex shader or has zero
    // opacity at that t, so the warm-up frame looks exactly like the gated one.
    const all = !this.warmed; this.warmed = true;
    u.uT.value = t; u.uFacade.value = s.facade; u.uPitch.value.x = s.pitch; u.uRoofLift.value = s.roofOffset; u.uFlash.value = s.pulse * FLASH; u.uGlint.value.x = s.glint;
    parts.pitch.mesh.visible = all || s.pitch > 0; parts.tiers.mesh.visible = all || t > BUILD.tiers.start; parts.facade.mesh.visible = all || s.facade > 0; parts.pylons.mesh.visible = all || t > BUILD.pylons.start;
    parts.crowd.mesh.visible = all || t > IDLE.crowd.start;
    (parts.markings.mesh.material as THREE.Material).opacity = s.markings; parts.markings.mesh.visible = all || s.markings > 0;
    roof.position.y = s.roofOffset; roof.visible = all || s.roofOpacity > 0;
    for (const m of this.roofMaterials) { m.opacity = s.roofOpacity; m.depthWrite = s.roofOpacity >= 1; }
    this.streaks.visible = all || s.streakOpacity > .002; this.streaks.scale.y = s.streakLength; (this.streaks.material as THREE.Material).opacity = s.streakOpacity;
    const ring = this.ring.material as THREE.ShaderMaterial; ring.uniforms.uRadius.value = s.ringRadius; ring.uniforms.uOpacity.value = s.ringOpacity; this.ring.visible = all || s.ringOpacity > .002;
    // Camera: idle sway plus the damped pointer offset (let in over 6–7 s), orbiting the vertical axis.
    const p = this.pointer, k = this.still ? 0 : s.parallax, c = this.camera;
    const basis = viewBasis(HERO_VIEW.azimuth + s.sway + k * p.x * IDLE.parallax.azimuth, HERO_VIEW.elevation - k * p.y * IDLE.parallax.elevation);
    c.position.set(...basis.dir).multiplyScalar(CAMERA_DISTANCE); c.up.set(...basis.up); c.lookAt(0, 0, 0);
    // Animate the actual elements so timeline updates do not invalidate styles across the whole hero section.
    this.glowHighlight.style.opacity = s.pulse.toFixed(3);
    this.underline.style.transform = `scaleX(${s.underline.toFixed(3)})`;
    this.host.dataset.heroT = t.toFixed(3);
  }
  // ?hero-t only: re-render and encode the frame in the same task, so the drawing buffer is intact (poster script).
  private capture = (event: Event) => {
    const { type = 'image/webp', quality = .9 } = (event as CustomEvent).detail ?? {};
    this.apply(this.frozen ?? STATIC_T); this.renderer.render(this.scene, this.camera);
    this.renderer.domElement.toBlob(blob => this.host.dispatchEvent(new CustomEvent('hero-captured', { detail: blob })), type, quality);
  };
  // A lost context gets no error UI (the art is decorative): the loop stops and the poster takes over.
  private contextLost = (event: Event) => {
    event.preventDefault(); cancelAnimationFrame(this.raf); this.raf = 0; this.sized = false; this.size = '';
    delete this.host.dataset.heroReady; this.host.dataset.heroQuality = 'poster'; this.options.onFallback();
  };
  dispose() {
    if (this.disposed) return; this.disposed = true;
    cancelAnimationFrame(this.raf); this.resize.disconnect(); this.intersection.disconnect();
    document.removeEventListener('visibilitychange', this.wake); this.reduce.removeEventListener('change', this.motionChanged);
    this.section.removeEventListener('pointermove', this.point); this.section.removeEventListener('pointerleave', this.leave);
    this.host.removeEventListener('hero-capture', this.capture); this.snapshot?.remove();
    this.hero.dispose();
    for (const mesh of [this.ring, this.streaks]) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    this.streaks.dispose();
    const canvas = this.renderer.domElement; canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.renderer.dispose(); this.renderer.forceContextLoss(); canvas.remove();
    // The underline is left as drawn: HeroArt owns it once the stage is gone (the poster is the settled state).
    const host = this.host; delete host.dataset.heroReady; delete host.dataset.heroFrame; delete host.dataset.heroT; host.dataset.heroPhase = 'placeholder';
    this.section.style.removeProperty('--hero-pulse'); delete this.section.dataset.heroCut;
  }
}
// Returns null when WebGL cannot start; the caller shows the poster instead.
export function mountHero(host: HTMLElement, options: HeroOptions) {
  try { return new HeroStage(host, options); } catch { host.querySelector('canvas.hero-canvas')?.remove(); return null; }
}
