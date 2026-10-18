/* Fotos privadas: colocación de los enlaces firmados en <img> y <a> en un navegador real (Chromium + Playwright).
   Uso: node tests/fotos-supabase.e2e.js */
'use strict';
const fs=require('fs'),path=require('path');
let pw;try{pw=require('playwright');}catch(_){console.log('Se omite: falta playwright.');process.exit(0);}
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,m)=>{console.log((c?'✔ ':'✘ FALLA ')+m);if(!c){fallas++;process.exitCode=1;}};
(async()=>{
  const browser=await pw.chromium.launch();const page=await browser.newPage();
  const errores=[];page.on('pageerror',e=>errores.push(String(e)));
  await page.setContent('<!doctype html><body><div id="r"></div></body>');
  await page.evaluate(()=>{
    window.__firmas=[];
    window.glacialSupabaseCliente={storage:{from:()=>({createSignedUrls:async rutas=>{window.__firmas.push(rutas.slice());
      return {data:rutas.map(r=>r.includes('mala')?{path:r,signedUrl:null,error:'Object not found'}:{path:r,signedUrl:'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==#'+encodeURIComponent(r),error:null})};}})}};
  });
  await page.addScriptTag({content:fs.readFileSync(path.join(R,'js/produccion/06b-fotos-supabase.js'),'utf8')});
  await page.evaluate(()=>{const F=window.glacialFotos;
    document.getElementById('r').innerHTML=
      '<a id="a1" '+F.atributosEnlace('supabase:glacial-fotos/hojas/r1/e1.jpg')+'><img id="i1" '+F.atributosImg('supabase:glacial-fotos/hojas/r1/e1.jpg')+'></a>'+
      '<img id="i2" '+F.atributosImg('supabase:glacial-fotos/hojas/r1/e2.jpg')+'>'+
      '<img id="iv" '+F.atributosImg('https://res.cloudinary.com/c0vr6joq/image/upload/v1/x.jpg')+'>'+
      '<img id="im" '+F.atributosImg('supabase:glacial-fotos/hojas/r1/mala.jpg')+'>';});
  await page.waitForFunction(()=>document.getElementById('i2').src.includes('e2.jpg'),null,{timeout:4000});
  const est=await page.evaluate(()=>({i1:document.getElementById('i1').src,a1:document.getElementById('a1').href,tgt:document.getElementById('a1').target,iv:document.getElementById('iv').src,
    im:document.getElementById('im').getAttribute('data-foto-error'),llamadas:window.__firmas.length,rutas:window.__firmas.flat().sort().join()}));
  ok(/e1\.jpg$/.test(decodeURIComponent(est.i1))&&/e1\.jpg$/.test(decodeURIComponent(est.a1))&&est.tgt==='_blank','las referencias se convierten en enlaces firmados (imagen y enlace «Ver imagen»)');
  ok(est.llamadas===1&&est.rutas==='hojas/r1/e1.jpg,hojas/r1/e2.jpg,hojas/r1/mala.jpg','una sola llamada a Supabase firma todas las fotos de la pantalla (sin repetir)');
  ok(est.iv==='https://res.cloudinary.com/c0vr6joq/image/upload/v1/x.jpg','las fotos antiguas de Cloudinary no se tocan');
  ok(est.im==='1','una foto que no existe queda marcada con error (no rompe las demás)');
  await page.evaluate(()=>{document.getElementById('r').insertAdjacentHTML('beforeend','<img id="i3" '+window.glacialFotos.atributosImg('supabase:glacial-fotos/hojas/r2/e3.jpg')+'>');});
  await page.waitForFunction(()=>document.getElementById('i3').src.includes('e3.jpg'),null,{timeout:4000});
  ok(true,'una foto que aparece después (otra pantalla, historial) también se firma sola');
  /* firma caducada: al hacer clic en el enlace se vuelve a firmar */
  await page.evaluate(()=>{const a=document.getElementById('a1');a.setAttribute('data-foto-vence','1');window.__abierta=null;window.open=()=>({opener:1,location:{set href(v){window.__abierta=v;}},close(){}});});
  await page.evaluate(()=>{const a=document.getElementById('a1');a.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));});
  await page.waitForFunction(()=>!!window.__abierta,null,{timeout:4000});
  ok(/e1\.jpg$/.test(decodeURIComponent(await page.evaluate(()=>window.__abierta))),'con la firma caducada, el clic la renueva antes de abrir la foto');
  ok(errores.length===0,'sin errores en la consola'+(errores.length?': '+errores[0]:''));
  await browser.close();console.log(fallas?fallas+' fallas':'todo correcto');
})().catch(e=>{console.error(e);process.exit(1);});
