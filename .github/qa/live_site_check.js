// Daily public-site check. Loads every page of each public site (same-origin
// crawl), then checks: page loads, internal links, pictures, embedded videos,
// outside links, WCAG 2.2 AA (axe-core), phone-width overflow and record leaks.
// Content and link auditor (Nov 19 2026): page inventory compared with the last run,
// #anchors, http links on https pages, mailto/tel form, redirect chains, sitemap.xml,
// 404 page, titles/descriptions (missing, duplicate), og:image and JSON-LD, favicon,
// alt text, heavy pictures, untitled frames, house terms (sites.json house_terms),
// working notes and empty filter options, and a 0-100 score per site with its trend.
// Read-only. Writes qa-report.json and qa-report.md; exit 1 on any defect.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const cfg = JSON.parse(fs.readFileSync(process.env.SITES_JSON || path.join(__dirname, 'sites.json'), 'utf8'));
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
// Text that only appears in member records or paid app data (same list as public_guard.py).
const RECORD_MARKERS = [/window\.CTI_DATA/, /"ph"\s*:/, /"records"\s*:\s*\[/, /\bOriginal: National Archives/, /\bHeld at:/];
const PLACEHOLDER = /\b(lorem ipsum|TODO|FIXME|TBD)\b/;
// House terms and working text that must never reach a public page (visible text only).
const HOUSE = (cfg.house_terms || []).map(t => ({ re: new RegExp(t.pattern, t.flags || ''), why: t.why, warn: !!t.warn_only }));
const KEEP_HEADERS = ['content-security-policy', 'x-content-type-options', 'referrer-policy', 'strict-transport-security', 'x-frame-options', 'permissions-policy'];
const SKIP_HEADER_HOSTS = new Set(['atlas-223f5.web.app', 'atlas-223f5.firebaseapp.com']); // Fraternal Vault: hands off
const PREV = (() => { try { return JSON.parse(fs.readFileSync(process.env.PREV_REPORT || 'previous/qa-report.json', 'utf8')); } catch (e) { return null; } })();
// OFFLINE=1: source copies served on this machine; outside links and videos are not checked.
const OFFLINE = !!process.env.OFFLINE;
const BOT_BLOCK = new Set([401, 403, 405, 429, 999]); // site refuses robots: listed, not counted as broken

async function status(req, url) {
  try {
    let r = await req.fetch(url, { method: 'HEAD', timeout: 20000, maxRedirects: 10 });
    if (r.status() === 405 || r.status() === 404) r = await req.get(url, { timeout: 20000, maxRedirects: 10 });
    return r.status();
  } catch (e) { return 'no answer'; }
}

async function videoStatus(req, src) {
  const m = src.match(/(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/|v=)([\w-]{11})/);
  if (!m) return { kind: 'other', ok: (await status(req, src)) < 400 };
  const r = await req.get(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${m[1]}`, { timeout: 20000 }).catch(() => null);
  const s = r ? r.status() : 'no answer';
  return { kind: 'youtube', id: m[1], ok: s === 200, why: s === 200 ? '' : (s === 401 ? 'private or embedding off' : s === 404 ? 'removed' : String(s)) };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ bypassCSP: true }); // lets the WCAG checker run on pages with a strict Content Security Policy
  const req = ctx.request;
  const out = { run: new Date().toISOString(), sites: [] };
  const extSeen = new Map();
  for (const site of cfg.sites) {
    const origin = new URL(site.url).origin;
    const scope = site.url;
    const S = { ...site, pages: [], defects: [], warnings: [], videos: { ok: 0, broken: 0 } };
    const queue = [site.url], seen = new Set(), linkedFrom = new Set([site.url]);
    S.inventory = {};
    S.headers = {}; // security headers per page, read offline by security/web_baseline.py
    while (queue.length && seen.size < (cfg.max_pages_per_site || 30)) {
      const url = queue.shift().split('#')[0].replace(/\/index\.html$/, '/');
      if (seen.has(url)) continue;
      seen.add(url);
      const page = await ctx.newPage();
      if (OFFLINE) await page.route(u => !u.href.startsWith(origin), r => r.abort());
      const P = { url }, heavy = [];
      page.on('response', r => { if (r.request().resourceType() === 'image') { const n = +(r.headers()['content-length'] || 0); if (n > 500000) heavy.push(`${r.url()} (${Math.round(n / 1024)} KB)`); } });
      try {
        const resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
        P.status = resp ? resp.status() : 'no answer';
        if (resp) { let n = 0, q = resp.request(); while ((q = q.redirectedFrom())) n++; if (n > 1) S.warnings.push(`${url}: reached through ${n} redirects (make links point at the final address)`); }
        if (!resp || resp.status() >= 400) { S.defects.push(`${url}: page did not load (${P.status})`); await page.close(); continue; }
        if (!/html/i.test(resp.headers()['content-type'] || 'text/html')) { await page.close(); continue; } // a file, not a page
        if (!SKIP_HEADER_HOSTS.has(new URL(url).hostname)) { const h = resp.headers(), keep = {}; for (const k of KEEP_HEADERS) keep[k] = h[k] ?? null; S.headers[url.replace(origin, '') || '/'] = keep; }
        await page.waitForTimeout(800);
        const info = await page.evaluate(() => ({
          title: document.title,
          links: [...document.querySelectorAll('a[href]')].map(a => ({ href: a.href, raw: a.getAttribute('href') })),
          imgs: [...document.images].filter(i => i.loading !== 'lazy' || i.complete).map(i => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0 })),
          frames: [...document.querySelectorAll('iframe[src], video[src], video source[src], audio[src], audio source[src]')].map(f => f.src),
          html: document.documentElement.outerHTML,
          text: document.body ? document.body.innerText : '',
          desc: (document.querySelector('meta[name="description"]') || {}).content || '',
          canonical: (document.querySelector('link[rel="canonical"]') || {}).href || '',
          lang: document.documentElement.lang,
          h1: [...document.querySelectorAll('h1')].map(h => h.innerText.trim()),
          favicon: !!document.querySelector('link[rel~="icon"]'),
          ids: [...document.querySelectorAll('[id],a[name]')].map(e => e.id || e.getAttribute('name')),


          jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(x => x.textContent),
          ogimg: [...document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]')].map(m => m.content),
          options: [...document.querySelectorAll('option')].map(o => o.textContent.trim()),
        }));
        P.title = info.title;
        if (!info.title) S.defects.push(`${url}: page has no title`);
        // Content inventory, compared with the last run.
        const words = (info.text.match(/\S+/g) || []).length;
        S.inventory[url.replace(origin, '') || '/'] = { title: info.title, description: info.desc, canonical: info.canonical, lang: info.lang, h1: info.h1.join(' | '), words,
          hash: require('crypto').createHash('sha256').update(info.text).digest('hex').slice(0, 16) };
        if (!info.desc) S.warnings.push(`${url}: no meta description (search results and shares show no summary)`);
        if (info.h1.length !== 1) S.warnings.push(`${url}: ${info.h1.length} main headings (h1); expected 1`);
        if (!info.favicon && url === site.url) S.warnings.push(`${url}: no favicon`);
        for (const h of heavy) S.warnings.push(`${url}: heavy picture over 500 KB: ${h}`);
        for (const j of info.jsonld) { try { JSON.parse(j); } catch (e) { S.defects.push(`${url}: structured data (JSON-LD) does not parse`); } }
        for (const o of new Set(info.ogimg)) if (!OFFLINE || new URL(o, url).origin === origin) { const s = await status(req, new URL(o, url).href); if (!(s < 400)) S.defects.push(`${url}: share picture ${o} does not load (${s})`); }
        for (const o of info.options) if (/^[a-z_]+\s*\(0\)$/.test(o)) S.warnings.push(`${url}: filter option "${o}" is a raw code with no records`);
        for (const h of HOUSE) { const m = info.text.match(h.re); if (m) (h.warn ? S.warnings : S.defects).push(`${url}: "${m[0]}" on the page: ${h.why}`); }
        const idset = new Set(info.ids), missingAnchors = new Set();
        for (const l of info.links) {
          const raw = l.raw || '';
          if (/^mailto:/i.test(raw)) { if (!/^mailto:[^@\s?]+@[^@\s?]+\.[a-z]{2,}(\?.*)?$/i.test(raw)) S.defects.push(`${url}: badly formed e-mail link "${raw}"`); continue; }
          if (/^tel:/i.test(raw)) { if (!/^tel:\+?[\d\-(). ]{7,}$/i.test(raw)) S.defects.push(`${url}: badly formed phone link "${raw}"`); continue; }
          if (raw.startsWith('#')) { if (raw.length > 1 && !/^#[!/]/.test(raw) && !idset.has(decodeURIComponent(raw.slice(1)))) missingAnchors.add(raw); continue; }
          if (url.startsWith('https:') && /^http:\/\//i.test(l.href)) S.warnings.push(`${url}: insecure http link ${l.href}`);
          if (/^javascript:/i.test(l.raw || '')) { S.defects.push(`${url}: link "${l.raw}" is a script, not a link`); continue; }
          if (l.href.startsWith(scope) || (l.href.startsWith(origin) && scope === origin + '/')) {
            const clean = l.href.split('#')[0].replace(/\/index\.html$/, '/');
            linkedFrom.add(clean);
            if (!seen.has(clean) && !/\.(pdf|zip|png|jpe?g|webp|svg|mp4|json|csv)$/i.test(clean)) queue.push(clean);
            else if (/\.(pdf|zip|png|jpe?g|webp|svg|mp4)$/i.test(clean)) { const s = await status(req, clean); if (s >= 400 || s === 'no answer') S.defects.push(`${url}: link to ${clean} is broken (${s})`); }
          } else if (/^https?:/.test(l.href)) {
            if (!extSeen.has(l.href)) extSeen.set(l.href, { from: url, site: site.name });
          }
        }
        for (const i of info.imgs) if (!i.ok) S.defects.push(`${url}: picture did not load: ${i.src}`);
        for (const f of OFFLINE ? [] : info.frames.filter(f => /^https?:/.test(f))) {
          if (S.videoSeen && S.videoSeen.has(f)) continue;
          (S.videoSeen = S.videoSeen || new Set()).add(f);
          const v = await videoStatus(req, f);
          if (v.ok) S.videos.ok++; else { S.videos.broken++; S.defects.push(`${url}: video ${v.id || f} does not play (${v.why || 'error'})`); }
        }
        // Three or more missing #targets on one page means the page routes by #hash (a single-page app); those links are screens, not places.
        if (missingAnchors.size >= 3) S.warnings.push(`${url}: ${missingAnchors.size} #links have no matching place; the page looks like it switches screens by #hash, so they were not checked`);
        else for (const raw of missingAnchors) S.defects.push(`${url}: link "${raw}" points to a place that is not on the page`);
        // Per-site content rules from sites.json: text that must be on the home page, text that must never appear.
        const isHome = url === site.url.split('#')[0];
        if (isHome) {
          for (const t of site.expect || []) if (!info.html.includes(t)) S.defects.push(`${url}: expected text missing: "${t}"`);
          for (const r of cfg.require_on_home || []) if (!new RegExp(r.pattern, r.flags || '').test(info.text)) S.defects.push(`${url}: missing on the home page: ${r.why}`);
          if (site.expect_og_image) {
            const og = await page.evaluate(() => (document.querySelector('meta[property="og:image"]') || {}).content || '');
            if (!og.includes(site.expect_og_image)) S.defects.push(`${url}: og:image is "${og}", expected ${site.expect_og_image}`);
            else { const s = await status(req, new URL(og, url).href); if (!(s < 400)) S.defects.push(`${url}: og:image ${og} does not load (${s})`); }
          }
        }
        for (const t of site.forbid || []) if (info.html.includes(t)) S.defects.push(`${url}: forbidden text on a public page: "${t}"`);
        for (const m of RECORD_MARKERS) if (!(site.allow_markers || []).includes(m.source) && m.test(info.html)) S.defects.push(`${url}: member-record text on a public page (${m.source})`);
        const ph = info.html.replace(/<script[\s\S]*?<\/script>/g, '').match(PLACEHOLDER);
        if (ph) S.warnings.push(`${url}: placeholder text "${ph[0]}"`);
        await page.addScriptTag({ content: AXE });
        const viol = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help })));
        for (const v of viol) (['serious', 'critical'].includes(v.impact) ? S.defects : S.warnings).push(`${url}: WCAG 2.2 AA ${v.id} (${v.impact}, ${v.n} places): ${v.help}`);
        // WCAG 1.4.10 Reflow is measured at 320 CSS px; 360 px is the common phone width.
        for (const w of [320, 360]) {
          await page.setViewportSize({ width: w, height: 800 });
          if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) {
            S.defects.push(`${url}: page scrolls sideways at ${w} px${w === 320 ? ' (WCAG 1.4.10 Reflow)' : ' (phone width)'}`);
            break;
          }
        }
      } catch (e) {
        S.defects.push(`${url}: ${e.message.split('\n')[0].slice(0, 160)}`);
      }
      S.pages.push(P);
      await page.close();
    }
    delete S.videoSeen;
    // Site-wide: duplicate titles/descriptions, 404 page, sitemap.xml against what was served.
    const dup = (k) => { const m = {}; for (const [u, v] of Object.entries(S.inventory)) if (v[k]) (m[v[k]] = m[v[k]] || new Set()).add(u.split('?')[0].replace(/\/$/, '') || '/'); return Object.entries(m).map(([t, us]) => [t, [...us]]).filter(([, us]) => us.length > 1); };
    for (const [t, us] of dup('title')) S.warnings.push(`${us.length} pages share the title "${t.slice(0, 60)}": ${us.join(', ')}`);
    for (const [t, us] of dup('description')) S.warnings.push(`${us.length} pages share one description: ${us.join(', ')}`);
    const miss = await req.get(new URL('qa-no-such-page-' + Date.now(), scope).href, { timeout: 20000 }).catch(() => null);
    if (miss && miss.status() === 200) S.warnings.push(`a missing address answers 200, not 404 (search engines index error pages)`);
    const sm = await req.get(origin + '/sitemap.xml', { timeout: 20000 }).catch(() => null);
    if (sm && sm.status() === 200 && /<urlset/.test(await sm.text())) {
      const locs = [...(await sm.text()).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => { try { return origin + new URL(m[1]).pathname; } catch (e) { return m[1]; } });
      const norm = u => { try { return new URL(u).pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/\/$/, '') || '/'; } catch (e) { return u; } };
      const locPaths = new Set(locs.map(norm)), seenPaths = new Set([...seen].map(norm));
      for (const u of locs) if (u.startsWith(scope) && !seenPaths.has(norm(u))) { const s = await status(req, u); if (!(s < 400)) S.defects.push(`sitemap.xml lists ${u}, which does not load (${s})`); else S.warnings.push(`sitemap.xml lists ${u}, but no page links to it`); }
      for (const u of seen) if (!u.includes('?') && !locPaths.has(norm(u))) S.warnings.push(`${u} is served but not in sitemap.xml`);
    }
    // Content changes since the last run.
    const prevS = PREV && PREV.sites.find(x => x.name === S.name);
    const before = prevS && prevS.inventory;
    if (before) {
      S.changes = [];
      for (const [u, v] of Object.entries(S.inventory)) {
        const b = before[u];
        if (!b) S.changes.push(`new page ${u}`);
        else for (const k of ['title', 'description', 'canonical', 'h1', 'hash']) if (b[k] !== v[k]) S.changes.push(`${u}: ${k === 'hash' ? `text changed (${b.words} → ${v.words} words)` : `${k} "${String(b[k]).slice(0, 50)}" → "${String(v[k]).slice(0, 50)}"`}`);
      }
      for (const u of Object.keys(before)) if (!S.inventory[u]) S.changes.push(`page gone ${u}`);
    }
    // Score: 100, less 5 per defect and 1 per warning (floor 0), with the change since the last run.
    S.score = Math.max(0, 100 - 5 * S.defects.length - S.warnings.length);
    S.trend = prevS && typeof prevS.score === 'number' ? S.score - prevS.score : null;
    out.sites.push(S);
  }
  // Outside links, checked once each.
  out.external = { ok: 0, broken: [], robot_blocked: [] };
  // Library of Congress newspaper pages refuse automated page loads (403). Check the same page
  // through the Library's own data addresses instead: the JSON view, then Chronicling America.
  async function locStatus(href) {
    const m = href.match(/loc\.gov\/resource\/(sn\w+)\/(\d{4}-\d{2}-\d{2})\/ed-(\d+)\/?(?:\?sp=(\d+))?/);
    if (!m) return null;
    const tries = [href + (href.includes('?') ? '&' : '?') + 'fo=json',
      `https://chroniclingamerica.loc.gov/lccn/${m[1]}/${m[2]}/ed-${m[3]}/seq-${m[4] || 1}.json`];
    for (const t of tries) {
      const r = await req.get(t, { timeout: 20000, maxRedirects: 10 }).catch(() => null);
      if (r && r.status() === 200) return 200;
      if (r && r.status() === 404) return 404;
    }
    return null;
  }
  if (OFFLINE) extSeen.clear();
  for (const [href, from] of extSeen) {
    let s = /youtube\.com\/watch|youtu\.be\//.test(href) ? ((await videoStatus(req, href)).ok ? 200 : 404) : await status(req, href);
    if (BOT_BLOCK.has(s) && /loc\.gov\/resource\//.test(href)) s = (await locStatus(href)) || s;
    if (typeof s === 'number' && s < 400) out.external.ok++;
    // Big sites that answer robots with 400/503 or not at all (not with 404) are listed for a hand check, not counted as broken.
    else if (BOT_BLOCK.has(s) || (s !== 404 && s !== 410 && /(^|\.)(facebook|amazon|youtube|instagram|linkedin|x|twitter)\.com$/.test(new URL(href).hostname))) out.external.robot_blocked.push({ href, status: s, ...from });
    else out.external.broken.push({ href, status: s, ...from });
  }
  await browser.close();

  let failing = 0;
  const md = [`# Public site check ${out.run.slice(0, 16).replace('T', ' ')} UTC`, '',
    '| Site | Score | Trend | Pages | Videos playing | Videos broken | Defects | Warnings | Changes |', '|---|---|---|---|---|---|---|---|---|'];
  for (const S of out.sites) {
    md.push(`| [${S.name}](${S.url}) | ${S.score} | ${S.trend === null ? 'first run' : (S.trend > 0 ? '+' : '') + S.trend} | ${S.pages.length} | ${S.videos.ok} | ${S.videos.broken} | ${S.defects.length} | ${S.warnings.length} | ${S.changes ? S.changes.length : '-'} |`);
    if (!S.warn_only) failing += S.defects.length;
  }
  md.push('', `Outside links: ${out.external.ok} working, ${out.external.broken.length} broken, ${out.external.robot_blocked.length} refuse robots (check by hand).`);
  { const hp = out.sites.reduce((n, S) => n + Object.keys(S.headers || {}).length, 0), csp = out.sites.reduce((n, S) => n + Object.values(S.headers || {}).filter(h => h['content-security-policy']).length, 0); md.push('', `Security headers saved for ${hp} pages (${csp} send a content security policy; Fraternal Vault left out).`); }
  failing += out.external.broken.length;
  for (const S of out.sites) if (S.defects.length || S.warnings.length || (S.changes || []).length) {
    md.push('', `## ${S.name}${S.warn_only ? ' (report only)' : ''}`);
    S.defects.forEach(d => md.push(`- DEFECT: ${d}`));
    S.warnings.forEach(d => md.push(`- warning: ${d}`));
    (S.changes || []).forEach(d => md.push(`- changed: ${d}`));
  }
  if (out.external.broken.length) { md.push('', '## Broken outside links'); out.external.broken.forEach(b => md.push(`- ${b.href} (${b.status}) on ${b.from}`)); }
  fs.writeFileSync('qa-report.json', JSON.stringify(out, null, 1));
  fs.writeFileSync('qa-report.md', md.join('\n') + '\n');
  console.log(md.join('\n'));
  process.exit(failing ? 1 : 0);
})();
