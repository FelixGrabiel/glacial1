/* =========================================================
   LOTE 4 · PARTE B · RESUMEN DE TURNO AUTOMÁTICO + pantalla «Resúmenes de turno»

   CUÁNDO SE GENERA: el cierre de un turno de producción es el botón «GENERAR CIERRE DE TURNO» de Avance y cierre
   (avGenerar('CIERRE'), único por turno). En ese momento, sin pasos manuales, se guarda el resumen.
   Mientras el turno no cierre se ve como «Resumen preliminar», calculado en vivo en cada dispositivo.

   DE DÓNDE SALEN LOS NÚMEROS (los mismos que muestra el semáforo):
     · por línea: programado, producido y ratio de glacialResumenEjecutivoLineas() (24-semaforo…);
       ratio = producido ÷ horas efectivas (ratio oficial de 23b-tiempos-linea.js);
     · paradas: calcularTiemposLinea() de 23b (minutos programados y no programados, motivos), vía 47-analisis-paradas.js;
     · personal: tareo de Producción del turno (solo totales: nunca nombres ni DNI);
     · pendientes: paradas con motivo sin completar (bitácora), tareo con personas sin salida y salidas editadas.

   FIRESTORE: colección resumenesTurno, un documento por fecha y turno (id «AAAA-MM-DD_DIA» o «…_NOCHE»).
     · Se CREA con una transacción que no pisa uno existente: si dos supervisores cierran casi a la vez, queda uno solo.
     · «Actualizar resumen» cambia solo datos, actualizadoPor/En y el registro de actualizaciones (transacción).
     · No se guarda la imagen: se dibuja al momento a partir de los datos (1080 px de ancho, letra grande).
   Cargar después de 43, 44, 46 y 47. No modifica datos existentes.
   ========================================================= */
(function(){
  'use strict';

  const COLECCION='resumenesTurno';
  const MAX_ACTUALIZACIONES=20;
  const LIMITE_LISTA=62;                       // ~31 días (dos turnos por día)
  const ANCHO_IMAGEN=1080;
  const JEFATURA=['Jefe de Producción','Jefe de Operaciones','Jefatura','Gerente General','Gerente'];

  /* ---------- utilidades ---------- */
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,
    c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const fmt=n=>Math.round(num(n)).toLocaleString('es-PE');
  const fmtPct=v=>v==null?'—':v.toFixed(1)+' %';
  const hhmm=ms=>Number(ms)>0?new Date(Number(ms)).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false}):'—';
  const fmtFecha=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''))?f.slice(8,10)+'/'+f.slice(5,7)+'/'+f.slice(0,4):String(f||'');
  const canon=t=>String(t||'').toUpperCase().includes('NOCHE')?'NOCHE':'DIA';
  const etiquetaTurno=t=>t==='NOCHE'?'NOCHE':'DÍA';
  const idResumen=(fecha,turno)=>fecha+'_'+canon(turno);
  const chip=()=>window.glacialEstadoDatos?window.glacialEstadoDatos.chip():'';
  const puedeVer=()=>window.glacialVista&&window.glacialVista.activo()?window.glacialVista.puedeModulo('resumenes_turno'):(typeof window.puedeVerBitacoraMtto==='function'&&window.puedeVerBitacoraMtto());
  function puedeGenerar(){
    const u=typeof state!=='undefined'?state.user:null;
    if(!u)return false;
    try{
      if(typeof esMantCompartido==='function'&&esMantCompartido(u))return false;
      if(typeof esUsuarioSoloConsulta==='function'&&esUsuarioSoloConsulta(u))return false;
      const rol=String(u.rol||'').trim();
      if(['Administrador','Jefe de Producción','Jefe de Operaciones','Supervisor','Supervisor de Producción'].includes(rol))return true;
      return tienePermiso('avanceProduccion')||tienePermiso('paletas');
    }catch(_){return false;}
  }
  function turnoVigente(){
    try{if(typeof window.glacialTurnoVigente==='function'){const t=window.glacialTurnoVigente();if(t&&t.fecha)return {fecha:t.fecha,turno:canon(t.turno)};}}catch(_){/* sin turno */}
    return null;
  }

  /* =========================================================
     CONSTRUCCIÓN DE LOS DATOS DEL RESUMEN
     ========================================================= */
  function personalDeTareo(fecha,turno){
    const vacio={registrado:false,total:0,asistieron:0,enComision:0,faltas:0,tardanzas:0,descansos:0,otros:0,sinEstado:0,sinSalida:0,salidasEditadas:0,porDia:0};
    let t=null;
    try{t=typeof tareoBuscar==='function'?tareoBuscar('Producción',fecha,turno==='NOCHE'?'Noche':'Día'):null;}catch(_){t=null;}
    if(!t)return vacio;
    const canonE=typeof tareoEstadoCanonico==='function'?tareoEstadoCanonico:(v=>v);
    const r=Object.assign({},vacio,{registrado:true});
    try{r.porDia=typeof tareoPorDiaActivos==='function'?tareoPorDiaActivos(t).length:0;}catch(_){r.porDia=0;}
    const lista=Array.isArray(t.personal)?t.personal:[];
    // Criterio único de asistencia (13-tareo.js: tareoResumenAsistencia).
    const g=window.tareoResumenAsistencia(lista);
    r.total=g.total;r.asistieron=g.presentes;r.enComision=g.enComision;r.faltas=g.faltas;r.descansos=g.descansos;
    r.otros=g.otros;r.sinEstado=g.sinRegistrar;r.tardanzas=g.tardanzas;
    lista.forEach(p=>{
      const e=canonE(p.asistencia);
      if(e&&p.horaIngreso&&!p.horaSalida)r.sinSalida++;
      if(p.salidaEditada&&!p.salidaVista)r.salidasEditadas++;
    });
    return r;
  }

  /* datos = lo que se guarda en Firestore. Sin nombres de personas ni DNI. */
  async function construirDatos(fecha,turno,opciones){
    const op=Object.assign({conPendientes:true},opciones||{});
    const A=window.glacialAnalisisParadas;
    if(!A||typeof window.glacialResumenEjecutivoLineas!=='function')throw new Error('Faltan los módulos de indicadores del semáforo.');
    const us=A.listarUnidades(fecha,fecha,{}).unidades.filter(u=>canon(u.turno)===turno);
    const cacheFilas=new Map();
    const filaDe=u=>{
      if(!cacheFilas.has(u.turno)){let r=null;try{r=window.glacialResumenEjecutivoLineas(fecha,u.turno);}catch(_){r=null;}cacheFilas.set(u.turno,(r&&r.filas)||[]);}
      return cacheFilas.get(u.turno).find(f=>f.linea===u.linea)||null;
    };
    const nombreLinea=k=>{try{const l=(typeof LINES!=='undefined'?LINES:[]).find(x=>x.key===k);return l?l.name:k;}catch(_){return k;}};
    const lineas=us.map(u=>{
      const f=filaDe(u)||{};
      const programado=Math.round(num(f.programado)),producido=Math.round(num(f.producido));
      const ratio=f.ratios&&f.ratios.ratioEfectivo!=null?Math.round(f.ratios.ratioEfectivo):null;
      return {linea:u.linea,nombre:nombreLinea(u.linea),turno:u.turno,programado,producido,
        cumplimiento:GlacialIndicadores.cumplimiento(producido,programado)==null?null:+(GlacialIndicadores.cumplimiento(producido,programado)*100).toFixed(1),
        ratio,horasEfectivas:+(u.enMarcha/60).toFixed(2),minNoProg:Math.round(u.np),minProg:Math.round(u.prog),
        estado:f.estado||''};
    });
    const totProg=lineas.reduce((s,l)=>s+l.programado,0),totProd=lineas.reduce((s,l)=>s+l.producido,0);
    const par=A.armarPareto(us,{agrupar:'motivo',metrica:'minutos',incluirProg:false});
    const parL=A.armarPareto(us,{agrupar:'linea',metrica:'minutos',incluirProg:false});
    const res=A.resumenIndicadores(us);
    const paradas={
      cantidadNoProg:res.nNp,cantidadProg:us.reduce((s,u)=>s+u.pItems.length,0),
      minNoProg:Math.round(res.npMin),minProg:Math.round(res.progMin),
      top:par.filas.slice(0,3).map(f=>({motivo:f.clave,minutos:Math.round(f.minutos),cantidad:f.cantidad})),
      porLinea:parL.filas.map(f=>({nombre:f.clave,minutos:Math.round(f.minutos),cantidad:f.cantidad}))
    };
    const personal=personalDeTareo(fecha,turno);
    let sinMotivo=null;
    if(op.conPendientes&&typeof window.bitacoraMttoPendientes==='function'){
      try{sinMotivo=(await window.bitacoraMttoPendientes(fecha,turno)).map(p=>({linea:p.linea,nombre:nombreLinea(p.linea),inicio:p.inicio}));}
      catch(_){sinMotivo=null;}                  // sin conexión: se muestra «no se pudo consultar»
    }
    return {
      fecha,turno,generadoMs:ahoraMs(),
      lineas,totales:{programado:totProg,producido:totProd,cumplimiento:GlacialIndicadores.cumplimiento(totProd,totProg)==null?null:+(GlacialIndicadores.cumplimiento(totProd,totProg)*100).toFixed(1)},
      paradas,
      personal:{registrado:personal.registrado,total:personal.total,asistieron:personal.asistieron,enComision:personal.enComision||0,faltas:personal.faltas,
        tardanzas:personal.tardanzas,descansos:personal.descansos,otros:personal.otros,sinEstado:personal.sinEstado,porDia:personal.porDia},
      pendientes:{paradasSinMotivo:sinMotivo,tareoSinSalida:personal.sinSalida,salidasEditadas:personal.salidasEditadas,
        tareoRegistrado:personal.registrado}
    };
  }
  const totalPendientes=d=>(d.pendientes.paradasSinMotivo?d.pendientes.paradasSinMotivo.length:0)+num(d.pendientes.tareoSinSalida)+num(d.pendientes.salidasEditadas);

  /* =========================================================
     GUARDADO EN FIRESTORE (un documento por fecha y turno)
     ========================================================= */
  function sinConexion(){return window.glacialEstadoDatos&&window.glacialEstadoDatos.enLinea===false;}
  const quien=()=>({uid:(firebase.auth().currentUser||{}).uid||'',username:(state.user&&state.user.username)||'',nombre:(state.user&&(state.user.nombre||state.user.username))||''});

  /* Crea el resumen SOLO si no existe (dos cierres casi a la vez dejan uno solo). */
  async function crearResumen(fecha,turno,datos,extra){
    if(sinConexion())throw new Error('Sin conexión: el resumen no se guardó.');
    const ref=db.collection(COLECCION).doc(idResumen(fecha,turno));
    const q=quien();
    return db.runTransaction(async tx=>{
      const s=await tx.get(ref);
      if(s.exists)return {creado:false,existente:s.data()};
      tx.set(ref,Object.assign({
        fecha,turno:canon(turno),estado:'CERRADO',datos,
        creadoUid:q.uid,creadoPor:q.username,creadoPorNombre:q.nombre,creadoEn:firebase.firestore.FieldValue.serverTimestamp(),
        actualizaciones:[]
      },extra||{}));
      return {creado:true};
    });
  }
  /* «Actualizar resumen»: solo cambia los datos y deja registrado quién y cuándo (campos específicos). */
  async function actualizarResumen(fecha,turno){
    if(!puedeGenerar())throw new Error('No tienes permiso para actualizar el resumen.');
    if(sinConexion())throw new Error('Sin conexión: el resumen no se actualizó.');
    const datos=await construirDatos(fecha,canon(turno));
    const ref=db.collection(COLECCION).doc(idResumen(fecha,turno));
    const q=quien();
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);
      if(!s.exists)throw new Error('El resumen de ese turno todavía no existe.');
      const previo=Array.isArray(s.data().actualizaciones)?s.data().actualizaciones:[];
      const actualizaciones=previo.concat([{por:q.username,en:ahoraMs()}]).slice(-MAX_ACTUALIZACIONES);
      tx.update(ref,{datos,actualizadoUid:q.uid,actualizadoPor:q.username,actualizadoPorNombre:q.nombre,
        actualizadoEn:firebase.firestore.FieldValue.serverTimestamp(),actualizaciones});
    });
    return datos;
  }

  /* ---------- cierre de turno: genera el resumen en ese mismo momento ---------- */
  let pendientesReintento=[];
  async function generarAlCierre(fecha,turno){
    try{
      const datos=await construirDatos(fecha,canon(turno));
      const r=await crearResumen(fecha,turno,datos);
      avisar(r.creado?'Resumen del turno guardado ('+fmtFecha(fecha)+' · '+etiquetaTurno(canon(turno))+').':'El resumen de este turno ya existía.',false,fecha,turno);
      return r;
    }catch(e){
      pendientesReintento=pendientesReintento.filter(p=>!(p.fecha===fecha&&p.turno===canon(turno))).concat([{fecha,turno:canon(turno)}]);
      avisar('El cierre se generó, pero el resumen NO se guardó ('+((e&&e.message)||e)+'). Se reintentará solo al volver la conexión.',true,fecha,turno);
      return null;
    }
  }
  function reintentar(){
    if(!pendientesReintento.length||sinConexion())return;
    const lista=pendientesReintento;pendientesReintento=[];
    lista.forEach(p=>generarAlCierre(p.fecha,p.turno));
  }
  setInterval(reintentar,30000);
  if(typeof window.addEventListener==='function')window.addEventListener('online',()=>setTimeout(reintentar,1500));

  function avisar(texto,problema,fecha,turno){
    try{
      document.getElementById('rt-aviso')?.remove();
      const d=document.createElement('div');d.id='rt-aviso';d.setAttribute('role','status');
      d.style.cssText='position:fixed;left:16px;bottom:16px;z-index:10050;max-width:380px;padding:12px 14px;border-radius:10px;font-size:13px;'+
        'box-shadow:0 8px 24px rgba(0,0,0,.25);background:'+(problema?'#fff3d6;border:1px solid #f0c36a':'#effbf4;border:1px solid #13814a');
      d.innerHTML='<b>'+esc(texto)+'</b>'+(problema?'':'<div style="margin-top:6px"><button type="button" class="btn btn-primary btn-sm" data-rt-ver>Ver resumen</button> <button type="button" class="btn btn-ghost btn-sm" data-rt-x>Cerrar</button></div>');
      if(!problema){
        d.querySelector('[data-rt-ver]').onclick=()=>{d.remove();window.resumenTurnoAbrir({fecha,turno:canon(turno)});};
        d.querySelector('[data-rt-x]').onclick=()=>d.remove();
        setTimeout(()=>d.remove(),20000);
      }
      document.body.appendChild(d);
    }catch(_){/* aviso informativo */}
    if(problema)console.warn('Resumen de turno:',texto);
  }

  if(typeof avGenerar==='function'){
    const anterior=avGenerar;
    avGenerar=async function(hora,tipo){
      const r=await anterior.apply(this,arguments);
      try{
        if((tipo||'AVANCE')==='CIERRE'&&typeof avanceEstado!=='undefined'&&avanceEstado&&avanceEstado.fecha){
          const hay=(avanceEstado.snapshots||[]).some(s=>s&&s.tipo==='CIERRE'&&s.fecha===avanceEstado.fecha&&canon(s.turno)===canon(avanceEstado.turno));
          if(hay)generarAlCierre(avanceEstado.fecha,avanceEstado.turno);      // sin esperar: no retrasa el cierre
        }
      }catch(e){console.warn('Resumen de turno:',e&&e.message||e);}
      return r;
    };
    window.avGenerar=avGenerar;
  }

  /* =========================================================
     IMAGEN VERTICAL PARA WHATSAPP (1080 px de ancho, letra grande) — sin DNI ni nombres
     ========================================================= */
  function dibujarImagen(doc,canvasFactory){
    const d=doc.datos,preliminar=doc.estado!=='CERRADO';
    const W=ANCHO_IMAGEN,M=48;
    const crear=canvasFactory||(()=>document.createElement('canvas'));
    const medir=crear();medir.width=W;medir.height=10;
    const mc=medir.getContext('2d');
    // 1.ª pasada: calcula la altura; 2.ª: dibuja.
    function pasada(c,dibujar){
      let y=0;
      const fuente=(px,neg)=>(neg?'bold ':'')+px+'px Arial, Helvetica, sans-serif';
      const texto=(t,x,px,neg,color,alineado)=>{
        c.font=fuente(px,neg);
        if(dibujar){c.fillStyle=color||'#10265f';c.textAlign=alineado||'left';c.fillText(String(t),alineado==='right'?W-M:x,y+px);}
      };
      const ajustar=(t,px,neg,max)=>{
        c.font=fuente(px,neg);
        const palabras=String(t).split(' ');const lineas=[];let cur='';
        palabras.forEach(p=>{const prueba=cur?cur+' '+p:p;if(c.measureText(prueba).width>max&&cur){lineas.push(cur);cur=p;}else cur=prueba;});
        if(cur)lineas.push(cur);return lineas;
      };
      const bloqueTexto=(t,px,neg,color,sangria)=>{
        ajustar(t,px,neg,W-2*M-(sangria||0)).forEach(l=>{texto(l,M+(sangria||0),px,neg,color);y+=px+12;});
      };
      const caja=(alto,color)=>{if(dibujar){c.fillStyle=color;c.fillRect(M-16,y,W-2*M+32,alto);}};
      const titulo=(t)=>{y+=18;if(dibujar){c.fillStyle='#10265f';c.fillRect(M-16,y,W-2*M+32,64);}texto(t.toUpperCase(),M,40,true,'#ffffff');if(dibujar){}y+=64+14;};
      // encabezado
            y=26;
      texto('GLACIAL · RESUMEN DE TURNO',M,46,true,'#10265f');y+=62;
      texto(fmtFecha(d.fecha)+' · TURNO '+etiquetaTurno(d.turno),M,44,true,'#0868db');y+=58;
      if(preliminar){texto('RESUMEN PRELIMINAR · turno en curso · '+hhmm(d.generadoMs),M,34,true,'#8a5a00');y+=48;}
      else{texto('Turno cerrado',M,34,false,'#13814a');y+=46;}
      // planta
      titulo('Planta');
      texto('Producido '+fmt(d.totales.producido)+' de '+fmt(d.totales.programado),M,42,true,'#1b2a38');y+=54;
      texto('Cumplimiento '+fmtPct(d.totales.cumplimiento),M,48,true,colorCump(d.totales.cumplimiento));y+=66;
      // líneas
      titulo('Líneas');
      if(!d.lineas.length){bloqueTexto('Sin líneas con inicio real en este turno.',36,false,'#4a5b6b');}
      d.lineas.forEach(l=>{
        caja(188,'#f2f6fa');y+=8;
        texto(l.nombre,M,46,true,'#10265f');
        texto(fmtPct(l.cumplimiento),M,46,true,colorCump(l.cumplimiento),'right');y+=58;
        texto('Programado '+fmt(l.programado)+'  ·  Producido '+fmt(l.producido),M,38,false,'#1b2a38');y+=50;
        texto('Ratio '+(l.ratio==null?'—':fmt(l.ratio)+' UND/h'),M,38,true,'#1b2a38');y+=50;
        texto('Horas efectivas '+(+l.horasEfectivas).toFixed(1)+' h',M,34,false,'#4a5b6b');y+=44;
      });
      // paradas
      titulo('Paradas');
      texto('No programadas: '+fmt(d.paradas.cantidadNoProg)+' · '+fmt(d.paradas.minNoProg)+' min',M,40,true,'#a92f27');y+=52;
      texto('Programadas: '+fmt(d.paradas.cantidadProg)+' · '+fmt(d.paradas.minProg)+' min',M,40,false,'#1b2a38');y+=54;
      if(d.paradas.top.length){
        texto('Motivos principales',M,36,true,'#10265f');y+=46;
        d.paradas.top.forEach((p,i)=>bloqueTexto((i+1)+'. '+p.motivo+' — '+fmt(p.minutos)+' min',36,false,'#1b2a38',16));
      }else bloqueTexto('Sin paradas no programadas.',36,false,'#13814a');
      // personal
      titulo('Personal');
      if(d.personal.registrado){
        texto('Presentes '+d.personal.asistieron+(d.personal.enComision?' ('+d.personal.enComision+' en comisión)':'')+' · Faltas '+d.personal.faltas,M,40,true,'#1b2a38');y+=52;
        texto('Tardanzas '+d.personal.tardanzas+' · Descansos '+d.personal.descansos,M,40,false,'#1b2a38');y+=52;
        texto('Planilla '+d.personal.total+' · Personal por día '+num(d.personal.porDia),M,36,false,'#4a5b6b');y+=46;
      }else bloqueTexto('Tareo del turno sin registrar.',36,false,'#8a5a00');
      // pendientes
      titulo('Pendientes');
      const pm=d.pendientes.paradasSinMotivo;
      bloqueTexto(pm==null?'Paradas con motivo sin completar: no se pudo consultar.':'Paradas con motivo sin completar: '+pm.length,38,true,pm&&pm.length?'#8a5a00':'#1b2a38');
      pm&&pm.slice(0,5).forEach(p=>bloqueTexto('• '+p.nombre+' · '+hhmm(p.inicio),34,false,'#4a5b6b',16));
      bloqueTexto('Tareo con personas sin salida: '+d.pendientes.tareoSinSalida,38,true,d.pendientes.tareoSinSalida?'#8a5a00':'#1b2a38');
      bloqueTexto('Salidas editadas por Mantenimiento: '+d.pendientes.salidasEditadas,38,true,d.pendientes.salidasEditadas?'#8a5a00':'#1b2a38');
      // pie
      y+=10;
      if(doc.actualizadoEnMs)bloqueTexto('Actualizado el '+fmtFecha(isoDe(doc.actualizadoEnMs))+' a las '+hhmm(doc.actualizadoEnMs),30,false,'#4a5b6b');
      texto('Generado a las '+hhmm(d.generadoMs),M,30,false,'#4a5b6b');y+=44;
      return y;
    }
    function colorCump(v){return v==null?'#4a5b6b':v>=95?'#13814a':v>=85?'#8a5a00':'#a92f27';}
    const alto=pasada(mc,false)+20;
    const lienzo=crear();lienzo.width=W;lienzo.height=Math.max(600,Math.round(alto));
    const c=lienzo.getContext('2d');
    c.fillStyle='#ffffff';c.fillRect(0,0,W,lienzo.height);
    pasada(c,true);
    return lienzo;
  }
  const isoDe=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};

  function canvasABlob(canvas){
    return new Promise((res,rej)=>{
      if(canvas.toBlob)canvas.toBlob(b=>b?res(b):rej(new Error('No se pudo crear la imagen.')),'image/png');
      else rej(new Error('Este navegador no puede generar la imagen.'));
    });
  }
  const nombreArchivo=(doc,ext)=>'Resumen_turno_'+doc.datos.fecha+'_'+canon(doc.datos.turno)+(doc.estado!=='CERRADO'?'_preliminar':'')+'.'+ext;
  function descargarBlob(blob,nombre){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=nombre;document.body.appendChild(a);a.click();
    setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},1500);
  }
  /* En el celular: menú de compartir del teléfono. En el computador: descarga. */
  function puedeCompartirArchivos(blob,nombre){
    try{
      if(typeof navigator==='undefined'||typeof navigator.share!=='function'||typeof navigator.canShare!=='function')return false;
      const movil=/Android|iPhone|iPad|iPod/i.test(String(navigator.userAgent||''));
      const f=new File([blob],nombre,{type:blob.type||'image/png'});
      return movil&&navigator.canShare({files:[f]});
    }catch(_){return false;}
  }
  async function compartirOImagen(doc){
    const canvas=dibujarImagen(doc);
    const blob=await canvasABlob(canvas);
    const nombre=nombreArchivo(doc,'png');
    if(puedeCompartirArchivos(blob,nombre)){
      try{
        await navigator.share({files:[new File([blob],nombre,{type:'image/png'})],title:'Resumen de turno '+fmtFecha(doc.datos.fecha)+' '+etiquetaTurno(doc.datos.turno)});
        return 'compartido';
      }catch(e){if(e&&e.name==='AbortError')return 'cancelado';}   // si falla el menú, se descarga
    }
    descargarBlob(blob,nombre);
    return 'descargado';
  }

  /* =========================================================
     EXCEL
     ========================================================= */
  async function exportarExcel(doc){
    if(typeof ExcelJS==='undefined'){alert('No se pudo cargar ExcelJS. Revisa tu conexión a internet y recarga la página.');return;}
    const d=doc.datos;
    const wb=new ExcelJS.Workbook();wb.creator='GLACIAL';wb.created=new Date();
    const hoja=(nombre,cols,filas,anchos)=>{
      const ws=wb.addWorksheet(nombre);
      ws.addRow(['Resumen de turno · '+fmtFecha(d.fecha)+' · '+etiquetaTurno(d.turno)+(doc.estado!=='CERRADO'?' · PRELIMINAR':'')]).font={bold:true,size:14};
      ws.addRow([doc.estado==='CERRADO'?'Turno cerrado'+(doc.actualizadoEnMs?' · actualizado el '+fmtFecha(isoDe(doc.actualizadoEnMs))+' '+hhmm(doc.actualizadoEnMs):''):'Resumen preliminar calculado a las '+hhmm(d.generadoMs)]);
      ws.addRow([]);
      const h=ws.addRow(cols);
      h.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F4E79'}};c.alignment={horizontal:'center',wrapText:true};});
      filas.forEach(f=>ws.addRow(f));
      (anchos||[]).forEach((w,i)=>ws.getColumn(i+1).width=w);
      return ws;
    };
    hoja('Líneas',['Línea','Programado','Producido','Cumplimiento %','Ratio (UND/h)','Horas efectivas','Paradas no programadas (min)','Paradas programadas (min)'],
      d.lineas.map(l=>[l.nombre,l.programado,l.producido,l.cumplimiento==null?'—':l.cumplimiento,l.ratio==null?'—':l.ratio,l.horasEfectivas,l.minNoProg,l.minProg])
        .concat([['TOTAL',d.totales.programado,d.totales.producido,d.totales.cumplimiento==null?'—':d.totales.cumplimiento,'','',d.paradas.minNoProg,d.paradas.minProg]]),[24,14,14,16,16,16,26,24]);
    hoja('Paradas',['Concepto','Cantidad','Minutos'],[
      ['No programadas',d.paradas.cantidadNoProg,d.paradas.minNoProg],['Programadas',d.paradas.cantidadProg,d.paradas.minProg]]
      .concat(d.paradas.top.map((p,i)=>['Motivo principal '+(i+1)+': '+p.motivo,p.cantidad,p.minutos]))
      .concat(d.paradas.porLinea.map(p=>['Línea: '+p.nombre,p.cantidad,p.minutos])),[44,12,12]);
    hoja('Personal',['Concepto','Cantidad'],d.personal.registrado?[['Presentes',d.personal.asistieron],['En comisión / trabajo externo (incluidos en presentes)',d.personal.enComision||0],['Faltas',d.personal.faltas],['Tardanzas',d.personal.tardanzas],
      ['Descansos',d.personal.descansos],['Otros estados',d.personal.otros],['Sin estado',d.personal.sinEstado],['Total planilla del turno',d.personal.total],['Personal por día',num(d.personal.porDia)]]:[['Tareo del turno sin registrar','']],[34,12]);
    const pm=d.pendientes.paradasSinMotivo;
    hoja('Pendientes',['Concepto','Detalle'],[
      ['Paradas con motivo sin completar',pm==null?'No se pudo consultar':pm.length],
      ...(pm||[]).map(p=>['  '+p.nombre,hhmm(p.inicio)]),
      ['Tareo con personas sin salida',d.pendientes.tareoSinSalida],['Salidas editadas por Mantenimiento',d.pendientes.salidasEditadas]],[44,24]);
    const buffer=await wb.xlsx.writeBuffer();
    descargarBlob(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),nombreArchivo(doc,'xlsx'));
  }

  /* =========================================================
     PANTALLA «RESÚMENES DE TURNO»
     ========================================================= */
  const S={lista:[],listaLista:false,errorLista:'',desubLista:null,detalle:null,desubDetalle:null,preliminar:null,cargandoPrelim:false,errorPrelim:'',vista:'lista',abierto:null};

  const msDe=v=>!v?0:typeof v.toMillis==='function'?v.toMillis():(typeof v.seconds==='number'?v.seconds*1000:Number(v)||0);
  function docDeFirestore(id,x){
    return {id,estado:x.estado||'CERRADO',datos:x.datos,fecha:x.fecha,turno:x.turno,creadoPor:x.creadoPorNombre||x.creadoPor||'',
      creadoEnMs:msDe(x.creadoEn),actualizadoPor:x.actualizadoPorNombre||x.actualizadoPor||'',actualizadoEnMs:msDe(x.actualizadoEn),
      actualizaciones:Array.isArray(x.actualizaciones)?x.actualizaciones:[]};
  }
  function detenerListas(){
    if(S.desubLista){try{S.desubLista();}catch(_){/* ya cerrada */}}
    if(S.desubDetalle){try{S.desubDetalle();}catch(_){/* ya cerrada */}}
    S.desubLista=null;S.desubDetalle=null;S.listaLista=false;
  }
  function escucharLista(){
    if(S.desubLista||typeof db==='undefined')return;
    try{
      S.desubLista=db.collection(COLECCION).orderBy('fecha','desc').limit(LIMITE_LISTA).onSnapshot(snap=>{
        S.lista=snap.docs.map(d=>docDeFirestore(d.id,d.data({serverTimestamps:'estimate'})))
          .sort((a,b)=>b.fecha.localeCompare(a.fecha)||a.turno.localeCompare(b.turno));
        S.listaLista=true;S.errorLista='';refrescar();
      },e=>{S.errorLista='No se pudieron cargar los resúmenes: '+((e&&e.message)||e);S.listaLista=true;refrescar();});
    }catch(e){S.errorLista=String((e&&e.message)||e);}
  }
  function escucharDetalle(id){
    if(S.desubDetalle){try{S.desubDetalle();}catch(_){/* ya cerrada */}S.desubDetalle=null;}
    try{
      S.desubDetalle=db.collection(COLECCION).doc(id).onSnapshot(snap=>{
        if(snap.exists)S.detalle=docDeFirestore(id,snap.data({serverTimestamps:'estimate'}));
        refrescar();
      },()=>{});
    }catch(_){/* sin escucha */}
  }

  async function calcularPreliminar(){
    const t=turnoVigente();
    if(!t)return;
    S.cargandoPrelim=true;S.errorPrelim='';
    try{
      const datos=await construirDatos(t.fecha,t.turno);
      S.preliminar={id:idResumen(t.fecha,t.turno),estado:'PRELIMINAR',datos,fecha:t.fecha,turno:t.turno};
    }catch(e){S.errorPrelim=String((e&&e.message)||e);}
    S.cargandoPrelim=false;refrescar();
  }

  function estilos(){
    if(document.getElementById('rt-css'))return;
    const s=document.createElement('style');s.id='rt-css';
    s.textContent=`
      .rt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:10px}
      .rt-card{border:1px solid #dfe4ea;border-left:6px solid #13814a;border-radius:10px;padding:10px 14px;background:#fff;cursor:pointer}
      .rt-card.pre{border-left-color:#df8b00;background:#fffbea}.rt-card h4{margin:0 0 4px;font-size:15px;color:#10265f}
      .rt-card small{color:#5a6b7b}.rt-sec{margin:16px 0 6px;font-size:15px;color:#10265f}
      .rt-acciones{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
      .rt-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:8px 0}
      .rt-kpi{border:1px solid #dfe4ea;border-radius:10px;padding:10px 12px;background:#fff}.rt-kpi span{display:block;font-size:12px;color:#5a6b7b}.rt-kpi b{font-size:22px;color:#1b2a38}
      .rt-nota{font-size:12px;color:#5a6b7b}.rt-vacio{padding:14px;border:1px dashed #c5d0db;border-radius:10px;background:#f8fafc;color:#4a5b6b;font-size:13px}
      .rt-aviso{padding:8px 12px;border-radius:8px;background:#fff8e6;border:1px solid #f0c36a;margin:8px 0;font-size:13px}
    `;
    document.head.appendChild(s);
  }

  function htmlResumen(doc){
    const d=doc.datos;
    const pm=d.pendientes.paradasSinMotivo;
    return '<div class="rt-kpis">'+
      '<div class="rt-kpi"><span>Programado</span><b>'+fmt(d.totales.programado)+'</b></div>'+
      '<div class="rt-kpi"><span>Producido</span><b>'+fmt(d.totales.producido)+'</b></div>'+
      '<div class="rt-kpi"><span>Cumplimiento</span><b>'+fmtPct(d.totales.cumplimiento)+'</b></div>'+
      '<div class="rt-kpi"><span>Paradas no programadas</span><b>'+fmt(d.paradas.minNoProg)+' min</b></div>'+
      '<div class="rt-kpi"><span>Pendientes</span><b>'+totalPendientes(d)+'</b></div></div>'+
      '<h3 class="rt-sec">Por línea</h3>'+
      (d.lineas.length?'<div class="tareo-table-scroll"><table class="tareo-table"><thead><tr><th>Línea</th><th>Programado</th><th>Producido</th><th>Cumplimiento</th><th>Ratio (UND/h)</th><th>Horas efectivas</th></tr></thead><tbody>'+
        d.lineas.map(l=>'<tr><td>'+esc(l.nombre)+'</td><td>'+fmt(l.programado)+'</td><td>'+fmt(l.producido)+'</td><td>'+fmtPct(l.cumplimiento)+'</td><td>'+(l.ratio==null?'—':fmt(l.ratio))+'</td><td>'+(+l.horasEfectivas).toFixed(1)+' h</td></tr>').join('')+'</tbody></table></div>'
        :'<div class="rt-vacio">Sin líneas con inicio real en este turno.</div>')+
      '<h3 class="rt-sec">Paradas</h3>'+
      '<p>No programadas: <b>'+fmt(d.paradas.cantidadNoProg)+'</b> paradas, <b>'+fmt(d.paradas.minNoProg)+' min</b> · Programadas: <b>'+fmt(d.paradas.cantidadProg)+'</b>, <b>'+fmt(d.paradas.minProg)+' min</b></p>'+
      (d.paradas.top.length?'<ol>'+d.paradas.top.map(p=>'<li>'+esc(p.motivo)+' — '+fmt(p.minutos)+' min ('+p.cantidad+')</li>').join('')+'</ol>':'<div class="rt-vacio">Sin paradas no programadas.</div>')+
      '<h3 class="rt-sec">Personal</h3>'+
      (d.personal.registrado?'<p>Presentes <b>'+d.personal.asistieron+'</b>'+(d.personal.enComision?' (<b>'+d.personal.enComision+'</b> en comisión)':'')+' · Faltas <b>'+d.personal.faltas+'</b> · Tardanzas <b>'+d.personal.tardanzas+'</b> · Descansos <b>'+d.personal.descansos+'</b> · Planilla <b>'+d.personal.total+'</b> · Personal por día <b>'+num(d.personal.porDia)+'</b></p>'
        :'<div class="rt-vacio">El tareo de Producción de este turno no está registrado.</div>')+
      '<h3 class="rt-sec">Pendientes</h3>'+
      '<ul><li>Paradas con motivo sin completar: <b>'+(pm==null?'no se pudo consultar':pm.length)+'</b>'+(pm&&pm.length?' ('+pm.map(p=>esc(p.nombre)+' '+hhmm(p.inicio)).join(', ')+')':'')+'</li>'+
      '<li>Tareo con personas sin salida: <b>'+d.pendientes.tareoSinSalida+'</b></li>'+
      '<li>Salidas editadas por Mantenimiento: <b>'+d.pendientes.salidasEditadas+'</b></li></ul>';
  }

  function render(){
    const main=document.getElementById('main');
    if(!main)return;
    if(!puedeVer()){main.innerHTML='<div class="empty-state"><h4>Acceso no autorizado</h4></div>';return;}
    estilos();escucharLista();
    let cuerpo='';
    const doc=S.vista==='detalle'?(S.abierto==='PRELIMINAR'?S.preliminar:S.detalle):null;
    if(S.vista==='detalle'&&doc){
      const cerrado=doc.estado==='CERRADO';
      const compartible=puedeCompartirArchivos(new Blob([''],{type:'image/png'}),'x.png');
      cuerpo+='<div class="rt-acciones"><button type="button" class="btn btn-ghost btn-sm" data-rt-volver>← Volver a la lista</button>'+
        '<button type="button" class="btn btn-primary btn-sm" data-rt-imagen>'+(compartible?'Compartir imagen':'Descargar imagen')+'</button>'+
        '<button type="button" class="btn btn-ghost btn-sm" data-rt-excel>Descargar Excel</button>'+
        (cerrado&&puedeGenerar()?'<button type="button" class="btn btn-ghost btn-sm" data-rt-actualizar>Actualizar resumen</button>':'')+
        (!cerrado?'<button type="button" class="btn btn-ghost btn-sm" data-rt-recalcular>Recalcular ahora</button>':'')+'</div>'+
        '<p class="rt-nota">'+(cerrado?'Turno cerrado'+(doc.creadoPor?' · guardado por '+esc(doc.creadoPor):'')+(doc.creadoEnMs?' el '+esc(fmtFecha(isoDe(doc.creadoEnMs)))+' a las '+hhmm(doc.creadoEnMs):'')
          +(doc.actualizadoEnMs?' · <b>actualizado por '+esc(doc.actualizadoPor)+' el '+esc(fmtFecha(isoDe(doc.actualizadoEnMs)))+' a las '+hhmm(doc.actualizadoEnMs)+'</b>'+(doc.actualizaciones.length>1?' ('+doc.actualizaciones.length+' actualizaciones)':''):'')
          :'<b>Resumen preliminar</b>: el turno aún no cierra; se calcula en vivo (pendientes consultados a las '+hhmm(doc.datos.generadoMs)+'). Se guardará solo al generar el cierre de turno.')+'</p>'+htmlResumen(doc);
    }else{
      const t=turnoVigente();
      const pre=S.preliminar;
      const existe=t&&S.lista.some(x=>x.id===idResumen(t.fecha,t.turno));
      cuerpo+=(t&&!existe?'<h3 class="rt-sec">Turno en curso</h3><div class="rt-grid"><div class="rt-card pre" data-rt-abrir="PRELIMINAR"><h4>Resumen preliminar · '+esc(fmtFecha(t.fecha))+' · '+etiquetaTurno(t.turno)+'</h4>'+
        (S.cargandoPrelim&&!pre?'<small>Calculando…</small>':pre?'<div>Cumplimiento <b>'+fmtPct(pre.datos.totales.cumplimiento)+'</b> · paradas no programadas <b>'+fmt(pre.datos.paradas.minNoProg)+' min</b></div><small>Calculado en vivo · se guarda al generar el cierre de turno</small>'
          :'<small>'+(S.errorPrelim?esc(S.errorPrelim):'Toca para ver el resumen del turno en curso')+'</small>')+'</div></div>':'')+
        '<h3 class="rt-sec">Resúmenes guardados</h3>'+
        (S.errorLista?'<div class="rt-aviso">'+esc(S.errorLista)+'</div>':'')+
        (!S.listaLista?'<div class="rt-aviso">Cargando resúmenes…</div>'
          :S.lista.length?'<div class="rt-grid">'+S.lista.map(x=>{
            const d=x.datos||{totales:{},paradas:{},pendientes:{}};
            return '<div class="rt-card" data-rt-abrir="'+esc(x.id)+'"><h4>'+esc(fmtFecha(x.fecha))+' · '+etiquetaTurno(x.turno)+'</h4>'+
              '<div>Cumplimiento <b>'+fmtPct(d.totales&&d.totales.cumplimiento)+'</b> · paradas NP <b>'+fmt(d.paradas&&d.paradas.minNoProg)+' min</b></div>'+
              '<small>Pendientes: '+(d.pendientes?totalPendientes(d):'—')+(x.actualizadoEnMs?' · actualizado '+hhmm(x.actualizadoEnMs):'')+'</small></div>';}).join('')+'</div>'
          :'<div class="rt-vacio"><b>Todavía no hay resúmenes guardados.</b><br>Se guardan solos cuando un supervisor genera el cierre de turno en «Avance y cierre».</div>');
    }
    main.innerHTML='<div class="main-head" id="resumenes-turno-view"><div><h2>Resúmenes de turno</h2><div class="sub">Generados automáticamente al cerrar el turno · '+chip()+'</div></div></div>'+
      '<div class="panel"><div class="panel-body">'+cuerpo+'</div></div>';
  }

  let temporizador=null;
  function refrescar(){
    clearTimeout(temporizador);
    temporizador=setTimeout(()=>{
      try{if(typeof state!=='undefined'&&state.user&&state.currentTab==='resumenes-turno'&&document.getElementById('resumenes-turno-view'))render();}
      catch(e){console.warn('Resúmenes de turno:',e&&e.message||e);}
    },250);
  }

  document.addEventListener('click',async e=>{
    if(!document.getElementById('resumenes-turno-view'))return;
    const abrir=e.target.closest('[data-rt-abrir]')?.dataset.rtAbrir;
    if(abrir){
      S.abierto=abrir;S.vista='detalle';
      if(abrir==='PRELIMINAR'){if(!S.preliminar)await calcularPreliminar();}
      else{S.detalle=S.lista.find(x=>x.id===abrir)||null;escucharDetalle(abrir);}
      render();return;
    }
    if(e.target.closest('[data-rt-volver]')){S.vista='lista';S.abierto=null;if(S.desubDetalle){try{S.desubDetalle();}catch(_){/* cerrada */}S.desubDetalle=null;}render();return;}
    const doc=S.abierto==='PRELIMINAR'?S.preliminar:S.detalle;
    if(e.target.closest('[data-rt-imagen]')&&doc){
      try{await compartirOImagen(doc);}catch(err){alert('No se pudo generar la imagen: '+((err&&err.message)||err));}
      return;
    }
    if(e.target.closest('[data-rt-excel]')&&doc){
      try{await exportarExcel(doc);}catch(err){alert('No se pudo generar el Excel: '+((err&&err.message)||err));}
      return;
    }
    if(e.target.closest('[data-rt-recalcular]')){await calcularPreliminar();return;}
    if(e.target.closest('[data-rt-actualizar]')&&doc){
      if(!confirm('¿Actualizar este resumen con los datos de hoy? Quedará registrado quién y cuándo lo actualizó.'))return;
      try{await actualizarResumen(doc.fecha,doc.turno);}
      catch(err){alert('No se pudo actualizar: '+((err&&err.message)||err));}
    }
  });

  /* ---------- navegación ---------- */
  window.resumenTurnoAbrir=function(o){
    if(!puedeVer()){alert('No tienes permiso para ver los resúmenes de turno.');return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    S.vista='lista';S.abierto=null;
    state.currentTab='resumenes-turno';
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
    if(!S.preliminar)calcularPreliminar();
    if(o&&o.fecha){S.abierto=idResumen(o.fecha,o.turno);S.vista='detalle';S.detalle=S.lista.find(x=>x.id===S.abierto)||null;escucharDetalle(S.abierto);render();}
  };
  window.goResumenesTurno=()=>window.resumenTurnoAbrir();

  if(typeof ajustarVistaSegunPermisos==='function'){
    const anterior=ajustarVistaSegunPermisos;
    ajustarVistaSegunPermisos=function(){
      if(state.currentTab==='resumenes-turno'&&puedeVer())return;
      return anterior.apply(this,arguments);
    };
  }
  if(typeof renderMain==='function'){
    const anterior=renderMain;
    renderMain=function(){
      if(state.currentTab==='resumenes-turno'&&!state.showWelcome&&puedeVer()){render();return;}
      if((S.desubLista||S.desubDetalle)&&state.currentTab!=='resumenes-turno'){detenerListas();S.vista='lista';S.abierto=null;}   // salió: deja de leer
      return anterior.apply(this,arguments);
    };
  }
  if(typeof grupoSidebarActivo==='function'){
    const anterior=grupoSidebarActivo;
    grupoSidebarActivo=function(){return state.currentTab==='resumenes-turno'?'produccion':anterior.apply(this,arguments);};
  }
  if(typeof renderSidebar==='function'){
    const anterior=renderSidebar;
    renderSidebar=function(){
      const r=anterior.apply(this,arguments);
      const b=document.getElementById('btn-resumenes-turno');
      if(b){
        const mostrar=!!(typeof state!=='undefined'&&state.user)&&puedeVer();
        b.hidden=!mostrar;b.style.display=mostrar?'':'none';
        const activo=mostrar&&state.currentTab==='resumenes-turno';
        b.classList.toggle('active',activo);
        if(activo)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
        if(typeof actualizarGruposSidebar==='function')actualizarGruposSidebar();
      }
      return r;
    };
  }
  if(typeof handleLogout==='function'){
    const anterior=handleLogout;
    handleLogout=function(){const r=anterior.apply(this,arguments);detenerListas();S.preliminar=null;S.detalle=null;return r;};
  }
  // El preliminar se mantiene al día con los datos en vivo mientras la pantalla está abierta.
  ['onProgramacionesUpdated','onPaletasUpdated','onTareosUpdated','onRecordsUpdated'].forEach(nombre=>{
    const anterior=globalThis[nombre];
    if(typeof anterior!=='function')return;
    globalThis[nombre]=function(){
      const r=anterior.apply(this,arguments);
      try{if(typeof state!=='undefined'&&state.currentTab==='resumenes-turno'&&(S.abierto==='PRELIMINAR'||S.vista==='lista')&&!S.cargandoPrelim)calcularPreliminarDebounce();}catch(_){/* informativo */}
      return r;
    };
  });
  let tp=null;
  function calcularPreliminarDebounce(){clearTimeout(tp);tp=setTimeout(()=>{if(state.currentTab==='resumenes-turno')calcularPreliminar();},1500);}

  window.glacialResumenTurno={construirDatos,crearResumen,actualizarResumen,generarAlCierre,dibujarImagen,compartirOImagen,exportarExcel,
    idResumen,personalDeTareo,docDeFirestore,estado:S,render,puedeGenerar,totalPendientes,calcularPreliminar};
})();
