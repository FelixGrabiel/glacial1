/* =============================================================
   GLACIAL · FOTOS EN SUPABASE STORAGE (privadas, con enlace firmado)
   -------------------------------------------------------------
   Reemplaza a Cloudinary para las evidencias. Las fotos van a un bucket PRIVADO («glacial-fotos»): nadie puede abrirlas con una dirección fija;
   la página pide a Supabase un enlace FIRMADO que caduca (1 hora) y solo lo obtienen los usuarios con sesión que tengan permiso (reglas de
   storage.objects en supabase/migraciones/glacial_25_fotos_privadas.sql).
   · Lo que se guarda en la base es una REFERENCIA estable, no un enlace: url = «supabase:glacial-fotos/<ruta>». Las fotos antiguas de Cloudinary
     (url https://…) siguen funcionando igual: aquí se devuelven sin cambios.
   · subir(blob, {carpeta, id}) sube la foto (nunca sobrescribe) y devuelve {url, path, bucket, proveedor}.
   · Para mostrar: en el HTML se escribe atributosImg(url) / atributosEnlace(url); un observador firma los enlaces en lote (una sola llamada a
     Supabase por tanda) y los coloca en <img src> / <a href>. Las firmas se guardan en memoria y se renuevan antes de caducar.
   · Si Supabase Storage no está disponible (p. ej. el bucket aún no existe en ese proyecto), disponible() lo indica y quien llama puede volver a
     Cloudinary: así la operación no se detiene.
   Cargar DESPUÉS del puente (00b-puente-supabase.js) y ANTES de 06-registro.js.
   ============================================================= */
(function instalarFotosSupabase(global){
  'use strict';
  const BUCKET='glacial-fotos';
  const PREFIJO='supabase:'+BUCKET+'/';
  const TTL_SEG=3600,MARGEN_MS=5*60*1000;
  const PIXEL='data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  const firmas=new Map();                                          // ruta → {url, vence}
  const pendientes=new Map();                                      // ruta → promesa en curso (una sola firma por ruta)

  const cliente=()=>global.glacialSupabaseCliente||null;
  const esRef=u=>typeof u==='string'&&u.indexOf(PREFIJO)===0;
  const rutaDe=u=>esRef(u)?u.slice(PREFIJO.length):'';
  const disponible=()=>!!(cliente()&&cliente().storage);
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahora=()=>Date.now();

  async function subir(blob,{carpeta,id,tipo},opciones){
    opciones=opciones||{};
    if(!disponible())throw new Error('Supabase Storage no está disponible.');
    if(!blob)throw new Error('No hay archivo para subir.');
    /* Solo se sube un archivo real. Si el objeto perdió su contenido (p. ej. al copiar el formulario como texto, queda «{}»), Storage lo guardaba como el texto
       «[object Object]» (15 bytes) y la foto salía rota para siempre: mejor detener el guardado y pedir que se vuelva a elegir. */
    if(typeof Blob!=='undefined'&&!(blob instanceof Blob))throw new Error('el archivo de la foto se perdió (recarga o copia del formulario). Vuelve a seleccionarla.');
    if(blob.size===0)throw new Error('el archivo de la foto está vacío. Vuelve a seleccionarla.');
    const mime=tipo||blob.type||'image/jpeg';
    const ext=/pdf/.test(mime)?'pdf':/png/.test(mime)?'png':/webp/.test(mime)?'webp':'jpg';
    const ruta=String(carpeta||'sin_carpeta').replace(/^\/+|\/+$/g,'')+'/'+String(id||('f_'+ahora().toString(36)))+'.'+ext;
    const r=await cliente().storage.from(BUCKET).upload(ruta,blob,{contentType:mime,upsert:opciones.reemplazar===true,cacheControl:'3600'});
    if(r.error)throw new Error(r.error.message||'No se pudo subir la foto.');
    return {url:PREFIJO+ruta,path:ruta,bucket:BUCKET,proveedor:'supabase'};
  }

  /* Firma las rutas que faltan (o están por caducar) en UNA llamada y devuelve Map ruta → url. */
  async function firmarRutas(rutas){
    const salida=new Map(),faltan=[];
    [...new Set(rutas)].forEach(r=>{
      const f=firmas.get(r);
      if(f&&f.vence-ahora()>MARGEN_MS)salida.set(r,f.url);
      else if(pendientes.has(r))faltan.push(null);
      else faltan.push(r);
    });
    const nuevas=faltan.filter(Boolean);
    if(nuevas.length&&disponible()){
      const llamada=cliente().storage.from(BUCKET).createSignedUrls(nuevas,TTL_SEG).then(res=>{
        if(res.error)throw new Error(res.error.message||'No se pudo firmar.');
        (res.data||[]).forEach(d=>{if(d&&d.signedUrl&&!d.error)firmas.set(d.path,{url:d.signedUrl,vence:ahora()+TTL_SEG*1000});});
      }).finally(()=>nuevas.forEach(r=>pendientes.delete(r)));
      nuevas.forEach(r=>pendientes.set(r,llamada));
    }
    await Promise.all([...new Set(rutas)].map(r=>pendientes.get(r)).filter(Boolean).map(p=>p.catch(()=>null)));
    [...new Set(rutas)].forEach(r=>{const f=firmas.get(r);if(f)salida.set(r,f.url);});
    return salida;
  }
  /* Enlace https utilizable: las referencias se firman; las direcciones de Cloudinary (https://…) se devuelven tal cual. */
  async function resolver(url){
    if(!esRef(url))return url||'';
    const m=await firmarRutas([rutaDe(url)]);
    return m.get(rutaDe(url))||'';
  }

  /* ---------- HTML: atributos para <img> y <a> ---------- */
  const atributosImg=url=>esRef(url)?`src="${PIXEL}" data-foto-ref="${esc(url)}"`:`src="${esc(url||'')}"`;
  const atributosEnlace=url=>esRef(url)?`href="#" data-foto-ref="${esc(url)}"`:`href="${esc(url||'')}"`;

  /* ---------- colocar las firmas en la página ---------- */
  async function hidratar(raiz){
    const base=raiz||document;
    const els=[...base.querySelectorAll('[data-foto-ref]')].filter(el=>!el.getAttribute('data-foto-lista')||el.getAttribute('data-foto-vence')<String(ahora()+MARGEN_MS));
    if(!els.length)return 0;
    let mapa;
    try{mapa=await firmarRutas(els.map(el=>rutaDe(el.getAttribute('data-foto-ref'))));}catch(_){return 0;}
    let n=0;
    els.forEach(el=>{
      const r=rutaDe(el.getAttribute('data-foto-ref')),u=mapa.get(r);
      if(!u){el.setAttribute('data-foto-error','1');return;}
      if(el.tagName==='IMG')el.src=u;else if(el.tagName==='A'){el.href=u;el.target='_blank';el.rel='noopener noreferrer';}
      el.setAttribute('data-foto-lista','1');el.setAttribute('data-foto-vence',String(firmas.get(r).vence));el.removeAttribute('data-foto-error');n++;
    });
    return n;
  }
  /* Un enlace cuya firma caducó se vuelve a firmar al hacer clic (antes de abrirlo). */
  function alClic(e){
    const a=e.target&&e.target.closest?e.target.closest('a[data-foto-ref]'):null;
    if(!a)return;
    const ref=a.getAttribute('data-foto-ref'),vence=Number(a.getAttribute('data-foto-vence')||0);
    if(a.getAttribute('data-foto-lista')&&vence-ahora()>0)return;          // firma vigente: el enlace normal funciona
    e.preventDefault();
    const w=global.open('','_blank');if(w)w.opener=null;
    resolver(ref).then(u=>{if(w){if(u)w.location.href=u;else w.close();}}).catch(()=>{if(w)w.close();});
  }
  let reloj=null;
  function programar(){if(reloj)return;reloj=setTimeout(()=>{reloj=null;hidratar();},150);}
  function iniciar(){
    document.addEventListener('click',alClic,true);
    new MutationObserver(m=>{if(m.some(x=>x.addedNodes&&x.addedNodes.length||x.type==='attributes'))programar();}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-foto-ref']});
    programar();
  }
  if(typeof document!=='undefined'&&document.body!==undefined){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();}

  global.glacialFotos={BUCKET,PREFIJO,PIXEL,esRef,rutaDe,disponible,subir,resolver,firmarRutas,atributosImg,atributosEnlace,hidratar,
    _limpiarCache:()=>{firmas.clear();pendientes.clear();}};
})(typeof window!=='undefined'?window:globalThis);
