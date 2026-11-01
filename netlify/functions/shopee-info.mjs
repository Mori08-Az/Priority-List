// Best-effort lookup for a Shopee link: follows short links, reads the product name from the final URL,
// then tries to read title / photo / price / rating from the page. Shopee may block servers; every field is optional.
const HOST_OK = h => /(^|\.)(shopee\.([a-z]{2,3}|com?\.[a-z]{2})|shp\.ee|shope\.ee)$/i.test(h);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
// Product photos live under /file/<hash> on Shopee's image CDN; anything else on a Shopee host is a logo/placeholder.
export const isProductImage = u => { try { const x = new URL(u); return x.protocol === 'https:' && (!/shopee|susercontent/i.test(x.hostname) || /\/file\/[\w-]+/.test(x.pathname)); } catch { return false; } };
const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'public, max-age=3600' } });

export function nameFromUrl(u) {
  try {
    const p = decodeURIComponent(new URL(u).pathname);
    const m = p.match(/\/(.+)-i\.(\d+)\.(\d+)/);
    if (m) return { name: m[1].replace(/-/g, ' ').trim(), shopId: m[2], itemId: m[3] };
    const n = p.match(/\/product\/(\d+)\/(\d+)/);
    if (n) return { name: '', shopId: n[1], itemId: n[2] };
  } catch {}
  return { name: '' };
}
const meta = (html, key) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i');
  const tag = (html.match(re) || [''])[0];
  const c = tag.match(/content=["']([^"']*)["']/i);
  return c ? c[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() : '';
};
export function parseHtml(html) {
  const out = {};
  let title = meta(html, 'og:title') || (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
  title = title.replace(/\s*[|\-–]\s*Shopee.*$/i, '').trim();
  if (title && !/^shopee\b/i.test(title)) out.title = title;
  const img = meta(html, 'og:image');
  if (isProductImage(img)) out.image = img;
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      let d = JSON.parse(m[1]); d = Array.isArray(d) ? d.find(x => x['@type'] === 'Product') : d;
      if (!d || d['@type'] !== 'Product') continue;
      if (d.name && !out.title) out.title = String(d.name);
      const im = Array.isArray(d.image) ? d.image[0] : d.image; if (!out.image && isProductImage(im || '')) out.image = im;
      const o = Array.isArray(d.offers) ? d.offers[0] : d.offers;
      const price = Number(o && (o.price ?? o.lowPrice)); if (price > 0) out.price = price;
      const high = Number(o && o.highPrice); if (high > 0 && price > 0 && high !== price) out.priceHigh = high;
      const r = d.aggregateRating || {};
      if (Number(r.ratingValue) > 0) out.rating = Number(r.ratingValue);
      const rc = Number(r.ratingCount ?? r.reviewCount); if (rc >= 0 && r.ratingValue) out.reviews = rc;
    } catch {}
  }
  return out;
}

const UA_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PRODUCT = /-i\.\d+\.\d+|\/product\/\d+\/\d+/;

// Short links return a small launcher page; the real product link may be written inside it (JS redirect / app link).
export function findProductUrl(html) {
  const variants = [html];
  const plain = html.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  variants.push(plain);
  try { variants.push(decodeURIComponent(plain)); } catch {}
  for (const v of variants) {
    for (const m of v.matchAll(/https?:\/\/[^\s"'<>\\)?&#=]+/g)) {
      try { const x = new URL(m[0]); if (HOST_OK(x.hostname) && PRODUCT.test(decodeURIComponent(x.pathname))) return x.href; } catch {}
    }
  }
  return '';
}
export function candidates(html) {
  const plain = html.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  return [...new Set(plain.match(/https?:\/\/[^\s"'<>\\)]+/g) || [])].filter(u => { try { return HOST_OK(new URL(u).hostname); } catch { return false; } }).slice(0, 25);
}

async function resolve(startUrl, ua, trace) {
  let cur = startUrl, html = '';
  try {
    for (let hop = 0; hop < 6; hop++) {
      const r = await fetch(cur, { redirect: 'manual', headers: { 'user-agent': ua, 'accept-language': 'en-PH,en;q=0.9', accept: 'text/html,*/*' }, signal: AbortSignal.timeout(8000) });
      const loc = r.headers.get('location');
      trace.push({ ua: ua === UA ? 'mobile' : 'desktop', url: cur, status: r.status, type: r.headers.get('content-type'), location: loc });
      if (r.status >= 300 && r.status < 400 && loc) {
        const next = new URL(loc, cur);
        if (next.protocol !== 'https:' || !HOST_OK(next.hostname)) break;
        cur = next.href; continue;
      }
      if (r.ok && /text\/html/i.test(r.headers.get('content-type') || '')) html = (await r.text()).slice(0, 1_500_000);
      break;
    }
  } catch (e) { trace.push({ error: String((e && e.message) || e) }); }
  return { cur, html };
}

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const target = q.get('url') || '';
  let u; try { u = new URL(target); } catch { return json({ error: 'bad url' }, 400); }
  if (u.protocol !== 'https:' || !HOST_OK(u.hostname)) return json({ error: 'not a Shopee link' }, 400);
  const debug = q.get('debug') === '1', trace = [];

  let { cur, html } = await resolve(u.href, UA, trace);
  let product = PRODUCT.test(safeDecode(cur)) ? cur : findProductUrl(html);
  if (!product) { // try once more as a desktop browser
    const second = await resolve(u.href, UA_DESKTOP, trace);
    const found = PRODUCT.test(safeDecode(second.cur)) ? second.cur : findProductUrl(second.html);
    if (found || (!html && second.html)) { cur = second.cur; html = second.html; product = found; }
  }
  if (product) {
    cur = product;
    // the product page itself may carry a name/photo; the URL alone already gives the name
    const page = await resolve(product, UA, trace);
    if (page.html) html = page.html;
  }
  try { const inner = new URL(cur).searchParams.get('redirect') || new URL(cur).searchParams.get('url'); if (inner && PRODUCT.test(decodeURIComponent(inner))) cur = decodeURIComponent(inner); } catch {}
  const fromUrl = nameFromUrl(cur), page = parseHtml(html);
  if (debug) {
    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1].trim().slice(0, 500)).filter(Boolean).slice(0, 4);
    return Response.json({ trace, finalUrl: cur, productUrlFound: product || null, name: fromUrl.name, htmlLength: html.length, pageTitle: (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || null, parsed: page, shopeeLinksInPage: candidates(html), inlineScripts: scripts });
  }
  return json({ finalUrl: cur, name: page.title || fromUrl.name || '', shopId: fromUrl.shopId || '', itemId: fromUrl.itemId || '', ...page, title: undefined });
};
function safeDecode(x) { try { return decodeURIComponent(x); } catch { return x; } }
