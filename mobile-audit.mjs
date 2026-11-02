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
const eventId=(await db.prepare("select id from events where name like '%الشرطة%'").get()).id;
const memberId=(await db.prepare('select team_member_id from event_members where event_id=? limit 1').get(eventId)).team_member_id;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const p=await c.newPage();
await p.goto(`${BASE}/login`); await p.waitForSelector('[data-signin-tab=staff]'); await p.click('[data-signin-tab=staff]'); await p.waitForSelector('#username'); await p.fill('#username','admin'); await p.fill('#password','Admin@12345');
await p.click('button[type=submit]'); await p.waitForLoadState('networkidle');
const pages=[['01-dash','/admin'],['02-events','/admin/events'],['03-venues','/admin/venues'],['04-team','/admin/team'],['05-overview',`/admin/events/${eventId}`],['06-gates',`/admin/events/${eventId}/gates`],['07-assign',`/admin/events/${eventId}/assignments`],['08-map',`/admin/events/${eventId}/map`],['09-attend',`/admin/events/${eventId}/attendance`],['10-eventteam',`/admin/events/${eventId}/team`],['11-announce',`/admin/events/${eventId}/announcements`],['12-issues',`/admin/events/${eventId}/issues`],['13-report',`/admin/events/${eventId}/reports`],['14-activity',`/admin/events/${eventId}/activity`],['15-settings','/admin/settings'],['16-newevent','/admin/events/new'],['17-notify',`/admin/events/${eventId}/notify`],['18-credits','/admin/credits'],['19-ledger',`/admin/team/${memberId}`],['20-board',`/admin/events/${eventId}/board`],['21-sheet',`/admin/events/${eventId}/board/sheet`],['22-setup',`/admin/events/${eventId}/team?setup=2`],['23-signin','/login']];
const report=[];
for(const [name,url] of pages){
  await p.goto(BASE+url); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1200);
  const m = await p.evaluate(()=>({
    docW: document.documentElement.scrollWidth,
    winW: window.innerWidth,
    overflowing: Array.from(document.querySelectorAll('*'))
      .filter(el=>{const r=el.getBoundingClientRect(); return r.width>window.innerWidth+2 && r.height>0;})
      .slice(0,6).map(el=>`${el.tagName.toLowerCase()}.${(el.className||'').toString().split(' ').slice(0,3).join('.')}=${Math.round(el.getBoundingClientRect().width)}px`),
    smallTargets: Array.from(document.querySelectorAll('button,a,select,input[type=checkbox]'))
      .filter(el=>{
        const r=el.getBoundingClientRect();
        if (r.height===0 || r.height>=40) return false;
        if (el.classList.contains('skip-link')) return false;
        // WCAG 2.5.8 exempts a link sitting inline inside a sentence — the
        // text around it sets its size, and padding it would break the line.
        const parent = el.parentElement;
        const inlineInSentence = el.tagName==='A'
          && getComputedStyle(el).display === 'inline'
          && parent && parent.textContent.trim().length > el.textContent.trim().length + 10;
        if (inlineInSentence) return false;
        /*
         * A checkbox drawn at 18px inside a label the whole height of a row is
         * not an 18px target: tapping anywhere on that label toggles it, so the
         * label is what the finger has to hit. Judge it by the label, the way a
         * person actually uses it — but only when there really is one, and only
         * when it is big enough.
         */
        if (el.tagName === 'INPUT') {
          const label = el.closest('label');
          if (label && label.getBoundingClientRect().height >= 40) return false;
        }
        return true;
      }).length,
  }));
  report.push({name,...m});
  await p.screenshot({path:`/tmp/m-${name}.png`});
}
console.log(JSON.stringify(report,null,1));

/*
 * The navigation drawer, explicitly.
 *
 * It regressed once in a way no overflow check would catch: the header carries
 * `backdrop-blur`, which makes it the containing block for fixed children, so
 * the drawer's inset-0 collapsed to the header's own 62px and the menu opened
 * as a strip across the top. Assert it covers the viewport.
 */
await p.goto(`${BASE}/admin/events/${eventId}`);
await p.waitForLoadState('networkidle');
await p.waitForTimeout(800);
await p.locator('header button[aria-expanded]').first().tap();
await p.waitForTimeout(600);
const drawer = await p.evaluate(() => {
  const panel = document.querySelector('[role="dialog"][aria-modal="true"]');
  if (!panel) return { found: false };
  const overlay = panel.parentElement.getBoundingClientRect();
  return {
    found: true,
    coversViewport:
      Math.round(overlay.height) >= window.innerHeight - 2 &&
      Math.round(overlay.width) >= window.innerWidth - 2,
    links: panel.querySelectorAll('a').length,
    overlayHeight: Math.round(overlay.height),
    viewportHeight: window.innerHeight,
  };
});
const drawerOk = drawer.found && drawer.coversViewport && drawer.links > 3;
console.log(`\n${drawerOk ? 'PASS' : 'FAIL'}  navigation drawer covers the screen — ` +
  `${drawer.overlayHeight ?? 0}/${drawer.viewportHeight ?? 0}px, ${drawer.links ?? 0} links`);

await b.close(); db.close();
if (!drawerOk) process.exitCode = 1;
