/* =============================================================
   GLACIAL · CUADRO DE ROTACIÓN TIPO EXCEL (componente compartido)
   -------------------------------------------------------------
   Lo usan las tres rotaciones: Supervisores (31), Mantenimiento (30) y Maquinistas (33). Es solo PRESENTACIÓN y EDICIÓN de la
   celda seleccionada: no guarda nada por sí mismo. Al pulsar «Aplicar» llama a la función global que le da cada módulo
   (cfg.aplicar), que usa el mecanismo de guardado, los permisos y la auditoría EXISTENTES.

   · Tabla HTML con bordes finos en todas las celdas; filas por persona (identidad = id estable, no el número de fila);
     encabezado fijo; columnas «#» y persona fijas al desplazar (scroll propio del contenedor, también en celular).
   · Cada celda muestra turno (negrita) y horario; DESCANSO solo el texto. «(+1 día)» solo si el horario cruza medianoche.
   · Clic o toque selecciona la celda (borde azul) y abre el editor inferior: Turno + Inicio + Fin (+ campos extra del módulo).
     Los valores viven en un borrador local hasta «Aplicar»; «Cancelar» o Esc lo descartan. Turno, inicio y fin se aplican JUNTOS.
   · Teclado: flechas entre celdas, Enter/F2 abre el editor, Esc cancela, Tab recorre sin atrapar el foco.
   · Un solo juego de listeners en el documento (no se duplican con cada render) y la selección, el foco y el scroll se
     conservan cuando el módulo vuelve a dibujar la pantalla (llamar a glacialRotGrid.activar(id) después de asignar el HTML).

   cfg = {
     id, col1:'SUPERVISOR', etiquetaTabla,
     dias:[{fecha, etq:'LUN', corta:'05/10', largo:'lunes 05/10', hoy}],
     filas:[{id, nombre, sub, celdas:[{valor, inicio, fin}], extra:{clave:valor}}],
     catalogo:[{valor, etq, clase, horas:true|false, base:{inicio,fin}}],
     bloqueado, mensajeBloqueo,
     aplicar:'nombreFuncionGlobal'   // (filaId, diaIdx, {turno, inicio, fin, extra}) → true | {ok:true} | false | {ok:false,error}
     rerender:'nombreFuncionGlobal'  // vuelve a dibujar la pantalla del módulo
     fusion:{etq:'Toda la semana'}   // una sola celda por fila que abarca los siete días (Mantenimiento: turno semanal)
     extras:[{clave, etq, opciones:[...]}], accionesFila:[{etq, fn:'nombreFuncionGlobal'}]  // fn(filaId)
   }
   Cargar ANTES de 30, 31 y 33.
   ============================================================= */
(function instalarRotGrid(){
  'use strict';

  const ESTADO={};   // id → {sel:{f,d}, base, draft, msg, scrollX, scrollY, foco}
  const CFG={};      // id → cfg del último dibujo
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const aMin=t=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(t||''));return m?Number(m[1])*60+Number(m[2]):null;};
  /* El horario cruza medianoche cuando el fin es igual o anterior al inicio (22:00–07:00). Se decide por las horas, no por el nombre del turno. */
  const cruzaMedianoche=(i,f)=>{const a=aMin(i),b=aMin(f);return a!==null&&b!==null&&b<=a;};
  const textoHorario=(i,f)=>(i&&f)?(i+'–'+f+(cruzaMedianoche(i,f)?' (+1 día)':'')):'';
  const clon=o=>JSON.parse(JSON.stringify(o===undefined?null:o));
  const est=id=>ESTADO[id]||(ESTADO[id]={sel:null,base:null,draft:null,msg:'',msgTipo:'',scrollX:0,scrollY:0,foco:null});

  /* ---------- datos de una celda ---------- */
  const filaDe=(cfg,f)=>(cfg.filas||[]).find(x=>String(x.id)===String(f));
  const itemCat=(cfg,valor)=>(cfg.catalogo||[]).find(c=>c.valor===valor)||null;
  function valorCelda(cfg,f,d){
    const fila=filaDe(cfg,f);if(!fila)return null;
    const c=(fila.celdas||[])[cfg.fusion?0:d]||{};
    return {turno:c.valor||'',inicio:c.inicio||'',fin:c.fin||'',extra:Object.assign({},fila.extra||{})};
  }
  const claseDe=(cfg,valor)=>{const it=itemCat(cfg,valor);return it&&it.clase?it.clase:'otro';};
  const etiquetaDe=(cfg,valor)=>{const it=itemCat(cfg,valor);return String(it&&it.etq?it.etq:(valor||'—'));};
  const conHoras=(cfg,valor)=>{const it=itemCat(cfg,valor);return !!(it&&it.horas);};
  const sucio=(s)=>!!(s&&s.draft&&s.base&&JSON.stringify(s.draft)!==JSON.stringify(s.base));
  const diaDe=(cfg,d)=>(cfg.dias||[])[cfg.fusion?0:d]||{};
  const rotuloDia=(cfg,d)=>cfg.fusion?(cfg.fusion.etq||'Toda la semana'):(diaDe(cfg,d).largo||diaDe(cfg,d).corta||'');

  /* ---------- estilos (una vez) ---------- */
  function estilos(){
    if(document.getElementById('rg-css'))return;
    const s=document.createElement('style');s.id='rg-css';
    s.textContent=`
      .rg{margin-top:14px}
      .rg-leyenda{display:flex;flex-wrap:wrap;gap:10px 16px;justify-content:flex-end;margin:0 0 8px;font-size:12px;color:#4a5d6d}
      .rg-leyenda span{display:inline-flex;align-items:center;gap:6px}.rg-leyenda i{width:16px;height:16px;border-radius:4px;border:1px solid #c5d3df;display:inline-block}
      .rg-scroll{overflow:auto;max-height:68vh;border:1px solid #c5d3df;border-radius:10px;background:#fff;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
      .rg-tabla{border-collapse:separate;border-spacing:0;width:100%;min-width:max-content;font-size:14px;color:#17384d}
      .rg-tabla th,.rg-tabla td{border-right:1px solid #cdd8e1;border-bottom:1px solid #cdd8e1;padding:0;vertical-align:middle;background:#fff}
      .rg-tabla tr>*:last-child{border-right:0}.rg-tabla tbody tr:last-child>*{border-bottom:0}
      .rg-tabla thead th{position:sticky;top:0;z-index:3;background:#003B5C;color:#fff;font-size:13px;font-weight:800;text-align:center;padding:10px 8px;letter-spacing:.02em;white-space:nowrap;border-color:#1b567a}
      .rg-tabla thead th small{display:block;font-weight:600;opacity:.85;font-size:12px}
      .rg-tabla thead th.rg-hoy{background:#0b5f8f}
      .rg-n{position:sticky;left:0;z-index:2;width:46px;min-width:46px;text-align:center;color:#5b6e7d;font-weight:700}
      .rg-p{position:sticky;left:46px;z-index:2;min-width:190px;max-width:240px;padding:8px 12px!important;text-align:left;font-weight:400;box-shadow:2px 0 0 rgba(0,59,92,.08)}
      .rg-tabla thead th.rg-n,.rg-tabla thead th.rg-p{z-index:5;text-align:left}
      .rg-tabla thead th.rg-n{text-align:center}
      .rg-p strong{display:block;font-size:14px;line-height:1.25;overflow-wrap:anywhere}.rg-p span{display:block;font-size:12px;color:#5b6e7d;margin-top:2px}
      .rg-tabla tbody tr{height:68px}
      .rg-c{min-width:128px;text-align:center;cursor:pointer;padding:6px 8px;line-height:1.3;position:relative;outline:none}
      .rg-c b{display:block;font-size:14px;letter-spacing:.01em}.rg-c span{display:block;font-size:13px;color:#425a6c;white-space:nowrap}
      .rg-dia{background:#E3F1FB}.rg-intermedio{background:#FFF2CC}.rg-noche{background:#E9E3F8}.rg-descanso{background:#EEF0F2}.rg-descanso b{font-weight:600;color:#5b6e7d}
      .rg-vacaciones{background:#E1F3E8}.rg-licencia{background:#FCE4E4}.rg-otro{background:#F4EBDD}
      .rg-fusion{min-width:0}
      .rg-c:hover{filter:brightness(.97)}
      .rg-c.rg-sel{box-shadow:inset 0 0 0 3px #1565C0;z-index:1}
      .rg-c:focus-visible{box-shadow:inset 0 0 0 3px #1565C0,0 0 0 2px #fff,0 0 0 4px #0b5f8f}
      .rg-c.rg-cambio::after{content:'';position:absolute;right:5px;top:5px;width:8px;height:8px;border-radius:50%;background:#e08a00}
      .rg-editor{margin-top:12px;background:#fff;border:1px solid #cdd8e1;border-radius:10px;padding:12px 14px}
      .rg-ed-fila{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:flex-end}
      .rg-ed-tit{flex:1 1 100%;font-size:15px;color:#17384d}
      .rg-ed-tit b{font-weight:800}
      .rg-ed label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#4a5d6d;font-weight:700;min-width:120px;flex:1 1 130px}
      .rg-ed select,.rg-ed input{min-height:44px;font-size:15px;padding:6px 10px;border:1px solid #b9c8d4;border-radius:8px;background:#fff;color:#17384d;width:100%;box-sizing:border-box}
      .rg-ed button{min-height:44px;padding:0 20px;border-radius:8px;font-weight:700;font-size:15px;cursor:pointer;border:1px solid #b9c8d4;background:#fff;color:#17384d}
      .rg-ed button.rg-aplicar{background:#0B6BCB;color:#fff;border-color:#0B6BCB}
      .rg-ed button[disabled],.rg-ed select[disabled],.rg-ed input[disabled]{opacity:.55;cursor:not-allowed}
      .rg-ed [hidden]{display:none!important}
      .rg-msg{flex:1 1 100%;font-size:13px;min-height:18px}.rg-msg.ok{color:#1F7A44}.rg-msg.error{color:#B3261E;font-weight:700}
      .rg-ayuda{margin-top:8px;font-size:12px;color:#5b6e7d}
      /* Refuerzo: las reglas globales de tablas del sistema (th en mayúsculas, colores, relleno) no deben alterar este cuadro. */
      .rg .rg-tabla thead th{background:#003B5C!important;color:#fff!important;text-transform:none!important;font-size:13px!important;padding:10px 8px!important;white-space:nowrap;border-color:#1b567a!important;text-align:center}
      .rg .rg-tabla thead th.rg-hoy{background:#0b5f8f!important}
      .rg .rg-tabla thead th.rg-n,.rg .rg-tabla thead th.rg-p{text-align:left}
      .rg .rg-tabla thead th.rg-n{text-align:center}
      .rg .rg-tabla tbody th.rg-p{background:#fff!important;color:#17384d!important;text-transform:none!important;font-size:14px!important;font-weight:400!important;white-space:normal;overflow-wrap:anywhere;width:190px;min-width:190px;max-width:190px;letter-spacing:0!important}
      .rg .rg-tabla tbody th.rg-p strong{color:#17384d;text-transform:none;font-weight:800}
      .rg .rg-tabla tbody th.rg-p span{color:#5b6e7d;text-transform:none;font-weight:400}
      .rg .rg-tabla tbody td.rg-n{background:#fff!important;color:#5b6e7d!important;padding:0!important}
      .rg .rg-tabla td.rg-c{padding:8px 10px!important;min-width:150px;font-size:14px!important;color:#17384d!important;text-transform:none!important}
      .rg .rg-tabla td.rg-c b{font-size:14px;font-weight:800;color:#17384d}
      .rg .rg-tabla td.rg-c span{white-space:normal;text-wrap:balance;font-size:13px;color:#425a6c}
      .rg .rg-tabla td.rg-dia{background:#E3F1FB!important}.rg .rg-tabla td.rg-intermedio{background:#FFF2CC!important}.rg .rg-tabla td.rg-noche{background:#E9E3F8!important}
      .rg .rg-tabla td.rg-descanso{background:#EEF0F2!important}.rg .rg-tabla td.rg-vacaciones{background:#E1F3E8!important}.rg .rg-tabla td.rg-licencia{background:#FCE4E4!important}.rg .rg-tabla td.rg-otro{background:#F4EBDD!important}
      .rg .rg-tabla td.rg-descanso b{font-weight:600;color:#5b6e7d}
      .rg .rg-tabla td.rg-fusion{min-width:0}
      @media(max-width:700px){
        .rg .rg-tabla tbody th.rg-p{width:150px;min-width:150px;max-width:150px}
        .rg .rg-tabla td.rg-c{min-width:140px}
      }
      @media(max-width:700px){
        .rg-scroll{max-height:62vh}
        .rg-p{min-width:150px;max-width:170px;padding:8px 10px!important}
        .rg-c{min-width:118px}
        .rg-ed-fila>label{flex:1 1 calc(50% - 7px);min-width:0}
        .rg-ed-fila>label.rg-ancho{flex:1 1 100%}
        .rg-ed button{flex:1 1 calc(50% - 5px)}
      }`;
    document.head.appendChild(s);
  }

  /* ---------- HTML ---------- */
  function htmlCelda(cfg,fila,fi,d){
    const c=(fila.celdas||[])[cfg.fusion?0:d]||{};
    const v=c.valor||'';
    const clase=claseDe(cfg,v),hor=conHoras(cfg,v)?textoHorario(c.inicio,c.fin):'';
    const s=est(cfg.id),sel=s.sel&&String(s.sel.f)===String(fila.id)&&s.sel.d===d;
    const nombreEtq=etiquetaDe(cfg,v);
    const etiqueta=`${fila.nombre}, ${rotuloDia(cfg,d)}: ${nombreEtq}${hor?' '+hor:''}`;
    return `<td role="gridcell" class="rg-c rg-${esc(clase)}${cfg.fusion?' rg-fusion':''}${sel?' rg-sel':''}" ${cfg.fusion?'colspan="7"':''} data-rg-f="${esc(fila.id)}" data-rg-d="${d}" tabindex="${sel?0:-1}" aria-selected="${sel?'true':'false'}" aria-label="${esc(etiqueta)}"><b>${esc(nombreEtq)}</b>${hor?`<span>${esc(hor)}</span>`:''}</td>`;
  }
  function htmlEditor(id){
    const cfg=CFG[id];if(!cfg)return '';
    const s=est(id);
    if(!s.sel||!s.draft){
      return `<div class="rg-ayuda">Selecciona una celda para editarla · Enter o F2 abre el editor · Esc cancela · Tab recorre los controles</div>`;
    }
    const fila=filaDe(cfg,s.sel.f);if(!fila)return '';
    const dr=s.draft,dirty=sucio(s),dis=cfg.bloqueado?'disabled':'';
    const opciones=(cfg.catalogo||[]).map(c=>`<option value="${esc(c.valor)}" ${dr.turno===c.valor?'selected':''}>${esc(c.etq||c.valor)}</option>`).join('');
    const horas=conHoras(cfg,dr.turno);
    const extras=(cfg.extras||[]).map(x=>`<label class="rg-ancho"><span>${esc(x.etq)}</span><select data-rg-extra="${esc(x.clave)}" ${dis}>${(x.opciones||[]).map(o=>`<option ${String((dr.extra||{})[x.clave])===String(o)?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`).join('');
    const acciones=(cfg.accionesFila||[]).map((a,i)=>`<button type="button" data-rg-accion="${i}" ${dis}>${esc(a.etq)}</button>`).join('');
    return `<div class="rg-ed-fila">
      <div class="rg-ed-tit">Celda seleccionada: <b>${esc(fila.nombre)}</b> · ${esc(rotuloDia(cfg,s.sel.d))}</div>
      <label><span>Turno</span><select data-rg-turno ${dis} aria-label="Turno de ${esc(fila.nombre)}">${opciones}</select></label>
      <label data-rg-horas ${horas?'':'hidden'}><span>Inicio</span><input type="time" data-rg-inicio value="${esc(dr.inicio)}" ${dis}></label>
      <label data-rg-horas ${horas?'':'hidden'}><span>Fin</span><input type="time" data-rg-fin value="${esc(dr.fin)}" ${dis}></label>
      ${extras}
      <button type="button" class="rg-aplicar" data-rg-aplicar ${dis}>Aplicar</button>
      <button type="button" data-rg-cancelar ${dirty?'':'hidden'}>Cancelar</button>
      ${acciones}
      <div class="rg-msg ${esc(s.msgTipo)}" data-rg-msg role="${s.msgTipo==='error'?'alert':'status'}">${esc(cfg.bloqueado?(cfg.mensajeBloqueo||'La semana está cerrada: no se puede editar.'):(s.msg||''))}</div>
    </div>`;
  }
  function html(cfg){
    estilos();
    CFG[cfg.id]=cfg;
    const s=est(cfg.id);
    // La selección solo vale si la fila sigue existiendo (cambió la semana, el listado, etc.).
    if(s.sel&&!filaDe(cfg,s.sel.f)){s.sel=null;s.draft=null;s.base=null;}
    if(s.sel&&s.base){const nueva=valorCelda(cfg,s.sel.f,s.sel.d);if(!sucio(s)){s.base=clon(nueva);s.draft=clon(nueva);}}
    const usados=new Set();(cfg.filas||[]).forEach(f=>(f.celdas||[]).forEach(c=>c&&c.valor&&usados.add(c.valor)));
    const leyenda=(cfg.catalogo||[]).map(c=>`<span><i class="rg-${esc(c.clase||'otro')}"></i>${esc(c.etq||c.valor)}</span>`).join('');
    const cab=cfg.fusion
      ?`<th scope="colgroup" colspan="7">${esc(cfg.fusion.titulo||'TURNO DE LA SEMANA')}<small>${esc((cfg.dias[0]||{}).corta||'')} – ${esc((cfg.dias[6]||{}).corta||'')}</small></th>`
      :(cfg.dias||[]).map(d=>`<th scope="col" class="${d.hoy?'rg-hoy':''}">${esc(d.etq)}<small>${esc(d.corta)}</small></th>`).join('');
    const filas=(cfg.filas||[]).map((fila,fi)=>`<tr data-rg-fila="${esc(fila.id)}">
      <td class="rg-n">${fi+1}</td>
      <th scope="row" class="rg-p"><strong>${esc(fila.nombre)}</strong><span>${esc(fila.sub||'')}</span></th>
      ${cfg.fusion?htmlCelda(cfg,fila,fi,0):(cfg.dias||[]).map((_,d)=>htmlCelda(cfg,fila,fi,d)).join('')}
    </tr>`).join('');
    return `<div class="rg" data-rg-id="${esc(cfg.id)}">
      <div class="rg-leyenda" aria-label="Leyenda de turnos">${leyenda}</div>
      <div class="rg-scroll" data-rg-scroll tabindex="-1">
        <table class="rg-tabla" role="grid" aria-label="${esc(cfg.etiquetaTabla||'Rotación semanal')}">
          <thead><tr><th scope="col" class="rg-n">#</th><th scope="col" class="rg-p">${esc(cfg.col1||'PERSONA')}</th>${cab}</tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      <div class="rg-editor rg-ed" data-rg-editor>${htmlEditor(cfg.id)}</div>
    </div>`;
  }

  /* ---------- DOM ---------- */
  const raiz=id=>document.querySelector(`.rg[data-rg-id="${CSS.escape(id)}"]`);
  const celdaEl=(id,f,d)=>{const r=raiz(id);if(!r)return null;return [...r.querySelectorAll('[data-rg-f]')].find(e=>e.dataset.rgF===String(f)&&Number(e.dataset.rgD)===d)||null;};
  function pintarEditor(id){const r=raiz(id);if(!r)return;const e=r.querySelector('[data-rg-editor]');if(e)e.innerHTML=htmlEditor(id);}
  function pintarSeleccion(id){
    const r=raiz(id);if(!r)return;const s=est(id);
    r.querySelectorAll('[data-rg-f]').forEach(e=>{
      const sel=!!s.sel&&e.dataset.rgF===String(s.sel.f)&&Number(e.dataset.rgD)===s.sel.d;
      e.classList.toggle('rg-sel',sel);e.setAttribute('aria-selected',sel?'true':'false');e.tabIndex=sel?0:-1;
    });
  }

  /* Mantiene visible la celda activa: el navegador no descuenta las columnas ni el encabezado fijos al enfocarla. */
  function asegurarVisible(id,el){
    const r=raiz(id),sc=r&&r.querySelector('[data-rg-scroll]');if(!sc||!el)return;
    const sr=sc.getBoundingClientRect(),er=el.getBoundingClientRect();
    const p=sc.querySelector('thead .rg-p'),th=sc.querySelector('thead');
    const izq=p?p.getBoundingClientRect().right:sr.left,sup=th?th.getBoundingClientRect().bottom:sr.top;
    if(er.left<izq)sc.scrollLeft-=(izq-er.left)+2;else if(er.right>sr.right)sc.scrollLeft+=(er.right-sr.right)+2;
    if(er.top<sup)sc.scrollTop-=(sup-er.top)+2;else if(er.bottom>sr.bottom)sc.scrollTop+=(er.bottom-sr.bottom)+2;
    const s=est(id);s.scrollX=sc.scrollLeft;s.scrollY=sc.scrollTop;
  }

  /* ---------- operaciones ---------- */
  function resolverPendientes(id){
    const s=est(id),cfg=CFG[id];
    if(!sucio(s))return true;
    const fila=cfg&&s.sel?filaDe(cfg,s.sel.f):null;
    const aplicarlos=confirm(`Hay cambios sin aplicar en la celda de ${fila?fila.nombre:'la selección'}.\n\nAceptar: aplicarlos\nCancelar: descartarlos`);
    if(aplicarlos)return aplicar(id,true);
    s.draft=clon(s.base);return true;
  }
  function seleccionar(id,f,d,foco){
    const cfg=CFG[id];if(!cfg)return;
    const s=est(id);d=cfg.fusion?0:d;
    if(s.sel&&String(s.sel.f)===String(f)&&s.sel.d===d){if(foco){const e=celdaEl(id,f,d);if(e){e.focus({preventScroll:true});asegurarVisible(id,e);}}return;}
    if(!resolverPendientes(id))return;   // si no se pudo aplicar, no se cambia de celda
    const v=valorCelda(cfg,f,d);if(!v)return;
    s.sel={f:String(f),d};s.base=clon(v);s.draft=clon(v);s.msg='';s.msgTipo='';
    pintarSeleccion(id);pintarEditor(id);
    if(foco){const e=celdaEl(id,f,d);if(e){e.focus({preventScroll:true});asegurarVisible(id,e);}}
  }
  function mover(id,df,dd){
    const cfg=CFG[id],s=est(id);if(!cfg||!s.sel)return;
    const filas=cfg.filas||[];let i=filas.findIndex(x=>String(x.id)===String(s.sel.f));
    let d=s.sel.d+dd;i+=df;
    if(cfg.fusion)d=0;
    i=Math.max(0,Math.min(filas.length-1,i));d=Math.max(0,Math.min((cfg.fusion?1:(cfg.dias||[]).length)-1,d));
    if(filas[i])seleccionar(id,filas[i].id,d,true);
  }
  function aplicar(id,silencioso){
    const cfg=CFG[id],s=est(id);if(!cfg||!s.sel||!s.draft)return false;
    if(cfg.bloqueado){s.msg=cfg.mensajeBloqueo||'La semana está cerrada.';s.msgTipo='error';pintarEditor(id);return false;}
    const dr=s.draft;
    if(!dr.turno){s.msg='Elige un turno.';s.msgTipo='error';pintarEditor(id);return false;}
    if(conHoras(cfg,dr.turno)){
      if(!dr.inicio||!dr.fin){s.msg='Indica la hora de inicio y de fin.';s.msgTipo='error';pintarEditor(id);return false;}
    }
    const fn=window[cfg.aplicar];
    if(typeof fn!=='function'){s.msg='No se pudo aplicar: falta la función de guardado.';s.msgTipo='error';pintarEditor(id);return false;}
    const antes=raiz(id)&&raiz(id).querySelector('[data-rg-scroll]');
    if(antes){s.scrollX=antes.scrollLeft;s.scrollY=antes.scrollTop;}
    let res;
    try{res=fn(s.sel.f,s.sel.d,{turno:dr.turno,inicio:conHoras(cfg,dr.turno)?dr.inicio:'',fin:conHoras(cfg,dr.turno)?dr.fin:'',extra:clon(dr.extra||{})});}
    catch(e){console.error('Rotación: error al aplicar',e);res={ok:false,error:'No se pudo guardar la asignación.'};}
    const ok=res===true||(res&&res.ok===true);
    if(!ok){
      // Fallo: no se muestra éxito y el borrador sigue disponible para corregir o reintentar.
      s.msg=(res&&res.error)||'No se pudo aplicar la asignación.';s.msgTipo='error';pintarEditor(id);return false;
    }
    s.base=clon(s.draft);   // lo aplicado pasa a ser el valor guardado: ya no hay cambios pendientes
    s.msg=silencioso?'':'Asignación aplicada.';s.msgTipo='ok';
    s.foco='celda';
    const rer=window[cfg.rerender];
    if(typeof rer==='function')rer();   // el módulo vuelve a dibujar y llama a activar(id)
    return true;
  }
  function cancelar(id){
    const s=est(id);if(!s.sel)return;
    s.draft=clon(s.base);s.msg='';s.msgTipo='';pintarEditor(id);
    const e=celdaEl(id,s.sel.f,s.sel.d);if(e)e.focus({preventScroll:true});
  }
  function limpiar(id){const s=est(id);s.sel=null;s.base=null;s.draft=null;s.msg='';s.msgTipo='';s.scrollX=0;s.scrollY=0;}

  /* Se llama justo después de asignar el HTML: devuelve scroll y foco, y muestra el mensaje del último «Aplicar». */
  function activar(id){
    const r=raiz(id);if(!r)return;
    const s=est(id),sc=r.querySelector('[data-rg-scroll]');
    if(sc){sc.scrollLeft=s.scrollX||0;sc.scrollTop=s.scrollY||0;}
    if(s.sel){pintarSeleccion(id);pintarEditor(id);}
    // Marca de la celda cuyo contenido cambió respecto de lo guardado: la decide el módulo (no se infiere aquí).
        if(s.foco==='celda'&&s.sel){const e=celdaEl(id,s.sel.f,s.sel.d);if(e)e.focus({preventScroll:true});}
    else if(s.ultimoFoco&&Date.now()-s.ultimoFoco.t<2000&&(!document.activeElement||document.activeElement===document.body)){
      // Un refresco remoto (otra persona guardó) reemplazó el HTML mientras se escribía en el editor: se devuelve el foco al mismo control.
      const c=raiz(id)&&raiz(id).querySelector(s.ultimoFoco.sel);if(c)c.focus({preventScroll:true});
    }
    s.foco=null;
  }

  /* ---------- eventos (una sola vez en el documento) ---------- */
  function idDe(el){const r=el&&el.closest&&el.closest('.rg[data-rg-id]');return r?r.dataset.rgId:null;}
  function enlazar(){
    if(window.__rgEnlazado)return;window.__rgEnlazado=true;
    document.addEventListener('click',e=>{
      const t=e.target;if(!t||!t.closest)return;
      const cel=t.closest('[data-rg-f]');
      if(cel){const id=idDe(cel);if(id)seleccionar(id,cel.dataset.rgF,Number(cel.dataset.rgD),true);return;}
      const id=idDe(t);if(!id)return;
      if(t.closest('[data-rg-aplicar]')){aplicar(id);return;}
      if(t.closest('[data-rg-cancelar]')){cancelar(id);return;}
      const ac=t.closest('[data-rg-accion]');
      if(ac){const cfg=CFG[id],s=est(id),a=cfg&&(cfg.accionesFila||[])[Number(ac.dataset.rgAccion)];if(a&&s.sel&&typeof window[a.fn]==='function'){window[a.fn](s.sel.f);}}
    });
    const cambio=e=>{
      const t=e.target;if(!t||!t.closest)return;const ed=t.closest('[data-rg-editor]');if(!ed)return;
      const id=idDe(ed),cfg=CFG[id],s=est(id);if(!cfg||!s.draft)return;
      if(t.matches('[data-rg-turno]')){
        s.draft.turno=t.value;
        const it=itemCat(cfg,t.value);
        // Al cambiar de turno se cargan los horarios base de ese turno (regla existente del módulo); se pueden ajustar antes de Aplicar.
        if(it&&it.horas){s.draft.inicio=(it.base&&it.base.inicio)||'';s.draft.fin=(it.base&&it.base.fin)||'';}else{s.draft.inicio='';s.draft.fin='';}
        s.msg='';s.msgTipo='';pintarEditor(id);const nt=ed.querySelector('[data-rg-turno]');if(nt)nt.focus();return;
      }
      if(t.matches('[data-rg-inicio]'))s.draft.inicio=t.value;
      else if(t.matches('[data-rg-fin]'))s.draft.fin=t.value;
      else if(t.matches('[data-rg-extra]')){s.draft.extra=s.draft.extra||{};s.draft.extra[t.dataset.rgExtra]=t.value;}
      else return;
      s.msg='';s.msgTipo='';
      const cancelarBtn=ed.querySelector('[data-rg-cancelar]');if(cancelarBtn)cancelarBtn.hidden=!sucio(s);
    };
    document.addEventListener('change',cambio);
    document.addEventListener('input',e=>{if(e.target&&e.target.matches&&e.target.matches('[data-rg-inicio],[data-rg-fin]'))cambio(e);});
    document.addEventListener('keydown',e=>{
      const t=e.target;if(!t||!t.closest)return;const id=idDe(t);if(!id)return;
      const cel=t.closest('[data-rg-f]'),ed=t.closest('[data-rg-editor]');
      if(e.key==='Escape'){const s=est(id);if(sucio(s)){e.preventDefault();cancelar(id);}return;}
      if(cel){
        const dir={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]}[e.key];
        if(dir){e.preventDefault();
          const s=est(id);if(!s.sel||s.sel.f!==cel.dataset.rgF||s.sel.d!==Number(cel.dataset.rgD))seleccionar(id,cel.dataset.rgF,Number(cel.dataset.rgD),false);
          mover(id,dir[0],dir[1]);return;}
        if(e.key==='Enter'||e.key==='F2'){e.preventDefault();seleccionar(id,cel.dataset.rgF,Number(cel.dataset.rgD),false);const sel=raiz(id)&&raiz(id).querySelector('[data-rg-turno]');if(sel)sel.focus();return;}
        if(e.key===' '){e.preventDefault();seleccionar(id,cel.dataset.rgF,Number(cel.dataset.rgD),true);}
        return;
      }
      if(ed&&e.key==='Enter'&&t.matches('input[type="time"]')){e.preventDefault();aplicar(id);}
    });
        document.addEventListener('focusin',e=>{
      const t=e.target;if(!t||!t.closest)return;const ed=t.closest('[data-rg-editor]');if(!ed)return;
      const id=idDe(ed),sel=['[data-rg-turno]','[data-rg-inicio]','[data-rg-fin]'].find(q=>t.matches(q))||(t.dataset&&t.dataset.rgExtra?'[data-rg-extra="'+t.dataset.rgExtra+'"]':null);
      if(id&&sel)est(id).ultimoFoco={sel,t:Date.now()};
    });
    document.addEventListener('focusout',e=>{
      const t=e.target,n=e.relatedTarget;if(!t||!t.closest||!n)return;const id=idDe(t);
      if(id&&t.closest('[data-rg-editor]')&&!(n.closest&&n.closest('[data-rg-editor]')))est(id).ultimoFoco=null;
    });
    document.addEventListener('scroll',e=>{
      const t=e.target;if(!t||!t.matches||!t.matches('[data-rg-scroll]'))return;
      const id=idDe(t);if(id){const s=est(id);s.scrollX=t.scrollLeft;s.scrollY=t.scrollTop;}
    },true);
  }
  enlazar();

  window.glacialRotGrid={html,activar,limpiar,resolverPendientes,seleccionar,aplicar,cancelar,textoHorario,cruzaMedianoche,hayPendientes:id=>sucio(est(id)),estado:id=>est(id),cfg:id=>CFG[id]};
})();
