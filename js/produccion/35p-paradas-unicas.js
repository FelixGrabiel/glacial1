/* =============================================================
   GLACIAL · UNA SOLA PARADA, VISTA POR MARCA (27/11/2026) · docs/produccion/cierre-turno.md › «Una sola parada»
   Las paradas se registran en UN solo formulario: «Agregar paradas» (29-avance-produccion.js). Las demás pantallas las muestran:
     · Nuevo registro: cada cuadro muestra las paradas de SU marca (solo lectura) con «+ Parada» (abre el formulario con esa marca elegida)
       y «Editar» (abre el formulario con todas las paradas de la línea). Las paradas que ya estaban escritas en los cuadros siguen en la lista
       única (el formulario las muestra como «Nuevo registro» y se editan ahí).
     · Paletas › Cierre de turno: sus marcas con paradas y ratio (16f).
     · Avance y Cierre: «Paradas del turno» con TODAS las paradas de cada línea, por hora y con su marca, y «+ Parada».
   Las paradas siguen copiándose solas a su cuadro (35-autollenado-registro.js): de ellas salen las horas efectivas del registro.
   ============================================================= */
(function(raiz){
  'use strict';
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const esc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=t=>String(t==null?'':t).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const PT=()=>raiz.glacialParadasTramo||null;
  const etiqueta=p=>PT()?PT().etiqueta(p):(p&&p.tipo==='PROGRAMADA'?'P':'NP');
  const tag=p=>{const e=etiqueta(p),cls=e==='CAMBIO'?'cb':e==='P'?'p':'np';return `<span class="pu-tag pu-${cls}">${e==='CAMBIO'?'CAMB':e}</span>`;};
  const hhmm=(fecha,turno,h)=>PT()?PT().hms(fecha,h,turno):0;

  function estilos(){
    if(typeof document==='undefined'||document.getElementById('pu-css'))return;
    const s=document.createElement('style');s.id='pu-css';
    s.textContent=`.pu{border:1px solid #dce5eb;border-radius:12px;background:#fff;padding:12px 14px;display:grid;gap:8px;margin:10px 0 0}
.pu-cab{display:flex;justify-content:space-between;align-items:center;gap:10px}.pu-cab h4{margin:0;color:#0B3A5C;font-size:15px}.pu-cab b{color:#0B3A5C}
.pu-l{display:grid}.pu-f{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:7px 0;border-bottom:1px dashed #e3e9ee;font-size:14px}.pu-f:last-child{border-bottom:0}
.pu-f small{color:#587087}.pu-tag{display:inline-block;min-width:30px;text-align:center;border-radius:6px;padding:2px 7px;font-size:11.5px;font-weight:800}
.pu-np{background:#fde2e1;color:#8e1b16}.pu-p{background:#dcebff;color:#1e46a0}.pu-cb{background:#ede4ff;color:#5b2bb5}
.pu-acc{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.pu-acc .btn{min-height:44px;font-weight:800}
.pu-nota{font-size:12px;color:#587087;font-style:italic}.pu-vacio{font-size:13px;color:#587087}
.pu-pend{font-size:12.5px;color:#7a4a00;background:#fff8db;border:1px solid #f2cf63;border-radius:8px;padding:7px 9px}
.pu-lin{border-top:1px solid #e3e9ee;padding-top:8px}.pu-lin:first-of-type{border-top:0;padding-top:0}
.pu-pie{display:flex;justify-content:space-between;font-weight:800;border-top:1px solid #c9d4dc;padding-top:6px;font-size:13.5px}`;
    document.head.appendChild(s);
  }

  /* ---------- Nuevo registro ---------- */
  function opPorId(){
    const m=new Map();
    try{(typeof paradasOperativasActuales==='function'?paradasOperativasActuales():[]).forEach(p=>{if(p&&p.id)m.set(String(p.id),p);});}catch(_){/* sin paradas */}
    return m;
  }
  /** Paradas del cuadro i (las de Avance copiadas solas + las escritas antes en el cuadro), sin filas vacías, por hora. */
  function paradasDelCuadro(q,draftCtx){
    const ops=opPorId(),out=[];
    [['paradasProgramadas','PROGRAMADA'],['paradasNoProgramadas','NO_PROGRAMADA']].forEach(([k,tipo])=>(q&&q[k]||[]).forEach(r=>{
      if(!r||r.eliminada||(!String(r.descripcion||'').trim()&&!num(r.tiempoMin)))return;
      const o=r.origenId?ops.get(String(r.origenId)):null;
      out.push({descripcion:r.descripcion||(o&&o.descripcion)||'Parada',minutos:num(r.tiempoMin),tipo,horaInicio:(o&&o.horaInicio)||r.horaInicio||'',equipo:(o&&o.equipo)||r.equipo||'',esCambio:o?o.esCambio:undefined,manual:!r.auto});
    }));
    const c=draftCtx||{};
    return out.sort((a,b)=>(hhmm(c.fecha,c.turno,a.horaInicio)||Infinity)-(hhmm(c.fecha,c.turno,b.horaInicio)||Infinity));
  }
  function registroParadasUnicasHtml(i,q){
    estilos();
    const d=typeof draft!=='undefined'?draft:{};
    const lista=paradasDelCuadro(q,{fecha:d.fecha,turno:d.turno}),tot=lista.reduce((s,p)=>s+p.minutos,0);
    const titulo=[q&&q.marca,q&&q.presentacion&&(typeof nombrePresentacionUI==='function'?nombrePresentacionUI(d.linea,q.marca,q.presentacion):q.presentacion)].filter(Boolean).join(' ')||'esta marca';
    return `<div class="pu" data-pu-cuadro="${i}"><div class="pu-cab"><h4>Paradas de ${esc(titulo)}</h4><b>${lista.length} · ${tot.toLocaleString('es-PE')} min</b></div>
      ${lista.length?`<div class="pu-l">${lista.map(p=>`<div class="pu-f">${tag(p)}<span>${esc(p.horaInicio||'—')} ${esc(p.descripcion)}${p.equipo?` <small>· ${esc(p.equipo)}</small>`:''}${p.manual?' <small>· escrita en el registro</small>':''}</span><b>${p.minutos.toLocaleString('es-PE')}</b></div>`).join('')}</div>`:'<div class="pu-vacio">Sin paradas en esta marca.</div>'}
      <div class="pu-acc"><button type="button" class="btn btn-primary" data-no-autosave onclick="registroNuevaParada(${i})">+ Parada</button><button type="button" class="btn btn-ghost" data-no-autosave onclick="registroEditarParadas()">Editar</button></div>
      <div class="pu-nota">Las paradas se registran en un solo lugar («Agregar paradas»); aquí se ven las de esta marca.</div></div>`;
  }
  /** Tramo (marca de la Secuencia del turno) del cuadro: el que está en curso o el último cerrado de esa marca y presentación. */
  function tramoDelCuadro(q,c){
    try{
      const CM=raiz.glacialCierreMarcas;if(!CM||!q)return null;
      const V=CM.tramosTurno(c).V||[];
      const mismos=V.filter(t=>norm(t.marca)===norm(q.marca)&&norm(t.presentacion)===norm(q.presentacion));
      return mismos.find(t=>t.estado==='activo')||mismos.filter(t=>t.estado==='cerrado').pop()||mismos[0]||null;
    }catch(_){return null;}
  }
  raiz.registroNuevaParada=async function(i){
    if(typeof avAbrirParadas!=='function'||typeof draft==='undefined'||!draft)return;
    const q=(typeof normalizarCuadros==='function'?normalizarCuadros(draft):draft.cuadros||[])[i]||{};
    const c={linea:draft.linea,fecha:draft.fecha,turno:typeof avTurnoCanon==='function'?avTurnoCanon(draft.turno):draft.turno};
    try{if(raiz.glacialCierreMarcas)await raiz.glacialCierreMarcas.cargar(c);}catch(_){/* sin cierre: se usa la marca del cuadro */}
    const t=tramoDelCuadro(q,c);
    avAbrirParadas(draft.linea,draft.fecha,draft.turno,t?{tramoId:String(t.id)}:{marca:q.marca,presentacion:q.presentacion});
  };
  raiz.registroEditarParadas=function(){
    if(typeof avAbrirParadas==='function'&&typeof draft!=='undefined'&&draft)avAbrirParadas(draft.linea,draft.fecha,draft.turno);
  };

  /* ---------- Avance y Cierre: «Paradas del turno» (todas, por línea) ---------- */
  const pedidos=new Set();
  function avanceParadasTurnoHtml(){
    estilos();
    if(typeof avanceEstado==='undefined'||!avanceEstado.fecha||typeof avParadasLinea!=='function')return '';
    const lineas=(typeof AVANCE_LINEAS!=='undefined'?AVANCE_LINEAS:[]).map(l=>({l,ps:avParadasLinea(l,typeof avHoraActual==='function'?avHoraActual():'','AVANCE')})).filter(x=>x.ps.length);
    const puede=typeof avPuedeEditarParadas==='function'&&avPuedeEditarParadas();
    const bloques=lineas.map(({l,ps})=>{
      const c={linea:l,fecha:avanceEstado.fecha,turno:avanceEstado.turno},CM=raiz.glacialCierreMarcas,P=PT();
      // marca de cada parada: la del tramo (con el cierre del turno cargado) o la guardada / la de su cuadro
      let A=null;
      if(CM&&P){
        const k=c.linea+'|'+c.fecha+'|'+c.turno;
        if(!(CM.estado&&CM.estado.porTurno&&CM.estado.porTurno.has(k))&&!pedidos.has(k)){pedidos.add(k);CM.cargar(c).then(()=>{if(typeof state!=='undefined'&&state.currentTab==='avance-produccion'&&typeof avDibujar==='function')avDibujar();}).catch(()=>{});}
        try{const M=CM.modelo(c);if(M.V&&M.V.length)A={V:M.V,asig:P.asignar(ps.map((p,k2)=>Object.assign({},p,{id:p.id||('x'+k2)})),M.V,c)};}catch(_){A=null;}
      }
      const filas=[];
      if(A){A.asig.porTramo.forEach((lst,ti)=>lst.forEach(p=>filas.push(Object.assign({},p,{marcaTxt:A.V[ti].marca}))));A.asig.pendientes.forEach(p=>filas.push(Object.assign({},p,{marcaTxt:'sin marca',pend:true})));A.asig.sinSecuencia.forEach(p=>filas.push(Object.assign({},p,{marcaTxt:p.marca||''})));}
      else ps.forEach(p=>filas.push(Object.assign({},p,{marcaTxt:p.marca||''})));
      const orden=P?P.ordenarParadas(filas,c.fecha,c.turno):filas;
      const prog=orden.filter(p=>p.tipo==='PROGRAMADA'||(P&&P.esCambio(p))).reduce((s,p)=>s+num(p.minutos),0),tot=orden.reduce((s,p)=>s+num(p.minutos),0);
      const pend=orden.filter(p=>p.pend);
      return `<div class="pu-lin"><div class="pu-cab"><h4>${esc(typeof AVANCE_NOMBRES!=='undefined'&&AVANCE_NOMBRES[l]||l)}</h4>${puede?`<button type="button" class="btn btn-ghost btn-sm" onclick="avAbrirParadas('${esc(l)}')">+ Parada</button>`:''}</div>
        <div class="pu-l">${orden.map(p=>`<div class="pu-f">${tag(p)}<span>${esc(p.horaInicio||'—')} ${esc(p.descripcion||'Parada')}${p.marcaTxt?` <small>· ${esc(p.marcaTxt)}</small>`:''}</span><b>${num(p.minutos).toLocaleString('es-PE')}</b></div>`).join('')}</div>
        <div class="pu-pie"><span>Prog. ${prog.toLocaleString('es-PE')} · No prog. ${(tot-prog).toLocaleString('es-PE')}</span><span>Total ${tot.toLocaleString('es-PE')} min</span></div>
        ${pend.length?`<div class="pu-pend">⚠ ${pend.length} parada${pend.length===1?'':'s'} sin marca: ${puede?`<a href="#" onclick="avAbrirParadas('${esc(l)}');return false">tócala para elegir la marca</a>`:'falta elegir la marca'}.</div>`:''}</div>`;
    }).join('');
    return `<div class="pu" id="pu-avance"><div class="pu-cab"><h4>Paradas del turno</h4>${puede?'<button type="button" class="btn btn-primary btn-sm" onclick="avAbrirParadas()">+ Parada</button>':''}</div>
      ${bloques||'<div class="pu-vacio">Sin paradas registradas en este turno.</div>'}
      <div class="pu-nota">Una sola lista: estas mismas paradas se ven por marca en Nuevo registro y en Paletas › Cierre de turno.</div></div>`;
  }

  raiz.registroParadasUnicasHtml=registroParadasUnicasHtml;
  raiz.glacialParadasUnicas={registroParadasUnicasHtml,paradasDelCuadro,tramoDelCuadro,avanceParadasTurnoHtml};
})(typeof window!=='undefined'?window:globalThis);
