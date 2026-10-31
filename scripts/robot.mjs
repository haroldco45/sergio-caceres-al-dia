// Robot de Sergio Cáceres al Día — Vibras Positivas HM
// Corre cada 30 minutos en GitHub Actions. Trae noticias reales (Google News)
// y los últimos videos de su canal de YouTube (@caceressss).
// Sin dependencias: Node 20+.
import { readFile, writeFile } from 'node:fs/promises';

const CONSULTAS = [
  '"Sergio Cáceres" edil',
  '"Sergio Cáceres" Usaquén',
  '"Sergio Cáceres" Centro Democrático',
  '"Sergio Cáceres" denuncia Colombia',
  'sergiocaceresro',
];
// Hay otros "Sergio Cáceres" (concejal de Conil en España, futbolistas, Paraguay).
// Solo dejamos los que hablan de él.
const SI = /(usaqu[eé]n|edil|bogot[aá]|centro democr[aá]tico|sergiocaceresro|\bJAL\b|junta administradora)/i;
const NO = /(conil|siempre conil|c[aá]diz|paraguay|asunci[oó]n|futbol|fútbol|olimpia|cerro porte)/i;

const ES_EL = s => !NO.test(s) && ((/c[aá]ceres/i.test(s) && SI.test(s)) || /edil(es)? (de|por) usaqu[eé]n/i.test(s) || /sergiocaceresro/i.test(s));
const UA = { 'user-agent': 'Mozilla/5.0 (VibrasPositivasHM robot)' };

function limpiar(s = '') {
  return s.replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '')
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}]/gu, '') // sin emojis
    .replace(/\s{2,}/g, ' ').trim();
}
const tag = (xml, t) => (xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '';

async function noticias() {
  const out = [];
  for (const q of CONSULTAS) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=CO&ceid=CO:es-419`;
    try {
      const xml = await (await fetch(url, { headers: UA })).text();
      for (const it of xml.split('<item>').slice(1)) {
        const titulo = limpiar(tag(it, 'title'));
        const fuente = limpiar(tag(it, 'source'));
        const desc = limpiar(tag(it, 'description'));
        const texto = `${titulo} ${desc}`;
        if (!ES_EL(texto)) continue;
        out.push({
          titulo: titulo.replace(new RegExp(`\\s+-\\s+${fuente.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), ''),
          fuente,
          enlace: limpiar(tag(it, 'link')),
          fecha: limpiar(tag(it, 'pubDate')),
        });
      }
    } catch (e) { console.error('Noticias', q, e.message); }
  }
  return out;
}

async function videos() {
  try {
    const html = await (await fetch('https://www.youtube.com/@caceressss', { headers: UA })).text();
    const id = (html.match(/"(?:channelId|externalId)":"(UC[\w-]{22})"/) || [])[1];
    if (!id) return null;
    const xml = await (await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: UA })).text();
    return xml.split('<entry>').slice(1, 13).map(e => ({
      id: limpiar(tag(e, 'yt:videoId')),
      titulo: limpiar(tag(e, 'title')),
      fecha: limpiar(tag(e, 'published')),
    })).filter(v => v.id).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  } catch (e) { console.error('Videos', e.message); return null; }
}

async function leer(ruta, def) {
  try { return JSON.parse(await readFile(ruta, 'utf8')); } catch { return def; }
}

const previo = await leer('data/noticias.json', { items: [] });
const nuevas = await noticias();
const mapa = new Map();
for (const n of [...nuevas, ...(previo.items || [])]) {
  const k = n.titulo.toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 90);
  if (!mapa.has(k)) mapa.set(k, n);
}
const ts = f => { const n = new Date(f).getTime(); return isNaN(n) ? 0 : n; };
const items = [...mapa.values()]
  .filter(n => ts(n.fecha) && ES_EL(n.titulo))
  .map(n => ({ ...n, fecha: new Date(ts(n.fecha)).toISOString() }))
  .sort((a, b) => ts(b.fecha) - ts(a.fecha)) // lo más nuevo primero
  .slice(0, 150);
await writeFile('data/noticias.json', JSON.stringify({ actualizado: new Date().toISOString(), items }, null, 1));

const v = await videos();
if (v && v.length) await writeFile('data/videos.json', JSON.stringify({ actualizado: new Date().toISOString(), items: v }, null, 1));

console.log(`Noticias: ${items.length} (nuevas en esta pasada: ${nuevas.length}). Videos: ${v ? v.length : 'sin cambios'}`);
