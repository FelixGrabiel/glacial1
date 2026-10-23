/* =========================================================
   GLACIAL TV · MODO TELEVISIÓN (solo lectura)  ·  fase 1: INICIO y PRODUCCIÓN POR LÍNEA
   ---------------------------------------------------------
   Se activa SOLO con  ?modo=tv&vista=inicio|lineas|actual  (sin ese parámetro este archivo no hace nada).
   Dibuja encima de la aplicación una pantalla de 1280×720 (16:9) con letra grande, sin menú lateral, sin cabecera de administrador,
   sin botones ni enlaces: no hay nada que se pueda pulsar ni modificar. La aplicación normal sigue debajo, intacta.

   DATOS: no se copian píxeles ni se repiten cálculos. Se usan las MISMAS funciones del Inicio ejecutivo (js/accesos/32-dashboard-perfiles.js):
     cpDatosEjecutivo · cpFilasSinProduccion · cpPersonalPorLinea · cpUnidadEjec · cpNombreLinea · cpFmt · cpDuracionMin · cpHoraCorta
   así los porcentajes, estados y cifras coinciden con la página. Quien abre esta vista debe iniciar sesión con un usuario de SOLO
   LECTURA (Modo visualización con Inicio); la restricción es real, no depende de ocultar botones.

   FRESCURA: la cabecera muestra la hora de la última actualización. Si no hay conexión o los datos están viejos, lo dice en ámbar
   («SIN CONEXIÓN · datos de las hh:mm») y, si deja de poder calcular, «SIN DATOS». Nunca aparece «Actualizado» con datos vencidos.

   Funciones puras (modelos y HTML) expuestas en window.glacialTV para poder probarlas sin navegador (tests/modo-tv.test.js).
   Cargar al FINAL, después de 12-init.js. Estilos: css/tv-glacial.css (todo bajo #glacial-tv y html.modo-tv).
   ========================================================= */
(function(){
  'use strict';

  const VISTAS=['inicio','lineas','actual'];
  const TITULOS={inicio:'INICIO',lineas:'PRODUCCIÓN POR LÍNEA',actual:'PRODUCCIÓN ACTUAL'};
  const REFRESCO_MS=15000;          // se vuelve a dibujar cada 15 s (los datos llegan en vivo; esto es barato)
  const SIN_DATOS_MS=120000;        // más de 2 min sin poder calcular = «SIN DATOS»
  const BASE_ANCHO=1280, BASE_ALTO=720;

  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  /* Estado → texto y clase. En curso y En pausa comparten el naranja del sistema: se distinguen por TEXTO e icono, nunca solo por color. */
  const ESTADOS={
    EN_CURSO:{txt:'EN CURSO',cls:'curso',ico:'▶'},
    PAUSA:{txt:'EN PAUSA',cls:'pausa',ico:'❚❚'},
    PENDIENTE:{txt:'PENDIENTE',cls:'pendiente',ico:'○'},
    COMPLETADA:{txt:'COMPLETADA',cls:'completada',ico:'✔'},
    DETENIDA:{txt:'DETENIDA',cls:'detenida',ico:'■'},
    CANCELADA:{txt:'CANCELADA',cls:'cancelada',ico:'✖'},
    SIN_PROGRAMACION:{txt:'SIN PROGRAMACIÓN',cls:'sinprog',ico:'—'},
    SIN_PRODUCCION:{txt:'SIN PRODUCCIÓN',cls:'sinprod',ico:'!'}
  };
  const TEXTO_CAUSA={SIN_PROGRAMACION:'Sin programación',CANCELADA:'Programación cancelada',BLOQUE_NO_INICIA:'El bloque aún no inicia'};

  /* ---------- parámetros de la dirección ---------- */
  function leerParametros(search){
    let p=null;try{p=new URLSearchParams(search||'');}catch(_){p=null;}
    const vista=p&&p.get('vista');
    return {activo:!!p&&p.get('modo')==='tv',vista:VISTAS.includes(vista)?vista:'inicio'};
  }

  /* ---------- modelos (puros: reciben los datos del Inicio y las funciones de apoyo en «dep») ---------- */
  function modeloLineas(d,dep){
    const porLinea=new Map((d.filas||[]).map(f=>[f.linea,f]));
    const sp=dep.sinProduccion?dep.sinProduccion(d):{filas:[]};
    const sinProd=new Map((sp.filas||[]).map(f=>[f.linea,f]));
    return (d.lineasAutorizadas||[]).map(k=>{
      const nombre=dep.nombreLinea(k),u=dep.unidad(k),f=porLinea.get(k),causa=sinProd.get(k);
      if(!f){
        const e=causa?ESTADOS.SIN_PRODUCCION:ESTADOS.SIN_PROGRAMACION;
        return {linea:k,nombre,estado:e,producto:'—',producido:null,programado:null,unidad:u,pct:null,ultimo:'—',nota:causa?notaCausa(causa):''};
      }
      const g=f.desglose,act=g&&g.actual;
      const clave=(g&&g.estado)||f.estado;
      // Una línea con programación pero sin unidades en el bloque se muestra como SIN PRODUCCIÓN (informativo; no es una parada oficial).
      let e=ESTADOS[clave]||ESTADOS.PENDIENTE;
      if(causa&&!['COMPLETADA','CANCELADA'].includes(clave))e=ESTADOS.SIN_PRODUCCION;
      const prog=act?act.programado:f.programado,prod=act?act.producido:f.producido,pct=act?act.avance:f.avance;
      const nombreMarca=act?[act.marca,act.presentacion?dep.presentacion(k,act):''].filter(Boolean).join(' · '):'';
      return {linea:k,nombre,estado:e,
        producto:nombreMarca||dep.productoActual(f),
        producido:prod,programado:prog,unidad:u,
        pct:prog>0?Math.round(pct):null,
        ultimo:f.ultimoMs?dep.hora(f.ultimoMs):'—',
        nota:causa?notaCausa(causa):''};
    });
  }
  function notaCausa(f){
    if(f.pendiente)return 'Motivo pendiente';
    if(f.causa==='INFORMADA')return String(f.motivo||'');
    return TEXTO_CAUSA[f.causa]||String(f.causa||'');
  }

  function modeloPersonal(r,dep){
    if(!r)return {estado:'sin_modulo'};
    if(r.error)return {estado:'error'};
    if(!r.sincronizado)return {estado:'cargando'};
    if(!r.hayDistribucion)return {estado:'pendiente'};
    return {estado:'ok',
      lineas:r.lineas.map(x=>({nombre:dep.nombreLinea(x.linea),valor:x.pendiente?'Pendiente':String(x.cantidad),alerta:!!x.alerta})),
      asignados:r.distribuido,apoyo:r.apoyo,sinAsignar:r.sinAsignar,disponible:r.disponible};
  }

  function modeloInicio(d,dep){
    const vig=d.vigentes||[];
    const unidades=[...new Set(vig.map(f=>dep.unidad(f.linea)))];
    const totProd=vig.reduce((s,f)=>s+f.producido,0),totProg=vig.reduce((s,f)=>s+f.programado,0);
    const detalle=vig.length
      ?(unidades.length===1?`${dep.fmt(totProd)} de ${dep.fmt(totProg)} ${unidades[0]}`:`Promedio de ${vig.length} línea${vig.length>1?'s':''} con programación`)
      :'Sin programación para evaluar';
    const sp=dep.sinProduccion?dep.sinProduccion(d):{filas:[],estado:'sin_modulo'};
    return {
      fecha:d.fecha,turno:d.turno,
      avance:{pct:vig.length?Math.round(d.avance):null,detalle},
      enProduccion:{n:d.enCurso,total:d.totalLineas,nombres:d.nombresEnCurso||[]},
      paradas:{prog:dep.duracion(d.paradas.prog),noProg:dep.duracion(d.paradas.noProg)},
      motivos:(d.paradas.motivos||[]).slice().sort((a,b)=>b.minutos-a.minutos).slice(0,3)
        .map(m=>({linea:m.linea,motivo:m.motivo,min:dep.duracion(m.minutos),prog:m.clasif==='PROGRAMADA'})),
      personal:modeloPersonal(dep.personal?dep.personal(d):null,dep),
      sinProduccion:{estado:sp.estado,filas:(sp.filas||[]).map(f=>({nombre:dep.nombreLinea(f.linea),texto:notaCausa(f)}))},
      lineas:modeloLineas(d,dep)
    };
  }

  /* ---------- frescura ---------- */
  /* estadoPagina = glacialEstadoDatos.estado() (conexión de la página); ultimoOk = instante del último cálculo correcto. */
  function estadoDatos({ahora,ultimoOk,estadoPagina,hora}){
    if(!ultimoOk||ahora-ultimoOk>SIN_DATOS_MS)return {warn:true,nivel:'sindatos',texto:'SIN DATOS'+(ultimoOk?' · última actualización '+hora(ultimoOk):'')};
    if(estadoPagina&&estadoPagina.warn)return {warn:true,nivel:'sinconexion',texto:String(estadoPagina.texto||'').replace(/^Sin conexión/,'SIN CONEXIÓN')};
    return {warn:false,nivel:'ok',texto:'Actualizado '+hora(ultimoOk)};
  }

  /* ---------- HTML (sin botones ni enlaces) ---------- */
  const fmtPct=p=>p==null?'—':p+' %';
  const barra=(pct,cls)=>`<div class="tv-barra"><i class="tv-${cls}" style="width:${Math.min(100,Math.max(0,pct||0))}%"></i></div>`;
  const insignia=e=>`<span class="tv-ins tv-ins-${e.cls}"><b aria-hidden="true">${e.ico}</b>${esc(e.txt)}</span>`;
  const barraCls=e=>({curso:'naranja',pausa:'naranja',completada:'verde',detenida:'rojo',cancelada:'rojo',sinprod:'rojo'}[e.cls]||'azul');

  function marco(vista,estado,subtitulo,cuerpo){
    return `<div class="tv-escenario" data-vista="${esc(vista)}">
      <header class="tv-cab">
        <div class="tv-marca"><img class="tv-logo" src="assets/img/logo_glacial.jpeg" alt=""><span>GLACIAL</span><em>TV</em></div>
        <h1>${esc(TITULOS[vista])}</h1>
        <div class="tv-meta"><span class="tv-turno">${esc(subtitulo)}</span><span class="tv-chip tv-chip-${esc(estado.nivel)}" role="status">${esc(estado.texto)}</span></div>
      </header>
      <main class="tv-cuerpo">${cuerpo}</main>
    </div>`;
  }

  function tarjeta(titulo,cuerpo,extra){return `<section class="tv-card ${extra||''}"><h2>${esc(titulo)}</h2>${cuerpo}</section>`;}

  function htmlInicio(m){
    const av=m.avance.pct==null
      ?`<div class="tv-grande">—</div>${barra(0,'azul')}<p class="tv-peq">${esc(m.avance.detalle)}</p>`
      :`<div class="tv-grande">${m.avance.pct} %</div>${barra(m.avance.pct,'azul')}<p class="tv-peq">${esc(m.avance.detalle)}</p>`;
    const enProd=`<div class="tv-grande">${m.enProduccion.n} / ${m.enProduccion.total}</div><p class="tv-peq">${m.enProduccion.n?esc(m.enProduccion.nombres.join(' · ')):'Ninguna línea con producción'}</p>`;
    const par=`<p class="tv-par"><i class="tv-pt tv-pt-prog"></i>Programadas: <b>${esc(m.paradas.prog)}</b></p>
      <p class="tv-par"><i class="tv-pt tv-pt-noprog"></i>No programadas: <b>${esc(m.paradas.noProg)}</b></p><p class="tv-peq">Registro de Avance/Cierre</p>`;
    const mot=m.motivos.length
      ?m.motivos.map(x=>`<p class="tv-mot"><i class="tv-pt ${x.prog?'tv-pt-prog':'tv-pt-noprog'}"></i>${esc(x.linea)} · ${esc(x.motivo)} — <b>${esc(x.min)}</b></p>`).join('')
      :'<p class="tv-mut">Sin paradas registradas</p>';
    const per=m.personal.estado==='ok'
      ?`<div class="tv-per">${m.personal.lineas.map(x=>`<span class="${x.alerta?'tv-alerta':''}">${esc(x.nombre)}</span><b class="${x.valor==='Pendiente'?'tv-pend':''}">${esc(x.valor)}</b>`).join('')}</div>
        <p class="tv-peq">Asignados ${m.personal.asignados}${m.personal.apoyo?` · apoyo ${m.personal.apoyo}`:''}${m.personal.disponible!=null?` · con asistencia ${m.personal.disponible}`:''}</p>`
      :`<p class="tv-mut">${{pendiente:'Distribución pendiente de registrar',cargando:'Consultando la distribución…',error:'No se pudo consultar la distribución',sin_modulo:'Distribución no disponible'}[m.personal.estado]||''}</p>`;
    const sp=m.sinProduccion.filas.length
      ?m.sinProduccion.filas.slice(0,2).map(f=>`<p class="tv-sp"><b>${esc(f.nombre)}</b>${esc(f.texto)}</p>`).join('')+(m.sinProduccion.filas.length>2?`<p class="tv-peq">+${m.sinProduccion.filas.length-2} más</p>`:'')+'<p class="tv-peq">Informativo: no es una parada oficial</p>'
      :`<p class="tv-mut">${m.sinProduccion.estado==='listo'?'Todas las líneas están en producción.':'Consultando…'}</p>`;
    const filas=m.lineas.map(l=>`<tr><th>${esc(l.nombre)}</th>
        <td class="tv-prod">${esc(l.producto)}${l.nota?`<small>${esc(l.nota)}</small>`:''}</td>
        <td class="tv-num">${l.producido==null?'—':`<b>${esc(fmtNum(l.producido))}</b>${l.programado>0?` / ${esc(fmtNum(l.programado))}`:''} ${esc(l.unidad)}`}</td>
        <td class="tv-cum">${l.pct==null?'—':`<b>${fmtPct(l.pct)}</b>${barra(l.pct,barraCls(l.estado))}`}</td>
        <td>${insignia(l.estado)}</td></tr>`).join('');
    return `<div class="tv-inicio">
      ${tarjeta('Avance del turno',av)}${tarjeta('Líneas en producción',enProd)}${tarjeta('Paradas del turno',par)}
      ${tarjeta('Motivos registrados',mot)}${tarjeta('Distribución de personal',per)}${tarjeta('Líneas sin producción',sp,'tv-card-sp')}
      <section class="tv-card tv-tabla"><h2>Producción por línea</h2>
        <table><thead><tr><th>Línea</th><th>Producto</th><th>Producción</th><th>Cumplimiento</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table></section>
    </div>`;
  }

  function htmlLineas(m){
    const filas=m.lineas.map(l=>`<article class="tv-linea tv-linea-${l.estado.cls}">
        <div class="tv-l-nombre">${esc(l.nombre)}</div>
        <div class="tv-l-prod"><b>${esc(l.producto)}</b>${l.nota?`<small>${esc(l.nota)}</small>`:''}<small>Último registro: ${esc(l.ultimo)}</small></div>
        <div class="tv-l-cant">${l.producido==null?'<b>—</b>':`<b>${esc(fmtNum(l.producido))}</b>${l.programado>0?`<span> / ${esc(fmtNum(l.programado))}</span>`:''}<em>${esc(l.unidad)}</em>`}</div>
        <div class="tv-l-pct">${l.pct==null?'<b>—</b>':`<b>${fmtPct(l.pct)}</b>${barra(l.pct,barraCls(l.estado))}`}</div>
        <div class="tv-l-est">${insignia(l.estado)}</div>
      </article>`).join('');
    return `<div class="tv-lineas">${filas||'<p class="tv-mut">Sin líneas para mostrar</p>'}</div>`;
  }

  function htmlProximamente(){
    return `<div class="tv-aviso"><h2>Vista en preparación</h2><p>«Producción actual» llegará en la siguiente fase.</p></div>`;
  }
  function htmlMensaje(titulo,texto){
    return `<div class="tv-aviso"><h2>${esc(titulo)}</h2><p>${esc(texto)}</p></div>`;
  }

  const fmtNum=n=>Number(n).toLocaleString('es-PE');

  /* ---------- dependencias reales del navegador (las funciones del Inicio) ---------- */
  function depNavegador(){
    return {
      nombreLinea:k=>cpNombreLinea(k),unidad:k=>cpUnidadEjec(k),fmt:n=>cpFmt(n),duracion:m=>cpDuracionMin(m),hora:ms=>cpHoraCorta(ms),
      presentacion:(k,m)=>cpPresentacionUI({linea:k,marca:m.marca,presentacion:m.presentacion}),
      productoActual:f=>cpProductoActual(f),
      sinProduccion:d=>cpFilasSinProduccion(d),personal:d=>cpPersonalPorLinea(d)
    };
  }
  const horaCorta=ms=>new Date(ms).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/Lima'});
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  function subtituloDe(m){
    const f=String(m.fecha||'').split('-').reverse().join('/');
    const t=m.turno==='NOCHE'?'NOCHE':'DÍA + INTERMEDIO';
    return `${f} · ${t}`;
  }

  /* ---------- ejecución en el navegador ---------- */
  const ctx={params:null,raiz:null,ultimoOk:0,ultimoHtml:'',ultimoSub:''};

  function ajustarEscala(){
    if(!ctx.raiz)return;
    const e=Math.min(window.innerWidth/BASE_ANCHO,window.innerHeight/BASE_ALTO);
    ctx.raiz.style.setProperty('--tv-escala',String(e>0?e:1));
  }

  function dibujar(){
    if(!ctx.raiz)return;
    let cuerpo='',sub=ctx.ultimoSub||'';
    try{
      if(typeof cpPuedeVerInicioEjecutivo==='function'&&!cpPuedeVerInicioEjecutivo()){
        cuerpo=htmlMensaje('SIN PERMISO','Esta cuenta no puede ver el Inicio. Use un usuario de TV en Modo visualización con Inicio.');
      }else{
        const d=cpDatosEjecutivo();
        if(!d)throw new Error('sin datos');
        const m=modeloInicio(d,depNavegador());
        sub=subtituloDe(m);
        cuerpo=ctx.params.vista==='lineas'?htmlLineas(m):ctx.params.vista==='actual'?htmlProximamente():htmlInicio(m);
        ctx.ultimoOk=ahoraMs();
      }
    }catch(e){
      console.warn('GLACIAL TV: no se pudo calcular',e);
      cuerpo=ctx.ultimoHtml||htmlMensaje('SIN DATOS','Esperando la información de GLACIAL…');     // se conserva la última pantalla válida
    }
    let est=null;try{est=window.glacialEstadoDatos&&window.glacialEstadoDatos.estado?window.glacialEstadoDatos.estado():null;}catch(_){est=null;}
    const estado=estadoDatos({ahora:ahoraMs(),ultimoOk:ctx.ultimoOk,estadoPagina:est,hora:horaCorta});
    if(ctx.ultimoOk&&cuerpo&&!/tv-aviso/.test(cuerpo))ctx.ultimoHtml=cuerpo;
    ctx.ultimoSub=sub;
    ctx.raiz.innerHTML=marco(ctx.params.vista,estado,sub||'—',cuerpo);
  }

  function montar(){
    if(ctx.raiz)return;
    const r=document.createElement('div');
    r.id='glacial-tv';r.setAttribute('aria-live','off');
    document.body.appendChild(r);
    ctx.raiz=r;
    window.addEventListener('resize',ajustarEscala);
    ajustarEscala();
    dibujar();
    setInterval(dibujar,REFRESCO_MS);
  }

  function iniciar(){
    if(typeof document==='undefined'||typeof location==='undefined')return;
    ctx.params=leerParametros(location.search);
    if(!ctx.params.activo)return;
    document.documentElement.classList.add('modo-tv');
    // Se muestra la pantalla de acceso hasta que haya sesión y las funciones del Inicio estén listas.
    const espera=setInterval(()=>{
      if(typeof state!=='undefined'&&state&&state.user&&typeof cpDatosEjecutivo==='function'){
        clearInterval(espera);montar();
      }
    },1000);
  }

  window.glacialTV={VISTAS,TITULOS,ESTADOS,leerParametros,modeloLineas,modeloPersonal,modeloInicio,estadoDatos,htmlInicio,htmlLineas,htmlProximamente,marco,subtituloDe,
    SIN_DATOS_MS,REFRESCO_MS,_dibujarParaPruebas:dibujar,_ctx:ctx};
  iniciar();
})();
