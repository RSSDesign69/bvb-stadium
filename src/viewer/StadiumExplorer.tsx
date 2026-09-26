import { useEffect, useMemo, useRef, useState } from 'react';
import { BLOCK_BY_ID, DEMO, PLACE_BY_ID, describePlace, samplePlace } from '../places/demo';
import { DEFAULT_FILTERS, demoGroup, filterDemoPlaces, matchesDiscovery, unavailableReason } from '../commerce/demo/discovery';
import type { DemoGroup, DiscoveryFilters } from '../commerce/demo/discovery';
import { STANDS, STAND_ORDER } from '../stadium/layout';
import type { Place, StandId, Tier } from '../places/schema';
import type { Command, StadiumEngine, ViewState } from './engine';
import { DEFAULT_ATMOSPHERE } from '../atmosphere/settings';
const INITIAL_VIEW:ViewState={mode:'overview',position:[170,155,195],direction:[-.5,-.5,-.6],fov:43};

function MiniMap({place,view,filteredStand}:{place:Place|null;view:ViewState;filteredStand:StandId|'all'}){
  const preview=view.mode!=='overview';const position=preview?view.position:place?.position;
  const direction=preview?view.direction:place?.direction??view.direction;
  const markedStand=place?.stand??filteredStand;
  const x=position?110+position[0]:110,z=position?130+position[2]:130;
  return <svg className="mini-map" viewBox="0 0 220 260" role="img" aria-label={`Stadium orientation. North is up.${place?` Selected ${STANDS[place.stand].name}.`:filteredStand!=='all'?` Filtered to ${STANDS[filteredStand].name}.`:''}${preview?' Arrow shows viewing direction.':''}`}>
    <rect x="16" y="17" width="188" height="226" rx="32" fill="#293435" stroke="#85918b"/>
    <rect x="26" y="65" width="30" height="130" fill={markedStand==='west'?'#ffd900':'#48554c'}/>
    <rect x="164" y="65" width="30" height="130" fill={markedStand==='east'?'#ffd900':'#48554c'}/>
    <rect x="65" y="25" width="90" height="33" fill={markedStand==='north'?'#ffd900':'#48554c'}/>
    <rect x="65" y="203" width="90" height="33" fill={markedStand==='south'?'#ffd900':'#84741c'}/>
    <rect x="76" y="77.5" width="68" height="105" fill="#34674a" stroke="#b8cab3"/>
    <path d="M76 130H144" stroke="#b8cab3"/><circle cx="110" cy="130" r="9" fill="none" stroke="#b8cab3"/>
    <text x="110" y="13" textAnchor="middle">N</text><text x="110" y="255" textAnchor="middle">S</text><text x="9" y="133" textAnchor="middle">W</text><text x="211" y="133" textAnchor="middle">E</text>
    {position&&<g><line x1={x} y1={z} x2={x+direction[0]*22} y2={z+direction[2]*22} stroke="#6df9e8" strokeWidth="3"/><circle cx={x} cy={z} r="4" fill="#6df9e8" stroke="#102c29"/></g>}
  </svg>;
}
export default function StadiumExplorer({stand,onStand,standRequest}:{stand:StandId|null;onStand:(s:StandId)=>void;standRequest:number}){
  const loadFailed=useRef(false);
  const frame=useRef<HTMLDivElement>(null);
  const host=useRef<HTMLDivElement>(null),engine=useRef<StadiumEngine|null>(null),previewButton=useRef<HTMLButtonElement>(null),previousMode=useRef('overview');
  const [ready,setReady]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const [selectedId,setSelectedId]=useState<string|null>(null),[hoverId,setHoverId]=useState<string|null>(null);
  const [view,setView]=useState<ViewState>(INITIAL_VIEW),[cutaway,setCutaway]=useState(true);
  const [atmosphere,setAtmosphere]=useState(DEFAULT_ATMOSPHERE);
  const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  useEffect(()=>{if(ready)engine.current?.setAtmosphere(atmosphere);},[ready,atmosphere]);
  const [filters,setFilters]=useState<DiscoveryFilters>(DEFAULT_FILTERS);
  const [candidateId,setCandidateId]=useState('DEMO-WEST-04-LOWER-R11-S11');
  const [page,setPage]=useState(0),[notice,setNotice]=useState('');
  const [basket,setBasket]=useState<{anchor:Place;group:DemoGroup}|null>(null);
  const results=useMemo(()=>filterDemoPlaces(filters),[filters]);
  const resultIds=useMemo(()=>new Set(results.map(p=>p.id)),[results]);
  const candidate=(resultIds.has(candidateId)?PLACE_BY_ID.get(candidateId):results[0])??null;
  const block=candidate?BLOCK_BY_ID.get(candidate.blockId)!:null;
  const sections=block?.sections.filter(s=>s.rows.some(r=>r.places.some(p=>resultIds.has(p.id))))??[];
  const section=candidate?sections.find(s=>s.id===candidate.sectionId)??sections[0]:null;
  const rows=section?.rows.filter(r=>r.places.some(p=>resultIds.has(p.id)))??[];
  const row=candidate?rows.find(r=>r.id===candidate.rowId)??rows[0]:null;
  const places=row?.places.filter(p=>resultIds.has(p.id))??[];
  const blocks=useMemo(()=>DEMO.blocks.filter(b=>b.sections.some(s=>s.rows.some(r=>r.places.some(p=>resultIds.has(p.id))))),[resultIds]);
  const pageSize=8,pageCount=Math.ceil(results.length/pageSize);
  const selected=selectedId?PLACE_BY_ID.get(selectedId)??null:null,hovered=hoverId?PLACE_BY_ID.get(hoverId):null;
  const callbacks=useRef({select:(id:string)=>{},view:(state:ViewState)=>{}});
  const applySelection=(id:string,focusCamera=false)=>{
    const p=PLACE_BY_ID.get(id);if(!p||!matchesDiscovery(p,filters))return;
    setSelectedId(id);setCandidateId(id);setNotice('');
    if(focusCamera)engine.current?.focusBlock(p.blockId);
    engine.current?.select(id);
  };
  callbacks.current={select:applySelection,view:(next)=>{
    setView(next);
  }};
  useEffect(()=>{if(previousMode.current!=='overview'&&view.mode==='overview')previewButton.current?.focus({preventScroll:true});previousMode.current=view.mode;},[view.mode]);
  useEffect(()=>{
    let disposed=false;setReady(false);setError('');
    import('./engine').then(({StadiumEngine})=>{
      if(disposed||!host.current)return;
      try{engine.current=new StadiumEngine(host.current,{onSelect:id=>callbacks.current.select(id),onHover:setHoverId,onView:v=>callbacks.current.view(v),onError:setError});setReady(true);}
      catch{setError('3D graphics are unavailable. You can still explore every generated place below.');}
    }).catch(()=>{if(disposed)return;loadFailed.current=true;setError('The 3D viewer could not load. Retry reloads the page, or use the place explorer below.');});
    return()=>{disposed=true;engine.current?.dispose();engine.current=null;};
  },[attempt]);
  useEffect(()=>{if(ready){engine.current?.setVisiblePlaces(resultIds);engine.current?.select(selectedId);engine.current?.setCutaway(cutaway);}},[ready]);
  useEffect(()=>{
    engine.current?.setVisiblePlaces(resultIds);
    setPage(0);
    if(selectedId&&!resultIds.has(selectedId)){
      setSelectedId(null);setHoverId(null);engine.current?.select(null);
      setNotice('The selected place no longer matches the filters. Returned to stadium overview.');
    }
    if(!resultIds.has(candidateId))setCandidateId(results[0]?.id??'');
    if(results.length&&(!selectedId||!resultIds.has(selectedId)))engine.current?.focusBlock(results[0].blockId);
    if(!results.length){setHoverId(null);engine.current?.command('reset');}
  },[resultIds]);
  useEffect(()=>{
    if(!stand)return;const b=DEMO.blocks.find(b=>b.stand===stand)!;
    setFilters(current=>({...current,stand,tier:'all'}));setCandidateId(b.sections[0].rows[0].places[0].id);
    setSelectedId(null);engine.current?.select(null);engine.current?.focusBlock(b.id);
  },[stand,standRequest]);
  useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!(e.target as HTMLElement)?.closest('[role="dialog"]'))engine.current?.command('back');};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[]);
  useEffect(()=>{if(error){engine.current?.dispose();engine.current=null;setReady(false);setView(INITIAL_VIEW);}},[error]);
  const command=(c:Command)=>{if(c==='reset'){setSelectedId(null);setHoverId(null);}engine.current?.command(c);};
  const focusBlock=(id:string)=>{const first=results.find(p=>p.blockId===id);if(!first)return;setCandidateId(first.id);setSelectedId(null);engine.current?.select(null);engine.current?.focusBlock(id);};
  const sample=(level:'low'|'middle'|'high')=>{
    if(!block)return;
    const original=samplePlace(block,level);
    const pool=results.filter(p=>p.blockId===block.id).sort((a,b)=>a.eye[1]-b.eye[1]);
    const place=resultIds.has(original.id)?original:pool[level==='low'?0:level==='high'?pool.length-1:Math.floor(pool.length/2)];
    if(place)applySelection(place.id,true);
  };
  const updateFilters=(patch:Partial<DiscoveryFilters>)=>setFilters(current=>({...current,...patch}));
  const selectedGroup=selected?demoGroup(selected,filters.quantity):null;
  const alternative=selected&&!selectedGroup?results.find(p=>p.id!==selected.id&&p.stand===selected.stand&&demoGroup(p,filters.quantity))??results.find(p=>demoGroup(p,filters.quantity)):null;
  const addDemoSelection=()=>{
    if(!selected)return;
    if(!selectedGroup){setNotice(unavailableReason(selected,filters.quantity));return;}
    setBasket({anchor:selected,group:selectedGroup});setNotice(`Added ${selectedGroup.people} ${selectedGroup.people===1?'person':'people'} to the local demo selection. No reservation was made.`);
  };
  const activePreview=view.mode!=='overview';
  return <div className="explorer">
    <div className="viewer-topline"><span>Original 3D model <span className="muted">· Illustrative places</span></span><label className="roof-toggle"><input type="checkbox" checked={!activePreview&&cutaway} disabled={activePreview} onChange={e=>{setCutaway(e.target.checked);engine.current?.setCutaway(e.target.checked);}}/>Roof cutaway</label></div>
    <div className="atmosphere-controls" role="group" aria-label="Match-day atmosphere">
      <label><input type="checkbox" checked={atmosphere.enabled} onChange={e=>setAtmosphere(a=>({...a,enabled:e.target.checked}))}/>Match-day atmosphere</label>
      <button type="button" disabled={!atmosphere.enabled||reduced} aria-pressed={atmosphere.paused} onClick={()=>setAtmosphere(a=>({...a,paused:!a.paused}))}>{atmosphere.paused?'Resume atmosphere':'Pause atmosphere'}</button>
      <label><input type="checkbox" checked={atmosphere.clearView} onChange={e=>setAtmosphere(a=>({...a,clearView:e.target.checked}))}/>Clear-view preview</label>
      <p>{reduced?'Motion paused by your reduced-motion preference. ':''}Decorative crowd and fictional match. Clear view hides crowd and players, not structures.</p>
    </div>
    <div className="viewer-grid"><div className="scene-column">
      <div className="scene-frame" ref={frame} tabIndex={0} role="group" aria-label="Stadium camera. Arrow keys turn; plus and minus zoom; Escape returns to overview." onKeyDown={e=>{
        if(e.target!==e.currentTarget)return;const keys:Record<string,Command>={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down','+':'in','=':'in','-':'out',Escape:'back'};if(keys[e.key]){e.preventDefault();command(keys[e.key]);}
      }}>
        <div className="scene-host" ref={host}/>
        {!ready&&!error&&<div className="scene-message" role="status">Building the ground…</div>}
        {error&&<div className="scene-message" role="alert"><h3>Explore by place</h3><p>{error}</p><button className="primary-button" onClick={()=>{if(loadFailed.current)window.location.reload();else setAttempt(a=>a+1);}}>Retry 3D ↗</button></div>}
        <div className="scene-caption"><span className="scene-badge">{view.mode==='preview'?'Illustrative view':view.mode==='flying'?'Entering the stand':view.mode==='returning'?'Returning to overview':cutaway?'Roof cutaway':'Full roof'}</span><span>{activePreview?`Roof and barriers shown · ${!atmosphere.enabled||atmosphere.clearView?'crowd hidden':'simulated crowd'} · sightlines unverified`:'Four stands. One ground.'}</span></div>
        <div className="orientation"><MiniMap place={selected} view={view} filteredStand={filters.stand}/></div>
        {hovered&&view.mode==='overview'&&<div className="hover-card"><strong>{STANDS[hovered.stand].name} · {describePlace(hovered)}</strong><span>{hovered.availability==='available'?'Available in demo':'Unavailable in demo'} · €{hovered.demoPrice} demo</span></div>}
        {activePreview&&<button className="back-to-stadium" onClick={()=>command('back')}>← Back to stadium <kbd>Esc</kbd></button>}
      </div>
      <div className="camera-controls" aria-label={activePreview?'Preview camera controls':'Overview camera controls'}>
        <span className="camera-hint">{activePreview?'Drag to look · scroll to zoom':'Drag to orbit · click a place'}</span>
        <div className="camera-buttons">{([['left','←','Turn left'],['right','→','Turn right'],['up','↑','Look up'],['down','↓','Look down'],['in','+','Zoom in'],['out','−','Zoom out'],['reset','↺','Reset stadium']] as const).map(([c,icon,label])=><button key={c} onClick={()=>command(c)} aria-label={label} title={label} disabled={!ready||(activePreview&&view.mode!=='preview'&&c!=='reset')}>{icon}</button>)}</div>
      </div>
      <div className="stand-switcher" aria-label="Focus a stand">{STAND_ORDER.map(s=><button key={s} className={filters.stand===s?'is-active':''} onClick={()=>onStand(s)} aria-pressed={filters.stand===s}>{STANDS[s].name}<span aria-hidden="true">↗</span></button>)}</div>
      <p className="scene-footnote">{results.length.toLocaleString()} matching illustrative places · Nonmatching places are dimmed in the scene · No measured seat data</p>
    </div>
    <aside className="place-panel" aria-label="Place explorer">
      <div className="side-step"><span>Find a demo place</span><span>Step 01 of 04</span></div>
      <h3>{selected?STANDS[selected.stand].localName:'Inside the ground.'}</h3>
      <p className="place-lead">Generated places and fictional EUR prices. No live inventory or ticket purchase.</p>
      <div className="discovery-filters" aria-label="Filter illustrative places">
        <label>Stand<select aria-label="Stand" value={filters.stand} onChange={e=>updateFilters({stand:e.target.value as DiscoveryFilters['stand'],tier:'all'})}><option value="all">All stands</option>{STAND_ORDER.map(s=><option key={s} value={s}>{STANDS[s].name}</option>)}</select></label>
        <label>Tier<select aria-label="Tier" value={filters.tier} onChange={e=>updateFilters({tier:e.target.value as Tier|'all'})}><option value="all">All tiers</option><option value="lower" disabled={filters.stand==='south'}>Lower</option><option value="upper" disabled={filters.stand==='south'}>Upper</option><option value="terrace" disabled={filters.stand!=='all'&&filters.stand!=='south'}>Standing terrace</option></select></label>
        <label>Category<select aria-label="Category" value={filters.category} onChange={e=>updateFilters({category:e.target.value as DiscoveryFilters['category']})}><option value="all">All categories</option><option value="terrace">Terrace</option><option value="end">End stand</option><option value="sideline">Sideline</option></select></label>
        <label>People<select aria-label="People" value={filters.quantity} onChange={e=>updateFilters({quantity:Number(e.target.value) as DiscoveryFilters['quantity']})}>{[1,2,3,4].map(n=><option key={n} value={n}>{n} {n===1?'person':'people'}</option>)}</select></label>
        <label>Max demo price / person<select aria-label="Max demo price / person" value={filters.maxPrice??'all'} onChange={e=>updateFilters({maxPrice:e.target.value==='all'?null:Number(e.target.value)})}><option value="all">Any price</option>{[20,36,48,62].map(price=><option key={price} value={price}>€{price}</option>)}</select></label>
        <button type="button" className="filter-reset" onClick={()=>{setFilters(DEFAULT_FILTERS);setNotice('Filters cleared.');}}>Clear filters</button>
      </div>
      <div className="availability-legend" role="group" aria-label="Demo availability legend"><span><i className="legend-available"/>Available</span><span><i className="legend-unavailable"/>Unavailable</span><span><i className="legend-selected"/>Selected</span></div>
      <div className="result-heading"><strong>{results.length.toLocaleString()} matching {results.length===1?'place':'places'}</strong><span>Generated demo data</span></div>
      {results.length===0?<div className="results-empty"><strong>No places match these filters.</strong><p>Try another stand, category, quantity, or price.</p><button type="button" className="secondary-button" onClick={()=>setFilters(DEFAULT_FILTERS)}>Reset all filters <span>↗</span></button></div>:<>
        <div className="result-list" role="group" aria-label="Matching illustrative places">{results.slice(page*pageSize,(page+1)*pageSize).map(p=><button type="button" key={p.id} className={`result-item ${selectedId===p.id?'is-selected':''}`} aria-pressed={selectedId===p.id} onClick={()=>applySelection(p.id,true)}><span><strong>{STANDS[p.stand].name} · {describePlace(p)}</strong><small>{p.tier} · {p.kind==='seat'?'seated':'standing area'} · €{p.demoPrice}/person</small></span><em>{selectedId===p.id?'Selected':p.availability==='available'?'Available':'Unavailable'}</em></button>)}</div>
        {pageCount>1&&<div className="result-pages"><button type="button" disabled={page===0} onClick={()=>setPage(n=>n-1)}>Previous</button><span>Page {page+1} of {pageCount.toLocaleString()}</span><button type="button" disabled={page>=pageCount-1} onClick={()=>setPage(n=>n+1)}>Next</button></div>}
        {candidate&&block&&section&&row&&<><div className="browse-label">Browse matching places</div><div className="place-fields">
          <label>Demo block<select value={block.id} onChange={e=>focusBlock(e.target.value)}>{blocks.map(b=><option value={b.id} key={b.id}>{b.label}</option>)}</select></label>
          <label>Tier in block<select value={section.id} onChange={e=>{const next=results.find(p=>p.sectionId===e.target.value);if(next)setCandidateId(next.id);}}>{sections.map(s=><option key={s.id} value={s.id}>{s.tier==='terrace'?'Standing terrace':s.tier==='upper'?'Upper tier':'Lower tier'}</option>)}</select></label>
          <div className="row-place-fields"><label>{block.stand==='south'?'Terrace band':'Row'}<select value={row.id} onChange={e=>{const next=results.find(p=>p.rowId===e.target.value);if(next)setCandidateId(next.id);}}>{rows.map(r=><option key={r.id} value={r.id}>{block.stand==='south'?`Sample band ${r.number}`:`Row ${r.number}`}</option>)}</select></label>
          <label>{block.stand==='south'?'Sample position':'Seat'}<select value={candidate.id} onChange={e=>setCandidateId(e.target.value)}>{places.map(p=><option key={p.id} value={p.id}>{p.kind==='seat'?`Seat ${p.seatNumber}`:'Area centre'}{p.availability==='unavailable'?' · unavailable':''}</option>)}</select></label></div>
        </div><button className="secondary-button" onClick={()=>applySelection(candidate.id,true)}>Select this {candidate.kind==='seat'?'place':'area'} <span>↗</span></button><div className="sample-buttons" role="group" aria-label="Representative viewpoints"><span>Quick views</span>{(['low','middle','high'] as const).map(level=><button key={level} onClick={()=>sample(level)}>{level}</button>)}</div></>}
      </>}
      {selected?<div className="selected-details">
        <div className="selected-title"><span className="selection-dot"/><h4>{describePlace(selected)}</h4></div>
        <p className="place-id">{selected.id}</p>
        <dl><div><dt>Location</dt><dd>{STANDS[selected.stand].name} · {BLOCK_BY_ID.get(selected.blockId)?.label}</dd></div><div><dt>Type</dt><dd>{selected.kind==='seat'?'Illustrative seat':'Standing area · unassigned'}</dd></div><div><dt>Tier / category</dt><dd>{selected.tier} / {selected.priceCategory}</dd></div><div><dt>Demo availability</dt><dd>{selected.availability}</dd></div><div><dt>Demo price</dt><dd>€{selected.demoPrice} / person</dd></div><div><dt>People requested</dt><dd>{filters.quantity}</dd></div></dl>
        <p className="benefit-note"><strong>Illustrative features:</strong> {selected.benefits.join(' · ')}</p>
        <p className="sightline-note">Sightline: not verified. Potential model occlusions include roof supports, rails, barriers, and terrace steps. Exact effects from a real place are not verified. {selected.kind==='standing-area'?'This is a sample position in an area, with no assigned spot or adjacency promise.':''}</p>
        <button ref={previewButton} className="primary-button" disabled={!ready||activePreview} onClick={()=>{engine.current?.preview();frame.current?.scrollIntoView({block:'center',behavior:'instant'});frame.current?.focus({preventScroll:true});}}>Preview this view <span>↗</span></button>
        <button type="button" className="demo-add" onClick={addDemoSelection} disabled={!selectedGroup}>Add to demo selection · {selectedGroup?`€${selectedGroup.total} total`:'unavailable'}</button>
        {!selectedGroup&&<div className="unavailable-note" role="status"><p>{unavailableReason(selected,filters.quantity)}</p>{alternative&&<button type="button" className="secondary-button" onClick={()=>applySelection(alternative.id,true)}>Show available alternative <span>↗</span></button>}</div>}
      </div>:<div className="selection-empty">Your selected place and view details will appear here.</div>}
      {basket&&<div className="demo-confirmation" role="status"><strong>Added to your local demo selection</strong><p>{basket.group.people} {basket.group.people===1?'person':'people'} · {STANDS[basket.anchor.stand].name} · {describePlace(basket.anchor)} · €{basket.group.total} demo total</p><p>{basket.group.kind==='standing-area'?'A standing-area sample describes a region; no personal spot is assigned.':'These generated seats are consecutive in one demo row.'}</p><p>Independent stadium concept. Places, views, prices, and availability are illustrative. No tickets are sold. Nothing is reserved.</p><button type="button" onClick={()=>{setBasket(null);setNotice('Local demo selection removed.');}}>Remove demo selection</button></div>}
      {notice&&<p className="discovery-notice" role="status">{notice}</p>}
      <p className="panel-disclosure">Independent concept. Views, places, prices, and availability are illustrative. No tickets are sold.</p>
    </aside></div>
    <p className="sr-only" role="status" aria-live="polite">{selected?`${STANDS[selected.stand].name}, ${describePlace(selected)}. ${selected.availability} in demo.`:'No place selected.'} {view.mode==='preview'?'Preview open. Escape returns to stadium.':view.mode==='overview'?'Stadium overview.':'Camera moving.'}</p>
  </div>;
}
