import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { HeroArt } from './hero/HeroArt';
const StadiumExplorer = lazy(() => import('./viewer/StadiumExplorer'));

type StandId = 'south' | 'west' | 'north' | 'east';
function Arrow() { return <span aria-hidden="true">↗</span>; }


export function App() {
  const [selectedStand, setSelectedStand] = useState<StandId | null>(null);
  const [standRequest,setStandRequest]=useState(0);
  const chooseStand=(id:StandId)=>{setSelectedStand(id);setStandRequest(n=>n+1);};
  const [showAbout, setShowAbout] = useState(false);
  const [aboutClosing, setAboutClosing] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const aboutTriggerRef = useRef<HTMLButtonElement>(null);
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const closeAbout = useCallback(() => {
    if (!showAbout || closingRef.current) return;
    closingRef.current = true;
    setAboutClosing(true);
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 140;
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      closingRef.current = false;
      setAboutClosing(false);
      setShowAbout(false);
    }, duration);
  }, [showAbout]);
  useEffect(() => {
    if (!showAbout) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAbout();
      if (event.key === 'Tab') {
        const controls = Array.from(document.querySelectorAll<HTMLButtonElement>('.about-dialog button'));
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); aboutTriggerRef.current?.focus(); };
  }, [showAbout, closeAbout]);
  useEffect(() => () => { if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current); }, []);
  return <div className="site-shell">
    <div inert={showAbout || undefined}><a className="skip-link" href="#main">Skip to main content</a>
    <header className="site-header"><a className="brand" href="#main" aria-label="Stadium concept home"><img className="brand-logo" src="./bvb-09-logo.svg" alt=""/><span><strong>Signal Iduna Park</strong><small>Independent 3D concept</small></span></a><div className="header-right"><button ref={aboutTriggerRef} className="header-about" type="button" onClick={() => setShowAbout(true)}>About this concept <Arrow /></button></div></header>
    <main id="main"><div className="disclosure-bar"><strong>Independent concept / demo</strong><span>Places, views, prices, and availability are illustrative. No tickets are sold.</span></div>
      <section className="intro" aria-labelledby="page-title"><div className="intro-copy"><h1 id="page-title">Borussia Dortmund's Stadium<br/><em>from every angle<span className="hero-underline" aria-hidden="true"/></em></h1><p>Explore an original 3D interpretation of Signal Iduna Park. Choose a stand, find an illustrative place, and step inside the view.</p></div><HeroArt/></section>
      <section className="workspace" aria-label="Stadium overview"><div className="workspace-heading"><h2>Stadium explorer</h2></div><Suspense fallback={<div className="viewer-loading" role="status">Loading stadium explorer…</div>}><StadiumExplorer stand={selectedStand} onStand={chooseStand} standRequest={standRequest}/></Suspense></section>
    </main>
    <footer className="site-footer"><a href="./credits.html">Credits & demo video ↗</a><p>Independent stadium concept. Places, views, prices, and availability are illustrative. No tickets are sold.</p></footer>
    </div>
    {showAbout && <div className="dialog-backdrop" data-closing={aboutClosing || undefined} onMouseDown={event => { if (event.target === event.currentTarget) closeAbout(); }}><div className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title"><button ref={closeRef} className="dialog-close" type="button" aria-label="Close about dialog" onClick={closeAbout}>×</button><h2 id="about-title">An independent concept</h2><p>BVB 3D Stadium explores the architecture of Signal Iduna Park through an original, illustrative interface. The model contains four distinct stands, generated seats and standing-area viewpoints. Its dimensions and views are illustrative; it has no measured seat positions or live event data.</p><p>Places, views, prices, and availability are illustrative. No tickets are sold. BVB 3D Stadium is not affiliated with Borussia Dortmund, the stadium operator, or a ticket seller.</p><button className="primary-button" type="button" onClick={closeAbout}>Back to the ground <Arrow/></button></div></div>}
  </div>;
}
