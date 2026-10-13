/* =============================================================
   PLANIFICACIÓN · VISTA SEMANAL DE CARGA Y CAPACIDAD (etapa 4)

   Es LA vista semanal (reemplaza a la de la etapa 3, no es una segunda). Filas: las cinco líneas. Columnas: los siete días. Selector de bloque:
   Mañana + Intermedio / Noche / Ambos. Con «Ambos» cada celda muestra los dos bloques POR SEPARADO: su capacidad no se suma, porque la producción no se
   puede trasladar libremente entre ellos. Cada celda sale de NS.evaluar() (65a), la misma función del detalle diario, así la semana y el día coinciden.
   Estados de capacidad (con texto e ícono y leyenda propia, distinta de los colores de estado operativo): Cabe · Cabe, ajustado · No cabe ·
   Cálculo parcial (antes «Estimación incompleta») · Sin programación · Datos no disponibles. El estado operativo (en producción, pausa, detenida, finalizada, pendiente) conserva
   los colores acordados. Al abrir una celda se ve el desglose y se puede ir a la programación de ese día y bloque.
   ============================================================= */
(function(){
  'use strict';
  const NS=window.glacialPlanificacion,M=NS.motor;
  const {num,esc,iso,addDias,lunesDe,fechaOk,ahoraMs}=NS.util;
  const fmt=n=>num(n).toLocaleString('es-PE');
  const hm=min=>NS.textoDuracion(min);
  const F={bloque:'AMBOS',linea:'',cap:''};
  const NOMBRES=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const etqBloque=b=>b==='NOCHE'?'Noche':'Mañ. + Inter.';
  const clasesOp=e=>e==='EN_PRODUCCION'?'est-curso':e==='PAUSA'?'est-pausa':(e==='DETENIDA'||e==='LISTA')?'est-det':e==='FINALIZADA'?'est-fin':'est-pend';
  const textoOp=e=>({EN_PRODUCCION:'En producción',PAUSA:'En pausa',DETENIDA:'Detenida',LISTA:'Detenida',FINALIZADA:'Finalizada',PENDIENTE:'Pendiente'})[e]||'Pendiente';

  function estilos(){
    if(document.getElementById('plan-sem-css'))return;
    const s=document.createElement('style');s.id='plan-sem-css';
    const css=`
      #plan-root table.sem-tabla{border-collapse:separate;border-spacing:0;width:100%;font-size:12px;background:#fff}
      #plan-root .sem-tabla th{background:#f1f6fa;color:#46627a;padding:8px 6px;font-size:11px;font-weight:700;text-align:center;border-bottom:1px solid var(--pl-line);border-left:1px solid #e3eaf0;white-space:nowrap}
      #plan-root .sem-tabla th.sem-linea,#plan-root .sem-tabla td.sem-linea{position:sticky;left:0;z-index:2;background:#fff;text-align:left;border-left:0;font-weight:800;color:var(--pl-navy);min-width:72px;border-right:2px solid #dce5ec}
      #plan-root .sem-tabla th.sem-linea{background:#f1f6fa}
      #plan-root .sem-tabla td{vertical-align:top;border-top:1px solid #edf2f6;border-left:1px solid #edf2f6;padding:5px;min-width:128px}
      #plan-root .sem-hoy{box-shadow:inset 0 3px 0 var(--pl-blue,#005b96)}
      #plan-root .sem-sub{border-radius:9px;padding:5px 6px;margin-bottom:4px;cursor:pointer;border:1px solid var(--pc-b,#CBD5E1);background:var(--pc-bg,#fff);line-height:1.3}
      #plan-root .sem-sub:last-child{margin-bottom:0}
      #plan-root .sem-sub:hover,#plan-root .sem-sub:focus-visible{box-shadow:0 0 0 2px #7db4f0}
      #plan-root .sem-sub .sc-t{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#46627a}
      #plan-root .sem-sub .sc-c{font-size:11px;font-weight:800;color:var(--pc-c,#334155)}
      #plan-root .sem-sub .sc-n{font-variant-numeric:tabular-nums;color:#1b2a38}
      #plan-root .sem-sub .sc-l{font-size:11px;color:#46627a}
      #plan-root .sem-sub.sem-sin{border-style:dashed;background:#fff;color:#94a3b8}
      #plan-root .sem-sub.sem-inc{border-style:dashed}
      #plan-root .sem-sub.sem-dim{opacity:.28}
      #plan-root .sem-sub .plan-badge{font-size:10px;padding:1px 7px;margin-top:2px;display:inline-block}
      #plan-root .sem-desf{font-size:10px;color:#7A5200;font-weight:700}
      @media (max-width:640px){#plan-root .sem-tabla td{min-width:116px}}
    `;
    s.textContent=css+css.replace(/#plan-root/g,'.plan-dialogo');
    document.head.appendChild(s);
  }

  /* Datos de una celda: línea + día + bloque. Cualquier error de lectura se muestra como «Datos no disponibles», nunca como un valor inventado. */
  function celda(fecha,bloque,linea){
    try{
      if(typeof _programacionesReady!=='undefined'&&!_programacionesReady)return {tipo:'NODATOS',motivo:'La programación todavía se está cargando.'};
      const filas=NS.items(fecha,bloque).filter(p=>p.linea===linea&&NS.estadoDe(p)!=='CANCELADA');
      if(!filas.length)return {tipo:'SIN_PROG'};
      const ev=NS.evaluar(fecha,bloque,linea);
      if(!ev)return {tipo:'SIN_PROG'};
      const estados=filas.map(p=>NS.estadoDe(p));
      const op=estados.every(e=>e==='FINALIZADA')?'FINALIZADA':estados.some(e=>e==='DETENIDA'||e==='LISTA')?'DETENIDA':estados.some(e=>e==='EN_PRODUCCION')?'EN_PRODUCCION':estados.some(e=>e==='PAUSA')?'PAUSA':'PENDIENTE';
      const prods=new Set(filas.map(p=>p.marca+'|'+p.presentacion));
      return {tipo:'CAP',ev,c:ev.mostrar,productos:prods.size,op,filas};
    }catch(e){return {tipo:'NODATOS',motivo:'No se pudo leer: '+((e&&e.message)||e)};}
  }
  const claveEstado=d=>d.tipo==='CAP'?d.c.estado:d.tipo;
  const coincideFiltro=d=>{
    if(!F.cap)return true;
    if(F.cap==='CABE')return d.tipo==='CAP'&&(d.c.estado==='CABE'||d.c.estado==='JUSTO');
    return claveEstado(d)===F.cap;
  };

  function subHtml(d,fecha,bloque,linea,ambos){
    const cab=ambos?'<div class="sc-t">'+etqBloque(bloque)+'</div>':'';
    const attrs=' data-cel="'+esc(fecha+'|'+bloque+'|'+linea)+'" tabindex="0" role="button"';
    const dim=!coincideFiltro(d)?' sem-dim':'';
    if(d.tipo==='SIN_PROG')return '<div class="sem-sub sem-sin'+dim+'"'+attrs+' aria-label="Sin programación">'+cab+'<div class="sc-c">— Sin programación</div></div>';
    if(d.tipo==='NODATOS')return '<div class="sem-sub pc-nodatos'+dim+'"'+attrs+' title="'+esc(d.motivo||'')+'">'+cab+'<div class="sc-c">⚠ Datos no disponibles</div></div>';
    const c=d.c,k=NS.CAP[c.estado]||NS.CAP.NODATOS;
    const inc=c.estado==='INCOMPLETA';
    const nombres=d.filas.map(p=>p.marca+' '+NS.etiquetaPresentacion(p.linea,p.marca,p.presentacion)+': '+fmt(p.cantidadProgramada)+' UND').join('\n');
    return '<div class="sem-sub '+k.cls+(inc?' sem-inc':'')+dim+'"'+attrs+' title="'+esc(nombres)+'">'+cab+
      '<div class="sc-c">'+k.ico+' '+esc(k.txt)+'</div>'+
      '<div class="sc-n">'+(inc?'requerido / disponible: —':hm(c.requeridoMin)+' / '+hm(c.disponibleMin)+(c.cargaPct===null?'':' · '+Math.round(c.cargaPct)+' %'))+'</div>'+
      '<div class="sc-l">'+(inc?esc((c.faltantes[0]&&c.faltantes[0].dato)||'faltan datos'):(c.holguraMin<0?'Exceso '+hm(-c.holguraMin):'Libre '+hm(c.holguraMin)))+' · '+d.productos+(d.productos===1?' producto':' productos')+'</div>'+
      '<span class="plan-badge '+clasesOp(d.op)+'">'+esc(textoOp(d.op))+'</span>'+(d.ev.desfasada?'<div class="sem-desf">⟳ parámetros cambiaron</div>':'')+'</div>';
  }

  function pintarSemanal(cont){
    const E=NS.estado;
    if(!fechaOk(E.semana))E.semana=E.fecha;
    estilos();if(typeof NS.estilosCap==='function')NS.estilosCap();
    cont.innerHTML='<div class="plan-bar"><button type="button" class="btn btn-ghost btn-sm" data-sem="-7">◀ Semana anterior</button>'+
      '<label>Semana de<input type="date" id="sem-fecha" value="'+esc(E.semana)+'"></label>'+
      '<button type="button" class="btn btn-ghost btn-sm" data-sem="7">Semana siguiente ▶</button>'+
      '<button type="button" class="btn btn-ghost btn-sm" data-sem="hoy">Esta semana</button>'+
      '<label>Bloque<select id="sem-bloque"><option value="DÍA"'+(F.bloque==='DÍA'?' selected':'')+'>Mañana + Intermedio</option><option value="NOCHE"'+(F.bloque==='NOCHE'?' selected':'')+'>Noche</option><option value="AMBOS"'+(F.bloque==='AMBOS'?' selected':'')+'>Ambos (por separado)</option></select></label>'+
      '<label>Línea<select id="sem-linea"><option value="">Todas</option>'+NS.lineas().map(l=>'<option value="'+esc(l.key)+'"'+(l.key===F.linea?' selected':'')+'>'+esc(l.name)+'</option>').join('')+'</select></label>'+
      '<label>Estado de capacidad<select id="sem-cap"><option value="">Todos</option>'+[['CABE','Cabe (incluye ajustado)'],['EXCESO','No cabe'],['INCOMPLETA','Cálculo parcial'],['SIN_PROG','Sin programación'],['NODATOS','Datos no disponibles']].map(([v,t])=>'<option value="'+v+'"'+(F.cap===v?' selected':'')+'>'+t+'</option>').join('')+'</select></label>'+
      '</div>'+(typeof NS.leyendaCapacidad==='function'?NS.leyendaCapacidad():'')+
      '<p class="plan-nota" style="margin:0 0 8px">Cada celda: tiempo requerido / disponible, utilización, tiempo libre o exceso y productos. Toca una celda para ver el desglose. Con «Ambos» los bloques no se suman. La barra superior azul marca hoy. La capacidad es una previsión de planificación; el estado operativo (en producción, pausa, detenida, finalizada, pendiente) es la ejecución real.</p>'+
      '<div id="sem-grilla"></div>';
    pintarGrilla();
  }

  function pintarGrilla(){
    const cont=document.getElementById('sem-grilla');
    if(!cont)return;
    const E=NS.estado,lun=lunesDe(E.semana);
    const dias=[0,1,2,3,4,5,6].map(i=>addDias(lun,i));
    const hoy=NS.hoyOperativo?NS.hoyOperativo():iso(new Date(ahoraMs()));
    const bloques=F.bloque==='AMBOS'?['DÍA','NOCHE']:[F.bloque];
    const lineas=NS.lineas().filter(l=>!F.linea||l.key===F.linea);
    const filas=lineas.map(l=>{
      let alguna=false;
      const tds=dias.map(d=>{
        const subs=bloques.map(b=>{const dat=celda(d,b,l.key);if(coincideFiltro(dat))alguna=true;return subHtml(dat,d,b,l.key,bloques.length>1);});
        return '<td'+(d===hoy?' class="sem-hoy"':'')+'>'+subs.join('')+'</td>';
      });
      return {alguna,html:'<tr><td class="sem-linea">'+esc(l.name)+'</td>'+tds.join('')+'</tr>'};
    }).filter(f=>!F.cap||f.alguna);
    cont.innerHTML='<div class="plan-scroll"><table class="sem-tabla"><thead><tr><th class="sem-linea">Línea</th>'+dias.map((d,i)=>'<th'+(d===hoy?' style="color:#003b5c;background:#e4f0fa"':'')+'>'+NOMBRES[i]+' '+d.slice(8)+'/'+d.slice(5,7)+'</th>').join('')+'</tr></thead><tbody>'+
      (filas.length?filas.map(f=>f.html).join(''):'<tr><td colspan="8" class="plan-nota">Ninguna línea coincide con el filtro de estado.</td></tr>')+'</tbody></table></div>'+
      (NS.evaluacionFallo?'<p class="plan-error">No se pudo guardar alguna evaluación de capacidad: '+esc(NS.evaluacionFallo)+'</p>':'');
  }

  /* ---------- detalle de una celda ---------- */
  NS.abrirCelda=function(fecha,bloque,linea){
    const d=celda(fecha,bloque,linea);
    const titulo=esc(NS.nombreLinea(linea))+' · '+esc(fecha)+' · '+esc(NS.etiquetaBloqueConHorario(bloque));
    let h='<h3>'+titulo+'</h3>';
    if(d.tipo==='SIN_PROG')h+='<p>Sin programación en este día y bloque.</p>';
    else if(d.tipo==='NODATOS')h+='<p class="plan-error" style="display:block">'+esc(d.motivo||'Datos no disponibles.')+'</p>';
    else{
      const c=d.c;
      h+='<p>'+NS.chipCapacidad(c.estado)+' <span class="plan-badge '+clasesOp(d.op)+'">'+esc(textoOp(d.op))+'</span>'+(c.congelada?' <span class="sem-desf">evaluación guardada con los parámetros v'+num(c.versionGuardada)+'</span>':'')+'</p>';
      if(d.ev.desfasada)h+='<div class="pc-desf">Los parámetros cambiaron desde que se guardó este plan. Con los de hoy: '+esc(NS.CAP[d.ev.vigente.estado].txt)+' ('+hm(d.ev.vigente.requeridoMin)+' / '+hm(d.ev.vigente.disponibleMin)+'). '+(NS.puede()?'Puedes recalcular en Catálogo → Tiempos previstos.':'')+'</div>';
      if(c.motivoExceso)h+='<div class="cap-falta" style="background:#FAE8FF;color:#86198F">'+esc(c.motivoExceso)+'</div>';
      h+='<h5 style="margin:10px 0 4px;color:#003b5c">Productos y secuencia</h5><div class="plan-scroll"><table class="plan-tabla"><thead><tr><th>Producto</th><th class="num">UND</th><th>Estado</th></tr></thead><tbody>'+
        d.filas.map(p=>'<tr><td>'+esc(p.marca)+' '+esc(NS.etiquetaPresentacion(p.linea,p.marca,p.presentacion))+'</td><td class="num">'+fmt(p.cantidadProgramada)+'</td><td><span class="plan-badge '+clasesOp(NS.estadoDe(p))+'">'+esc(textoOp(NS.estadoDe(p)))+'</span></td></tr>').join('')+'</tbody></table></div>';
      const sec=NS.secuenciaLinea(fecha,bloque,linea);
      if(sec){
        const hh=ms=>new Date(ms).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false});
        h+='<p class="plan-nota">Secuencia: '+sec.tramos.map(t=>esc(t.marca)+(t.estimado?' ('+hh(t.inicioMs)+'–'+hh(t.finMs)+')':' (sin horas: '+esc(t.motivo||'')+')')).join(' → ')+(sec.finEstimadoMs?'. Termina hacia las '+hh(sec.finEstimadoMs)+'.':'.')+'</p>';
      }else h+='<p class="plan-nota">Sin secuencia definida en Paletas.</p>';
      h+=NS.htmlDesglose(d.ev.vigente,NS.capacidadRestante(fecha,bloque,linea));
    }
    h+='<div class="plan-acciones"><button type="button" class="btn btn-ghost" data-cel-cerrar>Cerrar</button>'+
      (d.tipo==='CAP'&&NS.puede()&&d.c.estado==='EXCESO'&&typeof NS.abrirOpciones==='function'?'<button type="button" class="btn btn-ghost" data-cel-opciones>Ver opciones para completar</button>':'')+
      '<button type="button" class="btn btn-primary" data-cel-ir>Ir a la programación de este día y bloque</button></div>';
    const fondo=NS.abrirDialogo(h,true);
    fondo.addEventListener('click',e=>{
      if(e.target.closest('[data-cel-cerrar]'))fondo.remove();
      else if(e.target.closest('[data-cel-ir]')){fondo.remove();NS.estado.tab='programacion';NS.estado.fecha=fecha;NS.estado.turno=NS.valorBloque(bloque);NS.pintarPestana();}
      else if(e.target.closest('[data-cel-opciones]')){fondo.remove();NS.abrirOpciones(fecha,bloque,linea);}
    });
  };

  /* ---------- eventos ---------- */
  document.addEventListener('click',e=>{
    const raiz=e.target.closest&&e.target.closest('#plan-root');
    if(!raiz||!NS.estado||NS.estado.tab!=='semanal')return;
    const nav=e.target.closest('[data-sem]');
    if(nav){
      const v=nav.getAttribute('data-sem');
      NS.estado.semana=v==='hoy'?(NS.hoyOperativo?NS.hoyOperativo():iso(new Date(ahoraMs()))):addDias(NS.estado.semana,Number(v));
      NS.pintarPestana();return;
    }
    const c=e.target.closest('[data-cel]');
    if(c){const [f,b,l]=c.getAttribute('data-cel').split('|');NS.abrirCelda(f,b,l);}
  });
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const c=e.target.closest&&e.target.closest('[data-cel]');
    if(c&&c.closest('#plan-root')){e.preventDefault();const [f,b,l]=c.getAttribute('data-cel').split('|');NS.abrirCelda(f,b,l);}
  });
  document.addEventListener('change',e=>{
    const t=e.target;
    if(!t||!t.closest||!t.closest('#plan-root')||!NS.estado||NS.estado.tab!=='semanal')return;
    if(t.id==='sem-fecha'&&fechaOk(t.value)){NS.estado.semana=t.value;NS.pintarPestana();}
    else if(t.id==='sem-bloque'){F.bloque=t.value;pintarGrilla();}
    else if(t.id==='sem-linea'){F.linea=t.value;pintarGrilla();}
    else if(t.id==='sem-cap'){F.cap=t.value;pintarGrilla();}
  });

  const i=NS.pestanas.findIndex(p=>p.clave==='semanal');
  const reg={clave:'semanal',titulo:'Programación semanal',orden:2,pintar:pintarSemanal,actualizar:pintarGrilla};
  if(i>=0)NS.pestanas[i]=reg;else NS.pestanas.push(reg);
})();
