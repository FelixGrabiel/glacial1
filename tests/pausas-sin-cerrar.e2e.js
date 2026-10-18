/* Panel «PARADAS DE HOY» dibujado con las 43 + 24b reales en Chromium: datos de producción del 18/10/2026 12:05. Uso: node tests/pausas-sin-cerrar.e2e.js */
'use strict';
const fs=require('fs'),path=require('path');
let pw;try{pw=require('playwright');}catch(_){console.log('Se omite: falta playwright.');process.exit(0);}
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,m)=>{console.log((c?'✔ ':'✘ FALLA ')+m);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(path.join(R,f),'utf8');
(async()=>{
  const browser=await pw.chromium.launch();const page=await browser.newPage({viewport:{width:1100,height:900}});
  const errores=[];page.on('pageerror',e=>errores.push(String(e)));
  await page.setContent('<!doctype html><meta charset="utf-8"><body><div id="main"><section id="pp-hoy" class="pp-card"></section></div><div id="modal-root"></div></body>');
  await page.evaluate(()=>{
    window.state={user:{rol:'Supervisor',nombre:'Ana',username:'ana'},currentTab:'centro-perfil'};
    const ms=(f,h,m)=>{const [y,mo,d]=f.split('-').map(Number);return new Date(y,mo-1,d,h,m).getTime();};
    window.__AHORA=ms('2026-10-18',12,5);window.tareoAhoraServidor=()=>window.__AHORA;window.ahoraServidor=()=>window.__AHORA;
    const ct=(l,f,t,m,h,mi)=>({clave:[l,f,t,m].join('|'),linea:l,fecha:f,turno:t,marca:m,presentacion:'7 Litros',cantidadProgramada:10,estadoOperacion:{estado:'PAUSA',inicio:ms(f,7,0),pausaDesde:ms(f,h,mi),motivoPausa:'Cambio temporal de producción',paradas:[]}});
    const ep=(l,f,t,m)=>({clave:[l,f,t,m].join('|'),linea:l,fecha:f,turno:t,marca:m,presentacion:'7 Litros',cantidadProgramada:10,estadoOperacion:{estado:'EN_PRODUCCION',inicio:ms(f,7,0),paradas:[]}});
    window.__prog=[ct('PET2','2026-10-12','DÍA','Merkat',12,19),ct('PET2','2026-10-12','DÍA','Aro',13,20),ct('B7L','2026-10-13','DÍA','ARO',13,17),ct('PET1','2026-10-15','DÍA','Cuisine',11,8),
      {clave:'B7L|2026-10-17|DÍA|BELLS',linea:'B7L',fecha:'2026-10-17',turno:'DÍA',marca:'BELLS',presentacion:'7 Litros',cantidadProgramada:10,estadoOperacion:{estado:'PAUSA',inicio:ms('2026-10-17',7,15),pausaDesde:ms('2026-10-17',13,30),motivoPausa:'Refrigerio',paradas:[]}},
      ep('PET2','2026-10-12','DÍA','Bells'),ep('B7L','2026-10-18','DÍA','Hoy')];
    window.loadProgramaciones=()=>window.__prog;window.puedeVerBitacoraMtto=()=>true;
    window.db=undefined;
  });
  await page.addScriptTag({content:leer('js/produccion/24b-pausas-sin-cerrar.js')});
  await page.addScriptTag({content:leer('js/mantenimiento/43-bitacora-mantenimiento.js')});
  await page.evaluate(()=>{window.__paradasHoy.dia.listo=true;});                // los eventos del día ya «llegaron» (sin ninguno)
  const html=async()=>page.evaluate(()=>window.__paradasHoy.htmlTarjeta());
  let h=await html();
  ok(!/PARADA PROLONGADA/.test(h)&&/SIN PARADAS ABIERTAS/.test(h),'el panel ya no dice «PARADA PROLONGADA» con las pausas viejas');
  ok(/Pausas sin cerrar \(revisar\)/.test(h)&&/B7L<\/b> · 2026-10-17 · DÍA · BELLS 7 Litros/.test(h)&&/Refrigerio · desde 17\/10 13:30 \(22 h 35 min\)/.test(h),'aparecen en «Pausas sin cerrar (revisar)» con línea, fecha, turno, marca, motivo, inicio y tiempo legible');
  ok(!/8626 min|7128 min|4377 min/.test(h)&&(h.match(/data-pp-cerrar=/g)||[]).length===6,'6 botones «Cerrar/Finalizar» (4 estacionadas + 1 refrigerio + 1 producción vieja)');
  ok(!/Sin paradas registradas/.test(h),'NO dice «Sin paradas registradas…» si hay algo por revisar (se acabó la contradicción)');
  await page.evaluate(()=>{window.__prog=[window.__prog[6]];});
  h=await html();ok(/Sin paradas registradas en este día operativo/.test(h)&&!/Pausas sin cerrar/.test(h),'con la lista vacía sí aparece «Sin paradas registradas…»');
  await page.evaluate(()=>{window.__prog=[{clave:'B7L|2026-10-18|DÍA|R',linea:'B7L',fecha:'2026-10-18',turno:'DÍA',marca:'R',presentacion:'7 Litros',cantidadProgramada:10,estadoOperacion:{estado:'PAUSA',inicio:0,pausaDesde:window.__AHORA-135*60000,motivoPausa:'Refrigerio',paradas:[]}}];});
  h=await html();ok(/PARADA PROLONGADA/.test(h)&&/2 h 15 min/.test(h),'un refrigerio de 2 h 15 min sí alerta y se escribe «2 h 15 min»');
  await page.evaluate(()=>{window.state.user.rol='Operador';window.__prog=[{clave:'B7L|2026-10-12|DÍA|R',linea:'B7L',fecha:'2026-10-12',turno:'DÍA',marca:'R',presentacion:'7 Litros',cantidadProgramada:10,estadoOperacion:{estado:'PAUSA',inicio:0,pausaDesde:window.__AHORA-9000*60000,motivoPausa:'Refrigerio',paradas:[]}}];});
  h=await html();ok(/Pausas sin cerrar/.test(h)&&!/data-pp-cerrar/.test(h),'un usuario sin permiso ve el aviso pero NO el botón');
  await page.evaluate(()=>{document.getElementById('pp-hoy').innerHTML=window.__paradasHoy.htmlTarjeta();});
  /* ventana «Cerrar pausa» de punta a punta (con una base simulada) */
  await page.evaluate(()=>{
    window.state.user.rol='Supervisor';
    const ms=(f,h,m)=>{const [y,mo,d]=f.split('-').map(Number);return new Date(y,mo-1,d,h,m).getTime();};
    window.__prog=[{clave:'B7L|2026-10-17|DÍA|BELLS',linea:'B7L',fecha:'2026-10-17',turno:'DÍA',marca:'BELLS',presentacion:'7 Litros',cantidadProgramada:10,estadoOperacion:{estado:'PAUSA',inicio:ms('2026-10-17',7,15),pausaDesde:ms('2026-10-17',13,30),motivoPausa:'Refrigerio',paradas:[{id:'x',tipo:'PAUSA',motivo:'Refrigerio',clasificacion:'PROGRAMADA',estandarMin:60,inicio:ms('2026-10-17',13,30),fin:0}]}}];
    window.__doc={items:JSON.parse(JSON.stringify(window.__prog))};
    window.db={collection:()=>({doc:()=>({})}),runTransaction:async fn=>{let w=null;const r=await fn({get:async()=>({exists:true,data:()=>JSON.parse(JSON.stringify(window.__doc))}),set:(ref,d)=>{w=d;}});if(w)window.__doc=JSON.parse(JSON.stringify(w));return r;}};
    document.getElementById('pp-hoy').innerHTML=window.__paradasHoy.htmlTarjeta();
  });
  await page.click('[data-pp-cerrar]');
  await page.waitForSelector('#pausa-cierre-fin');
  const defecto=await page.inputValue('#pausa-cierre-fin');
  ok(defecto==='2026-10-17T19:00','la ventana sugiere el fin del turno (19:00) como hora de fin');
  await page.fill('#pausa-cierre-fin','2026-10-17T12:00');await page.click('#pausa-cierre-ok');
  ok(/anterior al inicio/.test(await page.locator('#pausa-cierre-error').innerText()),'una hora anterior al inicio se rechaza con un mensaje');
  await page.fill('#pausa-cierre-fin','2026-10-17T14:10');await page.fill('#pausa-cierre-nota','duró 40 min');await page.click('#pausa-cierre-ok');
  await page.waitForSelector('#pausa-cierre-fondo',{state:'detached'});
  const g=await page.evaluate(()=>{const p=window.__doc.items[0],o=p.estadoOperacion;return {estado:o.estado,fin:o.paradas[0].fin,por:o.cierreManual.por,min:Math.round((o.paradas[0].fin-o.paradas[0].inicio)/60000),h:p.historialAlertas.map(x=>x.tipo).join()};});
  ok(g.estado==='FINALIZADA'&&g.min===40&&g.por==='Ana'&&/cierre_manual_pausa/.test(g.h),'cerrar guarda la hora indicada (40 min), quién la cerró y el registro en el historial');
  await page.screenshot({path:require('path').join(require('os').tmpdir(),'paradas-hoy.png')});
  ok(errores.length===0,'sin errores en la consola'+(errores.length?': '+errores[0]:''));
  await browser.close();console.log(fallas?fallas+' fallas':'todo correcto');
})().catch(e=>{console.error(e);process.exit(1);});
