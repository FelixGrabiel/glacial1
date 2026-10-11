/* =============================================================
   PLANIFICACIÓN · PANTALLA (Parte A)
   Pestañas: Programación, Vista semanal, Catálogo, Solicitudes y Cumplimiento.
   Esta parte dibuja la estructura y la pestaña Programación; las demás se registran en
   glacialPlanificacion.pestanas desde 53 y 54.
   Quien tiene el permiso «planificacion» crea y edita; los demás ven el plan en solo lectura.
   renderMain() llama directamente a renderPlanificacion() (06-registro.js).
   ============================================================= */
(function(){
  'use strict';
  const NS=window.glacialPlanificacion;
  const {num,esc,iso,addDias,fechaOk,ahoraMs}=NS.util;
  const G=()=>window.GlacialIndicadores;
  const LF='\n';   // salto de línea de los mensajes de confirmación (antes no estaba definido y importar con posible duplicado fallaba)

  const TABS=[
    {clave:'programacion',titulo:'Programación'},
    {clave:'semanal',titulo:'Vista semanal'},
    {clave:'catalogo',titulo:'Catálogo'},
    {clave:'solicitudes',titulo:'Solicitudes'},
    {clave:'cumplimiento',titulo:'Cumplimiento'}
  ];
  NS.TABS=TABS;

  /* ---------- estado de la pantalla (por dispositivo: solo qué se está mirando) ---------- */
  function iniciarEstado(){
    if(NS.estado&&NS.estado.fecha)return;
    let fecha=iso(new Date(ahoraMs())),turno='DÍA';
    try{const t=G().turnoVigente(ahoraMs());fecha=t.fecha;turno=NS.valorBloque(t.turno);}catch(_){/* hoy */}
    NS.estado=Object.assign({tab:'programacion',fecha,turno,semana:fecha},NS.estado||{});
    if(!NS.estado.fecha)NS.estado.fecha=fecha;
  }

  const CSS=`
    #plan-root .plan-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 14px;border-bottom:1px solid #d9e2e8}
    #plan-root .plan-tab{border:0;background:none;padding:9px 14px;font:inherit;font-weight:700;color:#5a6b78;cursor:pointer;border-bottom:3px solid transparent}
    #plan-root .plan-tab.active{color:#003b5c;border-bottom-color:#005b96}
    #plan-root .plan-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px}
    #plan-root .plan-bar label{font-size:12px;color:#5a6b78;display:flex;flex-direction:column;gap:3px}
    #plan-root .plan-turnos{display:flex;gap:6px}
    #plan-root .plan-pill{border:1px solid #cfdbe3;background:#fff;border-radius:999px;padding:6px 14px;font:inherit;font-weight:600;cursor:pointer;color:#405261}
    #plan-root .plan-pill.active{background:#003b5c;border-color:#003b5c;color:#fff}
    #plan-root table.plan-tabla{width:100%;border-collapse:collapse;font-size:13px;background:#fff}
    #plan-root .plan-tabla th{background:#eef3f7;color:#3d5365;text-align:left;padding:8px 10px;font-size:12px;border-bottom:1px solid #d9e2e8}
    #plan-root .plan-tabla td{padding:8px 10px;border-bottom:1px solid #edf1f4;vertical-align:middle}
    #plan-root .plan-tabla td.num,#plan-root .plan-tabla th.num{text-align:right;font-variant-numeric:tabular-nums}
    #plan-root .plan-sin td{background:#fff8e6;color:#8a6d1d}
    #plan-root .plan-linea td{background:#f6f9fb;font-weight:700;color:#003b5c}
    #plan-root .plan-badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#e6f0f7;color:#003b5c}
    #plan-root .plan-badge.prod{background:#e1f4e8;color:#1e7f4e}
    #plan-root .plan-badge.pausa{background:#fff4d6;color:#8a6d1d}
    #plan-root .plan-badge.stop{background:#fde6e6;color:#a32020}
    #plan-root .plan-badge.fin{background:#e8eef2;color:#5a6b78}
    /* Colores de estado: los mismos de Producción Actual (EN CURSO naranja, PAUSA amarillo, DETENIDA rojo, FINALIZADA verde, PENDIENTE gris). */
    #plan-root .plan-badge.est-curso{background:#FFEDD5;color:#9A3412}
    #plan-root .plan-badge.est-pausa{background:#FEF9C3;color:#713F12}
    #plan-root .plan-badge.est-det{background:#FEE2E2;color:#991B1B}
    #plan-root .plan-badge.est-fin{background:#DCFCE7;color:#166534}
    #plan-root .plan-badge.est-pend{background:#F3F4F6;color:#4B5563}
    #plan-root .plan-badge.est-canc{background:#E5E7EB;color:#6B7280;text-decoration:line-through}
    #plan-root .plan-sub td{background:#f6f9fb;font-size:12px;color:#3d5365;border-bottom:2px solid #d9e2e8}
    #plan-root .plan-barra{display:inline-block;width:64px;height:8px;border-radius:99px;background:#e5e9ee;overflow:hidden;vertical-align:middle;margin-right:6px}
    #plan-root .plan-barra i{display:block;height:100%;background:#F97316}
    #plan-root .plan-meta{display:inline-block;margin-top:3px;padding:1px 8px;border-radius:99px;font-size:11px;font-weight:700;background:#DCFCE7;color:#166534}
    #plan-root .plan-repro{display:block;font-size:11px;color:#9A3412}
    #plan-root .plan-repro-box{margin-top:12px;padding:10px 12px;border:1px solid #fed7aa;background:#fff7ed;border-radius:8px;font-size:13px;color:#7c2d12}
    #plan-root .plan-repro-box ul{margin:6px 0 0 18px;padding:0}
    #plan-root .plan-nota{font-size:12px;color:#5a6b78;margin:8px 0}
    #plan-root .plan-scroll{overflow-x:auto}
    .plan-fondo{position:fixed;inset:0;background:rgba(10,30,50,.55);z-index:10060;display:flex;align-items:center;justify-content:center;padding:16px}
    .plan-dialogo{background:#fff;border-radius:12px;padding:18px;width:100%;max-width:560px;max-height:92vh;overflow:auto;box-shadow:0 18px 55px rgba(0,0,0,.25)}
    .plan-dialogo.ancho{max-width:900px}
    .plan-dialogo h3{margin:0 0 10px;color:#003b5c}
    .plan-campos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .plan-campos label{font-size:12px;color:#5a6b78;display:flex;flex-direction:column;gap:3px}
    .plan-campos .completo{grid-column:1/-1}
    .plan-dialogo input,.plan-dialogo select,.plan-dialogo textarea,#plan-root input,#plan-root select{padding:7px 8px;border:1px solid #cfdbe3;border-radius:7px;font:inherit}
    .plan-error{color:#c62828;font-size:12px;min-height:16px;margin-top:8px;white-space:pre-line}
    .plan-aviso{color:#8a6d1d;font-size:12px;margin-top:6px;white-space:pre-line}
    .plan-acciones{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap}
    @media(max-width:640px){.plan-campos{grid-template-columns:1fr}}
  `;
  function estilos(){
    if(document.getElementById('plan-css'))return;
    const s=document.createElement('style');s.id='plan-css';s.textContent=CSS;document.head.appendChild(s);
  }

  /* ---------- diálogos ---------- */
  function abrirDialogo(html,ancho){
    const fondo=document.createElement('div');
    fondo.className='plan-fondo';
    fondo.innerHTML='<div class="plan-dialogo'+(ancho?' ancho':'')+'" role="dialog" aria-modal="true">'+html+'</div>';
    fondo.addEventListener('mousedown',e=>{if(e.target===fondo)fondo.remove();});
    document.body.appendChild(fondo);
    return fondo;
  }
  NS.abrirDialogo=abrirDialogo;

  /* ---------- armazón ---------- */
  window.renderPlanificacion=function(main){
    main=main||document.getElementById('main');
    if(!main)return;
    if(!NS.puedeVer()){
      main.innerHTML='<div class="empty-state"><h4>Sin acceso</h4><p>No tienes permiso para ver Planificación.</p></div>';
      return;
    }
    estilos();iniciarEstado();
    const solo=!NS.puede();
    main.innerHTML='<div id="plan-root"><div class="main-head"><div><h2>Planificación</h2>'+
      '<div class="sub">'+(solo?'Plan de producción · solo lectura (puedes pedir cambios en Solicitudes).':'Programa la producción por fecha, turno y línea. Los cambios se ven en todos los dispositivos al instante.')+'</div></div>'+
      (window.glacialEstadoDatos?'<div>'+window.glacialEstadoDatos.chip()+'</div>':'')+'</div>'+
      '<div class="plan-tabs" id="plan-tabs"></div><div id="plan-cuerpo"></div></div>';
    NS.pintarPestana();
  };

  NS.pintarPestana=function(){
    const raiz=document.getElementById('plan-root');
    if(!raiz)return;
    iniciarEstado();
    const tabs=document.getElementById('plan-tabs');
    tabs.innerHTML=TABS.map(t=>'<button type="button" class="plan-tab'+(t.clave===NS.estado.tab?' active':'')+'" data-plan-tab="'+t.clave+'">'+t.titulo+'</button>').join('');
    const cuerpo=document.getElementById('plan-cuerpo');
    const reg=NS.pestanas.find(p=>p.clave===NS.estado.tab);
    if(reg&&typeof reg.pintar==='function')reg.pintar(cuerpo);
    else cuerpo.innerHTML='<div class="empty-state"><h4>'+esc((TABS.find(t=>t.clave===NS.estado.tab)||{}).titulo||'')+'</h4><p>Esta pestaña se activa con la siguiente parte del módulo.</p></div>';
  };

  /* Cambio en vivo: solo se repinta la zona de datos de la pestaña abierta (no los controles ni los diálogos). */
  NS.repintar=function(){
    if(typeof state==='undefined'||!state.user||state.currentTab!=='planificacion'||!document.getElementById('plan-root'))return;
    const reg=NS.pestanas.find(p=>p.clave===NS.estado.tab);
    if(reg&&typeof reg.actualizar==='function')reg.actualizar();
  };

  document.addEventListener('click',e=>{
    const b=e.target.closest&&e.target.closest('[data-plan-tab]');
    if(!b||!b.closest('#plan-root'))return;
    NS.estado.tab=b.getAttribute('data-plan-tab');
    NS.pintarPestana();
  });

  /* =========================================================
     PESTAÑA PROGRAMACIÓN
     ========================================================= */
  const claseEstado=e=>e==='EN_PRODUCCION'?'est-curso':e==='PAUSA'?'est-pausa':(e==='DETENIDA'||e==='LISTA')?'est-det':e==='FINALIZADA'?'est-fin':e==='CANCELADA'?'est-canc':'est-pend';

  function pintarProgramacion(cont){
    const E=NS.estado,planifica=NS.puede();
    cont.innerHTML='<div class="plan-bar">'+
      '<label>Fecha<input type="date" id="plan-fecha" value="'+esc(E.fecha)+'"></label>'+
      '<div class="plan-turnos" role="group" aria-label="Turno">'+NS.BLOQUES.map(b=>'<button type="button" class="plan-pill'+(b.valor===NS.valorBloque(E.turno)?' active':'')+'" data-plan-turno="'+b.valor+'">'+esc(b.etq)+' <small style="font-weight:500">'+esc(NS.horarioBloque(b.valor))+'</small></button>').join('')+'</div>'+
      '<button type="button" class="btn btn-ghost btn-sm" data-plan-dia="-1">◀ Día anterior</button>'+
      '<button type="button" class="btn btn-ghost btn-sm" data-plan-dia="1">Día siguiente ▶</button>'+
      '<button type="button" class="btn btn-ghost btn-sm" data-plan-dia="hoy">Hoy</button>'+
      '<button type="button" class="btn btn-ghost btn-sm" data-plan-copiar-plan title="Copia el plan del bloque como texto para enviarlo al supervisor">Copiar plan</button>'+
      '<button type="button" class="btn btn-ghost btn-sm" data-plan-excel-plan>Excel del plan</button>'+
      (planifica?'<span style="flex:1"></span><button type="button" class="btn btn-ghost btn-sm" data-plan-copiar>Copiar programación…</button>'+
        '<button type="button" class="btn btn-ghost btn-sm" data-plan-excel>Importar Excel…</button>':'')+
      '</div><div id="plan-prog-tabla"></div>'+
      (planifica?'':'<p class="plan-nota">Solo lectura: para cambiar una cantidad o un producto, usa «Pedir cambio» en la fila. Si falta una programación, pídela desde Solicitudes.</p>');
    pintarTabla();
  }

  function pintarTabla(){
    const cont=document.getElementById('plan-prog-tabla');
    if(!cont)return;
    const E=NS.estado,planifica=NS.puede();
    const items=NS.items(E.fecha,E.turno);
    const duplicados=NS.duplicadosPosibles(E.fecha);
    const R=NS.resumenBloque(E.fecha,E.turno);
    const fmt=n=>num(n).toLocaleString('es-PE');
    const pctTxt=a=>a==null?'—':(a*100).toLocaleString('es-PE',{maximumFractionDigits:0})+' %';
    const barra=a=>a==null?'':'<span class="plan-barra" aria-hidden="true"><i style="width:'+Math.min(100,Math.round(a*100))+'%"></i></span>';
    let total=0;
    const filas=[];
    NS.lineas().forEach(l=>{
      const propios=items.filter(p=>p.linea===l.key);
      if(!propios.length){
        filas.push('<tr class="plan-sin"><td><b>'+esc(l.name)+'</b></td><td colspan="9">Sin programación</td><td></td><td class="acc">'+
          (planifica?'<button type="button" class="btn btn-ghost btn-sm" data-plan-nueva="'+esc(l.key)+'">+ Agregar</button>':
            '<button type="button" class="btn btn-ghost btn-sm" data-plan-pedir="'+esc(l.key)+'">Pedir programación</button>')+'</td></tr>');
        return;
      }
      const vistos=new Set();
      propios.forEach((p,i)=>{
        const cant=num(p.cantidadProgramada),upp=num(p.unidadesPorPaleta);
        const est=NS.estadoDe(p);
        if(est!=='CANCELADA')total+=cant;                  // las canceladas no participan en los totales activos
        const k=[p.linea,p.marca,p.presentacion].join('|'),g=R.grupos.get(k),primera=!vistos.has(k);vistos.add(k);
        let celdasAvance;
        if(!primera){
          celdasAvance='<td colspan="4" class="plan-nota" style="margin:0">incluido en la fila de arriba (mismo producto del bloque)</td>';
        }else if(!g||!(g.programado>0)){
          celdasAvance='<td class="num">—</td><td class="num">—</td><td class="num">—</td><td>—</td>';
        }else if(g.producido===null){
          celdasAvance='<td class="num" title="El turno cerrado no tiene registro del supervisor: no se asume cero.">Sin registro</td><td class="num">—</td><td class="num">—</td><td>—</td>';
        }else{
          celdasAvance='<td class="num">'+fmt(g.producido)+'</td><td class="num">'+(g.pendiente>0?fmt(g.pendiente):'—')+'</td><td class="num">'+(g.sobre>0?'<b style="color:#9A3412">+'+fmt(g.sobre)+'</b>':'—')+'</td>'+
            '<td>'+barra(g.avance)+pctTxt(g.avance)+(g.alcanzada?'<br><span class="plan-meta">Meta alcanzada</span>':'')+'</td>';
        }
        const orig=primera&&g?NS.originalDe(E.fecha,E.turno,p.linea,p.marca,p.presentacion):null;
        const repro=orig!==null&&g&&orig!==g.programado?'<span class="plan-repro" title="Plan al iniciar el bloque frente al plan vigente">original al inicio: '+fmt(orig)+'</span>':'';
        filas.push('<tr><td>'+(i===0?'<b>'+esc(l.name)+'</b>':'')+'</td><td>'+esc(p.marca)+(p.turno==='INTERMEDIO'?' <small style="color:#5a6b78">· Cargada como Intermedio</small>':'')+((p.unificadoDeIntermedio||[]).length?' <small style="color:#5a6b78" title="Unificada desde Intermedio con motivo y registro en el historial">· incluye '+(p.unificadoDeIntermedio.reduce((a,x)=>a+num(x.cantidad),0)).toLocaleString('es-PE')+' cargadas como Intermedio</small>':'')+(duplicados.has([p.linea,p.marca,p.presentacion].join('|'))&&(p.turno==='DÍA'||p.turno==='INTERMEDIO')?' <span class="plan-badge" style="background:#fff1d6;color:#8a5a1e" title="El mismo producto tiene la misma cantidad en Día e Intermedio: el programado del bloque es la SUMA. Revísalo; no se corrige solo.">posible duplicado</span>':'')+'</td><td>'+esc(NS.etiquetaPresentacion(p.linea,p.marca,p.presentacion))+'</td>'+
          '<td class="num">'+fmt(cant)+repro+'</td><td class="num">'+(upp?fmt(upp):'—')+'</td>'+
          '<td class="num" title="'+(upp?esc(NS.paletasEquivalentes(cant,upp).toLocaleString('es-PE',{maximumFractionDigits:2}))+' paletas equivalentes':'')+'">'+(upp?esc(NS.paletasTexto(cant,upp)):'—')+'</td>'+
          celdasAvance+
          '<td><span class="plan-badge '+claseEstado(est)+'">'+esc(NS.estadoTexto(est))+'</span></td><td class="acc">'+
          (planifica?'<button type="button" class="btn btn-ghost btn-sm" data-plan-editar="'+esc(p.clave)+'">Editar</button>':
            '<button type="button" class="btn btn-ghost btn-sm" data-plan-cambio="'+esc(p.clave)+'">Pedir cambio</button>')+
          (planifica&&NS.puedeUnificar(p)?' <button type="button" class="btn btn-ghost btn-sm" data-plan-unificar="'+esc(p.clave)+'">Unificar en Mañana</button>':'')+(planifica&&i===propios.length-1?' <button type="button" class="btn btn-ghost btn-sm" data-plan-nueva="'+esc(l.key)+'">+ Agregar</button>':'')+'</td></tr>');
      });
      const t=R.porLinea.get(l.key);
      if(t&&t.productos>0){
        const av=t.programado>0&&!t.sinRegistro?t.producido/t.programado:null;
        filas.push('<tr class="plan-sub"><td colspan="3">Subtotal '+esc(l.name)+' <small>(UND de esta línea)</small></td><td class="num"><b>'+fmt(t.programado)+'</b></td><td></td><td></td>'+
          '<td class="num">'+fmt(t.producido)+'</td><td class="num">'+(t.pendiente>0?fmt(t.pendiente):'—')+'</td><td class="num">'+(t.sobre>0?'+'+fmt(t.sobre):'—')+'</td>'+
          '<td>'+barra(av)+pctTxt(av)+'</td><td colspan="2">'+(t.sinRegistro?t.sinRegistro+' producto(s) sin registro (no suman al producido)':'')+'</td></tr>');
      }
    });
    const cambios=NS.cambiosDesdeInicio(E.fecha,E.turno);
    cont.innerHTML='<div class="plan-scroll"><table class="plan-tabla"><thead><tr><th>Línea</th><th>Marca</th><th>Presentación</th><th class="num">Cantidad (UND)</th>'+
      '<th class="num">UND por paleta</th><th class="num" title="Paletas completas + UND restantes">Paletas (completas + UND)</th><th class="num">Producido (UND)</th><th class="num">Pendiente</th><th class="num">Sobreproducción</th><th>Avance</th><th>Estado</th><th></th></tr></thead><tbody>'+filas.join('')+
      '</tbody><tfoot><tr><td colspan="3"><b>Total del bloque</b><br><small style="color:#5a6b78">Suma de UND de todas las líneas: solo referencia, no mide capacidad.</small></td><td class="num"><b>'+fmt(total)+'</b></td><td colspan="8"></td></tr></tfoot></table></div>'+
      '<p class="plan-nota">Producido: turno en curso = Paletas; turno cerrado = registro del turno. «Sin registro» no es cero. «Meta alcanzada» (cantidad producida ≥ programada) es distinto del estado «Finalizada».</p>'+
      (cambios.length?'<div class="plan-repro-box"><b>Reprogramado después del inicio del bloque</b> (plan original al iniciar → vigente):<ul>'+cambios.map(c=>'<li>'+esc(NS.nombreLinea(c.linea))+' · '+esc(c.marca)+' '+esc(NS.etiquetaPresentacion(c.linea,c.marca,c.presentacion))+': '+fmt(c.original)+' → '+fmt(c.vigente)+' UND'+(c.vigente===0?' (se quitó)':c.original===0?' (se agregó)':'')+'</li>').join('')+'</ul></div>':'')+
      (planifica&&NS.compromisoFallo?'<p class="plan-nota" style="color:#9A3412">No se pudo guardar el plan original del bloque ('+esc(NS.compromisoFallo)+'). El cambio de plan sí se guardó; revisa que las reglas estén publicadas.</p>':'');
  }

  /* ---------- crear o editar una programación ---------- */
  function abrirEdicion(base){
    if(!NS.puede())return;
    const E=NS.estado;
    const existente=base&&base.clave?NS.programaciones().find(p=>p.clave===base.clave):null;
    const f=Object.assign({linea:'',marca:'',presentacion:'',cantidad:'',upp:''},existente?{
      linea:existente.linea,marca:existente.marca,presentacion:existente.presentacion,
      cantidad:num(existente.cantidadProgramada),upp:num(existente.unidadesPorPaleta)}:base||{});
    f.fecha=E.fecha;f.turno=existente?existente.turno:NS.valorBloque(E.turno);   // una fila existente conserva su turno; lo nuevo de Día + Intermedio va en la fila DÍA
    // Versión de la fila que la persona VIO al abrir (null = no existía). Al guardar se comprueba en la transacción: si otra persona la cambió, no se pisa.
    let visto=existente?num(existente.version):null;
    const opcionesLinea=NS.lineas().map(l=>'<option value="'+esc(l.key)+'"'+(l.key===f.linea?' selected':'')+'>'+esc(l.name)+'</option>').join('');
    const fondo=abrirDialogo('<h3>'+(existente?'Editar programación':'Nueva programación')+'</h3>'+
      '<div class="small-muted" style="margin-bottom:10px">'+esc(f.fecha)+' · '+esc(f.turno)+'</div>'+
      '<div class="plan-campos">'+
      '<label>Línea<select id="pe-linea"'+(existente?' disabled':'')+'>'+opcionesLinea+'</select></label>'+
      '<label>Marca<select id="pe-marca"'+(existente?' disabled':'')+'></select></label>'+
      '<label class="completo">Presentación<select id="pe-pres"'+(existente?' disabled':'')+'></select></label>'+
      '<label>Cantidad programada (UND)<input type="number" id="pe-cant" min="1" step="1" inputmode="numeric" value="'+esc(f.cantidad)+'"></label>'+
      '<label>Unidades por paleta<input type="number" id="pe-upp" min="1" step="1" inputmode="numeric" value="'+esc(f.upp)+'"></label>'+
      '<label class="completo">Paletas equivalentes<input type="text" id="pe-eq" readonly></label>'+
      '<label class="completo" id="pe-motivo-bloque" style="display:none">Motivo del cambio (obligatorio: ya está en producción)<textarea id="pe-motivo" rows="2"></textarea></label>'+
      '</div><div class="plan-aviso" id="pe-aviso"></div><div class="plan-aviso" id="pe-conflicto" style="display:none;background:#fff1d6;border:1px solid #f0d98c;border-radius:8px;padding:8px 10px;color:#6b4a00"></div><div class="plan-error" id="pe-error"></div>'+
      '<div class="plan-acciones">'+(existente?'<button type="button" class="btn btn-ghost" id="pe-quitar" style="margin-right:auto;color:#a32020">Quitar programación</button>':'')+
      '<button type="button" class="btn btn-ghost" id="pe-cancelar">Cancelar</button><button type="button" class="btn btn-primary" id="pe-guardar">Guardar</button></div>');
    const q=id=>fondo.querySelector('#'+id);
    const llenarMarcas=()=>{
      const l=q('pe-linea').value;
      q('pe-marca').innerHTML='<option value="">Selecciona…</option>'+NS.marcas(l).map(m=>'<option value="'+esc(m)+'"'+(m===f.marca?' selected':'')+'>'+esc(m)+'</option>').join('');
      q('pe-pres').innerHTML='<option value="">Selecciona…</option>'+NS.presentaciones(l).map(p=>'<option value="'+esc(p.value)+'"'+(p.value===f.presentacion?' selected':'')+'>'+esc(p.label)+'</option>').join('');
    };
    const refrescarCampos=()=>{
      const l=q('pe-linea').value,m=q('pe-marca').value,p=q('pe-pres').value;
      const upp=num(q('pe-upp').value),cant=num(q('pe-cant').value);
      q('pe-eq').value=upp>0&&cant>0?(cant/upp).toLocaleString('es-PE',{maximumFractionDigits:1})+' paletas':'—';
      const ex=l&&m&&p?NS.existente(l,f.fecha,f.turno,m,p):null;
      const exige=!!ex&&num(ex.cantidadProgramada)>0&&NS.enProduccion(ex);
      q('pe-motivo-bloque').style.display=exige?'':'none';
      const v=NS.validar({linea:l,fecha:f.fecha,turno:f.turno,marca:m,presentacion:p,cantidad:q('pe-cant').value,upp:q('pe-upp').value});
      q('pe-aviso').textContent=v.avisos.join('\n');
    };
    /* Fila vigente de lo que se está editando (la que otra persona pudo cambiar). */
    const filaActual=()=>{
      const l=q('pe-linea').value,m=q('pe-marca').value,p=q('pe-pres').value;
      if(!l||!m||!p)return null;
      const ex=NS.existente(l,f.fecha,NS.turnoDeGuardado({linea:l,fecha:f.fecha,turno:f.turno,marca:m,presentacion:p}),m,p);
      return ex&&num(ex.cantidadProgramada)>0?ex:null;
    };
    const capturarVisto=()=>{if(existente)return;const ex=filaActual();visto=ex?num(ex.version):null;};
    /* Aviso en vivo (sin tocar lo que la persona escribe): si la fila cambió desde que se abrió, se muestra el valor actual. */
    let bloqueado=false;   // hay un conflicto del servidor sin resolver: el aviso en vivo no lo oculta
    const mostrarCambioRemoto=()=>{
      const box=q('pe-conflicto');if(!box||bloqueado)return;
      refrescarCampos();                           // el aviso «ya existe… se reemplazará» se recalcula con lo vigente (no toca lo escrito)
      const ex=filaActual(),actualV=ex?num(ex.version):null;
      if(actualV===visto){box.style.display='none';box.innerHTML='';return;}
      box.style.display='';
      box.innerHTML=(ex?'Otra persona cambió esta programación mientras la editabas. Valor actual: <b>'+num(ex.cantidadProgramada).toLocaleString('es-PE')+' UND</b> ('+num(ex.unidadesPorPaleta).toLocaleString('es-PE')+' por paleta, '+esc(NS.estadoTexto(NS.estadoDe(ex)).toLowerCase())+'). No se guardará encima.'
        :'Esta programación ya no existe (otra persona la quitó).')+' <button type="button" class="btn btn-ghost btn-sm" id="pe-recargar">Cargar valor actual</button>';
      q('pe-recargar').onclick=()=>{
        if(ex){q('pe-cant').value=num(ex.cantidadProgramada);q('pe-upp').value=num(ex.unidadesPorPaleta);}
        visto=actualV;box.style.display='none';box.innerHTML='';q('pe-error').textContent='';q('pe-guardar').disabled=false;refrescarCampos();
      };
    };
    /* Conflicto detectado por el servidor al guardar: el propio error trae el valor actual (puede ir un instante por delante de la copia local). */
    const mostrarConflictoError=e=>{
      const box=q('pe-conflicto');if(!box)return;
      const a=e.actual;
      box.style.display='';
      box.innerHTML=esc(e.message)+' <button type="button" class="btn btn-ghost btn-sm" id="pe-recargar">Cargar valor actual</button>';
      q('pe-guardar').disabled=true;bloqueado=true;
      q('pe-recargar').onclick=()=>{
        if(a){q('pe-cant').value=a.cantidad;q('pe-upp').value=a.unidadesPorPaleta;}
        bloqueado=false;visto=a?num(a.version):null;box.style.display='none';box.innerHTML='';q('pe-error').textContent='';q('pe-guardar').disabled=false;refrescarCampos();
      };
    };
    const vigilar=()=>{
      if(!document.body.contains(fondo)){const i=NS.alRefrescar.indexOf(vigilar);if(i>=0)NS.alRefrescar.splice(i,1);return;}
      mostrarCambioRemoto();
    };
    NS.alRefrescar.push(vigilar);
    llenarMarcas();capturarVisto();
    q('pe-linea').addEventListener('change',()=>{f.marca='';f.presentacion='';llenarMarcas();capturarVisto();refrescarCampos();mostrarCambioRemoto();});
    ['pe-marca','pe-pres'].forEach(id=>q(id).addEventListener('change',()=>{
      const l=q('pe-linea').value,m=q('pe-marca').value,p=q('pe-pres').value;
      if(!existente&&l&&m&&p){const s=NS.uppSugerida(l,m,p);if(s>0)q('pe-upp').value=s;}
      capturarVisto();refrescarCampos();mostrarCambioRemoto();
    }));
    ['pe-cant','pe-upp'].forEach(id=>q(id).addEventListener('input',refrescarCampos));
    refrescarCampos();
    q('pe-cancelar').onclick=()=>fondo.remove();
    q('pe-guardar').onclick=async()=>{
      const fila={linea:q('pe-linea').value,fecha:f.fecha,turno:f.turno,marca:q('pe-marca').value,presentacion:q('pe-pres').value,cantidad:q('pe-cant').value,upp:q('pe-upp').value};
      const motivo=q('pe-motivo').value.trim();
      q('pe-guardar').disabled=true;q('pe-error').textContent='';
      try{await NS.guardar(fila,{motivo,versionEsperada:visto});fondo.remove();pintarTabla();}
      catch(e){
        q('pe-error').textContent=e&&e.conflicto?'':(e&&e.message)||String(e);
        q('pe-guardar').disabled=false;
        if(e&&e.conflicto)mostrarConflictoError(e);   // se muestra el valor actual; hay que cargarlo para poder guardar de nuevo
      }
    };
    const quitar=q('pe-quitar');
    if(quitar)quitar.onclick=async()=>{
      const enProd=NS.enProduccion(existente);
      const motivo=enProd?(prompt('Esta programación ya está en producción. Motivo para quitarla (mínimo 5 caracteres):')||'').trim():'';
      if(enProd&&motivo.length<5){q('pe-error').textContent='Hace falta un motivo de al menos 5 caracteres.';return;}
      if(!enProd&&!confirm('¿Quitar esta programación?'))return;
      try{await NS.quitar(existente,motivo,{versionEsperada:visto});fondo.remove();pintarTabla();}
      catch(e){if(e&&e.conflicto)mostrarConflictoError(e);q('pe-error').textContent=e&&e.conflicto?'':(e&&e.message)||String(e);}
    };
  }
  NS.abrirEdicion=abrirEdicion;

  /* ---------- copiar programación ---------- */
  function abrirCopia(){
    if(!NS.puede())return;
    const E=NS.estado;
    const fondo=abrirDialogo('<h3>Copiar programación</h3><div class="small-muted">Destino: '+esc(E.fecha)+'</div>'+
      '<div style="display:grid;gap:8px;margin:12px 0;font-size:14px">'+
      '<label><input type="radio" name="pc-modo" value="DIA_ANTERIOR" checked> Del día anterior ('+esc(addDias(E.fecha,-1))+')</label>'+
      '<label><input type="radio" name="pc-modo" value="SEMANA_PASADA"> Del mismo día de la semana pasada ('+esc(addDias(E.fecha,-7))+')</label>'+
      '<label><input type="radio" name="pc-modo" value="SEMANA_COMPLETA"> De una semana completa (la semana anterior a la de esta fecha, lunes a domingo)</label>'+
      '<label><input type="checkbox" id="pc-solo"> Solo el bloque seleccionado ('+esc(NS.etiquetaBloque(E.turno))+')</label>'+
      '<label><input type="checkbox" id="pc-reemplazar"> Reemplazar las que ya existen (las que están en producción nunca se tocan)</label></div>'+
      '<div id="pc-vista" class="plan-nota"></div><div class="plan-error" id="pc-error"></div>'+
      '<div class="plan-acciones"><button type="button" class="btn btn-ghost" id="pc-cancelar">Cancelar</button><button type="button" class="btn btn-primary" id="pc-aplicar" disabled>Copiar</button></div>',true);
    const q=id=>fondo.querySelector('#'+id);
    let plan=null;
    const calcular=()=>{
      const modo=fondo.querySelector('input[name="pc-modo"]:checked').value;
      plan=NS.planCopia({modo,fecha:E.fecha,soloTurno:q('pc-solo').checked?E.turno:'',reemplazar:q('pc-reemplazar').checked});
      q('pc-vista').innerHTML='<b>'+plan.candidatos.length+'</b> programación(es) para copiar'+(plan.omitidos.length?' · '+plan.omitidos.length+' omitida(s)':'')+
        (plan.omitidos.length?'<ul style="margin:6px 0 0 18px;max-height:140px;overflow:auto">'+plan.omitidos.slice(0,30).map(o=>'<li>'+esc(o.texto)+'</li>').join('')+'</ul>':'');
      q('pc-aplicar').disabled=!plan.candidatos.length;
    };
    fondo.addEventListener('change',calcular);calcular();
    q('pc-cancelar').onclick=()=>fondo.remove();
    q('pc-aplicar').onclick=async()=>{
      q('pc-aplicar').disabled=true;q('pc-error').textContent='Copiando…';
      const modo=fondo.querySelector('input[name="pc-modo"]:checked').value;
      const motivoFila='Copia de programación ('+modo.toLowerCase().replace(/_/g,' ')+')';
      const r=await NS.aplicarLote(plan.candidatos,{accion:'COPIA',motivo:motivoFila});
      if(r.fallos.length){q('pc-error').textContent=r.ok.length+' copiada(s); '+r.fallos.length+' con error:\n'+r.fallos.slice(0,5).map(x=>x.error).join('\n');q('pc-aplicar').disabled=false;calcular();}
      else{fondo.remove();}
      pintarTabla();
    };
  }

  /* ---------- importar Excel ---------- */
  function abrirImportacion(){
    if(!NS.puede())return;
    const fondo=abrirDialogo('<h3>Importar programación desde Excel</h3>'+
      '<p class="plan-nota">Columnas de la primera hoja: <b>'+NS.COLUMNAS_EXCEL.join(' · ')+'</b>. «Unidades por paleta» es opcional (si falta se usa el catálogo). Revisa la vista previa antes de importar.</p>'+
      '<input type="file" id="pi-archivo" accept=".xlsx,.xls">'+
      ' <button type="button" class="btn btn-ghost btn-sm" id="pi-plantilla">Descargar plantilla</button>'+
      '<div id="pi-vista" style="margin-top:12px"></div><div class="plan-error" id="pi-error"></div>'+
      '<div class="plan-acciones"><button type="button" class="btn btn-ghost" id="pi-cancelar">Cancelar</button><button type="button" class="btn btn-primary" id="pi-aplicar" disabled>Importar</button></div>',true);
    const q=id=>fondo.querySelector('#'+id);
    let lectura=null;
    q('pi-cancelar').onclick=()=>fondo.remove();
    q('pi-plantilla').onclick=()=>NS.descargarPlantilla();
    q('pi-archivo').onchange=async e=>{
      const archivo=e.target.files&&e.target.files[0];if(!archivo)return;
      q('pi-error').textContent='';q('pi-vista').innerHTML='';q('pi-aplicar').disabled=true;
      try{
        lectura=await NS.leerExcel(archivo);
        const buenas=lectura.filas.filter(x=>!x.errores.length);
        q('pi-vista').innerHTML='<p><b>'+buenas.length+'</b> fila(s) válidas de '+lectura.filas.length+'.</p><div class="plan-scroll" style="max-height:300px;overflow:auto"><table class="plan-tabla"><thead><tr><th>#</th><th>Fecha</th><th>Turno</th><th>Línea</th><th>Marca</th><th>Presentación</th><th class="num">Cantidad</th><th>Resultado</th></tr></thead><tbody>'+
          lectura.filas.map(x=>'<tr'+(x.errores.length?' class="plan-sin"':'')+'><td>'+x.numero+'</td><td>'+esc(x.fila.fecha)+'</td><td>'+esc(x.fila.turno)+'</td><td>'+esc(x.fila.linea)+'</td><td>'+esc(x.fila.marca)+'</td><td>'+esc(x.fila.presentacion)+'</td><td class="num">'+esc(x.fila.cantidad)+'</td><td>'+
            (x.errores.length?esc(x.errores.join(' ')):'OK'+(x.avisos.length?' · '+esc(x.avisos.join(' ')):''))+'</td></tr>').join('')+'</tbody></table></div>';
        q('pi-aplicar').disabled=!buenas.length;
      }catch(err){q('pi-error').textContent='No se pudo leer el Excel: '+((err&&err.message)||err);}
    };
    q('pi-aplicar').onclick=async()=>{
      const dudosas=lectura.filas.filter(x=>!x.errores.length&&x.posibleDuplicado);
      if(dudosas.length&&!confirm('Hay '+dudosas.length+' producto(s) con posible duplicado (misma cantidad en Mañana e Intermedio):'+LF+LF+dudosas.slice(0,8).map(x=>'· '+x.fila.marca+' '+x.fila.presentacion+' ('+x.fila.cantidad.toLocaleString('es-PE')+' UND)').join(LF)+LF+LF+'¿Confirmas que son cantidades distintas y quieres importar?'))return;
      const filas=lectura.filas.filter(x=>!x.errores.length).map(x=>x.fila);
      // Si el archivo repite un producto, gana la última fila.
      const ultimas=new Map();filas.forEach(f=>ultimas.set(NS.clave(f.linea,f.fecha,f.turno,f.marca,f.presentacion),f));
      q('pi-aplicar').disabled=true;q('pi-error').textContent='Importando…';
      const r=await NS.aplicarLote([...ultimas.values()],{accion:'IMPORTACION',motivo:'Importación desde Excel'});
      if(r.fallos.length){q('pi-error').textContent=r.ok.length+' importada(s); '+r.fallos.length+' con error:\n'+r.fallos.slice(0,6).map(x=>x.error).join('\n');q('pi-aplicar').disabled=false;}
      else{fondo.remove();if(r.ok.length){const f0=r.ok[0];NS.estado.fecha=f0.fecha;NS.estado.turno=f0.turno;NS.pintarPestana();}}
      pintarTabla();
    };
  }

  /* ---------- Unificar en Día (con motivo; queda en el historial) ---------- */
  function abrirUnificar(clave){
    const p=NS.programaciones().find(x=>x.clave===clave);
    if(!p||!NS.puedeUnificar(p)){alert('Esta programación ya no se puede unificar.');return;}
    const dia=NS.existente(p.linea,p.fecha,'DÍA',p.marca,p.presentacion),cantDia=dia?num(dia.cantidadProgramada):0;
    const fondo=abrirDialogo('<h3>Unificar en Mañana</h3><p style="font-size:14px">'+esc(NS.nombreLinea(p.linea))+' · '+esc(p.marca)+' '+esc(NS.etiquetaPresentacion(p.linea,p.marca,p.presentacion))+' · '+esc(p.fecha)+'<br>'+
      'Cargada como Intermedio: <b>'+num(p.cantidadProgramada).toLocaleString('es-PE')+' UND</b>'+(cantDia>0?' · en Mañana ya hay '+cantDia.toLocaleString('es-PE')+' UND → quedarán <b>'+(cantDia+num(p.cantidadProgramada)).toLocaleString('es-PE')+' UND</b> en Mañana':' · pasará a ser la programación de Mañana')+'.</p>'+
      '<p class="plan-nota">No cambia el programado del bloque. La fila de Intermedio se quita y queda el rastro en la fila de Mañana y en el historial. Las paletas, avances y paradas de Intermedio conservan su turno.</p>'+
      '<label class="completo">Motivo (obligatorio)<textarea id="un-motivo" rows="2" maxlength="200"></textarea></label><div class="plan-error" id="un-error"></div>'+
      '<div class="plan-acciones"><button type="button" class="btn btn-ghost" id="un-cancelar">Cancelar</button><button type="button" class="btn btn-primary" id="un-aplicar">Unificar en Mañana</button></div>');
    fondo.querySelector('#un-cancelar').onclick=()=>fondo.remove();
    fondo.querySelector('#un-aplicar').onclick=async()=>{
      const err=fondo.querySelector('#un-error'),btn=fondo.querySelector('#un-aplicar');
      btn.disabled=true;err.textContent='Unificando…';
      try{await NS.unificarEnDia(p,fondo.querySelector('#un-motivo').value);fondo.remove();NS.pintarPestana();}
      catch(e){err.textContent=(e&&e.message)||String(e);btn.disabled=false;}
    };
  }

  /* ---------- eventos de la pestaña ---------- */
  document.addEventListener('click',e=>{
    const raiz=e.target.closest&&e.target.closest('#plan-root');
    if(!raiz||NS.estado.tab!=='programacion')return;
    const E=NS.estado,t=e.target.closest('[data-plan-turno]');
    if(t){E.turno=NS.valorBloque(t.getAttribute('data-plan-turno'));NS.pintarPestana();return;}
    const dia=e.target.closest('[data-plan-dia]');
    if(dia){
      const v=dia.getAttribute('data-plan-dia');
      E.fecha=v==='hoy'?G().diaOperativo(ahoraMs()):addDias(E.fecha,Number(v));
      NS.pintarPestana();return;
    }
    const cp=e.target.closest('[data-plan-copiar-plan]');
    if(cp){NS.copiarPlan(E.fecha,E.turno).then(()=>{const t0=cp.textContent;cp.textContent='Copiado ✓';setTimeout(()=>{cp.textContent=t0;},1800);}).catch(()=>alert('No se pudo copiar el plan.'));return;}
    if(e.target.closest('[data-plan-excel-plan]')){NS.excelPlan(E.fecha,E.turno);return;}
    if(e.target.closest('[data-plan-copiar]')){abrirCopia();return;}
    if(e.target.closest('[data-plan-excel]')){abrirImportacion();return;}
    const nueva=e.target.closest('[data-plan-nueva]');
    if(nueva){abrirEdicion({linea:nueva.getAttribute('data-plan-nueva')});return;}
    const editar=e.target.closest('[data-plan-editar]');
    if(editar){abrirEdicion({clave:editar.getAttribute('data-plan-editar')});return;}
    const unif=e.target.closest('[data-plan-unificar]');
    if(unif){abrirUnificar(unif.getAttribute('data-plan-unificar'));return;}
    const cambio=e.target.closest('[data-plan-cambio]');
    if(cambio){
      const p=NS.programaciones().find(x=>x.clave===cambio.getAttribute('data-plan-cambio'));
      if(p&&typeof NS.solicitarCambio==='function')NS.solicitarCambio(p);
      return;
    }
    const pedir=e.target.closest('[data-plan-pedir]');
    if(pedir&&typeof NS.solicitarProgramacion==='function')NS.solicitarProgramacion(pedir.getAttribute('data-plan-pedir'),E.fecha,E.turno,'','');
  });
  document.addEventListener('change',e=>{
    if(e.target&&e.target.id==='plan-fecha'&&e.target.closest('#plan-root')){
      if(fechaOk(e.target.value)){NS.estado.fecha=e.target.value;NS.pintarPestana();}
    }
  });

  NS.pestanas.push({clave:'programacion',titulo:'Programación',orden:1,pintar:pintarProgramacion,actualizar:pintarTabla});
})();
