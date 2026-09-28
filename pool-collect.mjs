import fs from 'fs';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 'Accept-Language': 'zh-CN,zh;q=0.9' };
async function get(url, ms=15000){
  const ac=new AbortController(); const t=setTimeout(()=>ac.abort(),ms);
  try{ const r=await fetch(url,{headers:UA,signal:ac.signal,redirect:'follow'});
    const buf=Buffer.from(await r.arrayBuffer());
    let text=buf.toString('utf8');
    if(/charset=["']?(gb2312|gbk)/i.test(text.slice(0,1000)) || /charset=["']?gb/i.test(r.headers.get('content-type')||'')) text=new TextDecoder('gbk').decode(buf);
    return {status:r.status,text};
  } finally{clearTimeout(t);}
}
function decodeEnt(s){return s.replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(Number(d)));}
function anchors(html, base){
  const out=[]; const re=/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi; let m;
  while((m=re.exec(html))){
    const txt=decodeEnt(m[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
    if(!txt||txt.length<10)continue;
    let href=m[1]; try{href=new URL(href,base).href;}catch{continue;}
    out.push({txt,href,i:m.index});
  }
  return out;
}
const out=[];
function push(s){out.push(s);}

// PEP lists (rjdt, jyyw, mtbd) pagination
for(const [tag,base,pages] of [['pep-rjdt','https://www.pep.com.cn/rjdt/rjdt/',5],['pep-jyyw','https://www.pep.com.cn/rjdt/jyyw/',4],['pep-mtbd','https://www.pep.com.cn/rjdt/mtbd/',4]]){
  for(let p=0;p<pages;p++){
    const u = p===0? base+'/' : base+`/index_${p}.shtml`;
    try{
      const {status,text}=await get(u);
      if(status!==200) { push(`# ${tag} p${p+1} HTTP ${status}`); continue; }
      push(`# ${tag} p${p+1}`);
      const seen=new Set();
      for(const a of anchors(text,u)){
        if(!/t2026\d{4}/.test(a.href))continue;
        if(seen.has(a.href))continue; seen.add(a.href);
        push(`- ${a.txt} | ${a.href}`);
      }
    }catch(e){push(`# ${tag} p${p+1} FAILED ${e.message}`);}
  }
}

// ESPH jkzx with per-item dates
try{
  const {status,text}=await get('https://www.esph.com.cn/jkzx/');
  push(`# ESPH-jkzx HTTP ${status}`);
  const seen=new Set();
  for(const a of anchors(text,'https://www.esph.com.cn/jkzx/')){
    if(!/\/jkzx\/[0-9a-f]{32}\.htm$/.test(a.href))continue;
    if(seen.has(a.href))continue; seen.add(a.href);
    const around=text.slice(Math.max(0,a.i-200), a.i+a.txt.length+400);
    const dm=around.match(/2026-\d{2}-\d{2}/);
    push(`- ${a.txt} | ${dm?dm[0]:''} | ${a.href}`);
  }
}catch(e){push(`# ESPH FAILED ${e.message}`);}

// CBBR article pages for dates
for(const id of ['114035','114042','114069','114065','114060','114057']){
  try{
    const {status,text}=await get(`https://www.cbbr.com.cn/contents/533/${id}.html`);
    const dm=text.match(/2026-\d{2}-\d{2}/);
    const tt=anchors(text,`https://www.cbbr.com.cn/contents/533/${id}.html`);
    const title=(tt[0]&&tt[0].txt)||'';
    push(`# CBBR-${id} ${dm?dm[0]:''} ${title.slice(0,60)}`);
  }catch(e){push(`# CBBR-${id} FAILED ${e.message}`);}
}

fs.writeFileSync('pool.txt', out.join('\n'), 'utf8');
console.log('done', out.length);
