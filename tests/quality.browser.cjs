// Task 9: reproducible automation; emulation is not physical-device certification.
const path=require('node:path');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve('.cache/browsers');
const {chromium,firefox,webkit}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.TEST_URL||'http://127.0.0.1:5178';
const output=path.resolve('.cache/qa');fs.mkdirSync(output,{recursive:true});
const report={date:new Date().toISOString(),engines:[],accessibility:[],performance:null};
const mode=(p,value)=>p.waitForFunction(v=>document.querySelector('.scene-host')?.dataset.mode===v,value);
const stats=p=>p.locator('.scene-host').evaluate(el=>({...el.dataset}));
const chooseStand=async(p,name)=>{const change=p.getByRole('button',{name:'Change stand',exact:true});if(await change.isVisible().catch(()=>false))await change.click();await p.locator('.stand-selector').getByRole('button',{name,exact:true}).click();};
// Task 3/4 audits: 44×44 targets and a 12px floor for text on the explorer surface.
async function auditSurface(page,label){
 return page.evaluate(()=>{
  const issues=[],visible=e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return r.width>0&&r.height>0&&c.visibility!=='hidden'&&e.checkVisibility()&&!e.closest('[hidden],[inert]');};
  const roots=[...document.querySelectorAll('.explorer,.site-header,.disclosure-bar')];
  const inRoots=e=>roots.some(r=>r.contains(e));
  for(const e of document.querySelectorAll('button,a[href],select,summary,input:not([type=hidden]),[tabindex="0"]')){
   if(!inRoots(e)||!visible(e)||e.matches('.scene-frame,.sr-only'))continue;
   let t=e;if(e.matches('input[type=checkbox]'))t=e.closest('label')||e;
   const r=t.getBoundingClientRect();
   if(r.width<43.5||r.height<43.5)issues.push(`target ${t.tagName.toLowerCase()}.${t.className||''} "${(t.textContent||t.getAttribute('aria-label')||'').trim().slice(0,30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  for(let n;n=walker.nextNode();){
   const e=n.parentElement;if(!n.textContent.trim()||!inRoots(e)||!visible(e)||e.closest('svg,.sr-only,option'))continue;
   const size=parseFloat(getComputedStyle(e).fontSize);
   if(size<12)issues.push(`text ${size}px "${n.textContent.trim().slice(0,30)}" in ${e.tagName.toLowerCase()}.${e.className||''}`);
  }
  if(document.documentElement.scrollWidth>innerWidth)issues.push('horizontal overflow');
  return issues;
 }).then(issues=>assert.deepEqual([...new Set(issues)],[],`Density audit: ${label}`));
}
async function axe(page,state){
 const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 report.accessibility.push({state,violations:result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))});
 assert.deepEqual(report.accessibility.at(-1).violations,[],`Accessibility: ${state}`);
}
(async()=>{
 for(const engine of (process.env.QUALITY_ENGINES||'chrome,firefox').split(',')){
  const type={chrome:chromium,firefox,webkit}[engine];assert.ok(type,`Unknown engine ${engine}`);
  console.log('CHECK',engine);
  const browser=await type.launch(engine==='chrome'?{channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']}:{headless:true});
  try{
   const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await mode(page,'overview');
   await page.locator('.scene-frame').scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>Number(document.querySelector('.scene-host').dataset.matchTime)>.2);
   const overview=await stats(page);assert.ok(+overview.drawCalls<200&&+overview.triangles<650000);
   await page.getByRole('button',{name:'Pause atmosphere',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.scene-host').dataset.atmosphere==='static');
   const stopped=(await stats(page)).matchTime;await page.waitForTimeout(250);assert.equal((await stats(page)).matchTime,stopped);
   if(engine==='chrome')await axe(page,'desktop overview with atmosphere paused');
   await page.getByRole('button',{name:'Resume atmosphere',exact:true}).click();await page.locator('.scene-frame').scrollIntoViewIfNeeded();
   await page.waitForFunction(t=>document.querySelector('.scene-host').dataset.matchTime!==t,stopped);
   // Out-of-view animation does not consume continuous rendering work.
   // A short viewport at the document end guarantees the scene is fully off-screen.
   await page.setViewportSize({width:1440,height:500});await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(150);
   assert.equal(await page.locator('.scene-frame').evaluate(e=>e.getBoundingClientRect().top>=innerHeight),true,'Scene is off-screen');
   const offscreen=(await stats(page)).matchTime;await page.waitForTimeout(250);assert.equal((await stats(page)).matchTime,offscreen);
   await page.setViewportSize({width:1440,height:1050});
   await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.scene-frame').scrollIntoViewIfNeeded();
   assert.equal(await page.getByRole('button',{name:'Pause atmosphere',exact:true}).isDisabled(),true);
   const reduced=(await stats(page)).matchTime;await page.waitForTimeout(150);assert.equal((await stats(page)).matchTime,reduced);
   for(const stand of ['South','West','North','East']){
    await chooseStand(page,`${stand} stand`);
    await page.getByRole('button',{name:'Middle view'}).click();await page.getByRole('button',{name:'Preview this view'}).click();await mode(page,'preview');
    assert.equal(await page.locator('.selection-dot,.sightline-note,.review-more').count(),0);
    await page.waitForFunction(()=>document.querySelector('.scene-host').dataset.renderMode==='preview'&&document.querySelector('.scene-host').dataset.crowdVisible==='false');
    const clear=await stats(page);await page.getByLabel('Clear-view preview',{exact:true}).uncheck();await page.locator('.scene-frame').scrollIntoViewIfNeeded();
    await page.waitForFunction(n=>+document.querySelector('.scene-host').dataset.triangles>n,+clear.triangles);
    if(engine==='chrome'&&stand==='South'){await page.locator('.scene-frame').screenshot({path:path.join(output,'matchday-standing-crowd.png')});await axe(page,'standing preview with decorative crowd');}
    await page.getByLabel('Clear-view preview',{exact:true}).check();await page.keyboard.press('Escape');await mode(page,'overview');
   }
   await page.getByRole('checkbox',{name:'Match-day atmosphere',exact:true}).uncheck();await page.locator('.scene-frame').scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>document.querySelector('.scene-host').dataset.atmosphere==='off');
   if(engine==='chrome'){
    // About dialog confines focus and excludes background controls from the accessibility tree.
    const about=page.getByRole('button',{name:'About this concept'});await about.click();
    assert.equal(await page.locator('[inert]').count(),1);await page.keyboard.press('Shift+Tab');assert.match(await page.locator(':focus').textContent(),/Back to the ground/);
    await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('aria-label'),'Close about dialog');await axe(page,'about modal');
    await page.keyboard.press('Escape');assert.equal(await about.evaluate(e=>e===document.activeElement),true);
    // Empty results remain accessible and offer recovery.
    await page.getByRole('button',{name:'Change place',exact:true}).click();await page.locator('.advanced-places summary').click();
    await page.locator('.discovery-filters').getByLabel('Stand',{exact:true}).selectOption('south');
    await page.locator('.discovery-filters').getByLabel('Category',{exact:true}).selectOption('sideline');await page.locator('.results-empty').waitFor();await axe(page,'empty results');
    await page.getByRole('button',{name:/Reset filters/}).click();
    // Progressive flow at desktop and narrow widths: Preview stays reachable, targets and text stay usable.
    await page.setViewportSize({width:1440,height:900});await page.reload();await mode(page,'overview');
    await page.locator('.explorer').evaluate(e=>e.scrollIntoView());
    await chooseStand(page,'West stand');await page.getByRole('button',{name:'Middle view'}).click();
    const inView=async loc=>{const b=await loc.boundingBox();return b&&b.y>=0&&b.y+b.height<=900;};
    assert.ok(await inView(page.getByRole('button',{name:'Preview this view'})),'Preview visible at 1440×900');
    assert.equal(await page.locator('.selection-dot,.sightline-note,.review-more').count(),0);
    await page.getByRole('button',{name:'Preview this view'}).click();await mode(page,'preview');
    assert.ok(await inView(page.getByRole('button',{name:'Save viewpoint'})),'Save visible in Preview at 1440×900');
    await page.getByRole('button',{name:'Change place',exact:true}).click();await page.locator('.advanced-places summary').click();
    await page.evaluate(()=>window.scrollBy({top:600,behavior:'instant'}));await page.waitForTimeout(150);
    const stuck=await page.locator('.scene-frame').boundingBox();assert.ok(stuck.y>=0&&stuck.y<400,'Scene stays in view while the place rail scrolls');
    for(const width of [320,390,768]){
     await page.setViewportSize({width,height:844});await page.reload();await mode(page,'overview');
     await auditSurface(page,`${width}px choose stand`);
     await chooseStand(page,'West stand');
     assert.equal(await page.locator('.advanced-places').evaluate(d=>d.open),false,'Advanced collapsed by default');
     assert.equal(await page.locator('.result-pages,.place-fields,.discovery-filters').evaluateAll(els=>els.filter(e=>e.checkVisibility()).length),0,'No exact-place controls in the novice stage');
     await auditSurface(page,`${width}px choose place`);
     await page.locator('.advanced-places summary').click();await auditSurface(page,`${width}px advanced`);await page.locator('.advanced-places summary').click();
     await page.getByRole('button',{name:'Middle view'}).click();await page.waitForTimeout(150);
     const preview=await page.getByRole('button',{name:'Preview this view'}).boundingBox();
     assert.ok(preview&&preview.y>=0&&preview.y+preview.height<=844,`Preview visible after selection at ${width}px`);
     await auditSurface(page,`${width}px review`);
     // Mobile reading order: scene → stand/view choice → review → atmosphere.
     const order=await page.evaluate(()=>['.scene-frame','.place-panel','.atmosphere-controls'].map(s=>document.querySelector(s).getBoundingClientRect().top+scrollY));
     assert.deepEqual(order,[...order].sort((a,b)=>a-b),`Narrow order at ${width}px: ${order}`);
     await page.getByRole('button',{name:'Preview this view'}).click();await mode(page,'preview');
     await page.getByRole('button',{name:'Save viewpoint'}).click();await page.getByRole('button',{name:'Remove saved viewpoint'}).waitFor();
     await auditSurface(page,`${width}px preview and saved`);
     if(width===390)await axe(page,'mobile saved viewpoint');
    }
    // 200% text enlargement and a narrow viewport must reflow without horizontal scrolling.
    await page.setViewportSize({width:640,height:900});await page.reload();await mode(page,'overview');
    await chooseStand(page,'West stand');await page.getByRole('button',{name:'Middle view'}).click();
    await page.setViewportSize({width:640,height:900});
    // Use actual computed font sizes rather than recursive percentage compounding.
    await page.evaluate(()=>{const items=[...document.querySelectorAll('body *:not(canvas):not(svg *)')].map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]);for(const [e,size] of items)e.style.fontSize=`${size*2}px`;});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Text resize overflow');
    await page.locator('.scene-frame').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'text-200-percent.png'),fullPage:true});
   }
   assert.deepEqual(errors,[]);report.engines.push({engine,version:browser.version(),overview,passed:true});console.log('PASS',engine,'atmosphere controls, offscreen pause, reduced motion, four-stand clear/crowd previews');
   if(engine==='chrome'){
    const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const phone=await mobile.newPage();
    await phone.goto(base);await mode(phone,'overview');await phone.locator('.scene-frame').scrollIntoViewIfNeeded();
    const cdp=await mobile.newCDPSession(phone);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    await phone.waitForTimeout(300);
    const timing=await phone.evaluate(()=>new Promise(resolve=>{const intervals=[];let last=performance.now();const start=last;const tick=t=>{intervals.push(t-last);last=t;if(t-start<2200)requestAnimationFrame(tick);else{intervals.shift();intervals.sort((a,b)=>a-b);resolve({samples:intervals.length,medianMs:intervals[Math.floor(intervals.length*.5)],p95Ms:intervals[Math.floor(intervals.length*.95)],meanMs:intervals.reduce((a,b)=>a+b,0)/intervals.length});}};requestAnimationFrame(tick);}));
    const mobileStats=await stats(phone);assert.ok(+mobileStats.triangles<350000&&+mobileStats.drawCalls<160);assert.ok(timing.p95Ms<100,'4× CPU slowdown p95 frame interval exceeds 100 ms');
    report.performance={kind:'390×844, DPR 2 (renderer capped 1.4), Chrome 4× CPU slowdown; host GPU unchanged',...timing,...mobileStats};
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await phone.getByRole('button',{name:'Pause atmosphere',exact:true}).tap();await axe(phone,'mobile overview');
    await phone.getByRole('checkbox',{name:'Match-day atmosphere',exact:true}).uncheck();await phone.locator('.scene-frame').scrollIntoViewIfNeeded();
    const box=await phone.locator('.scene-host canvas').boundingBox();const x=box.x+box.width*.5,y=box.y+box.height*.5;
    const snapshot=()=>phone.locator('.scene-host canvas').screenshot();const before=await snapshot();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+i*8,y:y+10,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await phone.waitForTimeout(100);assert.notDeepEqual(await snapshot(),before,'Touch drag changes camera');
    const beforePinch=await snapshot();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-35,y,id:1},{x:x+35,y,id:2}]});
    for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-35-i*6,y,id:1},{x:x+35+i*6,y,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await phone.waitForTimeout(100);assert.notDeepEqual(await snapshot(),beforePinch,'Pinch changes zoom');
    assert.equal(await phone.locator('.place-id').count(),0,'Gestures do not select places');await phone.screenshot({path:path.join(output,'matchday-mobile.png'),fullPage:true});
    console.log('PASS emulated mobile gestures, accessibility, performance',report.performance);
    // Delay and fail the lazy engine request, then retry without losing the data explorer.
    const loading=await context.newPage();let release;const gate=new Promise(resolve=>{release=resolve;});
    await loading.route('**/src/viewer/engine.ts*',async route=>{await gate;await route.abort();});await loading.goto(base,{waitUntil:'domcontentloaded'});
    await loading.getByRole('status').filter({hasText:'Building the ground'}).waitFor();await axe(loading,'engine loading');release();
    await loading.getByRole('button',{name:'Retry 3D'}).waitFor();await axe(loading,'engine load error');await loading.unroute('**/src/viewer/engine.ts*');
    await chooseStand(loading,'West stand');await loading.locator('.advanced-places summary').click();await loading.getByRole('button',{name:'Select this place'}).click();assert.ok(await loading.locator('.place-id').textContent());
    // A failed dynamic import is cached by the browser; a fresh import attempt needs a reload.
    await loading.getByRole('button',{name:'Retry 3D'}).click();
    await mode(loading,'overview');
    console.log('PASS loading/error announcements and retry');
   }
  }finally{await browser.close();}
 }
 fs.writeFileSync(path.join(output,'quality-report.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS quality suite; report:',path.join(output,'quality-report.json'));
})().catch(error=>{fs.writeFileSync(path.join(output,'quality-report.json'),JSON.stringify({...report,error:String(error)},null,2)+'\n');console.error(error);process.exit(1);});
