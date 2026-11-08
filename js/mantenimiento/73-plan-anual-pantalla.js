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
  const UI={maquina:'',anio:0,linea:'',conRegistros:false};      // conRegistros pasará a true cuando exista el módulo de registros

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
  function celdaSemanas(a,actual){
    const sem=N.leerSemanas;
    return N.MESES.map((_,i)=>{
      const nums=sem((a.semanas_por_mes||[])[i]).semanas;
      return '<td class="mp-mes">'+nums.map(s=>{
        const est=N.estadoSemana(s,actual&&actual.anio===a.anio?actual:null,{conRegistros:UI.conRegistros});
        const r=N.rangoSemana(a.anio,s);
        return '<span class="mp-sem mp-'+est+'" title="Semana '+s+' · '+N.ddmm(r.desde)+' al '+N.ddmm(r.hasta)+(est==='actual'?' · semana en curso':'')+'">'+s+'</span>';
      }).join('')+'</td>';
    }).join('');
  }
  function filaActividad(a,actual,editar){
    const p=N.partirActividad(a.actividad);
    const act='<b>'+esc(p.equipo)+'</b>'+(p.tarea?' <span class="mp-tarea">/ '+esc(p.tarea)+'</span>':'');
    let celdas;
    if(a.es_todo_el_anio){
      const av=N.avanceAnio(actual,a.anio);
      celdas='<td class="mp-todo" colspan="12"><div class="mp-barra" role="img" aria-label="Semanas 1 a 52, '+av.transcurridas+' de '+av.total+' transcurridas"><i style="width:'+av.pct+'%"></i></div>'+
        '<span class="mp-barra-txt">1 – 52'+(actual&&actual.anio===a.anio?' · S'+actual.semana+' en curso':'')+'</span></td>';
    }else celdas=celdaSemanas(a,actual);
    return '<tr data-mp-fila="'+esc(a.id)+'"><td class="mp-item">'+esc(a.item)+'</td><td class="mp-act">'+act+'</td><td class="mp-ins">'+esc(a.insumos)+'</td><td class="mp-n">'+esc(a.n_tecnicos)+'</td><td class="mp-frec">'+esc(a.frecuencia)+'</td>'+celdas+
      (editar?'<td class="mp-edit"><button type="button" class="btn btn-ghost btn-sm" data-mp-editar="'+esc(a.id)+'" aria-label="Editar actividad">✎</button></td>':'')+'</tr>';
  }
  function tarjetas(r,actual){
    const t=(titulo,valor,sub,cls)=>'<div class="mp-card '+(cls||'')+'"><span>'+titulo+'</span><b>'+valor+'</b>'+(sub?'<small>'+sub+'</small>':'')+'</div>';
    const rs=actual?N.rangoSemana(actual.anio,actual.semana):null;
    return '<div class="mp-cards">'+t('Actividades en el plan',r.total)+
      t('Esta semana'+(actual?' (S'+actual.semana+' · '+(rs?N.ddmm(rs.desde)+' al '+N.ddmm(rs.hasta):'')+')':''),r.estaSemana+' actividades')+
      t('Próxima semana con extras',r.proxima?'S'+r.proxima.semana+' · +'+r.proxima.extras:'—',r.proxima?'actividades no semanales':'')+
      t('Vencidas sin registro',r.vencidas===null?'—':r.vencidas,r.vencidas===null?'se calculan con los registros (próxima etapa)':'',r.vencidas>0?'mp-rojo':'')+'</div>';
  }

  function pintar(main){
    estilos();
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
      const acts=D.actividadesDe(maq.id,UI.anio);
      const grupos=N.agruparPorBloque(acts);
      const r=N.resumen(acts,actual&&actual.anio===UI.anio?actual:null,{conRegistros:UI.conRegistros});
      const colg='<colgroup><col style="width:44px"><col style="width:240px"><col style="width:150px"><col style="width:52px"><col style="width:92px">'+N.MESES.map(()=>'<col style="width:44px">').join('')+(editar?'<col style="width:44px">':'')+'</colgroup>';
      const cab=colg+'<thead><tr><th rowspan="2">ÍTEM</th><th rowspan="2">ACTIVIDAD (COMPONENTE / TAREA)</th><th rowspan="2">INSUMOS</th><th rowspan="2" title="Número de técnicos">N° TÉC.</th><th rowspan="2">FRECUENCIA</th><th colspan="12">MES / SEMANA</th>'+(editar?'<th rowspan="2"></th>':'')+'</tr>'+
        '<tr>'+N.MESES.map((m,i)=>'<th class="mp-th-mes" title="'+N.MESES_NOMBRE[i]+'">'+m+'</th>').join('')+'</tr></thead>';
      const cols=5+12+(editar?1:0);
      const filas=grupos.map(g=>'<tr class="mp-grupo"><td colspan="'+cols+'"><b>'+esc(g.frecuencia)+'</b> <span>'+g.items.length+' actividad'+(g.items.length===1?'':'es')+'</span></td></tr>'+g.items.map(a=>filaActividad(a,actual,editar)).join('')).join('');
      cuerpo=(maq.pendiente_confirmar?'<div class="mp-aviso mp-aviso-amb"><b>Pendiente de confirmar:</b> todavía no se sabe a qué línea pertenece esta máquina. No está asignada a PET1 ni a PET2.</div>':'')+
        tarjetas(r,actual&&actual.anio===UI.anio?actual:null)+
        '<div class="mp-leyenda"><span><i class="mp-sem mp-ejecutada"></i>Ejecutada</span><span><i class="mp-sem mp-actual"></i>Semana actual</span><span><i class="mp-sem mp-programada"></i>Programada</span><span><i class="mp-sem mp-vencida"></i>Vencida</span>'+
        '<em>'+(editar?'Puedes editar el plan (supervisor / jefe de Mantenimiento).':'Solo el Supervisor / Jefe de Mantenimiento puede editar.')+'</em></div>'+
        (acts.length?'<div class="mp-tw"><table class="mp-t">'+cab+'<tbody>'+filas+'</tbody></table></div>':'<div class="mp-aviso">Esta máquina no tiene actividades para '+UI.anio+'.</div>')+
        '<p class="mp-pie">Los números dentro de cada mes son las semanas programadas, igual que en el Excel PLAN-PROGRAMA MTTO '+UI.anio+'. Los textos se muestran tal cual vienen del plan.</p>';
    }
    const anios=D.anios();
    const lineas=[...new Set(c.maquinas.filter(m=>m.activo!==false).map(m=>m.linea_impresion||'PET'))];
    main.innerHTML='<section class="mp" id="mp-raiz">'+
      '<header class="mp-cab"><div><small>Planta de Agua · '+esc(UI.linea)+' · Programa '+UI.anio+'</small><h2>Plan de mantenimiento'+(maq?' · '+esc(maq.nombre):'')+'</h2></div>'+
      '<div class="mp-filtros"><span class="mp-vivo '+(c.enVivo?'on':'')+'" role="status">'+(c.enVivo?'● En vivo':'○ Sin tiempo real')+'</span>'+
      '<label>Línea<select data-mp-linea>'+lineas.map(l=>'<option'+(l===UI.linea?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select></label>'+
      '<label>Año<select data-mp-anio>'+(anios.length?anios:[UI.anio]).map(a=>'<option'+(a===UI.anio?' selected':'')+'>'+a+'</option>').join('')+'</select></label>'+
      (editar&&maq?'<button type="button" class="btn btn-primary" data-mp-nueva>+ Actividad</button>':'')+'</div></header>'+
      '<nav class="mp-chips" aria-label="Máquinas">'+ms.map(m=>'<button type="button" class="mp-chip'+(m.id===UI.maquina?' on':'')+(m.pendiente_confirmar?' pend':'')+'" data-mp-maq="'+esc(m.id)+'" aria-pressed="'+(m.id===UI.maquina)+'" title="'+esc(m.nombre)+(m.pendiente_confirmar?' · pendiente de confirmar a qué línea pertenece':'')+'">'+esc(m.codigo_hoja)+(m.pendiente_confirmar?' <b>?</b>':'')+'</button>').join('')+'</nav>'+
      cuerpo+'</section>';
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
    setTimeout(()=>{try{q('#mpe-act').focus();}catch(_){/* ya cerrado */}},50);
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
    if(e.target.closest('[data-mp-nueva]')){abrirEdicion('');return;}
    if(e.target.closest('[data-mp-recargar]')){D.cargar();return;}
  });
  document.addEventListener('change',e=>{
    const t=e.target;if(!t||!t.closest||!t.closest('#mp-raiz'))return;
    if(t.hasAttribute('data-mp-linea')){UI.linea=t.value;UI.maquina='';repintar(true);}
    if(t.hasAttribute('data-mp-anio')){UI.anio=Number(t.value)||UI.anio;repintar(true);}
  });

  /* ---------- estilos (variables de la paleta del logo) ---------- */
  function estilos(){
    if(document.getElementById('mp-estilos'))return;
    const s=document.createElement('style');s.id='mp-estilos';
    s.textContent='.mp{max-width:1280px;margin:0 auto;padding:4px 2px 24px}.mp-cab{display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px}'+
      '.mp-cab small{color:#5b6b79;font-size:12px}.mp-cab h2{margin:2px 0 0;font-size:22px}.mp-filtros{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}.mp-filtros label{display:flex;flex-direction:column;font-size:11.5px;color:#5b6b79;gap:2px}'+
      '.mp-filtros select{min-height:38px;border:1px solid #cfdbe3;border-radius:8px;padding:0 10px;background:#fff;font-size:14px}.mp-vivo{font-size:12.5px;color:#7a8794;align-self:center}.mp-vivo.on{color:#1a7f4b;font-weight:600}'+
      '.mp-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}.mp-chip{border:1px solid #cfdbe3;background:#fff;border-radius:999px;padding:8px 14px;font-size:13px;cursor:pointer;min-height:38px}'+
      '.mp-chip.on{background:var(--brand-700,#0877A6);border-color:var(--brand-700,#0877A6);color:#fff;font-weight:600}.mp-chip.pend{border-style:dashed}.mp-chip b{color:#b26a00}.mp-chip.on b{color:#ffe7b3}'+
      '.mp-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:12px}.mp-card{background:#fff;border:1px solid #dbe5ee;border-radius:var(--card-radius,14px);padding:12px 14px;box-shadow:var(--card-shadow,0 1px 2px rgba(3,51,80,.05))}'+
      '.mp-card span{display:block;font-size:12px;color:#5b6b79}.mp-card b{display:block;font-size:22px;margin-top:4px;color:#033350}.mp-card small{color:#7a8794;font-size:11.5px}.mp-card.mp-rojo{border-color:#f0b9b9;background:#fff6f6}.mp-card.mp-rojo b{color:#b42318}'+
      '.mp-leyenda{display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:12.5px;color:#46627a;margin:0 0 8px}.mp-leyenda em{margin-left:auto;font-style:normal;color:#7a8794}.mp-leyenda i.mp-sem{width:16px;height:16px;padding:0;margin-right:5px;vertical-align:-3px}'+
      '.mp-tw{background:#fff;border:1px solid #dbe5ee;border-radius:var(--card-radius,14px);overflow:auto;max-height:78vh}.mp-t{border-collapse:separate;border-spacing:0;width:100%;min-width:1100px;table-layout:fixed;font-size:13px}'+
      '.mp-t th{background:#eef3fa;color:#033350;font-size:11.5px;letter-spacing:.03em;padding:8px 8px;text-align:center;position:sticky;top:0;z-index:2;border-bottom:1px solid #dbe5ee}.mp-t thead tr:nth-child(2) th{top:34px}'+
      '.mp-t td{padding:7px 8px;border-bottom:1px solid #edf2f7;vertical-align:middle}.mp-grupo td{background:#f6f9fc;font-size:12.5px;color:#033350;border-bottom:1px solid #dbe5ee}.mp-grupo span{color:#7a8794;font-weight:400;margin-left:6px}'+
      '.mp-item,.mp-n{text-align:center;color:#46627a;width:44px}.mp-act{overflow-wrap:anywhere}.mp-tarea{color:#46627a}.mp-ins{color:#46627a;font-size:12px;overflow-wrap:anywhere}.mp-frec{font-size:11.5px;color:#46627a;white-space:nowrap}'+
      '.mp-mes{text-align:center;min-width:44px;white-space:normal}.mp-todo{padding:6px 10px}.mp-barra{height:10px;border-radius:6px;background:#e4ecf3;overflow:hidden;display:inline-block;width:calc(100% - 140px);vertical-align:middle;min-width:100px}'+
      '.mp-barra i{display:block;height:100%;background:linear-gradient(90deg,#8ec9e6,var(--brand,#0DB5F3))}.mp-barra-txt{font-size:12px;color:#46627a;margin-left:8px;white-space:nowrap}'+
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
