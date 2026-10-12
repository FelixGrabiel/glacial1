/* =============================================================
   MANTENIMIENTO · INTERVENCIONES · PANTALLA (Intervenciones · Preventivos · Equipos · Indicadores)

   Pantalla del grupo Mantenimiento del menú, pensada primero para el celular. Las pestañas se registran en window.glacialMantPestanas: esta parte dibuja
   «Intervenciones» y «Equipos»; Preventivos e Indicadores se agregan cuando sus módulos están cargados (no hay pestañas vacías).
   · Intervenciones: resumen (pendientes, en intervención, en espera, seguimientos), líneas detenidas SIN intervención (con «Abrir intervención»),
     filtros, lista y detalle con cronología, diagnóstico, acción, repuestos, participantes, seguimiento y cierre.
   · «Cerrar intervención» NO reanuda la línea (eso se hace en Producción Actual) y reanudar NO cierra la intervención.
   · Los colores de estado de una intervención (pizarra, azul, violeta, cian, punteado) y de resultado NO son los de estado operativo de Producción
     (naranja, amarillo, rojo, verde, gris).
   · «Sin datos», «error de lectura» y «cargando» se distinguen: nunca se muestra 0 cuando no se pudo leer.
   · Sin alert/confirm/prompt: ventanas propias; el texto escrito NO se pierde si el guardado falla.
   Cargar después de 67b-intervenciones-datos.js y 43-bitacora-mantenimiento.js.
   ============================================================= */
(function(){
  'use strict';
  const M=window.GlacialIntervenciones;
  const API=()=>window.glacialIntervenciones;
  const EQ=()=>window.glacialEquiposMaestro;
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const norm=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const fmtFH=ms=>ms?new Date(ms).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
  const fmtDur=ms=>{
    if(ms===null||ms===undefined||!Number.isFinite(ms))return '—';
    const m=Math.round(ms/60000),h=Math.floor(m/60);
    return h?h+' h '+String(m%60).padStart(2,'0')+' min':m+' min';
  };
  const hace=ms=>ms?fmtDur(Math.max(0,ahora()-ms)):'—';
  const nombreLinea=k=>{try{const l=(typeof LINES!=='undefined'?LINES:[]).find(x=>x.key===k);return l?l.name:k;}catch(_){return k;}};
  const aLocal=ms=>{const d=new Date(ms),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());};
  const msDeLocal=v=>{const t=new Date(v).getTime();return Number.isFinite(t)?t:0;};

  window.glacialMantPestanas=window.glacialMantPestanas||[];
  const PESTANAS=window.glacialMantPestanas;
  const F={linea:'',equipo:'',tipo:'',estado:'',tecnico:'',desde:'',hasta:'',q:''};
  const UI={tab:'intervenciones',detalle:null,aviso:'',equipoFiltro:{linea:'',activo:'',q:''}};

  /* ---------- estilos ---------- */
  function estilos(){
    if(document.getElementById('mi-css'))return;
    const s=document.createElement('style');s.id='mi-css';
    s.textContent=`
      .mi-tabs{display:flex;gap:4px;margin:10px 0 12px;padding:4px;background:#e8eff4;border-radius:12px;overflow-x:auto}
      .mi-tab{flex:1 0 auto;border:0;background:transparent;padding:9px 14px;border-radius:9px;font:inherit;font-weight:700;font-size:13px;color:#4f6272;cursor:pointer;white-space:nowrap}
      .mi-tab.active{background:#fff;color:#003b5c;box-shadow:0 1px 3px rgba(0,43,70,.2)}
      .mi-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:0 0 12px}
      .mi-kpi{background:#fff;border:1px solid #dce5ec;border-left:5px solid var(--c,#64748b);border-radius:12px;padding:8px 10px}
      .mi-kpi b{display:block;font-size:22px;color:#003b5c;font-variant-numeric:tabular-nums}.mi-kpi span{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#5a6b78}
      .mi-card{background:#fff;border:1px solid #dce5ec;border-left:5px solid var(--c,#64748b);border-radius:12px;padding:10px 12px;margin:8px 0;cursor:pointer}
      .mi-card:hover{box-shadow:0 2px 8px rgba(0,43,70,.12)}.mi-card h4{margin:0 0 4px;font-size:15px;color:#003b5c}
      .mi-card .mi-p{font-size:13px;color:#1b2a38;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .mi-meta{font-size:12px;color:#5a6b78;margin-top:4px}
      .mi-chip{display:inline-flex;align-items:center;gap:3px;padding:1px 9px;margin:0 4px 2px 0;border-radius:999px;font-size:11px;font-weight:800;border:1px solid var(--b,#94a3b8);background:var(--g,#f8fafc);color:var(--t,#334155);white-space:nowrap}
      .e-PENDIENTE{--c:#64748b;--b:#94a3b8;--g:#f1f5f9;--t:#334155}.e-EN_INTERVENCION{--c:#1d4ed8;--b:#93c5fd;--g:#dbeafe;--t:#1e3a8a}
      .e-EN_ESPERA{--c:#7c3aed;--b:#c4b5fd;--g:#ede9fe;--t:#5b21b6}.e-CERRADA{--c:#0e7490;--b:#67e8f9;--g:#cffafe;--t:#155e75}
      .e-CANCELADA{--c:#9ca3af;--b:#d1d5db;--g:#fff;--t:#6b7280}.e-CANCELADA.mi-chip{border-style:dashed}
      .r-OPERATIVO_VERIFICADO{--b:#67e8f9;--g:#cffafe;--t:#155e75}.r-OPERATIVO_OBSERVACION{--b:#c4b5fd;--g:#ede9fe;--t:#5b21b6}
      .r-NO_OPERATIVO{--b:#e879f9;--g:#fae8ff;--t:#86198f;font-size:12px}
      .p-ALTA{--b:#fdba74;--g:#fff7ed;--t:#9a3412}.p-CRITICA{--b:#e879f9;--g:#fae8ff;--t:#86198f}
      .mi-pend{border:2px solid #e879f9;background:#fdf4ff;border-radius:10px;padding:8px 10px;margin:8px 0;font-size:13px;color:#86198f}
      .mi-aviso{padding:8px 12px;border-radius:8px;background:#fff8e6;border:1px solid #f0c36a;margin:8px 0;font-size:13px}
      .mi-error{padding:8px 12px;border-radius:8px;background:#fdecea;border:1px solid #f1aeb5;color:#8c1d18;margin:8px 0;font-size:13px;white-space:pre-line}
      .mi-vacio{padding:14px;border:1px dashed #c5d0db;border-radius:10px;background:#f8fafc;color:#4a5b6b;font-size:13px}
      .mi-filtros{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:0 0 8px}
      .mi-filtros label,.mi-form label{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#5a6b78;display:flex;flex-direction:column;gap:3px}
      .mi-filtros select,.mi-filtros input,.mi-form select,.mi-form input,.mi-form textarea{padding:8px;border:1px solid #c5d0db;border-radius:8px;font:inherit;font-size:14px;text-transform:none;letter-spacing:0;font-weight:400;color:#1b2a38;background:#fff;width:100%;box-sizing:border-box}
      .mi-fondo{position:fixed;inset:0;background:rgba(10,20,40,.55);z-index:10060;display:flex;align-items:flex-start;justify-content:center;padding:12px;overflow:auto}
      .mi-fondo.sub{z-index:10070}
      .mi-modal{background:#fff;border-radius:14px;max-width:640px;width:100%;padding:16px;box-shadow:0 14px 40px rgba(0,0,0,.3);margin:auto}
      .mi-modal h3{margin:0 0 8px;font-size:17px;color:#003b5c}.mi-modal h5{margin:12px 0 4px;font-size:13px;color:#003b5c}
      .mi-acc{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
      .mi-form{display:grid;grid-template-columns:1fr;gap:10px}
      .mi-tabla{width:100%;border-collapse:collapse;font-size:12px}.mi-tabla th{text-align:left;color:#46627a;font-size:11px;padding:4px 6px;border-bottom:1px solid #dce5ec}.mi-tabla td{padding:4px 6px;border-bottom:1px solid #edf2f6;vertical-align:top}
      .mi-crono{border-left:3px solid #cbd5e1;margin:6px 0 0 6px;padding-left:10px;font-size:12px}.mi-crono div{margin:0 0 6px}.mi-crono small{color:#64748b}
      .mi-res-op{margin:8px 0;padding:8px 10px;border-radius:10px;font-weight:700}
      @media (min-width:700px){.mi-form.dos{grid-template-columns:1fr 1fr}.mi-form .completo{grid-column:1/-1}}
    `;
    document.head.appendChild(s);
  }

  /* ---------- ventanas propias ---------- */
  function modal(html,sub){
    estilos();
    const f=document.createElement('div');f.className='mi-fondo'+(sub?' sub':'');
    f.innerHTML='<div class="mi-modal" role="dialog" aria-modal="true">'+html+'</div>';
    const quitar=()=>{f.remove();setTimeout(()=>{try{pintarDetalle();}catch(_){/* sin detalle abierto */}},0);};     // al cerrar un formulario, el detalle de abajo se pone al día
    f.addEventListener('mousedown',e=>{if(e.target===f&&!f.dataset.fijo)quitar();});
    f.addEventListener('click',e=>{if(e.target.closest('[data-mi-cerrar]'))quitar();});
    document.body.appendChild(f);
    return f;
  }
  const aviso=(t,x)=>{const f=modal('<h3>'+esc(t)+'</h3><p>'+esc(x)+'</p><div class="mi-acc"><button type="button" class="btn btn-primary" data-mi-cerrar>Entendido</button></div>',true);return f;};
  /* Formulario: campos en html; alEnviar(q) lanza un Error con el mensaje a mostrar (el formulario NO se cierra y lo escrito se conserva). */
  function formulario(titulo,html,okTxt,alEnviar,opc){
    const f=modal('<h3>'+esc(titulo)+'</h3><div class="mi-form'+((opc&&opc.dos)?' dos':'')+'">'+html+'</div><div class="mi-error" id="mi-err" style="display:none"></div>'+
      '<div class="mi-acc"><button type="button" class="btn btn-ghost" data-mi-cerrar>Cancelar</button><button type="button" class="btn btn-primary" id="mi-ok">'+esc(okTxt)+'</button></div>',true);
    const q=s=>f.querySelector(s),err=q('#mi-err'),ok=q('#mi-ok');
    ok.onclick=async()=>{
      err.style.display='none';ok.disabled=true;const t0=ok.textContent;ok.textContent='Guardando…';
      try{await alEnviar(q,f);f.remove();setTimeout(()=>{try{pintarDetalle();}catch(_){/* sin detalle */}},0);}
      catch(e){err.textContent=(e&&e.message)||String(e);err.style.display='';ok.disabled=false;ok.textContent=t0;}
    };
    return f;
  }
  const opts=(obj,sel,vacio)=>(vacio?'<option value="">'+esc(vacio)+'</option>':'')+Object.keys(obj).map(k=>'<option value="'+esc(k)+'"'+(k===sel?' selected':'')+'>'+esc(obj[k])+'</option>').join('');

  /* ---------- datos para la lista ---------- */
  function filtradas(){
    const lista=API().todas();
    const desde=F.desde?new Date(F.desde+'T00:00:00').getTime():0,hasta=F.hasta?new Date(F.hasta+'T23:59:59').getTime():Infinity;
    const q=norm(F.q);
    return lista.filter(d=>{
      if(F.linea&&d.linea!==F.linea)return false;
      if(F.tipo&&d.tipo!==F.tipo)return false;
      if(F.estado&&d.estado!==F.estado)return false;
      if(F.equipo==='__sin__'?!!d.equipoId:(F.equipo&&d.equipoId!==F.equipo))return false;
      if(F.tecnico&&!(d.participantes||[]).some(p=>p.nombre===F.tecnico))return false;
      if(d.abiertaMs<desde||d.abiertaMs>hasta)return false;
      if(q&&!norm([d.problema,d.equipoNombre,d.diagnostico,d.accion,d.pendientes,(d.participantes||[]).map(p=>p.nombre).join(' ')].join(' ')).includes(q))return false;
      return true;
    }).sort((a,b)=>(M.estaAbierta(b.estado)-M.estaAbierta(a.estado))||(b.abiertaMs-a.abiertaMs));
  }
  const chipEstado=e=>'<span class="mi-chip e-'+esc(e)+'">'+esc(M.ESTADOS[e]||e)+'</span>';
  const chipResultado=r=>r?'<span class="mi-chip r-'+esc(r)+'">'+({OPERATIVO_VERIFICADO:'✓ ',OPERATIVO_OBSERVACION:'◐ ',NO_OPERATIVO:'✕ '})[r]+esc(M.RESULTADOS[r])+'</span>':'';
  const chipPrioridad=p=>'<span class="mi-chip p-'+esc(p)+'">'+esc(M.PRIORIDADES[p]||p)+'</span>';
  const responsable=d=>{const r=(d.participantes||[]).find(p=>p.rol==='RESPONSABLE')||(d.participantes||[])[0];return r?r.nombre:'—';};

  function tarjeta(d){
    const t=M.tiempos(d,ahora()),pe=M.pendientes(d);
    const dur=d.estado==='CERRADA'?(t.trabajoMs!==null?'trabajo '+fmtDur(t.trabajoMs)+(t.esperaMs?' · espera '+fmtDur(t.esperaMs):''):'duración no identificada'):'abierta hace '+hace(d.abiertaMs);
    return '<div class="mi-card e-'+esc(d.estado)+'" data-mi-abrir="'+esc(d.id)+'" tabindex="0" role="button">'+
      '<h4>'+(d.equipoId?esc(d.equipoNombre):'<i>'+esc(M.SIN_EQUIPO)+'</i>')+' <small style="font-weight:500;color:#5a6b78">· '+esc(nombreLinea(d.linea))+'</small></h4>'+
      chipEstado(d.estado)+chipPrioridad(d.prioridad)+'<span class="mi-chip">'+esc(M.TIPOS[d.tipo]||d.tipo)+'</span>'+(d.equipoPendiente&&M.estaAbierta(d.estado)?'<span class="mi-chip p-ALTA">Equipo por identificar</span>':'')+
      (d.estado==='EN_ESPERA'&&d.espera?'<span class="mi-chip e-EN_ESPERA">'+esc(M.MOTIVOS_ESPERA[d.espera.motivo]||'')+'</span>':'')+
      (d.estado==='CERRADA'?chipResultado(d.resultado):'')+
      '<div class="mi-p">'+esc(d.problema)+'</div>'+
      '<div class="mi-meta">Responsable: '+esc(responsable(d))+' · '+esc(dur)+(pe.total?' · <b style="color:#86198f">Pendientes: '+pe.total+'</b>':'')+'</div></div>';
  }

  /* ---------- líneas detenidas sin intervención ---------- */
  function detenidasSinIntervencion(){
    let progs=[];try{progs=(typeof loadProgramaciones==='function'?loadProgramaciones():[])||[];}catch(_){progs=[];}
    const todas=API().todas();
    const salida=new Map();
    progs.forEach(p=>{
      const op=p&&p.estadoOperacion;
      if(!op||!['DETENIDA','LISTA'].includes(op.estado)||!p.linea)return;
      const abiertas=(Array.isArray(op.paradas)?op.paradas:[]).filter(x=>x&&!Number(x.fin));
      const pid=abiertas.length?abiertas[abiertas.length-1].id:'';
      const clave=pid||(p.linea+'|'+(op.detenidaDesde||''));
      if(salida.has(p.linea+'|'+clave))return;
      const ya=todas.some(d=>d.linea===p.linea&&d.origen&&((pid&&(d.origen.paradaId===pid||d.origen.id===pid))||(!pid&&d.origen.id===clave)));
      if(ya)return;
      salida.set(p.linea+'|'+clave,{linea:p.linea,paradaId:pid||clave,motivo:op.motivo||'',equipoTexto:op.equipo||'',desdeMs:Number(op.detenidaDesde)||0,estado:op.estado});
    });
    return [...salida.values()];
  }

  /* ---------- pestaña Intervenciones ---------- */
  function pintarIntervenciones(cont){
    const A=API(),p=A.permisos(),st=A.estado();
    if(!st.cerradasPedidas)A.escucharCerradas();
    A.escucharAbiertas();
    const abiertas=A.abiertas();
    const cuenta=e=>abiertas.filter(d=>d.estado===e).length;
    const errLeer=st.errorAbiertas;
    const kpi=(t,v,c)=>'<div class="mi-kpi" style="--c:'+c+'"><b>'+(errLeer||!st.listoAbiertas?'—':v)+'</b><span>'+t+'</span></div>';
    const conPend=abiertas.concat(A.cerradas()).filter(d=>M.pendientes(d).total>0).length;
    const detenidas=p.ver&&st.listoAbiertas?detenidasSinIntervencion():[];
    const eqs=EQ()?EQ().lista():[];
    const tecnicos=[...new Set(A.todas().flatMap(d=>(d.participantes||[]).map(x=>x.nombre)))].sort((a,b)=>a.localeCompare(b,'es'));
    const lista=filtradas();
    cont.innerHTML=
      (errLeer?'<div class="mi-error">'+esc(errLeer)+'</div>':'')+
      '<div class="mi-kpis">'+kpi('Pendientes',cuenta('PENDIENTE'),'#64748b')+kpi('En intervención',cuenta('EN_INTERVENCION'),'#1d4ed8')+kpi('En espera',cuenta('EN_ESPERA'),'#7c3aed')+kpi('Con pendientes',conPend,'#a21caf')+
        (typeof window.glacialPreventivosResumen==='function'?window.glacialPreventivosResumen():'')+'</div>'+
      (detenidas.length?'<div class="mi-aviso"><b>Líneas detenidas sin intervención</b>'+detenidas.map(x=>'<div style="margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span><b>'+esc(nombreLinea(x.linea))+'</b> · '+esc(x.motivo||'sin motivo')+(x.equipoTexto?' · '+esc(x.equipoTexto):'')+(x.desdeMs?' · desde hace '+hace(x.desdeMs):'')+'</span>'+
        (p.escribir?'<button type="button" class="btn btn-primary btn-sm" data-mi-desde-parada="'+esc(x.linea+'|'+x.paradaId)+'">Abrir intervención</button>':'')+'</div>').join('')+
        '<div class="mi-meta">Abrir una intervención no cambia el estado de la línea.</div></div>':'')+
      (UI.aviso?'<div class="mi-aviso">'+esc(UI.aviso)+'</div>':'')+
      '<div class="mi-acc">'+(p.escribir?'<button type="button" class="btn btn-primary btn-sm" data-mi-nueva>+ Nueva intervención</button>':'')+
        (p.consulta?'<span class="mi-meta">Modo consulta: puedes ver las intervenciones, no modificarlas.</span>':'')+'</div>'+
      '<details'+(Object.keys(F).some(k=>F[k])?' open':'')+' style="margin:0 0 8px"><summary style="cursor:pointer;font-weight:700;color:#003b5c;padding:4px 0">Filtros</summary><div class="mi-filtros">'+
        '<label>Línea<select data-mi-f="linea"><option value="">Todas</option>'+M.LINEAS.map(l=>'<option value="'+l+'"'+(F.linea===l?' selected':'')+'>'+esc(nombreLinea(l))+'</option>').join('')+'</select></label>'+
        '<label>Equipo<select data-mi-f="equipo"><option value="">Todos</option><option value="__sin__"'+(F.equipo==='__sin__'?' selected':'')+'>'+esc(M.SIN_EQUIPO)+'</option>'+eqs.map(e=>'<option value="'+esc(e.id)+'"'+(F.equipo===e.id?' selected':'')+'>'+esc(EQ().etiqueta(e))+'</option>').join('')+'</select></label>'+
        '<label>Tipo<select data-mi-f="tipo">'+opts(M.TIPOS,F.tipo,'Todos')+'</select></label>'+
        '<label>Estado<select data-mi-f="estado">'+opts(M.ESTADOS,F.estado,'Todos')+'</select></label>'+
        '<label>Técnico<select data-mi-f="tecnico"><option value="">Todos</option>'+tecnicos.map(n=>'<option'+(F.tecnico===n?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select></label>'+
        '<label>Desde<input type="date" data-mi-f="desde" value="'+esc(F.desde)+'"></label><label>Hasta<input type="date" data-mi-f="hasta" value="'+esc(F.hasta)+'"></label>'+
        '<label>Buscar<input type="search" data-mi-f="q" value="'+esc(F.q)+'" placeholder="Problema, diagnóstico…"></label></div></details>'+
      '<div id="mi-lista">'+
        (errLeer?'<div class="mi-error">No se pudo leer la lista: no se muestran cifras.</div>'
          :!st.listoAbiertas?'<div class="mi-vacio">Cargando intervenciones…</div>'
          :lista.length?lista.map(tarjeta).join('')
          :'<div class="mi-vacio"><b>No hay intervenciones'+(A.todas().length?' con estos filtros':'')+'.</b>'+(A.todas().length?'':'<br>Aparecen aquí cuando un técnico abre una desde una parada o con «Nueva intervención».')+(st.errorCerradas?'<br><span style="color:#8c1d18">No se pudieron leer las cerradas: '+esc(st.errorCerradas)+'</span>':!st.listoCerradas?'<br>Cargando las cerradas…':'')+'</div>')+
      '</div>'+(st.listoAbiertas&&!errLeer&&st.listoCerradas?'<p class="mi-meta">Se muestran las abiertas y las cerradas de los últimos 30 días.</p>':'');
  }

  /* ---------- detalle ---------- */
  function htmlDetalle(d,p){
    const t=M.tiempos(d,ahora()),pe=M.pendientes(d),abierta=M.estaAbierta(d.estado);
    const acciones=[];
    if(p.escribir&&abierta){
      if(d.estado==='PENDIENTE')acciones.push(['iniciar','Iniciar trabajo','btn-primary']);
      if(d.estado==='EN_INTERVENCION')acciones.push(['espera','Poner en espera','btn-ghost']);
      if(d.estado==='EN_ESPERA')acciones.push(['retomar','Retomar trabajo','btn-primary']);
      acciones.push(['participar','Unirme','btn-ghost'],['repuesto','Agregar repuesto','btn-ghost'],['seguimiento','Agregar seguimiento','btn-ghost'],['equipo',d.equipoId?'Cambiar equipo':'Identificar equipo','btn-ghost'],['editar','Editar descripción','btn-ghost'],
        ['cerrar','Cerrar intervención','btn-primary'],['cancelar','Cancelar','btn-ghost']);
    }
    if(p.escribir&&d.estado==='CERRADA'&&pe.seguimientos)acciones.push(['resolverSeg','Resolver seguimiento','btn-ghost']);
    if(d.estado==='CERRADA'&&p.puedeCorregir)acciones.push(['corregir','Corregir (supervisor)','btn-ghost']);
    if(d.estado==='CERRADA'&&p.puedeVerificar&&!d.verificacion)acciones.push(['verificar','Verificar cierre','btn-ghost']);
    const evid=typeof window.glacialEvidenciasHtml==='function'?window.glacialEvidenciasHtml(d,p):'';
    return '<h3>'+(d.equipoId?esc(d.equipoNombre):'<i>'+esc(M.SIN_EQUIPO)+'</i>')+' · '+esc(nombreLinea(d.linea))+'</h3>'+
      chipEstado(d.estado)+chipPrioridad(d.prioridad)+'<span class="mi-chip">'+esc(M.TIPOS[d.tipo]||d.tipo)+'</span>'+(d.verificacion?'<span class="mi-chip e-CERRADA">Verificada por '+esc(d.verificacion.por.nombre)+'</span>':'')+
      (d.estado==='CERRADA'?'<div class="mi-res-op r-'+esc(d.resultado)+'" style="background:var(--g);color:var(--t);border:1px solid var(--b)">'+chipResultado(d.resultado)+(d.resultado==='NO_OPERATIVO'?'<div style="font-weight:600;margin-top:4px">Esto NO es una reparación exitosa: el equipo sigue sin operar y requiere seguimiento.</div>':'')+'</div>':'')+
      (pe.total?'<div class="mi-pend"><b>Pendientes ('+pe.total+')</b>'+(pe.textoCierre?'<div>'+esc(pe.textoCierre)+'</div>':'')+(d.seguimiento||[]).filter(s=>s.estado==='PENDIENTE').map(s=>'<div>• '+esc(s.texto)+' <small>('+esc(s.por.nombre)+')</small></div>').join('')+'</div>':'')+
      (d.equipoPendiente&&abierta?'<div class="mi-aviso">El equipo está <b>por identificar</b>. Hay que indicarlo antes de cerrar (o justificar por qué no se pudo).</div>':'')+
      (d.estado==='EN_ESPERA'&&d.espera?'<div class="mi-aviso"><b>En espera:</b> '+esc(M.MOTIVOS_ESPERA[d.espera.motivo])+(d.espera.detalle?' — '+esc(d.espera.detalle):'')+' · desde '+esc(fmtFH(d.espera.desdeMs))+' ('+esc(d.espera.por.nombre)+')</div>':'')+
      '<h5>Problema</h5><div>'+esc(d.problema)+'</div>'+
      '<div class="mi-meta">Origen: '+esc(({PARADA:'parada de línea',EVENTO:'evento de la bitácora',AVISO:'aviso',PLAN:'plan preventivo',MANUAL:'registro manual'})[d.origen&&d.origen.tipo]||'manual')+(d.origen&&d.origen.id?' · ref. '+esc(String(d.origen.id).slice(0,40)):'')+' · abrió '+esc(d.abiertaPor&&d.abiertaPor.nombre)+' ('+esc(fmtFH(d.abiertaMs))+')</div>'+
      '<h5>Tiempos</h5><table class="mi-tabla"><tbody><tr><td>Apertura</td><td>'+esc(fmtFH(d.abiertaMs))+'</td></tr><tr><td>Inicio real del trabajo</td><td>'+esc(fmtFH(d.inicioRealMs))+'</td></tr><tr><td>Fin real</td><td>'+esc(fmtFH(d.finRealMs))+'</td></tr>'+
        '<tr><td>Respuesta (apertura → inicio)</td><td>'+esc(fmtDur(t.respuestaMs))+'</td></tr><tr><td>Trabajo (sin esperas)</td><td>'+esc(fmtDur(t.trabajoMs))+'</td></tr><tr><td>Espera</td><td>'+esc(fmtDur(t.esperaMs))+'</td></tr>'+
        (d.estado==='CERRADA'?'<tr><td>Administrativo (fin real → cierre registrado)</td><td>'+esc(fmtDur(t.administrativoMs))+'</td></tr>':'')+'</tbody></table>'+
      (d.diagnostico||d.accion?'<h5>Diagnóstico</h5><div>'+esc(d.diagnostico||'—')+'</div><h5>Trabajo realizado</h5><div>'+esc(d.accion||'—')+'</div>':'')+
      '<h5>Repuestos y materiales</h5>'+((d.repuestos||[]).length?'<table class="mi-tabla"><thead><tr><th>Descripción</th><th>Cant.</th><th>Autor</th></tr></thead><tbody>'+d.repuestos.map(r=>'<tr'+(r.anulado?' style="text-decoration:line-through;opacity:.6"':'')+'><td>'+esc(r.codigo?r.codigo+' · ':'')+esc(r.descripcion)+(r.observacion?'<br><small>'+esc(r.observacion)+'</small>':'')+'</td><td>'+esc(r.cantidad)+' '+esc(r.unidad)+'</td><td><small>'+esc(r.por.nombre)+'<br>'+esc(fmtFH(r.en))+'</small></td></tr>').join('')+'</tbody></table>'
        :(d.sinRepuestos?'<div class="mi-meta">No se utilizaron repuestos ni materiales.</div>':'<div class="mi-meta">Sin repuestos registrados todavía.</div>'))+
      '<h5>Participantes</h5><div>'+(d.participantes||[]).map(x=>esc(x.nombre)+(x.rol==='RESPONSABLE'?' <small>(responsable)</small>':'')).join(' · ')+'</div>'+
      ((d.seguimiento||[]).length?'<h5>Seguimiento</h5>'+d.seguimiento.map(s=>'<div>'+({PENDIENTE:'⏳',HECHO:'✓',VINCULADO:'↗'})[s.estado]+' '+esc(s.texto)+' <small>('+esc(s.por.nombre)+(s.estado!=='PENDIENTE'?' → '+esc(s.estado.toLowerCase()):'')+')</small></div>').join(''):'')+
      evid+
      ((d.correcciones||[]).length?'<h5>Correcciones posteriores</h5>'+d.correcciones.map(c=>'<div class="mi-meta">'+esc(fmtFH(c.en))+' · '+esc(c.por.nombre)+': '+esc(c.motivo)+'</div>').join(''):'')+
      '<h5>Cronología</h5><div class="mi-crono">'+(d.historial||[]).slice().reverse().map(h=>'<div><b>'+esc(h.accion)+'</b> · '+esc(h.por&&h.por.nombre)+'<br><small>'+esc(fmtFH(h.en))+(h.a&&h.de!==h.a?' · '+esc(M.ESTADOS[h.de]||'')+' → '+esc(M.ESTADOS[h.a]||h.a):'')+'</small><br>'+esc(h.detalle)+'</div>').join('')+'</div>'+
      '<div class="mi-meta">Cerrar la intervención no reanuda la línea: se reanuda desde Producción Actual. Reanudar la línea tampoco cierra la intervención.</div>'+
      '<div class="mi-acc">'+acciones.map(([k,tx,c])=>'<button type="button" class="btn '+c+' btn-sm" data-mi-acc="'+k+'">'+tx+'</button>').join('')+'<button type="button" class="btn btn-ghost btn-sm" data-mi-cerrar-detalle>Cerrar ventana</button></div>';
  }
  function pintarDetalle(){
    if(!UI.detalle)return;
    const f=document.getElementById('mi-detalle');
    if(!f)return;
    if(document.querySelector('.mi-fondo.sub'))return;                      // hay un formulario abierto encima: no se repinta debajo
    const d=API().porId(UI.detalle);
    const cuerpo=f.querySelector('.mi-modal');
    if(!d){cuerpo.innerHTML='<h3>Intervención</h3><div class="mi-vacio">Esta intervención ya no está en la lista cargada.</div><div class="mi-acc"><button type="button" class="btn btn-ghost" data-mi-cerrar-detalle>Cerrar</button></div>';return;}
    const y=f.scrollTop;cuerpo.innerHTML=htmlDetalle(d,API().permisos());f.scrollTop=y;
    if(typeof window.glacialEvidenciasPostRender==='function')window.glacialEvidenciasPostRender(cuerpo);
  }
  function abrirDetalle(id){
    UI.detalle=id;
    document.getElementById('mi-detalle')?.remove();
    const f=modal('');f.id='mi-detalle';f.dataset.fijo='';
    f.addEventListener('mousedown',e=>{if(e.target===f){UI.detalle=null;f.remove();}});
    pintarDetalle();
  }
  const cerrarDetalle=()=>{UI.detalle=null;document.getElementById('mi-detalle')?.remove();};

  /* ---------- acciones ---------- */
  async function ejecutar(id,accion,datos){return API().accion(id,accion,datos);}
  const campoTexto=(id,et,v,ph,filas)=>'<label class="completo">'+esc(et)+(filas?'<textarea id="'+id+'" rows="'+filas+'" placeholder="'+esc(ph||'')+'">'+esc(v||'')+'</textarea>':'<input id="'+id+'" value="'+esc(v||'')+'" placeholder="'+esc(ph||'')+'">')+'</label>';
  const equiposDe=linea=>EQ()?EQ().delaLinea(linea):[];
  const selEquipo=(linea,sel)=>'<option value="">Seleccionar equipo…</option>'+equiposDe(linea).map(e=>'<option value="'+esc(e.id)+'"'+(e.id===sel?' selected':'')+'>'+esc(EQ().etiqueta(e))+'</option>').join('');
  const nombreEquipo=id=>{const e=EQ()?EQ().porId(id):null;return e?e.nombre:'';};

  const ACC={
    async iniciar(d){await ejecutar(d.id,'INICIAR',{});},
    async participar(d){try{await ejecutar(d.id,'PARTICIPAR',{});}catch(e){if(e.codigo==='YA_PARTICIPA'){aviso('Ya participas','Ya figuras como participante de esta intervención.');return;}throw e;}},
    espera(d){
      formulario('Poner en espera','<label class="completo">Motivo<select id="f-mot">'+opts(M.MOTIVOS_ESPERA,'REPUESTO')+'</select></label>'+campoTexto('f-det','Detalle (obligatorio si es «Otro motivo»)','','Por ejemplo: rodamiento 6204',2),
        'Poner en espera',async q=>{await ejecutar(d.id,'ESPERA',{motivo:q('#f-mot').value,detalle:q('#f-det').value});});
    },
    async retomar(d){await ejecutar(d.id,'RETOMAR',{});},
    repuesto(d){
      const idIntento=M.idNuevo('r');                                       // un id por formulario: un doble clic o reintento no registra dos veces
      formulario('Agregar repuesto o material','<label>Código<input id="f-cod" maxlength="40"></label><label>Descripción<input id="f-des" maxlength="120"></label><label>Cantidad<input id="f-can" type="number" min="0" step="any" inputmode="decimal"></label>'+
        '<label>Unidad<select id="f-uni">'+M.UNIDADES.map(u=>'<option>'+esc(u)+'</option>').join('')+'</select></label>'+campoTexto('f-obs','Observación (opcional)','','',2)+
        '<div class="mi-meta completo">Solo se registra lo utilizado: no se descuenta stock ni se afirma disponibilidad (la integración con Almacén está pendiente).</div>','Agregar',
        async q=>{await ejecutar(d.id,'REPUESTO',{id:idIntento,codigo:q('#f-cod').value,descripcion:q('#f-des').value,cantidad:q('#f-can').value,unidad:q('#f-uni').value,observacion:q('#f-obs').value});},{dos:true});
    },
    seguimiento(d){formulario('Agregar seguimiento',campoTexto('f-seg','¿Qué queda por hacer?','','Por ejemplo: pedir el sello del eje',3),'Agregar',async q=>{await ejecutar(d.id,'SEGUIMIENTO',{texto:q('#f-seg').value});});},
    equipo(d){
      formulario('Equipo intervenido','<label class="completo">Equipo<select id="f-eq">'+selEquipo(d.linea,d.equipoId)+'</select></label>'+(equiposDe(d.linea).length?'':'<div class="mi-aviso completo">No hay equipos cargados para esta línea. El Supervisor de Mantenimiento los registra en la pestaña «Equipos».</div>'),
        'Guardar',async q=>{const id=q('#f-eq').value;await ejecutar(d.id,'EQUIPO',{equipoId:id,equipoNombre:nombreEquipo(id)});});
    },
    editar(d){
      formulario('Editar descripción',campoTexto('f-prob','Problema',d.problema,'',3)+'<label class="completo">Prioridad<select id="f-pri">'+opts(M.PRIORIDADES,d.prioridad)+'</select></label>',
        'Guardar',async q=>{const c={};if(q('#f-prob').value.trim()!==d.problema)c.problema=q('#f-prob').value;if(q('#f-pri').value!==d.prioridad)c.prioridad=q('#f-pri').value;await ejecutar(d.id,'DATOS',c);});
    },
    cancelar(d){formulario('Cancelar intervención',campoTexto('f-mot','Motivo de la cancelación (obligatorio)','','',3),'Cancelar la intervención',async q=>{await ejecutar(d.id,'CANCELAR',{motivo:q('#f-mot').value});});},
    resolverSeg(d){
      const pend=(d.seguimiento||[]).filter(s=>s.estado==='PENDIENTE');
      formulario('Resolver seguimiento','<label class="completo">Seguimiento<select id="f-sg">'+pend.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.texto)+'</option>').join('')+'</select></label>'+campoTexto('f-nt','Nota (opcional)','','',2)+
        '<label class="completo">Orden vinculada (opcional)<input id="f-ov" placeholder="Id de otra intervención"></label>','Marcar como resuelto',
        async q=>{await ejecutar(d.id,'SEGUIMIENTO_RESUELTO',{id:q('#f-sg').value,nota:q('#f-nt').value,intervencionId:q('#f-ov').value});});
    },
    corregir(d){
      formulario('Corregir intervención cerrada','<div class="mi-aviso completo">Una corrección queda en el historial con tu nombre y el motivo. Lo anterior se conserva.</div>'+campoTexto('f-dg','Diagnóstico',d.diagnostico,'',3)+campoTexto('f-ac','Trabajo realizado',d.accion,'',3)+campoTexto('f-pe','Pendientes',d.pendientes,'',2)+
        '<label class="completo">Resultado<select id="f-re">'+opts(M.RESULTADOS,d.resultado)+'</select></label>'+campoTexto('f-mo','Motivo de la corrección (obligatorio)','','',2),'Guardar corrección',
        async q=>{await ejecutar(d.id,'CORREGIR',{motivo:q('#f-mo').value,diagnostico:q('#f-dg').value,accion:q('#f-ac').value,pendientes:q('#f-pe').value,resultado:q('#f-re').value});});
    },
    verificar(d){formulario('Verificar cierre',campoTexto('f-nt','Nota (opcional)','','',2),'Verificar',async q=>{await ejecutar(d.id,'VERIFICAR',{nota:q('#f-nt').value});});},
    cerrar(d){cerrarIntervencion(d);}
  };

  function tecnicosMtto(){
    let lista=[];try{lista=(typeof loadWorkers==='function'?loadWorkers():[])||[];}catch(_){lista=[];}
    return lista.filter(w=>{
      if(!w||norm(w.estado)!=='activo')return false;
      const cargo=norm(w.cargo);
      if(/supervisor|jefe|gerente|jefatura/.test(cargo))return false;
      if(typeof tareoEsTecnicoMantenimiento==='function'&&tareoEsTecnicoMantenimiento(w.cargo))return true;
      return norm(w.area)==='mantenimiento';
    }).sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),'es'));
  }

  /* Formulario de cierre: equipo, diagnóstico, acción, repuestos, resultado, pendientes, fin real, responsable y participantes. */
  function cerrarIntervencion(d){
    const fresco=API().porId(d.id)||d;
    const tecnicos=tecnicosMtto();
    const actuales=(fresco.participantes||[]);
    const yo=API().quienActua();
    const repuestos=(fresco.repuestos||[]).filter(r=>!r.anulado);
    const f=formulario('Cerrar intervención',
      '<div class="mi-aviso completo">Cerrar registra el trabajo realizado. <b>No reanuda la línea</b> (se hace desde Producción Actual).</div>'+
      '<label class="completo">1. Equipo intervenido<select id="f-eq">'+selEquipo(fresco.linea,fresco.equipoId)+'<option value="__no__"'+(!fresco.equipoId&&fresco.equipoJustificacion?' selected':'')+'>No se pudo identificar</option></select></label>'+
      '<div id="f-eqj" class="completo" style="display:none">'+campoTexto('f-eqjt','Justifica por qué no se pudo identificar (mínimo 10 caracteres)',fresco.equipoJustificacion,'',2)+'</div>'+
      campoTexto('f-dg','2. Diagnóstico: qué se encontró',fresco.diagnostico,'Mínimo 10 caracteres',3)+
      campoTexto('f-ac','3. Acción realizada: qué se hizo',fresco.accion,'Mínimo 10 caracteres',3)+
      '<div class="completo"><b style="font-size:12px;color:#5a6b78">4. REPUESTOS / MATERIALES</b>'+(repuestos.length?'<div>'+repuestos.map(r=>'• '+esc(r.descripcion||r.codigo)+' — '+esc(r.cantidad)+' '+esc(r.unidad)).join('<br>')+'</div>':'<div class="mi-meta">Ninguno registrado todavía (usa «Agregar repuesto» en el detalle).</div>')+
        '<label style="flex-direction:row;align-items:center;gap:8px;margin-top:6px;text-transform:none;letter-spacing:0;font-weight:600"><input type="checkbox" id="f-sinrep"'+(fresco.sinRepuestos?' checked':'')+(repuestos.length?' disabled':'')+' style="width:auto"> No se utilizaron repuestos ni materiales</label></div>'+
      '<div class="completo"><b style="font-size:12px;color:#5a6b78">5. RESULTADO</b>'+Object.keys(M.RESULTADOS).map(k=>'<label style="flex-direction:row;align-items:center;gap:8px;text-transform:none;letter-spacing:0;font-weight:600;margin-top:4px"><input type="radio" name="f-res" value="'+k+'" style="width:auto"'+(fresco.resultado===k?' checked':'')+'> '+esc(M.RESULTADOS[k])+'</label>').join('')+'</div>'+
      campoTexto('f-pe','6. Pendientes y observaciones (obligatorio si queda con observación o no operativo)',fresco.pendientes,'',3)+
      '<label class="completo">7. Fecha y hora real de finalización<input id="f-fin" type="datetime-local" value="'+aLocal(fresco.finRealMs||ahora())+'"></label>'+
      (!fresco.inicioRealMs?'<label class="completo">Inicio real del trabajo (no se registró)<input id="f-ini" type="datetime-local" value="'+aLocal(fresco.abiertaMs)+'"></label>':'')+
      '<label class="completo">8. Técnico responsable<select id="f-resp">'+actuales.map(x=>'<option value="'+esc(x.tecnicoId)+'"'+(x.rol==='RESPONSABLE'?' selected':'')+'>'+esc(x.nombre)+'</option>').join('')+'</select></label>'+
      '<div class="completo"><b style="font-size:12px;color:#5a6b78">PARTICIPANTES ADICIONALES</b><div>'+(tecnicos.filter(w=>!actuales.some(x=>x.tecnicoId===w.id||x.nombre===w.nombre)).map(w=>'<label style="flex-direction:row;align-items:center;gap:8px;text-transform:none;letter-spacing:0;font-weight:500"><input type="checkbox" class="f-part" value="'+esc(w.id)+'" data-n="'+esc(w.nombre)+'" style="width:auto"> '+esc(w.nombre)+'</label>').join('')||'<div class="mi-meta">Sin más técnicos disponibles.</div>')+'</div></div>',
      'Cerrar intervención',async q=>{
        const res=(q('input[name="f-res"]:checked')||{}).value||'';
        const eq=q('#f-eq').value,sinEq=eq==='__no__'||!eq;
        const participantes=[...f.querySelectorAll('.f-part:checked')].map(c=>({tecnicoId:c.value,nombre:c.dataset.n}));
        await ejecutar(fresco.id,'CERRAR',{equipoId:sinEq?'':eq,equipoNombre:sinEq?'':nombreEquipo(eq),equipoJustificacion:sinEq?q('#f-eqjt').value:'',diagnostico:q('#f-dg').value,accion:q('#f-ac').value,
          sinRepuestos:!!q('#f-sinrep').checked,resultado:res,pendientes:q('#f-pe').value,finRealMs:msDeLocal(q('#f-fin').value),inicioRealMs:q('#f-ini')?msDeLocal(q('#f-ini').value):0,responsableId:q('#f-resp').value,participantes});
        aviso('Intervención cerrada','Quedó registrada. La línea NO se reanudó: hazlo desde Producción Actual cuando corresponda.');
      },{dos:false});
    const sinEq=()=>{const v=f.querySelector('#f-eq').value;f.querySelector('#f-eqj').style.display=(v==='__no__'||!v)&&(v==='__no__')?'':'none';};
    f.querySelector('#f-eq').addEventListener('change',sinEq);sinEq();
  }

  /* Nueva intervención (manual). */
  function nuevaIntervencion(pref){
    const A=API(),p=pref||{};
    const clave=M.idNuevo('i');                                             // el mismo intento no se duplica
    const f=formulario('Nueva intervención',
      '<label>Línea<select id="f-li">'+M.LINEAS.map(l=>'<option value="'+l+'"'+(p.linea===l?' selected':'')+'>'+esc(nombreLinea(l))+'</option>').join('')+'</select></label>'+
      '<label>Equipo<select id="f-eq">'+selEquipo(p.linea||M.LINEAS[0],'')+'</select></label>'+
      '<label>Tipo<select id="f-ti">'+opts(M.TIPOS,p.tipo||'CORRECTIVO')+'</select></label><label>Prioridad<select id="f-pr">'+opts(M.PRIORIDADES,p.prioridad||'MEDIA')+'</select></label>'+
      campoTexto('f-pb','Problema',p.problema||'','Describe qué pasa (mínimo 5 caracteres)',3)+
      '<label class="completo" style="flex-direction:row;align-items:center;gap:8px;text-transform:none;letter-spacing:0;font-weight:600"><input type="checkbox" id="f-ini" style="width:auto"> Empezar el trabajo ahora</label>'+
      '<div class="mi-meta completo">Si todavía no sabes cuál es el equipo, déjalo sin elegir («Equipo por identificar»): se exige completarlo al cerrar. No se cambia el estado de la línea.</div>','Abrir intervención',
      async q=>{
        const eq=q('#f-eq').value;
        const r=await A.abrir({id:clave,linea:q('#f-li').value,equipoId:eq,equipoNombre:nombreEquipo(eq),tipo:q('#f-ti').value,prioridad:q('#f-pr').value,problema:q('#f-pb').value,origen:p.origen||{tipo:'MANUAL'}},{iniciar:q('#f-ini').checked});
        if(r.existente)UI.aviso='Ya existía una intervención para ese mismo origen y equipo: se abrió la existente.';
        abrirDetalle(r.doc.id);
      },{dos:true});
    const li=f.querySelector('#f-li');
    li.addEventListener('change',()=>{f.querySelector('#f-eq').innerHTML=selEquipo(li.value,'');});
  }

  /* ---------- pestaña Equipos ---------- */
  function pintarEquipos(cont){
    const E=EQ(),puede=E.puedeConfigurar();
    const fl=UI.equipoFiltro,q=norm(fl.q);
    const lista=E.lista().filter(e=>(!fl.linea||e.linea===fl.linea||e.compartidoCon.includes(fl.linea))&&(fl.activo===''||String(e.activo)===fl.activo)&&(!q||norm(e.nombre+' '+e.codigo+' '+e.tipo).includes(q)))
      .sort((a,b)=>a.linea.localeCompare(b.linea)||a.nombre.localeCompare(b.nombre,'es',{numeric:true}));
    cont.innerHTML='<div class="mi-filtros"><label>Línea<select data-mi-ef="linea"><option value="">Todas</option>'+E.LINEAS.concat([E.PLANTA]).map(l=>'<option value="'+l+'"'+(fl.linea===l?' selected':'')+'>'+esc(E.nombreLinea(l))+'</option>').join('')+'</select></label>'+
      '<label>Estado<select data-mi-ef="activo"><option value="">Todos</option><option value="true"'+(fl.activo==='true'?' selected':'')+'>Activos</option><option value="false"'+(fl.activo==='false'?' selected':'')+'>Inactivos</option></select></label>'+
      '<label>Buscar<input type="search" data-mi-ef="q" value="'+esc(fl.q)+'"></label></div>'+
      (typeof window.glacialEvidenciasConfigHtml==='function'?window.glacialEvidenciasConfigHtml():'')+
      (puede?'<div class="mi-acc"><button type="button" class="btn btn-primary btn-sm" data-mi-eq-nuevo>+ Agregar equipo</button></div>':'<div class="mi-meta">Solo el Supervisor de Mantenimiento o el Administrador pueden cambiar el catálogo.</div>')+
      (!E.listo()?'<div class="mi-vacio">Cargando el catálogo…</div>':lista.length?lista.map(e=>'<div class="mi-card" style="--c:'+(e.activo?'#0e7490':'#9ca3af')+';cursor:default"><h4>'+esc(e.nombre)+' <small style="font-weight:500;color:#5a6b78">· '+esc(e.codigo)+'</small></h4>'+
        '<span class="mi-chip">'+esc(e.tipo)+'</span><span class="mi-chip">'+esc(E.nombreLinea(e.linea))+'</span>'+e.compartidoCon.map(l=>'<span class="mi-chip">compartido: '+esc(E.nombreLinea(l))+'</span>').join('')+(e.activo?'':'<span class="mi-chip e-CANCELADA">Inactivo</span>')+
        (e.datos.marca||e.datos.modelo||e.datos.serie?'<div class="mi-meta">'+esc([e.datos.marca,e.datos.modelo,e.datos.serie&&'Serie '+e.datos.serie].filter(Boolean).join(' · '))+'</div>':'')+
        '<div class="mi-acc">'+(puede?'<button type="button" class="btn btn-ghost btn-sm" data-mi-eq-editar="'+esc(e.id)+'">Editar</button><button type="button" class="btn btn-ghost btn-sm" data-mi-eq-activo="'+esc(e.id)+'">'+(e.activo?'Desactivar':'Activar')+'</button>':'')+(typeof window.glacialFotosDeEquipo==='function'?'<button type="button" class="btn btn-ghost btn-sm" data-mi-eq-fotos="'+esc(e.id)+'">Fotos</button>':'')+'</div></div>').join('')
        :'<div class="mi-vacio"><b>No hay equipos'+(E.lista().length?' con estos filtros':' en el catálogo')+'.</b><br>'+(puede?'Agrega los equipos reales de cada línea. Tipos sugeridos: '+E.TIPOS_SUGERIDOS.join(', ')+' (son ejemplos de tipo, no un inventario cargado).':'El Supervisor de Mantenimiento registra los equipos.')+'</div>');
  }
  function formEquipo(id){
    const E=EQ(),x=id?E.porId(id):null;
    const b=x||{codigo:'',nombre:'',linea:UI.equipoFiltro.linea||'PET1',tipo:'',activo:true,compartidoCon:[],datos:{marca:'',modelo:'',serie:'',notas:''}};
    formulario(x?'Editar equipo':'Agregar equipo',
      '<label>Código<input id="e-cod" maxlength="20" value="'+esc(b.codigo)+'" placeholder="Por ejemplo PET1-SOP-01"></label><label>Nombre visible<input id="e-nom" maxlength="60" value="'+esc(b.nombre)+'" placeholder="Por ejemplo Sopladora 1"></label>'+
      '<label>Línea o ubicación<select id="e-li">'+E.LINEAS.concat([E.PLANTA]).map(l=>'<option value="'+l+'"'+(b.linea===l?' selected':'')+'>'+esc(E.nombreLinea(l))+'</option>').join('')+'</select></label>'+
      '<label>Tipo<input id="e-ti" list="e-tipos" maxlength="40" value="'+esc(b.tipo)+'"><datalist id="e-tipos">'+E.TIPOS_SUGERIDOS.map(t=>'<option value="'+esc(t)+'">').join('')+'</datalist></label>'+
      '<div class="completo"><b style="font-size:12px;color:#5a6b78">COMPARTIDO CON (si la máquina sirve a más de una línea)</b><div>'+E.LINEAS.map(l=>'<label style="flex-direction:row;align-items:center;gap:6px;text-transform:none;letter-spacing:0;font-weight:500;display:inline-flex;margin-right:10px"><input type="checkbox" class="e-comp" value="'+l+'" style="width:auto"'+(b.compartidoCon.includes(l)?' checked':'')+'> '+esc(E.nombreLinea(l))+'</label>').join('')+'</div></div>'+
      '<label>Marca<input id="e-ma" maxlength="80" value="'+esc(b.datos.marca)+'"></label><label>Modelo<input id="e-mo" maxlength="80" value="'+esc(b.datos.modelo)+'"></label><label>Serie<input id="e-se" maxlength="80" value="'+esc(b.datos.serie)+'"></label>'+
      campoTexto('e-no','Notas técnicas (opcional)',b.datos.notas,'',2)+
      '<label class="completo" style="flex-direction:row;align-items:center;gap:8px;text-transform:none;letter-spacing:0;font-weight:600"><input type="checkbox" id="e-ac" style="width:auto"'+(b.activo!==false?' checked':'')+'> Equipo activo (los inactivos no se ofrecen para intervenciones nuevas pero se conservan en el historial)</label>','Guardar',
      async (q,f)=>{
        await E.guardar({id:x?x.id:'',codigo:q('#e-cod').value,nombre:q('#e-nom').value,linea:q('#e-li').value,tipo:q('#e-ti').value,compartidoCon:[...f.querySelectorAll('.e-comp:checked')].map(c=>c.value),
          activo:q('#e-ac').checked,datos:{marca:q('#e-ma').value,modelo:q('#e-mo').value,serie:q('#e-se').value,notas:q('#e-no').value}},{esperadoEn:x?x.actualizadoEn:undefined});
      },{dos:true});
  }

  PESTANAS.push({clave:'intervenciones',titulo:'Intervenciones',orden:1,pintar:pintarIntervenciones,visible:()=>true});
  PESTANAS.push({clave:'equipos',titulo:'Equipos',orden:3,pintar:pintarEquipos,visible:()=>true});

  /* ---------- armazón y navegación ---------- */
  function visibles(){return PESTANAS.filter(t=>!t.visible||t.visible()).sort((a,b)=>a.orden-b.orden);}
  function render(){
    const main=document.getElementById('main');
    if(!main)return;
    estilos();
    const A=API();
    if(!A.permisos().ver){main.innerHTML='<div class="empty-state"><h4>Acceso no autorizado</h4></div>';return;}
    A.escucharAbiertas();
    if(window.glacialEvidencias)window.glacialEvidencias.reanudar().catch(()=>{});      // fotos pendientes de este dispositivo
    const tabs=visibles();
    if(!tabs.some(t=>t.clave===UI.tab))UI.tab=tabs[0].clave;
    main.innerHTML='<div class="main-head" id="intervenciones-view"><div><h2>Intervenciones</h2><div class="sub">Qué equipo falló, qué se hizo, quién intervino y qué queda pendiente · '+(window.glacialEstadoDatos?window.glacialEstadoDatos.chip():'')+'</div></div></div>'+
      '<div class="mi-tabs">'+tabs.map(t=>'<button type="button" class="mi-tab'+(t.clave===UI.tab?' active':'')+'" data-mi-tab="'+t.clave+'">'+esc(t.titulo)+'</button>').join('')+'</div><div id="mi-cuerpo"></div>';
    pintarTab();
  }
  function pintarTab(){
    const cont=document.getElementById('mi-cuerpo');
    if(!cont)return;
    const t=visibles().find(x=>x.clave===UI.tab);
    if(t)t.pintar(cont);
  }
  let temporizador=null;
  function refrescar(){
    clearTimeout(temporizador);
    temporizador=setTimeout(()=>{
      try{
        if(typeof state!=='undefined'&&state.currentTab==='intervenciones'&&document.getElementById('mi-cuerpo')){
          const a=document.activeElement;
          if(!(a&&a.closest&&a.closest('#mi-cuerpo')&&/INPUT|SELECT|TEXTAREA/.test(a.tagName)))pintarTab();   // no interrumpe quien está escribiendo un filtro
        }
        pintarDetalle();
      }catch(e){console.warn('Intervenciones:',e&&e.message||e);}
    },150);
  }
  function suscribir(){if(API()){API().alCambiar(refrescar);if(EQ())EQ().alCambiar(refrescar);return true;}return false;}
  suscribir();

  document.addEventListener('click',async e=>{
    const t=e.target;if(!t||!t.closest)return;
    const tab=t.closest('[data-mi-tab]');
    if(tab&&document.getElementById('intervenciones-view')){UI.tab=tab.dataset.miTab;render();return;}
    if(t.closest('[data-mi-cerrar-detalle]')){cerrarDetalle();return;}
    const ab=t.closest('[data-mi-abrir]');
    if(ab){abrirDetalle(ab.dataset.miAbrir);return;}
    if(t.closest('[data-mi-nueva]')){nuevaIntervencion();return;}
    const dp=t.closest('[data-mi-desde-parada]');
    if(dp){
      const [linea,...r]=dp.dataset.miDesdeParada.split('|'),pid=r.join('|');
      const x=detenidasSinIntervencion().find(y=>y.linea===linea&&y.paradaId===pid);
      if(!x)return;
      dp.disabled=true;
      try{const res=await API().abrirDesdeParada({linea:x.linea,paradaId:x.paradaId,motivo:x.motivo,equipoTexto:x.equipoTexto});UI.aviso=res.existente?'Esa parada ya tenía una intervención: se abrió la existente.':'';abrirDetalle(res.doc.id);}
      catch(err){aviso('No se pudo abrir',(err&&err.message)||String(err));dp.disabled=false;}
      return;
    }
    const ac=t.closest('[data-mi-acc]');
    if(ac&&UI.detalle){
      const d=API().porId(UI.detalle);if(!d)return;
      const f=ACC[ac.dataset.miAcc];if(!f)return;
      try{await f(d);}catch(err){aviso('No se pudo guardar',(err&&err.message)||String(err));}
      return;
    }
    if(t.closest('[data-mi-eq-nuevo]')){formEquipo('');return;}
    const ee=t.closest('[data-mi-eq-editar]');if(ee){formEquipo(ee.dataset.miEqEditar);return;}
    const ea=t.closest('[data-mi-eq-activo]');
    if(ea){const x=EQ().porId(ea.dataset.miEqActivo);if(x){try{await EQ().cambiarActivo(x.id,!x.activo);}catch(err){aviso('No se pudo cambiar',(err&&err.message)||String(err));}}return;}
  });
  document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.closest&&e.target.closest('[data-mi-abrir]')){e.preventDefault();abrirDetalle(e.target.closest('[data-mi-abrir]').dataset.miAbrir);}});
  document.addEventListener('input',e=>{const t=e.target;if(t&&t.dataset&&t.dataset.miF!==undefined&&t.tagName==='INPUT'){F[t.dataset.miF]=t.value;const l=document.getElementById('mi-lista');if(l){/* filtro de texto en vivo */const lista=filtradas();l.innerHTML=lista.length?lista.map(tarjeta).join(''):'<div class="mi-vacio">No hay intervenciones con estos filtros.</div>';}}
    if(t&&t.dataset&&t.dataset.miEf==='q'){UI.equipoFiltro.q=t.value;}});
  document.addEventListener('change',e=>{
    const t=e.target;if(!t||!t.dataset)return;
    if(t.dataset.miF!==undefined&&t.tagName!=='INPUT'||(t.dataset.miF!==undefined&&t.type==='date')){F[t.dataset.miF]=t.value;pintarTab();}
    if(t.dataset.miEf!==undefined){UI.equipoFiltro[t.dataset.miEf]=t.value;pintarTab();}
  });

  window.intervencionesAbrir=function(o){
    const A=API();
    if(!A||!A.permisos().ver){aviso('Sin acceso','No tienes permiso para ver las intervenciones de Mantenimiento.');return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    if(o&&o.tab)UI.tab=o.tab;
    state.currentTab='intervenciones';
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
    if(o&&o.abrir)abrirDetalle(o.abrir);
  };
  window.goIntervenciones=()=>window.intervencionesAbrir();
  window.glacialMantUI={modal,aviso,formulario,esc,fmtFH,fmtDur,opts,chipEstado,nombreLinea,abrirDetalle,pintarDetalle,render,UI,F};

  if(typeof ajustarVistaSegunPermisos==='function'){
    const anterior=ajustarVistaSegunPermisos;
    ajustarVistaSegunPermisos=function(){if(state.currentTab==='intervenciones'&&API().permisos().ver)return;return anterior.apply(this,arguments);};
  }
  if(typeof renderMain==='function'){
    const anterior=renderMain;
    renderMain=function(){
      if(state.currentTab==='intervenciones'&&!state.showWelcome&&API().permisos().ver){render();return;}
      return anterior.apply(this,arguments);
    };
  }
  if(typeof grupoSidebarActivo==='function'){
    const anterior=grupoSidebarActivo;
    grupoSidebarActivo=function(){return state.currentTab==='intervenciones'?'mantenimiento':anterior.apply(this,arguments);};
  }
  if(typeof renderSidebar==='function'){
    const anterior=renderSidebar;
    renderSidebar=function(){
      const r=anterior.apply(this,arguments);
      const b=document.getElementById('btn-intervenciones');
      if(b){
        const mostrar=!!(typeof state!=='undefined'&&state.user)&&API().permisos().ver;
        b.hidden=!mostrar;b.style.display=mostrar?'':'none';
        const activo=mostrar&&state.currentTab==='intervenciones';
        b.classList.toggle('active',activo);
        if(activo)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
        if(mostrar)API().escucharAbiertas();
        if(typeof actualizarGruposSidebar==='function')actualizarGruposSidebar();
      }
      return r;
    };
  }
})();
