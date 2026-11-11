// Daily public-site check. Loads every page of each public site (same-origin
// crawl), then checks: page loads, internal links, pictures, embedded videos,
// outside links, WCAG 2.2 AA (axe-core), phone-width overflow and record leaks.
// Read-only. Writes qa-report.json and qa-report.md; exit 1 on any defect.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'sites.json'), 'utf8'));
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
// Text that only appears in member records or paid app data (same list as public_guard.py).
const RECORD_MARKERS = [/window\.CTI_DATA/, /"ph"\s*:/, /"records"\s*:\s*\[/, /\bOriginal: National Archives/, /\bHeld at:/];
const PLACEHOLDER = /\b(lorem ipsum|TODO|FIXME|TBD)\b/;
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
  const ctx = await browser.newContext();
  const req = ctx.request;
  const out = { run: new Date().toISOString(), sites: [] };
  const extSeen = new Map();
  for (const site of cfg.sites) {
    const origin = new URL(site.url).origin;
    const scope = site.url;
    const S = { ...site, pages: [], defects: [], warnings: [], videos: { ok: 0, broken: 0 } };
    const queue = [site.url], seen = new Set();
    while (queue.length && seen.size < (cfg.max_pages_per_site || 30)) {
      const url = queue.shift().split('#')[0].replace(/\/index\.html$/, '/');
      if (seen.has(url)) continue;
      seen.add(url);
      const page = await ctx.newPage();
      const P = { url };
      try {
        const resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
        P.status = resp ? resp.status() : 'no answer';
        if (!resp || resp.status() >= 400) { S.defects.push(`${url}: page did not load (${P.status})`); await page.close(); continue; }
        await page.waitForTimeout(800);
        const info = await page.evaluate(() => ({
          title: document.title,
          links: [...document.querySelectorAll('a[href]')].map(a => ({ href: a.href, raw: a.getAttribute('href') })),
          imgs: [...document.images].filter(i => i.loading !== 'lazy' || i.complete).map(i => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0 })),
          frames: [...document.querySelectorAll('iframe[src], video[src], video source[src], audio[src], audio source[src]')].map(f => f.src),
          html: document.documentElement.outerHTML,
        }));
        P.title = info.title;
        if (!info.title) S.defects.push(`${url}: page has no title`);
        for (const l of info.links) {
          if (/^(mailto:|tel:|#)/i.test(l.raw || '')) continue;
          if (/^javascript:/i.test(l.raw || '')) { S.defects.push(`${url}: link "${l.raw}" is a script, not a link`); continue; }
          if (l.href.startsWith(scope) || (l.href.startsWith(origin) && scope === origin + '/')) {
            const clean = l.href.split('#')[0].replace(/\/index\.html$/, '/');
            if (!seen.has(clean) && !/\.(pdf|zip|png|jpe?g|webp|svg|mp4|json|csv)$/i.test(clean)) queue.push(clean);
            else if (/\.(pdf|zip|png|jpe?g|webp|svg|mp4)$/i.test(clean)) { const s = await status(req, clean); if (s >= 400 || s === 'no answer') S.defects.push(`${url}: link to ${clean} is broken (${s})`); }
          } else if (/^https?:/.test(l.href)) {
            if (!extSeen.has(l.href)) extSeen.set(l.href, { from: url, site: site.name });
          }
        }
        for (const i of info.imgs) if (!i.ok) S.defects.push(`${url}: picture did not load: ${i.src}`);
        for (const f of info.frames) {
          if (S.videoSeen && S.videoSeen.has(f)) continue;
          (S.videoSeen = S.videoSeen || new Set()).add(f);
          const v = await videoStatus(req, f);
          if (v.ok) S.videos.ok++; else { S.videos.broken++; S.defects.push(`${url}: video ${v.id || f} does not play (${v.why || 'error'})`); }
        }
        for (const m of RECORD_MARKERS) if (m.test(info.html)) S.defects.push(`${url}: member-record text on a public page (${m.source})`);
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
    out.sites.push(S);
  }
  // Outside links, checked once each.
  out.external = { ok: 0, broken: [], robot_blocked: [] };
  for (const [href, from] of extSeen) {
    const s = await status(req, href);
    if (typeof s === 'number' && s < 400) out.external.ok++;
    else if (BOT_BLOCK.has(s)) out.external.robot_blocked.push({ href, status: s, ...from });
    else out.external.broken.push({ href, status: s, ...from });
  }
  await browser.close();

  let failing = 0;
  const md = [`# Public site check ${out.run.slice(0, 16).replace('T', ' ')} UTC`, '',
    '| Site | Pages | Videos playing | Videos broken | Defects | Warnings |', '|---|---|---|---|---|---|'];
  for (const S of out.sites) {
    md.push(`| [${S.name}](${S.url}) | ${S.pages.length} | ${S.videos.ok} | ${S.videos.broken} | ${S.defects.length} | ${S.warnings.length} |`);
    if (!S.warn_only) failing += S.defects.length;
  }
  md.push('', `Outside links: ${out.external.ok} working, ${out.external.broken.length} broken, ${out.external.robot_blocked.length} refuse robots (check by hand).`);
  failing += out.external.broken.length;
  for (const S of out.sites) if (S.defects.length || S.warnings.length) {
    md.push('', `## ${S.name}${S.warn_only ? ' (report only)' : ''}`);
    S.defects.forEach(d => md.push(`- DEFECT: ${d}`));
    S.warnings.forEach(d => md.push(`- warning: ${d}`));
  }
  if (out.external.broken.length) { md.push('', '## Broken outside links'); out.external.broken.forEach(b => md.push(`- ${b.href} (${b.status}) on ${b.from}`)); }
  fs.writeFileSync('qa-report.json', JSON.stringify(out, null, 1));
  fs.writeFileSync('qa-report.md', md.join('\n') + '\n');
  console.log(md.join('\n'));
  process.exit(failing ? 1 : 0);
})();
