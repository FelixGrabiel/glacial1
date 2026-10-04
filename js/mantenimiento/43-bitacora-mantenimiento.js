/* =========================================================
   BITÁCORA DE MANTENIMIENTO (solo lectura)
   Lee la colección bitacoraMantenimiento (la escribe 24-semaforo-produccion-actual.js al
   DETENER / PAUSAR / INTERVENIR / REANUDAR una línea).

   · La ven: Administrador, Jefatura/Gerencia, Supervisor de Producción y quien tenga el permiso
     gestionar_rotacion_mantenimiento (Supervisor de Mantenimiento). La cuenta compartida NO.
     Las reglas de la etapa 2 aplican la misma lista (firestore.rules.etapa2.txt).
   · Carga SOLO el rango de fechas elegido (consulta por timestamp, tope de eventos). Los filtros de
     turno, línea, técnico y acción se aplican en el navegador sobre lo ya cargado: no gastan lecturas.
     Solo se vuelve a consultar al cambiar las fechas o al pulsar «Actualizar».
   · Vista por parada: agrupa DETENER/PAUSAR → INTERVENIR → REANUDAR de una misma presentación.
   Cargar después de 37b-mantenimiento-identificacion.js. No modifica datos.
   ========================================================= */
(function(){
  'use strict';

  const COLECCION='bitacoraMantenimiento';
  const LIMITE_EVENTOS=2000;     // tope de lecturas por consulta
  const MAX_DIAS=31;             // rango máximo por consulta
  const ACCIONES=['DETENER','PAUSAR','INTERVENIR','REANUDAR'];
  const TURNOS=['DÍA','INTERMEDIO','NOCHE'];
  const ROLES_LECTURA=['Jefe de Producción','Jefe de Operaciones','Jefatura','Gerente General','Gerente',
    'Supervisor','Supervisor de Producción'];            // = reglas de la etapa 2

  /* ---------- permisos ---------- */
  function puedeVerBitacoraMtto(usuario){
    const u=usuario||(typeof state!=='undefined'?state.user:null);
    if(!u||!u.username)return false;
    try{
      if(typeof esMantCompartido==='function'&&esMantCompartido(u))return false;
      const rol=String(u.rol||'').trim();
      if(rol==='Administrador')return true;
      if(ROLES_LECTURA.includes(rol))return true;
      return typeof tienePermiso==='function'&&tienePermiso('gestionar_rotacion_mantenimiento');
    }catch(_){return false;}
  }
  window.puedeVerBitacoraMtto=puedeVerBitacoraMtto;

  /* ---------- utilidades ---------- */
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,
    c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const hoyISO=()=>iso(new Date(ahoraMs()));
  const inicioDia=f=>{const [y,m,d]=String(f).split('-').map(Number);return new Date(y,m-1,d,0,0,0,0);};
  const dias=(a,b)=>Math.round((inicioDia(b)-inicioDia(a))/86400000)+1;
  const fechaOk=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''));
  const fmtHora=ms=>ms?new Date(ms).toLocaleString('es-PE',{hour12:false}):'—';
  const fmtDur=ms=>{
    if(ms==null||!Number.isFinite(ms))return '—';
    const s=Math.round(ms/1000);
    if(s<60)return s+' s';
    const m=Math.floor(s/60),h=Math.floor(m/60);
    return h?h+' h '+String(m%60).padStart(2,'0')+' min':m+' min';
  };
  const minutos=ms=>Math.round((ms||0)/60000);
  const norm=t=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();

  /* ---------- estado de la pantalla ---------- */
  const F={desde:'',hasta:'',turno:'',linea:'',tecnico:'',accion:'',vista:'paradas'};
  const carga={clave:'',eventos:[],truncado:false,cargando:false,error:'',token:0,cargadoEn:0};

  function msDe(v){
    if(!v)return 0;
    if(typeof v.toMillis==='function')return v.toMillis();
    if(typeof v.seconds==='number')return v.seconds*1000+Math.floor((v.nanoseconds||0)/1e6);
    return Number(v)||0;
  }

  /* ---------- carga por rango (nunca la colección completa) ---------- */
  async function cargarRango(forzar){
    if(typeof db==='undefined')return;
    const rechazar=msg=>{carga.error=msg;carga.cargando=false;renderBitacoraMtto();};
    if(!fechaOk(F.desde)||!fechaOk(F.hasta))return rechazar('Elige fechas válidas.');
    if(F.hasta<F.desde)return rechazar('La fecha final no puede ser anterior a la inicial.');
    if(dias(F.desde,F.hasta)>MAX_DIAS)return rechazar('El rango máximo es de '+MAX_DIAS+' días por consulta (para no gastar lecturas).');
    const clave=F.desde+'|'+F.hasta;
    if(!forzar&&clave===carga.clave&&!carga.error)return;
    const token=++carga.token;
    carga.cargando=true;carga.error='';
    renderBitacoraMtto();
    try{
      const ini=inicioDia(F.desde);
      const fin=new Date(inicioDia(F.hasta).getTime()+86400000);
      const T=firebase.firestore.Timestamp;
      const snap=await db.collection(COLECCION)
        .where('timestamp','>=',T.fromDate(ini))
        .where('timestamp','<',T.fromDate(fin))
        .orderBy('timestamp','asc')
        .limit(LIMITE_EVENTOS)
        .get();
      if(token!==carga.token)return;          // llegó una consulta más nueva
      carga.eventos=snap.docs.map(d=>{
        const x=d.data({serverTimestamps:'estimate'});
        return Object.assign({},x,{id:d.id,ts:msDe(x.timestamp)});
      });
      carga.truncado=snap.size>=LIMITE_EVENTOS;
      carga.clave=clave;carga.cargadoEn=ahoraMs();
    }catch(e){
      if(token!==carga.token)return;
      carga.error='No se pudo cargar la bitácora: '+((e&&e.message)||e);
      carga.eventos=[];carga.clave='';
    }
    carga.cargando=false;
    renderBitacoraMtto();
  }

  /* ---------- agrupar eventos en paradas ---------- */
  const esPendiente=m=>{const t=norm(m);return !t||t==='otro'||t==='sin motivo registrado';};

  function armarParadas(eventos){
    const porClave=new Map();
    eventos.forEach(e=>{
      const k=(e.linea||'')+'|'+(e.claveProgramacion||e.marca||'');
      if(!porClave.has(k))porClave.set(k,[]);
      porClave.get(k).push(e);
    });
    const paradas=[];
    const ahora=ahoraMs();
    porClave.forEach(lista=>{
      lista.sort((a,b)=>a.ts-b.ts);
      let abierta=null;
      const nueva=(tipo,e,incompleta)=>{
        const p={tipo,pasos:[e],linea:e.linea||'',turno:e.turno||'',marca:e.marca||'',presentacion:e.presentacion||'',
          fechaPlan:e.fechaPlan||'',inicio:e.ts,fin:null,duracionMs:null,cerrada:false,sinInicio:!!incompleta,motivo:''};
        paradas.push(p);return p;
      };
      lista.forEach(e=>{
        if(e.accion==='DETENER'||e.accion==='PAUSAR'){
          abierta=nueva(e.accion==='PAUSAR'?'PAUSA':'DETENCION',e,false);
          abierta.motivo=e.motivo||'';
        }else if(e.accion==='INTERVENIR'){
          if(!abierta){abierta=nueva('DETENCION',e,true);}else abierta.pasos.push(e);
        }else if(e.accion==='REANUDAR'){
          if(!abierta){
            abierta=nueva(norm(e.estadoAnterior)==='pausa'?'PAUSA':'DETENCION',e,true);
            abierta.motivo=e.motivo||'';
          }else abierta.pasos.push(e);
          abierta.fin=e.ts;abierta.cerrada=true;
          abierta.duracionMs=Number.isFinite(Number(e.duracionMs))&&e.duracionMs!=null?Number(e.duracionMs)
            :(abierta.sinInicio?null:Math.max(0,e.ts-abierta.inicio));
          if(!abierta.motivo)abierta.motivo=e.motivo||'';
          abierta=null;
        }
      });
    });
    paradas.forEach(p=>{
      if(!p.cerrada&&!p.sinInicio)p.duracionEnCursoMs=Math.max(0,ahora-p.inicio);
      p.duracionTotalMs=p.cerrada?p.duracionMs:(p.duracionEnCursoMs??null);
      p.pendiente=esPendiente(p.motivo);
      p.iniciador=p.pasos[0].tecnicoNombre||p.pasos[0].cuenta||'—';
    });
    return paradas.sort((a,b)=>b.inicio-a.inicio);
  }

  /* ---------- filtros (en el navegador) ---------- */
  function eventoCumple(e){
    if(F.turno&&e.turno!==F.turno)return false;
    if(F.linea&&e.linea!==F.linea)return false;
    if(F.tecnico&&(e.tecnicoNombre||e.cuenta||'')!==F.tecnico)return false;
    if(F.accion&&e.accion!==F.accion)return false;
    return true;
  }
  function paradaCumple(p){
    if(F.turno&&p.turno!==F.turno)return false;
    if(F.linea&&p.linea!==F.linea)return false;
    if(F.tecnico&&!p.pasos.some(e=>(e.tecnicoNombre||e.cuenta||'')===F.tecnico))return false;
    if(F.accion&&!p.pasos.some(e=>e.accion===F.accion))return false;
    return true;
  }
  const datosFiltrados=()=>{
    const paradas=armarParadas(carga.eventos).filter(paradaCumple);
    const eventos=carga.eventos.filter(eventoCumple).slice().sort((a,b)=>b.ts-a.ts);
    return {paradas,eventos};
  };

  /* ---------- resumen ---------- */
  function resumir(paradas){
    const porLinea=new Map(),porTecnico=new Map();
    const sumar=(m,k,p)=>{
      const r=m.get(k)||{paradas:0,ms:0,pendientes:0,enCurso:0};
      r.paradas++;r.ms+=p.duracionTotalMs||0;if(p.pendiente)r.pendientes++;if(!p.cerrada&&!p.sinInicio)r.enCurso++;
      m.set(k,r);
    };
    paradas.forEach(p=>{sumar(porLinea,p.linea||'—',p);sumar(porTecnico,p.iniciador,p);});
    const tot={paradas:paradas.length,ms:paradas.reduce((s,p)=>s+(p.duracionTotalMs||0),0),
      pendientes:paradas.filter(p=>p.pendiente).length,enCurso:paradas.filter(p=>!p.cerrada&&!p.sinInicio).length};
    const ord=m=>[...m.entries()].map(([k,v])=>Object.assign({k},v)).sort((a,b)=>b.ms-a.ms||b.paradas-a.paradas);
    return {porLinea:ord(porLinea),porTecnico:ord(porTecnico),tot};
  }

  /* ---------- pantalla ---------- */
  function estilos(){
    if(document.getElementById('bitmtto-css'))return;
    const s=document.createElement('style');s.id='bitmtto-css';
    s.textContent=`
      .bm-resumen{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}
      .bm-kpi{border:1px solid #dfe4ea;border-radius:10px;padding:10px 12px;background:#fff}
      .bm-kpi span{display:block;font-size:12px;color:#5a6b7b}.bm-kpi b{font-size:22px;color:#1b2a38}
      .bm-kpi.warn{border-color:#f0c36a;background:#fff8e6}
      .bm-dos{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:12px}
      .bm-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px}
      .bm-card{border:1px solid #dfe4ea;border-left:5px solid #2f7fd0;border-radius:10px;padding:10px 12px;background:#fff}
      .bm-card.pausa{border-left-color:#13814a}.bm-card.pend{border-color:#e0a43a;border-left-color:#e0a43a;background:#fff8e6}
      .bm-card.curso{box-shadow:0 0 0 2px rgba(169,47,39,.25)}
      .bm-card h4{margin:0 0 4px;font-size:15px}.bm-card .meta{font-size:12px;color:#5a6b7b;margin-bottom:6px}
      .bm-chip{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700;background:#e8eef5;color:#1b2a38;margin-right:4px}
      .bm-chip.warn{background:#f6d58b;color:#6b4300}.bm-chip.bad{background:#f4c7c3;color:#8a1f17}.bm-chip.ok{background:#cdeedd;color:#0c5c34}
      .bm-pasos{margin:6px 0 0;padding:0;list-style:none;font-size:12.5px}.bm-pasos li{padding:2px 0;border-top:1px dashed #e3e8ee}
      .bm-aviso{padding:8px 12px;border-radius:8px;background:#fff8e6;border:1px solid #f0c36a;margin-bottom:10px;font-size:13px}
      .bm-error{padding:8px 12px;border-radius:8px;background:#fdecea;border:1px solid #f1b0aa;color:#8a1f17;margin-bottom:10px;font-size:13px}
    `;
    document.head.appendChild(s);
  }

  function opciones(lista,sel,todos){
    return '<option value="">'+todos+'</option>'+lista.map(v=>'<option value="'+esc(v)+'"'+(v===sel?' selected':'')+'>'+esc(v)+'</option>').join('');
  }

  function tablaResumen(titulo,filas,colNombre){
    return '<div class="panel" style="margin:0"><div class="panel-head"><h3>'+esc(titulo)+'</h3></div><div class="panel-body">'+
      (filas.length?'<div class="tareo-table-scroll"><table class="tareo-table"><thead><tr><th>'+esc(colNombre)+'</th><th>Paradas</th><th>Minutos</th><th>Motivo pendiente</th></tr></thead><tbody>'+
        filas.map(r=>'<tr><td>'+esc(r.k)+'</td><td>'+r.paradas+(r.enCurso?' <span class="small-muted">('+r.enCurso+' en curso)</span>':'')+'</td><td>'+minutos(r.ms)+'</td><td>'+(r.pendientes||'—')+'</td></tr>').join('')+
        '</tbody></table></div>':'<p class="small-muted">Sin paradas en el filtro.</p>')+'</div></div>';
  }

  function cuentaTxt(e){
    return esc(e.cuenta||'—')+(String(e.identificadoPor||'').startsWith('PIN')?' <span class="bm-chip">PIN</span>':'');
  }

  function tarjetaParada(p){
    const clase=['bm-card',p.tipo==='PAUSA'?'pausa':'',p.pendiente?'pend':'',(!p.cerrada&&!p.sinInicio)?'curso':''].join(' ');
    const dur=p.cerrada?fmtDur(p.duracionTotalMs):(p.sinInicio?'—':fmtDur(p.duracionTotalMs)+' (en curso)');
    return '<div class="'+clase+'">'+
      '<h4>'+esc(p.linea||'—')+' · '+esc(p.marca||'')+' '+esc(p.presentacion||'')+'</h4>'+
      '<div class="meta">'+esc(p.fechaPlan||'')+' · '+esc(p.turno||'')+'</div>'+
      '<div><span class="bm-chip '+(p.tipo==='PAUSA'?'ok':'bad')+'">'+(p.tipo==='PAUSA'?'PAUSA PROGRAMADA':'DETENCIÓN')+'</span>'+
      (p.pendiente?'<span class="bm-chip warn">MOTIVO PENDIENTE</span>':'')+
      (!p.cerrada&&!p.sinInicio?'<span class="bm-chip bad">EN CURSO</span>':'')+
      (p.sinInicio?'<span class="bm-chip">INICIO FUERA DEL RANGO</span>':'')+'</div>'+
      '<div style="margin-top:6px"><b>Motivo:</b> '+(esc(p.motivo)||'<i>sin motivo</i>')+'</div>'+
      '<div><b>Duración total:</b> '+esc(dur)+'</div>'+
      '<ul class="bm-pasos">'+p.pasos.map(e=>'<li><b>'+esc(e.accion)+'</b> · '+esc(fmtHora(e.ts))+' · '+esc(e.tecnicoNombre||'—')+
        ' <span class="small-muted">(cuenta '+cuentaTxt(e)+')</span></li>').join('')+'</ul></div>';
  }

  function renderBitacoraMtto(){
    const main=document.getElementById('main');
    if(!main)return;
    if(!puedeVerBitacoraMtto()){main.innerHTML='<div class="empty-state"><h4>Acceso no autorizado</h4></div>';return;}
    estilos();
    if(!F.desde){F.desde=F.hasta=hoyISO();}
    const {paradas,eventos}=datosFiltrados();
    const R=resumir(paradas);
    const lineas=[...new Set(carga.eventos.map(e=>e.linea).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    const tecnicos=[...new Set(carga.eventos.map(e=>e.tecnicoNombre||e.cuenta).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    main.innerHTML=
      '<div class="main-head" id="bitmtto-view"><div><h2>Bitácora de Mantenimiento</h2>'+
      '<div class="sub">Solo lectura · hora del servidor · '+(carga.cargadoEn?'consultada a las '+esc(fmtHora(carga.cargadoEn)):'sin consultar')+'</div></div></div>'+
      '<div class="panel"><div class="panel-body">'+
      '<div class="tar2-toolbar" style="margin-bottom:10px;gap:10px;flex-wrap:wrap">'+
        '<div class="field-sm"><label>Desde</label><input type="date" id="bm-desde" value="'+esc(F.desde)+'" max="'+esc(hoyISO())+'"></div>'+
        '<div class="field-sm"><label>Hasta</label><input type="date" id="bm-hasta" value="'+esc(F.hasta)+'" max="'+esc(hoyISO())+'"></div>'+
        '<div class="field-sm"><label>Turno</label><select id="bm-turno">'+opciones(TURNOS,F.turno,'Todos')+'</select></div>'+
        '<div class="field-sm"><label>Línea</label><select id="bm-linea">'+opciones(lineas,F.linea,'Todas')+'</select></div>'+
        '<div class="field-sm"><label>Técnico</label><select id="bm-tecnico">'+opciones(tecnicos,F.tecnico,'Todos')+'</select></div>'+
        '<div class="field-sm"><label>Acción</label><select id="bm-accion">'+opciones(ACCIONES,F.accion,'Todas')+'</select></div>'+
        '<div class="field-sm"><label>&nbsp;</label><button type="button" class="btn btn-ghost btn-sm" id="bm-hoy">Hoy</button> '+
        '<button type="button" class="btn btn-ghost btn-sm" id="bm-actualizar">Actualizar</button> '+
        '<button type="button" class="btn btn-primary btn-sm" id="bm-excel"'+((carga.eventos.length&&!carga.cargando)?'':' disabled')+'>Exportar a Excel</button></div>'+
      '</div>'+
      (carga.cargando?'<div class="bm-aviso">Cargando eventos del rango…</div>':'')+
      (carga.error?'<div class="bm-error">'+esc(carga.error)+'</div>':'')+
      (carga.truncado?'<div class="bm-aviso">Se muestran los primeros '+LIMITE_EVENTOS+' eventos del rango. Acota las fechas para ver el resto.</div>':'')+
      '<div class="bm-resumen">'+
        '<div class="bm-kpi"><span>Paradas</span><b>'+R.tot.paradas+'</b></div>'+
        '<div class="bm-kpi"><span>Minutos de parada</span><b>'+minutos(R.tot.ms)+'</b></div>'+
        '<div class="bm-kpi'+(R.tot.pendientes?' warn':'')+'"><span>Motivo pendiente</span><b>'+R.tot.pendientes+'</b></div>'+
        '<div class="bm-kpi"><span>En curso</span><b>'+R.tot.enCurso+'</b></div>'+
        '<div class="bm-kpi"><span>Eventos en el rango</span><b>'+carga.eventos.length+'</b></div></div>'+
      '<div class="bm-dos">'+tablaResumen('Por línea',R.porLinea,'Línea')+tablaResumen('Por técnico (quien inició la parada)',R.porTecnico,'Técnico')+'</div>'+
      '<div class="tareo-tabs" style="margin-bottom:10px">'+
        '<button type="button" class="tareo-tab '+(F.vista==='paradas'?'active':'')+'" data-bm-vista="paradas">Por parada ('+paradas.length+')</button>'+
        '<button type="button" class="tareo-tab '+(F.vista==='eventos'?'active':'')+'" data-bm-vista="eventos">Todos los eventos ('+eventos.length+')</button></div>'+
      (F.vista==='paradas'
        ?(paradas.length?'<div class="bm-cards">'+paradas.map(tarjetaParada).join('')+'</div>':'<p class="small-muted">No hay paradas con esos filtros.</p>')
        :('<div class="tareo-table-scroll"><table class="tareo-table"><thead><tr><th>Hora (servidor)</th><th>Técnico</th><th>Acción</th><th>Línea</th><th>Marca y presentación</th><th>Motivo</th><th>Duración</th><th>Cuenta</th></tr></thead><tbody>'+
          (eventos.length?eventos.map(e=>'<tr><td>'+esc(fmtHora(e.ts))+'</td><td>'+esc(e.tecnicoNombre||'—')+'</td><td>'+esc(e.accion)+'</td><td>'+esc(e.linea||'')+'</td><td>'+esc((e.marca||'')+' '+(e.presentacion||''))+'</td><td>'+esc(e.motivo||'')+'</td><td>'+(e.duracionMs!=null&&Number.isFinite(Number(e.duracionMs))?esc(fmtDur(Number(e.duracionMs))):'—')+'</td><td>'+cuentaTxt(e)+'</td></tr>').join('')
            :'<tr><td colspan="8" class="small-muted">No hay eventos con esos filtros.</td></tr>')+
          '</tbody></table></div>'))+
      '</div></div>';
  }
  window.renderBitacoraMtto=renderBitacoraMtto;

  /* ---------- eventos de la pantalla ---------- */
  document.getElementById('main')?.addEventListener('change',e=>{
    if(!document.getElementById('bitmtto-view'))return;
    const id=e.target.id;
    if(id==='bm-desde'||id==='bm-hasta'){
      F.desde=document.getElementById('bm-desde').value;F.hasta=document.getElementById('bm-hasta').value;
      if(fechaOk(F.desde)&&(!fechaOk(F.hasta)||F.hasta<F.desde))F.hasta=F.desde;
      cargarRango(false);return;
    }
    const mapa={'bm-turno':'turno','bm-linea':'linea','bm-tecnico':'tecnico','bm-accion':'accion'};
    if(mapa[id]){F[mapa[id]]=e.target.value;renderBitacoraMtto();}
  });
  document.getElementById('main')?.addEventListener('click',e=>{
    if(!document.getElementById('bitmtto-view'))return;
    const vista=e.target.closest('[data-bm-vista]')?.dataset.bmVista;
    if(vista){F.vista=vista;renderBitacoraMtto();return;}
    if(e.target.closest('#bm-hoy')){F.desde=F.hasta=hoyISO();cargarRango(true);return;}
    if(e.target.closest('#bm-actualizar')){cargarRango(true);return;}
    if(e.target.closest('#bm-excel')){exportarExcel();}
  });

  /* ---------- Excel con los filtros aplicados ---------- */
  async function exportarExcel(){
    if(typeof ExcelJS==='undefined'){alert('No se pudo cargar ExcelJS. Revisa tu conexión a internet y recarga la página.');return;}
    const {paradas,eventos}=datosFiltrados();
    if(!eventos.length&&!paradas.length){alert('No hay datos con esos filtros.');return;}
    const R=resumir(paradas);
    const filtros='Rango: '+F.desde+' a '+F.hasta+' · Turno: '+(F.turno||'todos')+' · Línea: '+(F.linea||'todas')+
      ' · Técnico: '+(F.tecnico||'todos')+' · Acción: '+(F.accion||'todas');
    const wb=new ExcelJS.Workbook();wb.creator='GLACIAL';wb.created=new Date();
    const cabecera=(ws,titulo,cols)=>{
      ws.addRow([titulo]).font={bold:true,size:14};
      ws.addRow([filtros]).font={italic:true,color:{argb:'FF5A6B7B'}};
      ws.addRow([]);
      const h=ws.addRow(cols);
      h.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F4E79'}};
        c.alignment={vertical:'middle',horizontal:'center',wrapText:true};});
      ws.views=[{state:'frozen',ySplit:4}];
      return h.number;
    };
    // Resumen
    const wr=wb.addWorksheet('Resumen');
    cabecera(wr,'Bitácora de Mantenimiento · resumen',['Tipo','Nombre','Paradas','Minutos','Motivo pendiente']);
    wr.addRow(['TOTAL','',R.tot.paradas,minutos(R.tot.ms),R.tot.pendientes]).font={bold:true};
    R.porLinea.forEach(r=>wr.addRow(['Línea',r.k,r.paradas,minutos(r.ms),r.pendientes]));
    R.porTecnico.forEach(r=>wr.addRow(['Técnico (inició)',r.k,r.paradas,minutos(r.ms),r.pendientes]));
    [14,34,12,12,16].forEach((w,i)=>wr.getColumn(i+1).width=w);
    // Paradas
    const wp=wb.addWorksheet('Paradas');
    const hp=cabecera(wp,'Bitácora de Mantenimiento · paradas',['Inicio (servidor)','Fin','Tipo','Línea','Fecha plan','Turno','Marca','Presentación','Motivo','Motivo pendiente','Estado','Duración (min)','Pasos (acción · hora · técnico · cuenta)']);
    paradas.slice().sort((a,b)=>a.inicio-b.inicio).forEach(p=>wp.addRow([
      fmtHora(p.inicio),p.fin?fmtHora(p.fin):'',p.tipo==='PAUSA'?'Pausa programada':'Detención',p.linea,p.fechaPlan,p.turno,p.marca,p.presentacion,
      p.motivo,p.pendiente?'SÍ':'',p.cerrada?'Cerrada':(p.sinInicio?'Sin inicio en el rango':'En curso'),
      p.duracionTotalMs==null?'':minutos(p.duracionTotalMs),
      p.pasos.map(e=>e.accion+' · '+fmtHora(e.ts)+' · '+(e.tecnicoNombre||'—')+' · '+(e.cuenta||'')).join('\n')]));
    wp.autoFilter={from:{row:hp,column:1},to:{row:hp,column:13}};
    [22,22,16,12,12,12,18,16,26,12,16,12,70].forEach((w,i)=>wp.getColumn(i+1).width=w);
    wp.eachRow((row,n)=>{if(n>hp)row.alignment={vertical:'top',wrapText:true};});
    // Eventos
    const we=wb.addWorksheet('Eventos');
    const he=cabecera(we,'Bitácora de Mantenimiento · eventos',['Hora (servidor)','Técnico','Acción','Línea','Fecha plan','Turno','Marca','Presentación','Motivo','Duración (min)','Cuenta','Identificado por','Rol de la cuenta']);
    eventos.slice().sort((a,b)=>a.ts-b.ts).forEach(e=>we.addRow([
      fmtHora(e.ts),e.tecnicoNombre||'',e.accion,e.linea||'',e.fechaPlan||'',e.turno||'',e.marca||'',e.presentacion||'',e.motivo||'',
      e.duracionMs!=null&&Number.isFinite(Number(e.duracionMs))?minutos(Number(e.duracionMs)):'',e.cuenta||'',e.identificadoPor||'',e.rol||'']));
    we.autoFilter={from:{row:he,column:1},to:{row:he,column:13}};
    [22,26,12,12,12,12,18,16,26,12,16,16,22].forEach((w,i)=>we.getColumn(i+1).width=w);

    const buffer=await wb.xlsx.writeBuffer();
    const nombre='Bitacora_Mantenimiento_'+F.desde+(F.hasta!==F.desde?'_a_'+F.hasta:'')+'.xlsx';
    const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const a=document.createElement('a');a.href=url;a.download=nombre;document.body.appendChild(a);a.click();
    setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},1500);
  }
  window.bitacoraMttoExportar=exportarExcel;

  /* ---------- navegación: botón del menú, pestaña y permisos ---------- */
  window.goBitacoraMtto=function(){
    if(!puedeVerBitacoraMtto()){alert('No tienes permiso para ver la bitácora de Mantenimiento.');return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    state.currentTab='bitacora-mtto';
    if(!F.desde||!F.hasta)F.desde=F.hasta=hoyISO();
    if(carga.usuario!==state.user.username){carga.usuario=state.user.username;carga.clave='';carga.eventos=[];carga.error='';}
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
    cargarRango(false);
  };

  if(typeof ajustarVistaSegunPermisos==='function'){
    const ajustarAnterior=ajustarVistaSegunPermisos;
    ajustarVistaSegunPermisos=function(){
      if(state.currentTab==='bitacora-mtto'&&puedeVerBitacoraMtto())return;
      return ajustarAnterior.apply(this,arguments);
    };
  }
  if(typeof renderMain==='function'){
    const mainAnterior=renderMain;
    renderMain=function(){
      if(state.currentTab==='bitacora-mtto'&&!state.showWelcome&&puedeVerBitacoraMtto()){
        renderBitacoraMtto();return;
      }
      return mainAnterior.apply(this,arguments);
    };
  }
  if(typeof grupoSidebarActivo==='function'){
    const grupoAnterior=grupoSidebarActivo;
    grupoSidebarActivo=function(){
      return state.currentTab==='bitacora-mtto'?'mantenimiento':grupoAnterior.apply(this,arguments);
    };
  }
  if(typeof renderSidebar==='function'){
    const sidebarAnterior=renderSidebar;
    renderSidebar=function(){
      const r=sidebarAnterior.apply(this,arguments);
      const b=document.getElementById('btn-bitacora-mtto');
      if(b){
        const mostrar=!!(typeof state!=='undefined'&&state.user)&&puedeVerBitacoraMtto();
        b.hidden=!mostrar;b.style.display=mostrar?'':'none';
        const activo=mostrar&&state.currentTab==='bitacora-mtto';
        b.classList.toggle('active',activo);
        if(activo)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
        if(typeof actualizarGruposSidebar==='function')actualizarGruposSidebar();
      }
      return r;
    };
  }
})();
