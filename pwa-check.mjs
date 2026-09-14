import { chromium } from 'playwright';
const BASE='http://localhost:3000';
import { createClient } from '@libsql/client';

/**
 * Same shape as before, one less native dependency: a tiny read-only wrapper
 * over libSQL so the checks talk to the database the app actually uses.
 */
const client = createClient({ url: 'file:data/ops.db' });
const db = {
  prepare: (sql) => ({
    get: async (...args) => (await client.execute({ sql, args })).rows[0],
    all: async (...args) => (await client.execute({ sql, args })).rows,
  }),
  close: () => client.close(),
};
const token=(await db.prepare(`select em.token from event_members em join team_members tm on tm.id=em.team_member_id join events e on e.id=em.event_id where e.name like '%الشرطة%' and tm.full_name like 'أمير%'`).get()).token;
const results=[];
const ok=(n,c,d='')=>{results.push([n,c,d]);console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`)};

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'allow'});
const p=await c.newPage();

// manifest + icons are actually served
const man = await p.request.get(`${BASE}/manifest.webmanifest`);
ok('manifest is served', man.ok(), `${man.status()} ${man.headers()['content-type']}`);
const mj = await man.json();
ok('manifest declares standalone display', mj.display==='standalone');
ok('manifest has a maskable icon', mj.icons.some(i=>i.purpose==='maskable'));
ok('manifest is Arabic/RTL', mj.dir==='rtl' && mj.lang==='ar');
for (const path of ['/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png','/offline.html','/sw.js']) {
  const r = await p.request.get(BASE+path);
  ok(`serves ${path}`, r.ok(), String(r.status()));
}

// head wiring
await p.goto(`${BASE}/member/${token}`); await p.waitForLoadState('networkidle');
const head = await p.evaluate(()=>({
  manifest: !!document.querySelector('link[rel=manifest]'),
  apple: !!document.querySelector('link[rel=apple-touch-icon]'),
  capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute('content'),
  theme: document.querySelector('meta[name=theme-color]')?.getAttribute('content'),
  viewportFit: (document.querySelector('meta[name=viewport]')?.getAttribute('content')||'').includes('viewport-fit=cover'),
}));
ok('manifest linked in <head>', head.manifest);
ok('apple-touch-icon linked', head.apple);
ok('iOS standalone enabled', head.capable==='yes', String(head.capable));
ok('theme-color set', head.theme==='#080b11', String(head.theme));
ok('viewport-fit=cover for notches', head.viewportFit);

// service worker actually registers and controls the page
await p.waitForTimeout(2500);
const swState = await p.evaluate(async ()=>{
  const r = await navigator.serviceWorker.getRegistration();
  return { registered: !!r, active: !!r?.active, scope: r?.scope };
});
ok('service worker registered', swState.registered, swState.scope||'');
ok('service worker active', swState.active);

// offline: a previously-visited page still renders
await p.reload(); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1200);
await c.setOffline(true);
const offlineResp = await p.goto(`${BASE}/member/${token}`).catch(()=>null);
const offlineText = await p.textContent('body').catch(()=> '');
ok('cached page still opens offline', offlineText.includes('موقعك')||offlineText.includes('البوابة'), offlineResp?String(offlineResp.status()):'no response');
const fresh = await p.goto(`${BASE}/admin`).catch(()=>null);
const freshText = await p.textContent('body').catch(()=> '');
ok('never-seen page shows the offline notice offline', freshText.includes('لا يوجد اتصال'), '');
await c.setOffline(false);

await b.close(); db.close();
const bad=results.filter(r=>!r[1]);
console.log(`\n${results.length-bad.length}/${results.length} PWA checks passed`);
if(bad.length) process.exit(1);
