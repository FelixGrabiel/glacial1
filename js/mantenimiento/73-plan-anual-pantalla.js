/* =====================================================================================================================
   MANTENIMIENTO · PLAN ANUAL · pantalla · docs/mantenimiento/plan-y-registro.md
   Una pestaña por máquina, con las mismas columnas del Excel PLAN-PROGRAMA MTTO (ITEM · ACTIVIDAD · INSUMOS · N° TÉC. · FRECUENCIA · E…D),
   agrupada por bloque de frecuencia. Las semanales muestran una barra «1 – 52»; las demás, el número de cada semana programada pintado según su estado.
   En vivo: lo que edita el supervisor aparece en los demás dispositivos sin recargar (72-plan-anual-datos.js).
   Editar el plan: solo el Supervisor / Jefe de Mantenimiento (permiso moduloMantenimiento) o el Administrador; las reglas de la base lo exigen también.
   «Vencida» (rojo) necesita el módulo de registros (etapa siguiente): mientras tanto lo pasado se ve como programado, sin afirmar que venció.
   ===================================================================================================================== */
(function(){
  'use strict';
  const TAB='plan-anual-mtto',BOTON='btn-plan-anual-mtto';
  const N=window.glacialMttoPlan,D=window.glacialMttoPlanDatos;
  if(!N||!D)return;
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const hoyIso=()=>GlacialFecha.fechaISOLocal(ahoraMs());          // fecha de hoy en hora de Lima (01b-fecha-operativa.js)
  const UI={maquina:'',anio:0,linea:'',conRegistros:true,buscar:'',frec:'',soloSemana:false,abiertas:new Set(),enfocarBuscar:null};

  /* ---------- permisos ---------- */
  const JEFATURA=['Jefe de Producción','Jefe de Operaciones','Jefatura','Gerente General','Gerente'];
  const usuario=()=>(typeof state!=='undefined'&&state.user)||null;
  const compartida=()=>{try{return typeof esMantCompartido==='function'&&esMantCompartido(usuario());}catch(_){return false;}};
  /* Misma regla que la marca «supmtto» de glacial_fs.ctx(): la base es quien decide; esto solo oculta botones. */
  function puedeEditar(){
    const u=usuario();if(!u||compartida())return false;
    if(window.glacialVista&&window.glacialVista.activoDe&&window.glacialVista.activoDe(u))return false;
    const rol=String(u.rol||'').trim();
    if(JEFATURA.includes(rol))return false;
    return rol==='Administrador'||(typeof tienePermiso==='function'&&(tienePermiso('moduloMantenimiento')||tienePermiso('gestionar_rotacion_mantenimiento')));
  }
  function puedeVer(){
    const u=usuario();if(!u)return false;
    if(compartida()||puedeEditar())return true;
    return typeof window.puedeVerBitacoraMtto==='function'&&window.puedeVerBitacoraMtto();
  }

  /* ---------- selección ---------- */
  function normalizarSeleccion(){
    const ms=D.cache.maquinas.filter(m=>m.activo!==false);
    if(!ms.some(m=>m.id===UI.maquina))UI.maquina=(ms.find(m=>!m.pendiente_confirmar)||ms[0]||{}).id||'';
    const anios=D.anios();
    if(!anios.includes(UI.anio))UI.anio=anios.includes(N.semanaIso(hoyIso()).anio)?N.semanaIso(hoyIso()).anio:(anios[0]||N.semanaIso(hoyIso()).anio);
    const lineas=[...new Set(ms.map(m=>m.linea_impresion||'PET'))];
    if(!lineas.includes(UI.linea))UI.linea=lineas[0]||'PET';
  }

  /* ---------- piezas ---------- */
  /* Lo que dice el Registro del año (se lee una vez y se actualiza solo): mapa de ejecución y semana desde la que se cuentan «vencidas». */
  let EJ={mapa:null,desde:Infinity,error:''};
  function leerEjecucion(){
    const ej=D.ejecucion(UI.anio);
    EJ={mapa:ej&&ej.listo?N.mapaEjecucion(ej.registros,ej.acts):null,desde:N.semanaDesde(UI.anio,N.inicioRegistros(D.cache.config)),error:ej&&ej.error?ej.error:''};
  }
  const optsSemana=a=>({conRegistros:!!EJ.mapa,desde:EJ.desde,ejecucion:EJ.mapa?EJ.mapa.get(a.id):null});
  const motivoDe=(a,s)=>{const e=EJ.mapa&&EJ.mapa.get(a.id)&&EJ.mapa.get(a.id).get(s);return e&&e.motivo?' · Motivo: '+e.motivo:'';};
  function cumplText(a,actual){
    if(!EJ.mapa||!actual||actual.anio!==a.anio)return '';
    const c=N.cumplimiento([a],actual,EJ.mapa,EJ.desde);if(!c.base)return '';
    return '<span class="mp-cump'+(c.vencidas?' mal':'')+'" title="Semanas ya pasadas desde que empezó el Registro: hechas / programadas">✓ '+c.hechas+' de '+c.base+(c.vencidas?' · '+c.vencidas+' vencida'+(c.vencidas===1?'':'s'):'')+'</span>';
  }
  function celdaSemanas(a,actual){
    const sem=N.leerSemanas;
    return N.MESES.map((_,i)=>{
      const nums=sem((a.semanas_por_mes||[])[i]).semanas;
      return '<td class="mp-mes">'+nums.map(s=>{
        const est=N.estadoSemana(s,actual&&actual.anio===a.anio?actual:null,optsSemana(a));
        const r=N.rangoSemana(a.anio,s);
        return '<span class="mp-sem mp-'+est+'" title="Semana '+s+' · '+N.ddmm(r.desde)+' al '+N.ddmm(r.hasta)+(est==='actual'?' · semana en curso':est==='ejecutada'?' · hecha':est==='tarde'?' · se hizo después de su semana':est==='noreal'?' · NO se realizó'+motivoDe(a,s):est==='vencida'?' · vencida: sin hacer':'')+'">'+s+'</span>';
      }).join('')+'</td>';
    }).join('');
  }
  function filaActividad(a,actual,editar){
    const p=N.partirActividad(a.actividad);
    const act='<b>'+esc(p.equipo)+'</b>'+(p.tarea?' <span class="mp-tarea">/ '+esc(p.tarea)+'</span>':'');
    let celdas;
    if(a.es_todo_el_anio){
      celdas='<td class="mp-todo" colspan="12"><span class="mp-todo-pill" title="Se hace todas las semanas del año (1 – 52)"><b>↻ Todas las semanas</b> 1 – 52</span>'+
        (actual&&actual.anio===a.anio?'<span class="mp-barra-txt">Semana '+actual.semana+' en curso</span>':'')+cumplText(a,actual)+'</td>';
    }else celdas=celdaSemanas(a,actual);
    const abierta=UI.abiertas.has(a.id),estaSemana=!!(actual&&actual.anio===a.anio&&(a.semanas||[]).includes(actual.semana));
    return '<tr class="mp-fila'+(abierta?' abierta':'')+'" data-mp-fila="'+esc(a.id)+'" data-mp-abrir="'+esc(a.id)+'" tabindex="0" aria-expanded="'+abierta+'" title="Toca para ver cuándo se hace"><td class="mp-item"><span class="mp-chev" aria-hidden="true">'+(abierta?'▾':'▸')+'</span> '+esc(a.item)+'</td><td class="mp-act">'+act+(estaSemana?' <span class="mp-hoy">Esta semana</span>':'')+'</td><td class="mp-ins">'+esc(a.insumos)+'</td><td class="mp-n">'+esc(a.n_tecnicos)+'</td><td class="mp-frec">'+esc(a.frecuencia)+'</td>'+celdas+
      (editar?'<td class="mp-edit"><button type="button" class="btn btn-ghost btn-sm" data-mp-editar="'+esc(a.id)+'" aria-label="Editar actividad">✎</button></td>':'')+'</tr>'+(abierta?filaDetalle(a,actual,editar):'');
  }
  /** Detalle de una actividad: calendario de las 52 semanas y próximas fechas (se abre al tocar la fila). */
  function filaDetalle(a,actual,editar){
    const total=N.semanasDelAnio(a.anio),prog=new Set(a.semanas||[]),act=actual&&actual.anio===a.anio?actual.semana:0;
    const celdas=[];for(let sem=1;sem<=total;sem++){
      const r=N.rangoSemana(a.anio,sem),on=prog.has(sem),est=on?N.estadoSemana(sem,actual&&actual.anio===a.anio?actual:null,optsSemana(a)):'',
        cls=!on?'no':est==='ejecutada'?'ok':est==='tarde'?'tarde':est==='noreal'?'noreal':est==='vencida'?'venc':sem===act?'actual':act&&sem<act?'pasada':'prox';
      celdas.push('<span class="mp-cal mp-cal-'+cls+'" title="Semana '+sem+' · '+N.ddmm(r.desde)+' al '+N.ddmm(r.hasta)+(on?(est==='ejecutada'?' · hecha':est==='tarde'?' · se hizo después':est==='noreal'?' · NO se realizó'+motivoDe(a,sem):est==='vencida'?' · vencida: sin hacer':sem===act?' · esta semana':act&&sem<act?' · ya pasó (antes del Registro)':' · programada'):' · no se hace')+'">'+sem+'</span>');
    }
    const futuras=[...prog].filter(x=>x>=act).sort((x,y)=>x-y).slice(0,4);
    const prox=futuras.length?futuras.map(x=>{const r=N.rangoSemana(a.anio,x);return '<li><b>Semana '+x+'</b>'+(x===act?' <em>(esta semana)</em>':'')+'<small>'+N.ddmm(r.desde)+' al '+N.ddmm(r.hasta)+'</small></li>';}).join(''):'<li><small>No quedan semanas programadas este año.</small></li>';
    const nTxt=a.es_todo_el_anio?'Todas las semanas del año':prog.size+' semana'+(prog.size===1?'':'s')+' al año';
    return '<tr class="mp-det"><td colspan="'+(5+12+(editar?1:0))+'"><div class="mp-det-in"><div><h4>'+esc(nTxt)+' · '+esc(a.frecuencia)+'</h4><div class="mp-cal-g" role="img" aria-label="Calendario de semanas del año">'+celdas.join('')+'</div>'+
      '<div class="mp-cal-ley"><span><i class="mp-cal mp-cal-ok"></i>Hecha</span><span><i class="mp-cal mp-cal-tarde"></i>Hecha tarde</span><span><i class="mp-cal mp-cal-noreal"></i>No se realizó</span><span><i class="mp-cal mp-cal-venc"></i>Vencida</span><span><i class="mp-cal mp-cal-actual"></i>Esta semana</span><span><i class="mp-cal mp-cal-prox"></i>Programada</span><span><i class="mp-cal mp-cal-no"></i>No se hace</span></div></div>'+
      '<div><h4>Próximas</h4><ul class="mp-prox">'+prox+'</ul>'+(a.insumos&&a.insumos!=='N/A'?'<p class="mp-ins2"><b>Insumos:</b> '+esc(a.insumos)+'</p>':'')+'<p class="mp-ins2"><b>Técnicos:</b> '+esc(a.n_tecnicos)+'</p></div></div></td></tr>';
  }
  /** Filtros de la tabla: búsqueda, frecuencia y «solo esta semana». */
  function filtrar(acts,actual){
    const q=String(UI.buscar||'').trim().toLowerCase();
    return acts.filter(a=>(!q||N.textoBusqueda(a).includes(q))&&(!UI.frec||a.frecuencia===UI.frec)&&(!UI.soloSemana||!!(actual&&actual.anio===a.anio&&(a.semanas||[]).includes(actual.semana))));
  }
  function herramientas(acts,vistas,actual){
    const cuenta={};acts.forEach(a=>{cuenta[a.frecuencia]=(cuenta[a.frecuencia]||0)+1;});
    const orden=N.BLOQUES.filter(b=>cuenta[b]);
    const chip=(v,txt,n)=>'<button type="button" class="mp-fchip'+(UI.frec===v?' on':'')+'" data-mp-frec="'+esc(v)+'" aria-pressed="'+(UI.frec===v)+'">'+esc(txt)+' <b>'+n+'</b></button>';
    return '<div class="mp-herr"><input type="search" class="mp-buscar" data-mp-buscar placeholder="Buscar equipo, actividad o insumo…" value="'+esc(UI.buscar)+'" aria-label="Buscar en el plan">'+
      '<div class="mp-fchips">'+chip('','Todas',acts.length)+orden.map(b=>chip(b,b,cuenta[b])).join('')+'</div>'+
      '<label class="mp-solo"><input type="checkbox" data-mp-solo'+(UI.soloSemana?' checked':'')+(actual?'':' disabled')+'> Solo lo de esta semana</label>'+
      (vistas!==acts.length?'<span class="mp-cuenta">Mostrando '+vistas+' de '+acts.length+'</span>':'')+'</div>';
  }
  function tarjetas(r,actual,cump){
    const t=(titulo,valor,sub,cls)=>'<div class="mp-card '+(cls||'')+'"><span>'+titulo+'</span><b>'+valor+'</b>'+(sub?'<small>'+sub+'</small>':'')+'</div>';
    const rs=actual?N.rangoSemana(actual.anio,actual.semana):null;
    return '<div class="mp-cards">'+t('Actividades en el plan',r.total)+
      t('Esta semana'+(actual?' (S'+actual.semana+' · '+(rs?N.ddmm(rs.desde)+' al '+N.ddmm(rs.hasta):'')+')':''),r.estaSemana+' actividades')+
      t('Próxima semana con extras',r.proxima?'S'+r.proxima.semana+' · +'+r.proxima.extras:'—',r.proxima?'actividades no semanales':'')+
      t('Cumplimiento del plan',cump&&cump.pct!==null?cump.pct+' %':'—',cump&&cump.base?cump.hechas+' de '+cump.base+' semanas hechas (desde que empezó el Registro)':(EJ.mapa?'todavía no hay semanas cerradas para medir':'leyendo el Registro…'),cump&&cump.pct!==null&&cump.pct<80?'mp-rojo':'')+
      t('Vencidas',r.vencidas===null?'—':r.vencidas,r.vencidas===null?'leyendo el Registro…':(cump&&cump.no?cump.no+' marcadas «No se realizó»':'semanas pasadas sin hacer'),r.vencidas>0?'mp-rojo':'')+'</div>';
  }

  function vencChip(m,actual){
    if(!EJ.mapa||!actual||actual.anio!==UI.anio)return '';
    const c=N.cumplimiento(D.actividadesDe(m.id,UI.anio),actual,EJ.mapa,EJ.desde);
    return c.vencidas?' <b class="mp-venc" title="'+c.vencidas+' actividad'+(c.vencidas===1?'':'es')+' vencida'+(c.vencidas===1?'':'s')+' · cumplimiento '+(c.pct===null?'—':c.pct+' %')+'">'+c.vencidas+'</b>':'';
  }
  function pintar(main){
    estilos();leerEjecucion();
    normalizarSeleccion();
    const editar=puedeEditar(),c=D.cache;
    const ms=c.maquinas.filter(m=>m.activo!==false&&(m.linea_impresion||'PET')===UI.linea);
    const maq=c.maquinas.find(m=>m.id===UI.maquina)||null;
    const actual=N.semanaDeHoy(hoyIso());
    let cuerpo;
    if(!c.listo){
      cuerpo='<div class="mp-aviso">'+(c.error?esc(c.error)+' <button type="button" class="btn btn-ghost btn-sm" data-mp-recargar>Reintentar</button>':(c.cargando||!c.error?'Cargando el plan…':''))+'</div>';
    }else if(!ms.length||!maq){
      cuerpo='<div class="mp-aviso">Todavía no hay máquinas cargadas en el plan.</div>';
    }else{
      const acts=D.actividadesDe(maq.id,UI.anio),actualA=actual&&actual.anio===UI.anio?actual:null,vistas=filtrar(acts,actualA);
      const grupos=N.agruparPorBloque(vistas);
      const r=N.resumen(acts,actual&&actual.anio===UI.anio?actual:null,{conRegistros:!!EJ.mapa,desde:EJ.desde,ejecutadasDe:(a,s)=>{const e=EJ.mapa&&EJ.mapa.get(a.id)&&EJ.mapa.get(a.id).get(s);return !!e&&(e.estado==='ok'||e.estado==='tarde');}});
      const cump=EJ.mapa?N.cumplimiento(acts,actual,EJ.mapa,EJ.desde):null;
      const colg='<colgroup><col style="width:44px"><col style="width:240px"><col style="width:150px"><col style="width:52px"><col style="width:92px">'+N.MESES.map(()=>'<col style="width:44px">').join('')+(editar?'<col style="width:44px">':'')+'</colgroup>';
      const cab=colg+'<thead><tr><th rowspan="2">ÍTEM</th><th rowspan="2">ACTIVIDAD (COMPONENTE / TAREA)</th><th rowspan="2">INSUMOS</th><th rowspan="2" title="Número de técnicos">N° TÉC.</th><th rowspan="2">FRECUENCIA</th><th colspan="12">MES / SEMANA</th>'+(editar?'<th rowspan="2"></th>':'')+'</tr>'+
        '<tr>'+N.MESES.map((m,i)=>'<th class="mp-th-mes" title="'+N.MESES_NOMBRE[i]+'">'+m+'</th>').join('')+'</tr></thead>';
      const cols=5+12+(editar?1:0);
      const filas=grupos.map(g=>'<tr class="mp-grupo"><td colspan="'+cols+'"><b>'+esc(g.frecuencia)+'</b> <span>'+g.items.length+' actividad'+(g.items.length===1?'':'es')+'</span></td></tr>'+g.items.map(a=>filaActividad(a,actual,editar)).join('')).join('');
      cuerpo=(maq.pendiente_confirmar?'<div class="mp-aviso mp-aviso-amb"><b>Pendiente de confirmar:</b> todavía no se sabe a qué línea pertenece esta máquina. No está asignada a PET1 ni a PET2.</div>':'')+
        tarjetas(r,actual&&actual.anio===UI.anio?actual:null,cump)+
        '<div class="mp-leyenda"><span><i class="mp-sem mp-ejecutada"></i>Hecha</span><span><i class="mp-sem mp-tarde"></i>Hecha tarde</span><span><i class="mp-sem mp-noreal"></i>No se realizó</span><span><i class="mp-sem mp-actual"></i>Semana actual</span><span><i class="mp-sem mp-programada"></i>Programada</span><span><i class="mp-sem mp-vencida"></i>Vencida</span>'+
        '<em>'+(editar?'Puedes editar el plan (supervisor / jefe de Mantenimiento). Toca una actividad para ver cuándo se hace.':'Solo el Supervisor / Jefe de Mantenimiento puede editar. Toca una actividad para ver cuándo se hace.')+'</em></div>'+
        (acts.length?herramientas(acts,vistas.length,actualA)+(vistas.length?'<div class="mp-tw"><table class="mp-t">'+cab+'<tbody>'+filas+'</tbody></table></div>':'<div class="mp-aviso">Ninguna actividad coincide con lo que buscas. <button type="button" class="btn btn-ghost btn-sm" data-mp-limpiar>Quitar filtros</button></div>'):'<div class="mp-aviso">Esta máquina no tiene actividades para '+UI.anio+'.</div>')+
        '<p class="mp-pie">Los números dentro de cada mes son las semanas programadas, igual que en el Excel PLAN-PROGRAMA MTTO '+UI.anio+'. Los textos se muestran tal cual vienen del plan.</p>';
    }
    const anios=D.anios();
    const lineas=[...new Set(c.maquinas.filter(m=>m.activo!==false).map(m=>m.linea_impresion||'PET'))];
    main.innerHTML='<section class="mp" id="mp-raiz">'+(window.glacialMttoTabs?window.glacialMttoTabs.html('plan'):'')+
      '<header class="mp-cab"><div><small>Planta de Agua · '+esc(UI.linea)+' · Programa '+UI.anio+'</small><h2>Plan de mantenimiento'+(maq?' · '+esc(maq.nombre):'')+'</h2></div>'+
      '<div class="mp-filtros"><span class="mp-vivo '+(c.enVivo?'on':'')+'" role="status">'+(c.enVivo?'● En vivo':'○ Sin tiempo real')+'</span>'+
      '<label>Línea<select data-mp-linea>'+lineas.map(l=>'<option'+(l===UI.linea?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select></label>'+
      '<label>Año<select data-mp-anio>'+(anios.length?anios:[UI.anio]).map(a=>'<option'+(a===UI.anio?' selected':'')+'>'+a+'</option>').join('')+'</select></label>'+
      (maq&&c.listo?'<button type="button" class="btn btn-ghost" data-mp-excel>Exportar Excel</button><button type="button" class="btn btn-ghost" data-mp-imprimir>Imprimir</button>':'')+(editar&&maq?'<button type="button" class="btn btn-primary" data-mp-nueva>+ Actividad</button>':'')+'</div></header>'+
      '<nav class="mp-chips" aria-label="Máquinas">'+ms.map(m=>'<button type="button" class="mp-chip'+(m.id===UI.maquina?' on':'')+(m.pendiente_confirmar?' pend':'')+'" data-mp-maq="'+esc(m.id)+'" aria-pressed="'+(m.id===UI.maquina)+'" title="'+esc(m.nombre)+(m.pendiente_confirmar?' · pendiente de confirmar a qué línea pertenece':'')+'">'+esc(m.codigo_hoja)+(m.pendiente_confirmar?' <b>?</b>':'')+vencChip(m,actual)+'</button>').join('')+'</nav>'+
      cuerpo+'</section>';
    if(UI.enfocarBuscar!==null){const i=main.querySelector('[data-mp-buscar]');if(i){i.focus();try{i.setSelectionRange(UI.enfocarBuscar,UI.enfocarBuscar);}catch(_){/* sin cursor */}}UI.enfocarBuscar=null;}
  }

  /* ---------- editar / agregar actividad ---------- */
  function abrirEdicion(id){
    if(!puedeEditar())return;
    const maq=D.cache.maquinas.find(m=>m.id===UI.maquina);if(!maq)return;
    const ex=id?D.cache.actividades.find(a=>a.id===id):null;
    if(id&&!ex)return;
    const f=ex||{frecuencia:'SEMANAL',item:'',actividad:'',insumos:'',n_tecnicos:1,semanas_por_mes:Array(12).fill(''),es_todo_el_anio:true};
    const fondo=document.createElement('div');fondo.className='mp-modal';fondo.setAttribute('role','dialog');fondo.setAttribute('aria-modal','true');
    fondo.innerHTML='<div class="mp-dlg"><h3>'+(ex?'Editar actividad':'Nueva actividad')+' · '+esc(maq.nombre)+'</h3>'+
      '<div class="mp-campos"><label>Frecuencia<select id="mpe-frec">'+N.BLOQUES.map(b=>'<option'+(b===f.frecuencia?' selected':'')+'>'+b+'</option>').join('')+'</select></label>'+
      '<label>Ítem<input id="mpe-item" value="'+esc(f.item)+'" inputmode="numeric"></label>'+
      '<label class="mp-ancho">Actividad (COMPONENTE / TAREA)<input id="mpe-act" value="'+esc(f.actividad)+'"></label>'+
      '<label class="mp-ancho">Insumos<input id="mpe-ins" value="'+esc(f.insumos)+'"></label>'+
      '<label>N° técnicos<input id="mpe-n" type="number" min="0" max="20" value="'+esc(f.n_tecnicos)+'"></label>'+
      '<label class="mp-chk"><input id="mpe-todo" type="checkbox"'+(f.es_todo_el_anio?' checked':'')+'> Todo el año (1 – 52)</label></div>'+
      '<div id="mpe-meses" class="mp-meses"'+(f.es_todo_el_anio?' hidden':'')+'><p>Semanas programadas por mes (por ejemplo <b>9</b> o <b>1,3</b>):</p><div>'+
      N.MESES.map((m,i)=>'<label title="'+N.MESES_NOMBRE[i]+'">'+m+'<input data-mpe-mes="'+i+'" value="'+esc((f.semanas_por_mes||[])[i]||'')+'"></label>').join('')+'</div></div>'+
      '<div class="mp-error" id="mpe-err" role="alert"></div>'+
      '<div class="mp-acc">'+(ex?'<button type="button" class="btn btn-ghost" id="mpe-quitar" style="margin-right:auto;color:#a32020">Quitar</button>':'')+'<button type="button" class="btn btn-ghost" id="mpe-x">Cancelar</button><button type="button" class="btn btn-primary" id="mpe-ok">Guardar</button></div></div>';
    document.body.appendChild(fondo);
    const q=s=>fondo.querySelector(s),err=t=>{q('#mpe-err').textContent=t||'';};
    q('#mpe-todo').onchange=()=>{q('#mpe-meses').hidden=q('#mpe-todo').checked;};
    q('#mpe-x').onclick=()=>fondo.remove();
    q('#mpe-ok').onclick=async()=>{
      err('');
      const todo=q('#mpe-todo').checked;
      const celdas=[...fondo.querySelectorAll('[data-mpe-mes]')].map(i=>i.value);
      const s=N.armarSemanas(celdas,todo);
      if(s.errores.length){err(s.errores.join(' '));return;}
      if(!todo&&!s.semanas.length){err('Escribe al menos una semana, o marca «Todo el año».');return;}
      q('#mpe-ok').disabled=true;err('Guardando…');
      try{
        await D.guardarActividad(maq.id,UI.anio,{frecuencia:q('#mpe-frec').value,item:q('#mpe-item').value,actividad:q('#mpe-act').value,insumos:q('#mpe-ins').value,n_tecnicos:q('#mpe-n').value,
          semanas_por_mes:s.semanasPorMes,semanas:s.semanas,es_todo_el_anio:s.todo},ex&&ex.id,ex&&ex.version);
        fondo.remove();repintar(true);
      }catch(e){err(e.message||String(e));q('#mpe-ok').disabled=false;if(e.conflicto)setTimeout(()=>{fondo.remove();repintar(true);},2500);}
    };
    const quitar=q('#mpe-quitar');
    if(quitar)quitar.onclick=async()=>{
      if(quitar.dataset.seguro!=='1'){quitar.dataset.seguro='1';quitar.textContent='¿Seguro? Pulsa otra vez';return;}
      try{await D.quitarActividad(ex.id);fondo.remove();repintar(true);}catch(e){err(e.message||String(e));}
    };
    setTimeout(()=>{try{if(!fondo.contains(document.activeElement))q('#mpe-act').focus();}catch(_){/* ya cerrado */}},50);       // no le roba el foco a quien ya empezó a escribir
  }

  /* ---------- imprimir (A4 horizontal, igual que la hoja del Excel) y exportar ---------- */
  const IMP=()=>window.glacialMttoPlanImpresion;
  function imprimir(){
    const maq=D.cache.maquinas.find(m=>m.id===UI.maquina);if(!maq||!IMP())return;
    const html=IMP().htmlImpresion(maq,D.actividadesDe(maq.id,UI.anio),UI.anio,new URL('assets/img/mtto-logo.png',location.href).href);
    const f=document.createElement('iframe');f.setAttribute('aria-hidden','true');f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    f.onload=()=>setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print();}catch(_){alert('No se pudo abrir la impresión.');}setTimeout(()=>f.remove(),60000);},250);
    f.srcdoc=html;document.body.appendChild(f);
  }
  async function exportarExcel(){
    if(typeof ExcelJS==='undefined'||!IMP()){alert('No se pudo cargar el generador de Excel. Revisa tu conexión y recarga la página.');return;}
    try{
      const items=D.cache.maquinas.filter(m=>m.activo!==false&&(m.linea_impresion||'PET')===UI.linea).map(m=>({maquina:m,acts:D.actividadesDe(m.id,UI.anio)}));
      const wb=IMP().libroExcel(ExcelJS,items,UI.anio),buf=await wb.xlsx.writeBuffer();
      const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      a.download='PLAN-PROGRAMA_MTTO_'+UI.anio+'_PLANTA_DE_AGUA_'+UI.linea+'.xlsx';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
    }catch(e){alert('No se pudo generar el Excel: '+((e&&e.message)||e));}
  }
  function repintar(forzar){
    if(typeof state==='undefined'||state.currentTab!==TAB)return;
    const m=document.getElementById('main');
    if(!m||(!forzar&&document.querySelector('.mp-modal')))return;     // no se repinta debajo de un formulario abierto
    pintar(m);
  }
  D.alCambiar(()=>repintar(false));

  document.addEventListener('click',e=>{
    const raiz=e.target.closest&&e.target.closest('#mp-raiz');
    if(!raiz)return;
    const m=e.target.closest('[data-mp-maq]');if(m){UI.maquina=m.getAttribute('data-mp-maq');repintar(true);return;}
    const ed=e.target.closest('[data-mp-editar]');if(ed){abrirEdicion(ed.getAttribute('data-mp-editar'));return;}
    const fq=e.target.closest('[data-mp-frec]');if(fq){UI.frec=fq.getAttribute('data-mp-frec');repintar(true);return;}
    if(e.target.closest('[data-mp-limpiar]')){UI.buscar='';UI.frec='';UI.soloSemana=false;repintar(true);return;}
    const fa=e.target.closest('[data-mp-abrir]');
    if(fa&&!e.target.closest('input,button,select,textarea,a')){const id=fa.getAttribute('data-mp-abrir');if(UI.abiertas.has(id))UI.abiertas.delete(id);else UI.abiertas.add(id);repintar(true);return;}
    if(e.target.closest('[data-mp-nueva]')){abrirEdicion('');return;}
    if(e.target.closest('[data-mp-recargar]')){D.cargar();return;}
    if(e.target.closest('[data-mp-imprimir]')){imprimir();return;}
    if(e.target.closest('[data-mp-excel]')){exportarExcel();return;}
  });
  document.addEventListener('change',e=>{
    const t=e.target;if(!t||!t.closest||!t.closest('#mp-raiz'))return;
    if(t.hasAttribute('data-mp-linea')){UI.linea=t.value;UI.maquina='';repintar(true);}
    if(t.hasAttribute('data-mp-anio')){UI.anio=Number(t.value)||UI.anio;repintar(true);}
    if(t.hasAttribute('data-mp-solo')){UI.soloSemana=!!t.checked;repintar(true);}
  });
  document.addEventListener('input',e=>{
    const t=e.target;if(!t||!t.hasAttribute||!t.hasAttribute('data-mp-buscar')||!t.closest('#mp-raiz'))return;
    UI.buscar=t.value;UI.enfocarBuscar=t.selectionStart==null?t.value.length:t.selectionStart;repintar(true);
  });
  document.addEventListener('keydown',e=>{                                    // Enter o espacio abre/cierra una actividad con el teclado
    if(e.key!=='Enter'&&e.key!==' ')return;
    const f=e.target&&e.target.closest&&e.target.closest('tr[data-mp-abrir]');if(!f||e.target!==f||!f.closest('#mp-raiz'))return;
    e.preventDefault();const id=f.getAttribute('data-mp-abrir');if(UI.abiertas.has(id))UI.abiertas.delete(id);else UI.abiertas.add(id);repintar(true);
  });

  /* ---------- estilos (variables de la paleta del logo) ---------- */
  function estilos(){
    if(document.getElementById('mp-estilos'))return;
    const s=document.createElement('style');s.id='mp-estilos';
    s.textContent=(window.glacialMttoTabs?window.glacialMttoTabs.css:'')+'.mp{max-width:1280px;margin:0 auto;padding:4px 2px 24px}.mp-cab{display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px}'+
      '.mp-cab small{color:#5b6b79;font-size:12px}.mp-cab h2{margin:2px 0 0;font-size:22px}.mp-filtros{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}.mp-filtros label{display:flex;flex-direction:column;font-size:11.5px;color:#5b6b79;gap:2px}'+
      '.mp-filtros select{min-height:38px;border:1px solid #cfdbe3;border-radius:8px;padding:0 10px;background:#fff;font-size:14px}.mp-vivo{font-size:12.5px;color:#7a8794;align-self:center}.mp-vivo.on{color:#1a7f4b;font-weight:600}'+
      '.mp-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}.mp-chip{border:1px solid #cfdbe3;background:#fff;border-radius:999px;padding:8px 14px;font-size:13px;cursor:pointer;min-height:38px}'+
      '.mp-chip.on{background:var(--brand-700,#0877A6);border-color:var(--brand-700,#0877A6);color:#fff;font-weight:600}.mp-chip.pend{border-style:dashed}.mp-chip b{color:#b26a00}.mp-chip.on b{color:#ffe7b3}'+
      '.mp-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:12px}.mp-card{background:#fff;border:1px solid #dbe5ee;border-radius:var(--card-radius,14px);padding:12px 14px;box-shadow:var(--card-shadow,0 1px 2px rgba(3,51,80,.05))}'+
      '.mp-card span{display:block;font-size:12px;color:#5b6b79}.mp-card b{display:block;font-size:22px;margin-top:4px;color:#033350}.mp-card small{color:#7a8794;font-size:11.5px}.mp-card.mp-rojo{border-color:#f0b9b9;background:#fff6f6}.mp-card.mp-rojo b{color:#b42318}'+
      '.mp-leyenda{display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:12.5px;color:#46627a;margin:0 0 8px}.mp-leyenda em{margin-left:auto;font-style:normal;color:#7a8794}.mp-leyenda i.mp-sem{width:16px;height:16px;padding:0;margin-right:5px;vertical-align:-3px}'+
      '.mp-tw{background:#fff;border:1px solid #dbe5ee;border-radius:var(--card-radius,14px);overflow:auto;max-height:78vh}.mp-t{border-collapse:separate;border-spacing:0;width:100%;min-width:1100px;table-layout:fixed;font-size:13px}'+
      '.mp-t th{background:#eef3fa;color:#033350;font-size:11.5px;letter-spacing:.03em;padding:8px 8px;text-align:center;position:sticky;top:0;z-index:2;border-bottom:1px solid #dbe5ee}.mp-t thead tr:nth-child(2) th{top:34px}'+
      '.mp-t td{padding:7px 8px;border-bottom:1px solid #edf2f7;vertical-align:middle}.mp-grupo td{background:#f6f9fc;font-size:12.5px;color:#033350;border-bottom:1px solid #dbe5ee}.mp-grupo span{color:#7a8794;font-weight:400;margin-left:6px}'+
      '.mp-item,.mp-n{text-align:center;color:#46627a;width:44px}.mp-act{overflow-wrap:anywhere}.mp-tarea{color:#46627a}.mp-ins{color:#46627a;font-size:12px;overflow-wrap:anywhere}.mp-frec{font-size:11.5px;color:#46627a;white-space:nowrap}'+
      '.mp-mes{text-align:center;min-width:44px;white-space:normal}.mp-todo{padding:6px 10px}.mp-barra{height:10px;border-radius:6px;background:#e4ecf3;overflow:hidden;display:inline-block;width:calc(100% - 140px);vertical-align:middle;min-width:100px}'+
      '.mp-barra i{display:block;height:100%;background:linear-gradient(90deg,#8ec9e6,var(--brand,#0DB5F3))}.mp-barra-txt{font-size:12px;color:#46627a;margin-left:10px;white-space:nowrap}.mp-cump{margin-left:12px;font-size:12px;color:#1a7f4b;font-weight:600;white-space:nowrap}.mp-cump.mal{color:#b42318}.mp-chip b.mp-venc{background:#fde8e8;color:#b42318;border-radius:999px;padding:0 7px;margin-left:4px;font-size:11.5px}.mp-chip.on b.mp-venc{background:#fff;color:#b42318}.mp-tarde{background:#e8f4d6;color:#3d5f12;border-color:#c9e3a8}.mp-noreal{background:#fff0dc;color:#8a4b00;border-color:#f0c58a}'+
      '.mp-todo-pill{display:inline-flex;gap:8px;align-items:center;background:#e8f7fe;color:#065F86;border:1px solid #bfe3f4;border-radius:999px;padding:5px 14px;font-size:12.5px}.mp-todo-pill b{font-weight:700}.mp-fila{cursor:pointer}.mp-fila:hover td{background:#f3f9fd}.mp-fila.abierta td{background:#eaf5fb}.mp-fila:focus-visible{outline:2px solid var(--brand,#0DB5F3);outline-offset:-2px}.mp-chev{display:inline-block;width:12px;color:#5b6b79;font-size:11px}.mp-hoy{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;background:#fff4d6;border:1px solid #ecd48b;color:#8a6100;font-size:11px;font-weight:700;white-space:nowrap}.mp-herr{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;margin:0 0 10px}.mp-buscar{flex:1 1 260px;min-height:42px;border:1px solid #cfdbe3;border-radius:10px;padding:0 12px;font-size:14px;background:#fff}.mp-fchips{display:flex;gap:6px;flex-wrap:wrap}.mp-fchip{border:1px solid #cfdbe3;background:#fff;border-radius:999px;padding:6px 12px;font-size:12.5px;cursor:pointer;min-height:36px;color:#033350}.mp-fchip b{color:#7a8794;font-weight:600;margin-left:2px}.mp-fchip.on{background:var(--brand-700,#0877A6);border-color:var(--brand-700,#0877A6);color:#fff}.mp-fchip.on b{color:#d6f0fb}.mp-solo{display:flex;gap:6px;align-items:center;font-size:13px;color:#033350;cursor:pointer}.mp-cuenta{font-size:12.5px;color:#7a8794}.mp-det td{background:#f7fbfe;padding:12px 16px 16px;border-bottom:2px solid #dbe5ee}.mp-det-in{display:grid;grid-template-columns:minmax(0,2fr) minmax(220px,1fr);gap:18px}.mp-det h4{margin:0 0 8px;font-size:13px;color:#033350}.mp-cal-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(34px,1fr));gap:4px}.mp-cal{display:inline-flex;align-items:center;justify-content:center;min-height:26px;border-radius:6px;font-size:11.5px;font-weight:600;border:1px solid transparent}.mp-cal-prox{background:#d9eefa;color:#065F86;border-color:#b6dcf0}.mp-cal-ok{background:#dff3e6;color:#14532d;border-color:#b6e0c4}.mp-cal-tarde{background:#e8f4d6;color:#3d5f12;border-color:#c9e3a8}.mp-cal-noreal{background:#fff0dc;color:#8a4b00;border-color:#f0c58a}.mp-cal-venc{background:#fde8e8;color:#9b1c1c;border-color:#f3b6b6}.mp-cal-actual{background:#fff;color:#065F86;border:2px solid var(--brand,#0DB5F3)}.mp-cal-pasada{background:#e9edf1;color:#7a8794}.mp-cal-no{background:transparent;color:#b7c2cc;border-color:#edf2f7;font-weight:400}.mp-cal-ley{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;font-size:12px;color:#46627a}.mp-cal-ley i.mp-cal{width:16px;min-height:16px;height:16px;margin-right:5px;vertical-align:-3px}.mp-prox{list-style:none;margin:0;padding:0;display:grid;gap:6px}.mp-prox li{display:flex;justify-content:space-between;gap:8px;background:#fff;border:1px solid #dbe5ee;border-radius:8px;padding:6px 10px;font-size:13px}.mp-prox em{color:#8a6100;font-style:normal;font-size:12px}.mp-prox small{color:#5b6b79}.mp-ins2{margin:8px 0 0;font-size:12.5px;color:#46627a}@media(max-width:760px){.mp-det-in{grid-template-columns:1fr}}'+
      '.mp-sem{display:inline-block;min-width:26px;padding:2px 6px;margin:1px;border-radius:6px;font-size:12px;font-weight:600;border:1px solid transparent;line-height:1.5}'+
      '.mp-programada{background:#eef1f4;color:#46627a;border-color:#dfe5ea}.mp-actual{background:#fff;color:var(--brand-700,#0877A6);border:2px solid var(--brand,#0DB5F3)}.mp-ejecutada{background:#dff3e6;color:#14532d;border-color:#b6e0c4}.mp-vencida{background:#fde8e8;color:#9b1c1c;border-color:#f3b6b6}'+
      '.mp-aviso{background:#fff;border:1px dashed #cfdbe3;border-radius:12px;padding:16px;color:#46627a;margin:8px 0}.mp-aviso-amb{background:#fff8e6;border:1px solid #ecd48b;color:#6d4a00}.mp-pie{font-size:12px;color:#7a8794;margin-top:8px}'+
      '.mp-modal{position:fixed;inset:0;background:rgba(3,51,80,.45);display:flex;align-items:center;justify-content:center;z-index:9000;padding:16px}.mp-dlg{background:#fff;border-radius:14px;max-width:640px;width:100%;max-height:92vh;overflow:auto;padding:18px}'+
      '.mp-dlg h3{margin:0 0 12px;font-size:17px}.mp-campos{display:grid;grid-template-columns:1fr 1fr;gap:10px}.mp-campos label,.mp-meses label{display:flex;flex-direction:column;font-size:12px;color:#5b6b79;gap:3px}.mp-ancho{grid-column:1/-1}'+
      '.mp-campos input:not([type=checkbox]),.mp-campos select,.mp-meses input{min-height:40px;border:1px solid #cfdbe3;border-radius:8px;padding:0 10px;font-size:14px}.mp-chk{flex-direction:row!important;align-items:center;gap:8px!important;font-size:13px!important;color:#033350!important}'+
      '.mp-meses>div{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.mp-meses p{font-size:12.5px;color:#46627a;margin:10px 0 6px}.mp-error{color:#b42318;font-size:13px;min-height:18px;margin-top:8px}.mp-acc{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}'+
      '@media(max-width:760px){.mp-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.mp-campos{grid-template-columns:1fr}.mp-meses>div{grid-template-columns:repeat(4,1fr)}.mp-leyenda em{margin-left:0;flex-basis:100%}.mp-cab h2{font-size:19px}}';
    document.head.appendChild(s);
  }

  /* ---------- navegación (mismo patrón que Velocidades estándar) ---------- */
  function ir(){
    if(!puedeVer()){alert('No tienes permiso para ver esta pantalla.');return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    D.escuchar();
    state.currentTab=TAB;
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
  }
  window.goPlanAnualMtto=ir;
  window.glacialMttoPlanPantalla={puedeEditar,puedeVer,pintar,UI,abrirEdicion};

  if(typeof ajustarVistaSegunPermisos==='function'){
    const a=ajustarVistaSegunPermisos;
    ajustarVistaSegunPermisos=function(){if(state.currentTab===TAB&&puedeVer())return;return a.apply(this,arguments);};
  }
  if(typeof renderMain==='function'){
    const a=renderMain;
    renderMain=function(){
      if(state.currentTab===TAB&&!state.showWelcome&&puedeVer()){pintar(document.getElementById('main'));return;}
      return a.apply(this,arguments);
    };
  }
  if(typeof renderSidebar==='function'){
    const a=renderSidebar;
    renderSidebar=function(){
      const r=a.apply(this,arguments);
      const b=document.getElementById(BOTON);
      if(b){
        const m=puedeVer();b.hidden=!m;b.style.display=m?'':'none';
        b.classList.toggle('active',m&&state.currentTab===TAB);
        if(m&&state.currentTab===TAB)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
      }
      if(typeof actualizarGruposSidebar==='function')actualizarGruposSidebar();
      return r;
    };
  }
})();
