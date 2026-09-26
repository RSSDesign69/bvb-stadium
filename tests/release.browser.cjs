const { chromium } = require('@playwright/test');
const { default: AxeBuilder } = require('@axe-core/playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({channel:process.env.TEST_BROWSER || 'chrome',args:['--enable-webgl','--ignore-gpu-blocklist']});
 try {
  const context = await browser.newContext({viewport:{width:1440,height:1050}});
  const page = await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.TEST_URL || 'http://127.0.0.1:4173';
  await page.goto(base);
  await page.waitForFunction(()=>document.querySelector('.scene-host')?.dataset.mode==='overview');
  assert.match(await page.locator('.disclosure-bar').innerText(),/No tickets are sold/);
  await page.getByRole('link',{name:'Credits & demo video'}).click();
  await page.getByRole('heading',{name:'Inside the project.'}).waitFor();
  assert.equal((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.length,0);
  const metadata=await page.locator('video').evaluate(async video=>{video.load();await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject;});await video.play();await new Promise(resolve=>setTimeout(resolve,1500));video.pause();return {duration:video.duration,time:video.currentTime,width:video.videoWidth,height:video.videoHeight};});
  assert.ok(metadata.duration>20&&metadata.duration<90);assert.ok(metadata.time>0);assert.equal(metadata.width,1440);
  const notices=await page.request.get(new URL('THIRD_PARTY_NOTICES.txt',base).href);assert.equal(notices.status(),200);assert.match(await notices.text(),/MIT License/);
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.setViewportSize({width:1440,height:1050});await page.screenshot({path:'.cache/demo/credits.png',fullPage:true});
  await page.getByRole('link',{name:'Back to Terrace Atlas'}).click();
  await page.waitForFunction(()=>document.querySelector('.scene-host')?.dataset.mode==='overview');
  assert.deepEqual(errors,[]);
  console.log('PASS production disclosure, credits, axe, responsive layout, video playback, notices and return link',metadata);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
