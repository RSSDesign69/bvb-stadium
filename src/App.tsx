import { lazy, Suspense, useEffect, useRef, useState } from 'react';
const StadiumExplorer = lazy(() => import('./viewer/StadiumExplorer'));

type StandId = 'south' | 'west' | 'north' | 'east';
const stands: Record<StandId, { name: string; direction: string; note: string; character: string }> = {
  south: { name: 'South stand', direction: 'Südtribüne · south', note: 'A broad, steep terrace defines the stadium’s most recognizable end.', character: 'Terrace concept' },
  west: { name: 'West stand', direction: 'Westtribüne · west', note: 'A long side of the ground, imagined here as layered viewing tiers.', character: 'Sideline concept' },
  north: { name: 'North stand', direction: 'Nordtribüne · north', note: 'The opposite end frames a full length view down the pitch.', character: 'End stand concept' },
  east: { name: 'East stand', direction: 'Osttribüne · east', note: 'The second sideline completes the four sided ground.', character: 'Sideline concept' },
};
const standOrder: StandId[] = ['south', 'west', 'north', 'east'];
function Arrow() { return <span aria-hidden="true">↗</span>; }


export function App() {
  const [selectedStand, setSelectedStand] = useState<StandId | null>(null);
  const [standRequest,setStandRequest]=useState(0);
  const chooseStand=(id:StandId)=>{setSelectedStand(id);setStandRequest(n=>n+1);};
  const [showAbout, setShowAbout] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const aboutTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!showAbout) return; closeRef.current?.focus(); const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowAbout(false); if (event.key === 'Tab') { const controls = Array.from(document.querySelectorAll<HTMLButtonElement>('.about-dialog button')); const first = controls[0]; const last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }; document.addEventListener('keydown', close); return () => { document.removeEventListener('keydown', close); aboutTriggerRef.current?.focus(); }; }, [showAbout]);
  const moveTo = (selector: string) => document.querySelector(selector)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  return <div className="site-shell">
    <div inert={showAbout || undefined}><a className="skip-link" href="#main">Skip to main content</a>
    <header className="site-header"><a className="brand" href="#main" aria-label="Stadium concept home"><img className="brand-logo" src="./bvb-09-logo.svg" alt=""/><span><strong>Signal Iduna Park</strong><small>Independent 3D concept</small></span></a><div className="header-right"><span className="header-edition">Study 01 · Dortmund</span><button ref={aboutTriggerRef} className="header-about" type="button" onClick={() => setShowAbout(true)}>About this concept <Arrow /></button></div></header>
    <main id="main"><div className="disclosure-bar"><strong>Independent concept / demo</strong><span>Places, views, prices, and availability are illustrative. No tickets are sold.</span></div>
      <section className="intro" aria-labelledby="page-title"><div className="intro-copy"><p className="intro-context">Signal Iduna Park · Dortmund · Study 01</p><h1 id="page-title">The ground<br/><em>from every angle.</em></h1><p>Explore an original 3D interpretation of Signal Iduna Park. Choose a stand, find an illustrative place, and step inside the view.</p></div><dl className="intro-facts" aria-label="Concept scope"><div><dt>4</dt><dd>distinct stands</dd></div><div><dt>3D</dt><dd>interactive model</dd></div><div><dt>0</dt><dd>tickets sold</dd></div></dl></section>
      <section className="workspace" aria-label="Stadium overview"><div className="workspace-heading"><div><span className="section-kicker">Explore the ground</span><h2>Stadium explorer<span className="heading-period">.</span></h2></div><span className="view-indicator"><span className="indicator-square"/>Interactive architectural concept</span></div><Suspense fallback={<div className="viewer-loading" role="status">Loading stadium explorer…</div>}><StadiumExplorer stand={selectedStand} onStand={chooseStand} standRequest={standRequest}/></Suspense></section>
      <section className="stand-guide" id="stand-guide" aria-labelledby="guide-title"><div className="guide-top"><span className="section-kicker">Stand guide · 4 sides</span><h2 id="guide-title">A ground with<br/><em>four faces.</em></h2></div><div className="guide-grid">{standOrder.map((id, index) => <button type="button" className={`guide-card ${selectedStand === id ? 'is-active' : ''}`} key={id} onClick={() => { chooseStand(id); moveTo('.workspace'); }}><span className="guide-card-top"><small>0{index + 1} / 04</small><Arrow/></span><span className="guide-card-name">{stands[id].name}</span><span className="guide-card-note">{stands[id].character}</span></button>)}</div></section>
    </main>
    <footer className="site-footer"><a href="./credits.html">Credits & demo video ↗</a><span className="footer-brand">TERRACE ATLAS <span>© 2026</span></span><p>Independent stadium concept. Places, views, prices, and availability are illustrative. No tickets are sold.</p></footer>
    </div>
    {showAbout && <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowAbout(false); }}><div className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title"><button ref={closeRef} className="dialog-close" type="button" aria-label="Close about dialog" onClick={() => setShowAbout(false)}>×</button><span className="section-kicker">About the project</span><h2 id="about-title">An independent concept.</h2><p>Terrace Atlas explores the architecture of Signal Iduna Park through an original, illustrative interface. The model contains four distinct stands, generated seats and standing-area viewpoints. Its dimensions and views are illustrative; it has no measured seat positions or live event data.</p><p>Places, views, prices, and availability are illustrative. No tickets are sold. Terrace Atlas is not affiliated with Borussia Dortmund, the stadium operator, or a ticket seller.</p><button className="primary-button" type="button" onClick={() => setShowAbout(false)}>Back to the ground <Arrow/></button></div></div>}
  </div>;
}
