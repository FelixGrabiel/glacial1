/* 27/11/2026 · VERSIÓN NUEVA PUBLICADA
   Una página abierta muchas horas (el bot de WhatsApp en su Chromium sin pantalla, o una PC de planta) sigue con el código con que se abrió.
   Así el bot mandó el Avance en el formato general por línea cuando la página ya había vuelto al formato por formato (PR #183).
   Cada 5 minutos se relee index.html sin caché y se comparan las versiones (?v=…) de los scripts:
   · navegador automatizado (navigator.webdriver: el bot) → se recarga solo, pero nunca mientras arma un Avance/Cierre (3 min de margen);
   · persona → aviso «Hay una versión nueva de GLACIAL · Recargar» (no se recarga sola para no perder lo que esté escribiendo). */
(function(W){
  'use strict';
  const CADA_MS = 5 * 60 * 1000, MARGEN_BOT_MS = 3 * 60 * 1000;
  // Huella: los src locales (js/…?v=…) en orden alfabético.
  function huella(lista){
    return (lista || []).map(s => String(s || '').trim()).filter(s => /^js\//.test(s)).sort().join('\n');
  }
  function huellaHtml(html){
    const out = []; const rx = /<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi; let m;
    while((m = rx.exec(String(html || '')))) out.push(m[1]);
    return huella(out);
  }
  function huellaPagina(doc){
    return huella([...(doc || document).querySelectorAll('script[src]')].map(s => s.getAttribute('src')));
  }
  // Hay versión nueva solo si las dos huellas tienen scripts y son distintas (una lectura vacía o cortada no cuenta).
  function esNueva(actual, publicada){ return !!actual && !!publicada && publicada.split('\n').length >= 10 && actual !== publicada; }
  const esAutomatizado = () => { try{ return !!(W.navigator && W.navigator.webdriver); }catch(_){ return false; } };
  const ocupado = () => { const t = Number(W.__glxBotUltimoUso || 0); return t > 0 && Date.now() - t < MARGEN_BOT_MS; };

  let avisado = false, revisando = false;
  function aviso(){
    if(avisado || !W.document || !document.body) return; avisado = true;
    const d = document.createElement('div'); d.id = 'glx-version-nueva'; d.setAttribute('role', 'status');
    d.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:9999;background:#0B3A5C;color:#fff;border-radius:12px;padding:10px 12px 10px 16px;display:flex;gap:12px;align-items:center;box-shadow:0 6px 24px rgba(0,0,0,.25);font:600 14px/1.3 system-ui,sans-serif;max-width:calc(100vw - 32px)';
    d.innerHTML = '<span>Hay una versión nueva de GLACIAL.</span><button type="button" style="min-height:40px;border:0;border-radius:9px;padding:0 14px;background:#fff;color:#0B3A5C;font:800 14px system-ui,sans-serif;cursor:pointer">Recargar</button>';
    d.querySelector('button').addEventListener('click', () => W.location.reload());
    document.body.appendChild(d);
  }
  async function revisar(){
    if(revisando || typeof W.fetch !== 'function') return false;
    revisando = true;
    try{
      const r = await W.fetch(W.location.pathname + '?vchk=' + Date.now(), { cache: 'no-store' });
      if(!r || !r.ok) return false;
      if(!esNueva(huellaPagina(document), huellaHtml(await r.text()))) return false;
      if(esAutomatizado()){ if(!ocupado()) W.location.reload(); }
      else aviso();
      return true;
    }catch(_){ return false; }
    finally{ revisando = false; }
  }
  W.glacialVersionNueva = { huella, huellaHtml, huellaPagina, esNueva, revisar, CADA_MS, MARGEN_BOT_MS };
  if(W.document && W.setInterval){
    W.setInterval(revisar, CADA_MS);
    document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') revisar(); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
