const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' };
const r = await fetch('https://www.sdpress.com.cn/', { headers: UA });
const buf = Buffer.from(await r.arrayBuffer());
let text = buf.toString('utf8');
if (/charset=["']?gb/i.test(r.headers.get('content-type') || '')) text = new TextDecoder('gbk').decode(buf);
function decodeEnt(s){return s.replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(Number(d)));}
const seen = new Set();
const re = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
let m;
while ((m = re.exec(text))) {
  const txt = decodeEnt(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  if (!txt || txt.length < 8) continue;
  let href = m[1]; try { href = new URL(href, 'https://www.sdpress.com.cn/').href; } catch { continue; }
  if (seen.has(href)) continue; seen.add(href);
  const around = text.slice(Math.max(0, m.index - 250), m.index + txt.length + 350);
  const dm = around.match(/2026(\d{4}|\s?[./-?]\s?\d{1,2}\s?[./-?]\s?\d{1,2})/);
  if (dm) console.log(`- ${txt.slice(0,70)} | ${dm[0]} | ${href}`);
}
