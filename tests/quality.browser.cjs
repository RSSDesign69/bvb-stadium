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
   await page.locator('.site-footer').scrollIntoViewIfNeeded();await page.waitForTimeout(100);
   const offscreen=(await stats(page)).matchTime;await page.waitForTimeout(250);assert.equal((await stats(page)).matchTime,offscreen);
   await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.scene-frame').scrollIntoViewIfNeeded();
   assert.equal(await page.getByRole('button',{name:'Pause atmosphere',exact:true}).isDisabled(),true);
   const reduced=(await stats(page)).matchTime;await page.waitForTimeout(150);assert.equal((await stats(page)).matchTime,reduced);
   for(const stand of ['South','West','North','East']){
    await page.locator('.stand-switcher').getByRole('button',{name:`${stand} stand`}).click();
    await page.getByRole('button',{name:'middle',exact:true}).click();await page.getByRole('button',{name:'Preview this view'}).click();await mode(page,'preview');
    assert.match(await page.locator('.scene-caption').textContent(),/crowd hidden/);
    assert.match(await page.locator('.sightline-note').textContent(),/not verified/);
    await page.waitForFunction(()=>document.querySelector('.scene-host').dataset.renderMode==='preview'&&document.querySelector('.scene-host').dataset.crowdVisible==='false');
    const clear=await stats(page);await page.getByLabel('Clear-view preview',{exact:true}).uncheck();await page.locator('.scene-frame').scrollIntoViewIfNeeded();
    await page.waitForFunction(n=>+document.querySelector('.scene-host').dataset.triangles>n,+clear.triangles);
    assert.match(await page.locator('.scene-caption').textContent(),/simulated crowd/);
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
    await page.locator('.discovery-filters').getByLabel('Stand',{exact:true}).selectOption('south');
    await page.locator('.discovery-filters').getByLabel('Category',{exact:true}).selectOption('sideline');await page.locator('.results-empty').waitFor();await axe(page,'empty results');
    await page.getByRole('button',{name:'Reset all filters'}).click();
    // 200% text enlargement and a narrow viewport must reflow without horizontal scrolling.
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
    await loading.getByRole('button',{name:'Select this place'}).click();assert.ok(await loading.locator('.place-id').textContent());
    // A failed dynamic import is cached by the browser; a fresh import attempt needs a reload.
    await loading.getByRole('button',{name:'Retry 3D'}).click();
    await mode(loading,'overview');
    console.log('PASS loading/error announcements and retry');
   }
  }finally{await browser.close();}
 }
 fs.writeFileSync(path.join(output,'quality-report.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS quality suite; report:',path.join(output,'quality-report.json'));
})().catch(error=>{fs.writeFileSync(path.join(output,'quality-report.json'),JSON.stringify({...report,error:String(error)},null,2)+'\n');console.error(error);process.exit(1);});
