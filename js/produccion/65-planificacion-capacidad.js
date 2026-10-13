/* =============================================================
   PLANIFICACIÓN · CAPACIDAD, SECUENCIA Y TRASLADO DE SALDO (etapas 3 y 4)

   El CÁLCULO vive en el motor (65b-planificacion-motor.js, funciones puras) y los parámetros en 65a (reglas de preparación, ventanas de indisponibilidad,
   versión). Aquí solo se arman los datos reales de cada línea y bloque, se dibuja el panel de Programación y se traslada el saldo.

   CAPACIDAD (por línea y bloque; las UND de líneas distintas NUNCA se suman para medir capacidad):
     disponible = duración del bloque − unión de ventanas previstas      requerido = Σ (UND ÷ velocidad estándar) + preparaciones (cada una UNA vez)
     Estados: Cabe · Cabe, ajustado (carga ≥ 95 %) · No cabe · Estimación incompleta (se dice qué dato falta) · Sin programación.
     «No cabe» también cuando las horas totales caben pero la secuencia no es ejecutable entre las ventanas (motivo en pantalla).
   CAPACIDAD DEL PLAN vs RESTANTE: en un bloque ya iniciado se muestran las dos; la restante parte de «ahora», del producido oficial y de las ventanas futuras.
   Las evaluaciones guardadas al publicar un plan NO se reescriben al cambiar los parámetros: la pantalla avisa y ofrece recalcular (65a).

   TRASLADO DE SALDO: mueve a otro bloque lo que falta producir (programado − producido OFICIAL) en UNA transacción: baja el origen, sube el
   destino, deja el historial (origen y destino) y conserva el total. Con el compromiso original (64) el origen no oculta lo incumplido.
   Un identificador de traslado impide duplicados por doble clic o reintento; se relee el destino y su capacidad dentro de la transacción.
   Cargar después de 64-planificacion-avance.js, 65a y 65b.
   ============================================================= */
(function(){
  'use strict';
  const NS=window.glacialPlanificacion,M=NS.motor;
  const {num,esc,fechaOk,addDias,ahoraMs}=NS.util;
  const fmt=n=>num(n).toLocaleString('es-PE');

  /* ---------- tiempos y velocidades ---------- */
  const velDe=(l,p,m)=>typeof window.glacialVelocidadEstandar==='function'?num(window.glacialVelocidadEstandar(l,p,m)):0;
  NS.velocidadDe=velDe;
  NS.duracionBloqueMin=turno=>{
    const m=/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/.exec(NS.horarioBloque(turno)||'');
    if(!m)return 0;
    const a=Number(m[1])*60+Number(m[2]),b=Number(m[3])*60+Number(m[4]);
    return ((b-a)+1440)%1440||0;                 // Noche cruza la medianoche (21:00–07:00 = 10 h)
  };
  /* Valores generales de respaldo (etapa 3): {cambioMin, paradasMin|null}. Se conservan para quien aún no configura reglas ni ventanas. */
  NS.tiemposDe=turno=>{
    const t=typeof NS.tiemposPlan==='function'?NS.tiemposPlan():{};
    const cambio=Number.isFinite(Number(t.cambioMin))&&t.cambioMin!==null&&t.cambioMin!==''?Number(t.cambioMin):null;
    const k=NS.valorBloque(turno)==='NOCHE'?'fijoNocheMin':'fijoDiaMin';
    const par=Number.isFinite(Number(t[k]))&&t[k]!==null&&t[k]!==''?Number(t[k]):null;
    return {cambioMin:cambio,paradasMin:par};
  };
  const hm=min=>{const s=min<0?'-':'',a=Math.round(Math.abs(min));return a<60?s+a+' min':s+Math.floor(a/60)+' h '+String(a%60).padStart(2,'0')+' min';};
  NS.textoDuracion=hm;
  const hhmm=ms=>new Date(ms).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false});

  /* ---------- secuencia (tramos existentes, definidos en Paletas) ---------- */
  const filasBloque=(fecha,turno)=>NS.items(fecha,turno).filter(p=>NS.estadoDe(p)!=='CANCELADA');
  NS.tramosDe=(fecha,turno,linea)=>{
    const salida=[];
    filasBloque(fecha,turno).forEach(p=>{
      if(p.linea!==linea)return;
      (Array.isArray(p.tramosSecuencia)?p.tramosSecuencia:[]).forEach(t=>salida.push(Object.assign({},t,{marca:p.marca,presentacion:p.presentacion,clave:p.clave})));
    });
    return salida.sort((a,b)=>num(a.orden)-num(b.orden)||num(a.creadoEn)-num(b.creadoEn));
  };

  /* ---------- capacidad de una línea en un bloque ---------- */
  /* Lo que se MUESTRA: la evaluación vigente, o la guardada si los parámetros cambiaron desde que se guardó el plan (65a). null = sin programación. */
  NS.capacidadLinea=function(fecha,turno,linea){
    const e=NS.evaluar(fecha,turno,linea);
    return e?e.mostrar:null;
  };
  NS.cargaCelda=(fecha,bloque,linea)=>{const c=NS.capacidadLinea(fecha,bloque,linea);return c&&c.estado!=='INCOMPLETA'?{pct:c.cargaPct,estado:c.estado}:null;};
  /* Capacidad restante (solo bloques iniciados). */
  NS.capacidadRestante=function(fecha,turno,linea){
    try{return M.restante(NS.entradaMotor(fecha,turno,linea));}catch(e){return {aplica:false,motivo:'No se pudo calcular: '+((e&&e.message)||e)};}
  };
  /* Secuencia con horas estimadas, armada con el resultado de la colocación del motor (una sola fuente). */
  NS.secuenciaLinea=function(fecha,turno,linea){
    const tramos=NS.tramosDe(fecha,turno,linea);
    if(!tramos.length)return null;
    const c=NS.capacidadVigente(fecha,turno,linea);
    if(!c)return null;
    const bloque=NS.valorBloque(turno),b=NS.bloqueDe(fecha,bloque,linea),col=c.colocacion||{};
    const evs=(col.eventos||[]).filter(e=>e.tipo==='TRAMO');
    const sal=tramos.map(t=>{
      const e=evs.find(x=>num(x.orden)===num(t.orden)&&x.marca===t.marca&&x.presentacion===t.presentacion);
      const fila={orden:t.orden,marca:t.marca,presentacion:t.presentacion,tipoFin:t.tipoFin,horaFin:t.horaFin,inicioMs:null,finMs:null,qty:null,estimado:false};
      if(e&&e.estimado){fila.inicioMs=b.inicioMs+e.a*60000;fila.finMs=b.inicioMs+e.z*60000;fila.qty=e.qty;fila.estimado=true;}
      else fila.motivo=(e&&e.motivo)||(c.faltantes.length?'falta '+c.faltantes[0].dato+(c.faltantes[0].marca?' de '+c.faltantes[0].marca:''):'sin datos suficientes');
      return fila;
    });
    const preps=(col.eventos||[]).filter(e=>e.tipo==='PREP').map(e=>({etiqueta:e.etiqueta,minutos:e.minutos,inicioMs:b.inicioMs+e.a*60000,finMs:b.inicioMs+e.z*60000}));
    const avisos=(col.avisos||[]).concat(col.conflictos||[]);
    if(col.excedeMin>0)avisos.push('La secuencia estimada termina '+hm(col.excedeMin)+' después del fin del bloque.');
    return {tramos:sal,preparaciones:preps,incompleta:!col.verificada&&c.faltantes.length>0,avisos,sinTramo:col.sinTramo||[],quedan:col.quedan||[],
      finEstimadoMs:col.finOff!==null&&col.finOff!==undefined&&!(c.faltantes.length)?b.inicioMs+col.finOff*60000:null,finBloqueMs:b.inicioMs+b.duracionMin*60000,ventanas:c.ventanas||[]};
  };

  /* =========================================================
     PANEL EN PROGRAMACIÓN: capacidad y secuencia
     ========================================================= */
  /* Escala de CAPACIDAD (azul / violeta / fucsia / pizarra), con texto e ícono: NO usa los colores de estado operativo
     (naranja en producción, amarillo programada, rojo detenida, verde finalizada, gris pendiente). */
  const CAP={
    CABE:{txt:'Cabe',ico:'✓',cls:'pc-cabe'},JUSTO:{txt:'Cabe, ajustado',ico:'◐',cls:'pc-justo'},EXCESO:{txt:'No cabe',ico:'✕',cls:'pc-exceso'},
    INCOMPLETA:{txt:'Cálculo parcial',ico:'◐',cls:'pc-inc'},SIN_PROG:{txt:'Sin programación',ico:'—',cls:'pc-sin'},NODATOS:{txt:'Datos no disponibles',ico:'⚠',cls:'pc-nodatos'}};
  NS.CAP=CAP;
  NS.estilosCap=()=>estilosCap();
  const COLORES=['#005b96','#F97316','#0e9f6e','#8b5cf6','#d946ef','#0891b2'];
  function estilosCap(){
    if(document.getElementById('plan-cap-css'))return;
    const s=document.createElement('style');s.id='plan-cap-css';
    const css=`
      #plan-root .pc-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:800;border:1px solid var(--pc-b);background:var(--pc-bg);color:var(--pc-c);white-space:nowrap}
      #plan-root .pc-cabe{--pc-c:#075985;--pc-bg:#E0F2FE;--pc-b:#7DD3FC}
      #plan-root .pc-justo{--pc-c:#5B21B6;--pc-bg:#EDE9FE;--pc-b:#C4B5FD}
      #plan-root .pc-exceso{--pc-c:#86198F;--pc-bg:#FAE8FF;--pc-b:#E879F9}
      #plan-root .pc-inc{--pc-c:#334155;--pc-bg:#F8FAFC;--pc-b:#94A3B8}
      #plan-root .pc-inc.pc-chip{border-style:dashed}
      #plan-root .pc-sin{--pc-c:#64748B;--pc-bg:#FFFFFF;--pc-b:#CBD5E1}
      #plan-root .pc-nodatos{--pc-c:#7C2D12;--pc-bg:#FFF7ED;--pc-b:#FDBA74}
      #plan-root .plan-cap.pc{border-top:4px solid var(--pc-b)}
      #plan-root .plan-cap.pc .cap-meter i{background:var(--pc-c)}
      #plan-root .pc-leyenda{display:flex;gap:6px 12px;flex-wrap:wrap;align-items:center;margin:8px 0;font-size:12px;color:#46627a}
      #plan-root .pc-desf{margin-top:6px;padding:5px 8px;border-radius:8px;background:#FFF8E6;border:1px solid #F0C36A;color:#7A5200;font-size:11px}
      #plan-root .pc-det table{width:100%;font-size:12px;border-collapse:collapse;margin:4px 0 8px}
      #plan-root .pc-det th{text-align:left;color:#46627a;font-size:11px;padding:3px 6px;border-bottom:1px solid #dce5ec}
      #plan-root .pc-det td{padding:3px 6px;border-bottom:1px solid #edf2f6;vertical-align:top}
      #plan-root .pc-det td.num,#plan-root .pc-det th.num{text-align:right;font-variant-numeric:tabular-nums}
      #plan-root .pc-det h6{margin:10px 0 2px;font-size:12px;color:#003b5c}
      #plan-root .plan-gantt .g-vent{position:absolute;z-index:3;top:0;bottom:0;background:repeating-linear-gradient(135deg,#94A3B8,#94A3B8 4px,#CBD5E1 4px,#CBD5E1 8px);opacity:.7}
      #plan-root .plan-gantt .g-prep{position:absolute;top:10px;bottom:10px;background:#475569;border-radius:4px;opacity:.9}
    `;
    s.textContent=css+css.replace(/#plan-root/g,'.plan-dialogo');
    document.head.appendChild(s);
  }
  NS.leyendaCapacidad=function(){
    return '<div class="pc-leyenda" aria-label="Leyenda de capacidad">'+['CABE','JUSTO','EXCESO','INCOMPLETA','SIN_PROG','NODATOS'].map(k=>'<span class="pc-chip '+CAP[k].cls+'">'+CAP[k].ico+' '+CAP[k].txt+'</span>').join('')+
      '<small>Escala de capacidad: distinta de los colores de estado operativo.</small></div>';
  };
  /* Cálculo parcial: qué falta, lo que SÍ se conoce y, si lo conocido ya excede el bloque, el exceso mínimo comprobado. Nunca convierte un dato desconocido en cero. */
  NS.textoParcial=function(c){
    if(!c||!c.faltantes||!c.faltantes.length)return '';
    const cambio=c.preparaciones&&c.preparaciones.some(t=>t.minutos===null&&t.tipo==='CAMBIO');
    const vel=c.faltantes.filter(f=>f.dato==='velocidad estándar');
    const otros=c.faltantes.filter(f=>f.dato!=='velocidad estándar'&&!/^tiempo de cambio|cambio/i.test(f.dato));
    const partes=[];
    if(cambio)partes.push('configurar cambio de marca o de formato');
    vel.forEach(f=>partes.push('la velocidad estándar de '+(f.marca?f.marca+' ':'')+(f.etiqueta||f.presentacion||'un producto')));
    otros.forEach(f=>partes.push(f.dato));
    if(!partes.length)partes.push(c.faltantes.map(f=>f.dato).join('; '));
    return 'Cálculo parcial: falta '+partes.join('; ')+'.';
  };
  NS.chipCapacidad=function(estado){const k=CAP[estado]||CAP.NODATOS;return '<span class="pc-chip '+k.cls+'">'+k.ico+' '+k.txt+'</span>';};

  /* Desglose explicable de una capacidad (y de la restante si el bloque ya inició). */
  NS.htmlDesglose=function(c,restante,nombreLineaTxt){
    if(!c)return '';
    const fila=(a,b,cls)=>'<tr><td'+(cls?' class="'+cls+'"':'')+'>'+a+'</td><td class="num">'+b+'</td></tr>';
    let h='<div class="pc-det"><h6>Tiempo</h6><table><tbody>'+
      fila('Tiempo bruto del bloque',hm(c.brutoMin))+
      fila('Ventanas previstas (unión)',hm(c.indisponibleMin)+(c.ventanasSinHorarioMin?' <small>(general, sin horario)</small>':''))+
      fila('<b>Tiempo disponible</b>','<b>'+hm(c.disponibleMin)+'</b>')+
      fila('Producción requerida',hm(c.produccionMin)+(c.faltantes.some(f=>f.dato==='velocidad estándar')?'*':''))+
      fila('Cambios y preparaciones',hm(c.preparacionMin))+
      fila(c.estado==='INCOMPLETA'?'<b>Tiempo requerido conocido (parcial)</b>':'<b>Tiempo total requerido</b>',c.estado==='INCOMPLETA'?'<b>≥ '+hm(c.requeridoMin)+'</b>':'<b>'+hm(c.requeridoMin)+'</b>')+
      fila('Saldo de tiempo',c.estado==='INCOMPLETA'?(c.excesoMinimoMin>0?'Exceso mínimo comprobado '+hm(c.excesoMinimoMin):'—'):(c.saldoMin<0?'Exceso ':'Libre ')+hm(Math.abs(c.saldoMin)))+
      fila('Utilización',c.utilizacionPct===null?'—':Math.round(c.utilizacionPct)+' %')+'</tbody></table>';
    h+='<h6>Productos</h6><table><thead><tr><th>Producto</th><th class="num">UND</th><th class="num">UND/h</th><th class="num">Tiempo</th></tr></thead><tbody>'+
      c.productos.map(p=>'<tr><td>'+esc(p.marca)+' '+esc(p.etiqueta||p.presentacion)+'</td><td class="num">'+fmt(p.cantidad)+'</td><td class="num">'+(p.vel?fmt(p.vel):'—')+'</td><td class="num">'+(p.min===null?'—':hm(p.min))+'</td></tr>').join('')+'</tbody></table>';
    if(c.preparaciones.length||c.preparacionesOmitidas.length){
      h+='<h6>Preparaciones (cada una cuenta una vez)</h6><table><thead><tr><th>Tarea</th><th class="num">Min</th><th>Regla aplicada</th></tr></thead><tbody>'+
        c.preparaciones.map(t=>'<tr><td>'+esc(t.etiqueta)+'</td><td class="num">'+(t.minutos===null?'—':t.minutos)+'</td><td>'+esc(t.explicacion||'')+(t.faltante?' <b>Falta: '+esc(t.faltante)+'</b>':'')+'</td></tr>').join('')+
        c.preparacionesOmitidas.map(t=>'<tr><td>'+esc(t.etiqueta)+'</td><td class="num">0</td><td>'+esc(t.motivo)+'</td></tr>').join('')+'</tbody></table>';
    }
    if(c.ventanas.length){
      h+='<h6>Ventanas previstas</h6><table><thead><tr><th>Tipo</th><th>Horario</th><th class="num">Min</th><th>Motivo</th></tr></thead><tbody>'+
        c.ventanas.map(v=>'<tr><td>'+esc(M.TIPOS_VENTANA[v.tipo]||v.tipo)+'</td><td>'+hhmm(v.inicioMs)+'–'+hhmm(v.finMs)+'</td><td class="num">'+v.minutos+'</td><td>'+esc(v.motivo||'')+'</td></tr>').join('')+'</tbody></table>'+
        (c.ventanasSolapadasMin>0?'<p class="plan-nota">Hay ventanas superpuestas: se descuentan '+c.ventanasSolapadasMin+' min menos que la suma (unión).</p>':'');
    }
    const col=c.colocacion||{};
    if(col.verificada)h+='<h6>Colocación de la secuencia</h6><p class="plan-nota">'+(col.ejecutable?'Los tramos caben entre las ventanas: terminaría hacia las '+hhmm(c.finEstMs)+'.':'No es ejecutable: '+esc((col.conflictos&&col.conflictos[0])||(col.quedan&&col.quedan.length?'queda cantidad sin producir dentro del bloque':'revisa los tramos'))+'.')+'</p>';
    else if(col.motivo)h+='<p class="plan-nota">'+esc(col.motivo)+'</p>';
    if(c.faltantes.length)h+='<div class="cap-falta"><b>'+esc(NS.textoParcial(c))+'</b> La parte conocida se muestra arriba; el total definitivo no puede calcularse hasta completarlo.</div>';
    if(false)h+='<div class="cap-falta">Falta: '+c.faltantes.map(f=>esc(f.dato)+(f.marca&&!/ \(/.test(f.dato)?' de '+esc(f.marca)+' '+esc(f.etiqueta||f.presentacion):'')).join('; ')+'. Complétalo en el Catálogo → Tiempos previstos / velocidades.</div>';
    if(c.notas.length)h+='<p class="plan-nota">'+c.notas.map(esc).join('<br>')+'</p>';
    h+='<p class="plan-nota">Parámetros versión '+num(c.parametrosVersion)+'. Es una previsión de planificación: no crea paradas oficiales ni cambia el ratio real.</p>';
    if(restante){
      h+='<h6>Capacidad restante del bloque iniciado</h6>';
      if(!restante.aplica)h+='<p class="plan-nota">'+esc(restante.motivo||'No aplica.')+'</p>';
      else if(restante.estado==='SIN_DATOS'||restante.estado==='INCOMPLETA')h+='<p class="plan-error" style="display:block">'+esc(restante.motivo)+'</p>';
      else h+='<table><tbody>'+fila('Calculado a las',hhmm(restante.ahoraMs))+fila('Tiempo disponible restante',hm(restante.disponibleMin)+(restante.ventanasFuturasMin?' <small>(sin '+Math.round(restante.ventanasFuturasMin)+' min de ventanas futuras)</small>':''))+
        fila('Producción pendiente',hm(restante.produccionMin))+fila('Preparaciones que faltan',hm(restante.preparacionMin))+fila('<b>Requerido restante</b>','<b>'+hm(restante.requeridoMin)+'</b>')+
        fila('Saldo',(restante.holguraMin<0?'Exceso ':'Libre ')+hm(Math.abs(restante.holguraMin)))+'</tbody></table><p class="plan-nota">'+esc(restante.fuente)+'</p>'+(restante.notas&&restante.notas.length?'<p class="plan-nota">'+restante.notas.map(esc).join('<br>')+'</p>':'');
    }
    return h+'</div>';
  };

  document.addEventListener('click',e=>{
    const b=e.target.closest&&e.target.closest('[data-plan-config-tiempos]');
    if(!b||!NS.puede())return;
    NS.estado.tab='catalogo';NS.pintarPestana();
  });
  NS.pintarExtras=function(){
    const cap=document.getElementById('plan-capacidad');
    if(!cap)return;
    estilosCap();
    const E=NS.estado,dur=NS.duracionBloqueMin(E.turno),planifica=NS.puede();
    const tarjetas=[];let desf=0;
    NS.lineas().forEach(l=>{
      const ev=NS.evaluar(E.fecha,E.turno,l.key);
      if(!ev)return;
      const c=ev.mostrar,k=CAP[c.estado]||CAP.NODATOS,restante=NS.capacidadRestante(E.fecha,E.turno,l.key);
      if(ev.desfasada)desf++;
      const rest=restante&&restante.aplica?'<div class="cap-fil"><span>Capacidad restante <small>('+hhmm(restante.ahoraMs)+')</small></span><b>'+(restante.estado==='SIN_DATOS'||restante.estado==='INCOMPLETA'?'sin datos':
        (restante.estado==='EXCESO'?'No cabe · exceso '+hm(-restante.holguraMin):'Libre '+hm(restante.holguraMin)))+'</b></div>':'';
      tarjetas.push('<div class="plan-cap pc '+k.cls+'"><h5><span>'+esc(l.name)+'</span>'+NS.chipCapacidad(c.estado)+'</h5>'+
        '<div class="cap-pct">'+(c.cargaPct===null?'—':Math.round(c.cargaPct)+' %')+'<small>de utilización del tiempo disponible</small></div>'+
        '<div class="cap-meter"><i style="width:'+(c.cargaPct===null?0:Math.min(100,Math.round(c.cargaPct)))+'%"></i></div>'+
        '<div class="cap-fil"><span>Disponible</span><b>'+hm(c.disponibleMin)+'</b></div>'+
        '<div class="cap-fil"><span>Producción requerida</span><b>'+(c.produccionMin>0||!c.faltantes.length?hm(c.produccionMin):'—')+(c.faltantes.some(f=>f.dato==='velocidad estándar')&&c.produccionMin>0?'*':'')+'</b></div>'+
        '<div class="cap-fil"><span>Cambios y preparaciones <small>('+c.preparaciones.length+')</small></span><b>'+hm(c.preparacionMin)+'</b></div>'+
        '<div class="cap-fil"><span>'+(c.estado==='INCOMPLETA'?'Requerido conocido <small>(parcial)</small>':'Requerido total')+'</span><b>'+(c.estado==='INCOMPLETA'?'≥ ':'')+hm(c.requeridoMin)+'</b></div>'+
        '<div class="cap-fil cap-hol"><span>'+(c.estado==='INCOMPLETA'?(c.excesoMinimoMin>0?'Exceso mínimo comprobado':'Libre / exceso'):(c.holguraMin<0?'Exceso':'Tiempo libre'))+'</span>'+(c.estado==='INCOMPLETA'?'<b>'+(c.excesoMinimoMin>0?hm(c.excesoMinimoMin):'pendiente')+'</b>':'<b>'+hm(Math.abs(c.holguraMin))+'</b>')+'</div>'+
        (c.finEstMs&&c.estado!=='INCOMPLETA'?'<div class="cap-fil"><span>Inicio y fin estimados</span><b>'+hhmm(c.inicioEstMs)+' – '+hhmm(c.finEstMs)+'</b></div>':'')+rest+
        (c.motivoExceso?'<div class="cap-falta" style="background:#FAE8FF;color:#86198F">'+esc(c.motivoExceso)+'</div>':'')+
        (c.faltantes.length?'<div class="cap-falta"><b>'+esc(NS.textoParcial(c))+'</b>'+(c.estado==='INCOMPLETA'&&c.excesoMinimoMin>0?' Lo conocido ya excede el tiempo disponible: no cabe, y el exceso real puede ser mayor.':'')+
          (planifica?'<div style="margin-top:6px"><button type="button" class="btn btn-ghost btn-sm" data-plan-config-tiempos>Configurar tiempo de cambio</button></div>':'')+'</div>':'')+
        (ev.desfasada?'<div class="pc-desf">Evaluación guardada con los parámetros v'+num(ev.guardada.version)+'; hoy serían otros (v'+num(c.parametrosVersion)+'). Con los de hoy: '+esc(CAP[ev.vigente.estado].txt)+'. '+(planifica?'Recalcula en Catálogo → Tiempos previstos.':'')+'</div>':'')+
        '<details class="pc-d"><summary>Desglose</summary>'+NS.htmlDesglose(ev.vigente,restante)+'</details>'+
        (planifica&&c.estado==='EXCESO'&&typeof NS.abrirOpciones==='function'?'<div style="margin-top:8px"><button type="button" class="btn btn-primary btn-sm" data-plan-opciones="'+esc(l.key)+'">Ver opciones para completar</button></div>':'')+'</div>');
    });
    cap.innerHTML=!tarjetas.length?'':'<h4 class="plan-h4">Capacidad del bloque <small>(estimación de referencia · duración '+hm(dur)+')</small></h4>'+NS.leyendaCapacidad()+
      '<div class="plan-caps">'+tarjetas.join('')+'</div>'+
      '<p class="plan-nota">Cada tiempo se cuenta una sola vez: las ventanas solo restan del disponible y las preparaciones solo suman al requerido. * sin los productos que no tienen velocidad estándar. Una estimación incompleta no se presenta como verdadera: completa el dato que falta. Las ventanas y reglas se configuran en Catálogo → Tiempos previstos. Pedidos, stock de insumos y mantenimiento programado: <b>Por confirmar</b> (todavía no hay una fuente fiable en el sistema). Esto es una previsión de planificación; el estado operativo es la ejecución real.</p>'+
      (desf?'<p class="plan-nota" style="color:#7A5200">'+desf+(desf===1?' línea muestra':' líneas muestran')+' una evaluación guardada con parámetros anteriores (no se reescribió en silencio).</p>':'');
    // secuencia: barra de tiempo del bloque (con ventanas y preparaciones) + detalle
    const sec=document.getElementById('plan-secuencia');
    if(!sec)return;
    const bloque=NS.valorBloque(E.turno),ini=NS.inicioBloqueMs(E.fecha,bloque),durMs=dur*60000;
    const bloques=[];
    NS.lineas().forEach(l=>{
      const s=NS.secuenciaLinea(E.fecha,E.turno,l.key);
      if(!s)return;
      const colorDe=new Map();
      s.tramos.forEach(x=>{const k=x.marca+'|'+x.presentacion;if(!colorDe.has(k))colorDe.set(k,COLORES[colorDe.size%COLORES.length]);});
      const pos=(a,z)=>{const left=Math.max(0,(a-ini)/durMs*100);return 'left:'+left.toFixed(2)+'%;width:'+Math.max(1.2,Math.min(100-left,(z-a)/durMs*100)).toFixed(2)+'%';};
      const segs=ini&&durMs?s.ventanas.map(v=>'<span class="g-vent" style="'+pos(v.inicioMs,v.finMs)+'" title="'+esc((M.TIPOS_VENTANA[v.tipo]||v.tipo)+' '+hhmm(v.inicioMs)+'–'+hhmm(v.finMs))+'"></span>').join('')+
        s.preparaciones.filter(p=>p.minutos>0).map(p=>'<span class="g-prep" style="'+pos(p.inicioMs,p.finMs)+'" title="'+esc(p.etiqueta+' · '+p.minutos+' min')+'"></span>').join('')+
        s.tramos.filter(x=>x.estimado).map(x=>'<span class="g-seg" style="'+pos(x.inicioMs,x.finMs)+';background:'+colorDe.get(x.marca+'|'+x.presentacion)+'" title="'+esc(x.marca+' · '+hhmm(x.inicioMs)+'–'+hhmm(x.finMs)+' · '+fmt(Math.round(x.qty))+' UND')+'">'+esc(x.marca)+'</span>').join(''):'';
      const exceso=s.finEstimadoMs&&s.finEstimadoMs>s.finBloqueMs?'<span class="g-over" title="La secuencia estimada pasa del fin del bloque">+'+hm((s.finEstimadoMs-s.finBloqueMs)/60000)+'</span>':'';
      const f=s.tramos.map(x=>'<tr><td class="num">'+esc(x.orden)+'</td><td>'+esc(x.marca)+' '+esc(NS.etiquetaPresentacion(l.key,x.marca,x.presentacion))+'</td><td>'+esc(x.tipoFin==='HORA'?'Hasta '+x.horaFin:x.tipoFin==='CANTIDAD'?'Hasta completar su cantidad':x.tipoFin==='CIERRE'?'Hasta el cierre del turno':'—')+'</td>'+
        '<td class="num">'+(x.estimado?hhmm(x.inicioMs):'—')+'</td><td class="num">'+(x.estimado?hhmm(x.finMs):'—')+'</td><td class="num">'+(x.estimado?fmt(Math.round(x.qty)):'—')+'</td>'+(x.motivo?'<td><small style="color:#6b7280">Estimación incompleta: '+esc(x.motivo)+'</small></td>':'<td></td>')+'</tr>').join('');
      bloques.push('<div class="plan-seq"><h5>'+esc(l.name)+(s.finEstimadoMs?' <small>· termina hacia las '+hhmm(s.finEstimadoMs)+'</small>':'')+'</h5>'+
        (segs?'<div class="plan-gantt" role="img" aria-label="Secuencia estimada de '+esc(l.name)+', con ventanas previstas y preparaciones">'+segs+exceso+'</div><div class="plan-gantt-eje"><span>'+hhmm(ini)+'</span><span>'+hhmm(ini+durMs/2)+'</span><span>'+hhmm(ini+durMs)+'</span></div>':'')+
        '<details'+(segs?'':' open')+'><summary>Detalle de tramos</summary><div class="plan-scroll"><table class="plan-tabla"><thead><tr><th class="num">Orden</th><th>Producto</th><th>Fin del tramo</th><th class="num">Inicio estimado</th><th class="num">Fin estimado</th><th class="num">UND estimadas</th><th></th></tr></thead><tbody>'+f+'</tbody></table></div></details>'+
        (s.avisos.length?'<p class="plan-nota" style="color:#9A3412">'+s.avisos.map(esc).join('<br>')+'</p>':'')+
        (s.sinTramo.length?'<p class="plan-nota">Sin posición en la secuencia: '+s.sinTramo.map(x=>esc(x.marca)+' '+esc(NS.etiquetaPresentacion(l.key,x.marca,x.presentacion))+' ('+fmt(x.cantidad)+' UND)').join(', ')+'.</p>':'')+
        (s.quedan.length?'<p class="plan-nota">Quedan sin asignar a un tramo: '+s.quedan.map(x=>esc(x.marca)+' '+fmt(x.cantidad)+' UND').join(', ')+'.</p>':'')+'</div>');
    });
    sec.innerHTML=bloques.length?'<h4 class="plan-h4">Secuencia del bloque <small>(tramos definidos en Paletas · horas estimadas a velocidad estándar · franjas rayadas = ventanas previstas)</small></h4>'+bloques.join('')+
      '<p class="plan-nota">Un producto que aparece en varios tramos (p. ej. SCALA → BELLS → SCALA) reparte entre ellos solo lo programado: su cantidad no se duplica. Una preparación no se parte: si no cabe antes de una ventana, se coloca después.</p>':'';
  };

  /* =========================================================
     TRASLADO DE SALDO
     ========================================================= */
  const usuarioNombre=()=>(typeof state!=='undefined'&&state.user&&(state.user.nombre||state.user.username))||'';
  const conflicto=(msg,actual,extra)=>{const e=new Error(msg);e.conflicto=true;e.actual=actual||null;if(extra)Object.assign(e,extra);return e;};
  /* Saldo comprobado de la fila: {programado, producido, saldo, max} o {error}. Sin registro NO es cero: no se puede comprobar. */
  NS.saldoDe=function(item){
    const r=NS.resumenBloque(item.fecha,item.turno),g=r.grupos.get([item.linea,item.marca,item.presentacion].join('|'));
    if(!g||!(g.programado>0))return {error:'Esta programación no tiene cantidad activa.'};
    if(g.producido===null)return {error:'No hay registro de producción de este producto: no se puede comprobar el saldo.',programado:g.programado};
    const saldo=Math.max(0,g.programado-g.producido);
    return {programado:g.programado,producido:g.producido,saldo,max:Math.min(saldo,num(item.cantidadProgramada))};
  };
  /* Filas (marca, presentación, cantidad) de una línea y bloque dentro de CUALQUIER lista de programaciones (la de la nube o la de una transacción). */
  NS.filasDeLista=(items,fecha,bloque,linea)=>(items||[]).filter(p=>p&&p.linea===linea&&p.fecha===fecha&&NS.valorBloque(p.turno)===bloque&&num(p.cantidadProgramada)>0&&NS.estadoDe(p)!=='CANCELADA')
    .map(p=>({marca:p.marca,presentacion:p.presentacion,cantidad:num(p.cantidadProgramada)}));
  const capDeFilas=(fecha,bloque,linea,filas)=>M.capacidad(NS.entradaMotor(fecha,bloque,linea,filas));
  const resumenCap=c=>c?{estado:c.estado,requeridoMin:Math.round(c.requeridoMin),disponibleMin:Math.round(c.disponibleMin),holguraMin:Math.round(c.holguraMin),cargaPct:c.cargaPct===null?null:Math.round(c.cargaPct)}:{estado:'SIN_PROG',requeridoMin:0,disponibleMin:0,holguraMin:0,cargaPct:null};
  /* Capacidad de origen y destino antes y después de mover `cant` UND de un producto (con los datos que se pasen: cache o transacción). */
  NS.simularTraslado=function(item,destFecha,destTurno,cant,itemsOpc){
    const items=itemsOpc||NS.programaciones(),ob=NS.valorBloque(item.turno),dbk=NS.valorBloque(destTurno);
    const fo=NS.filasDeLista(items,item.fecha,ob,item.linea),fd=NS.filasDeLista(items,destFecha,dbk,item.linea);
    const mover=(filas,delta)=>{
      const sal=filas.map(f=>Object.assign({},f)),i=sal.findIndex(f=>f.marca===item.marca&&f.presentacion===item.presentacion);
      if(i>=0)sal[i].cantidad+=delta;else if(delta>0)sal.push({marca:item.marca,presentacion:item.presentacion,cantidad:delta});
      return sal.filter(f=>f.cantidad>0);
    };
    return {origen:{antes:resumenCap(capDeFilas(item.fecha,ob,item.linea,fo)),despues:resumenCap(capDeFilas(item.fecha,ob,item.linea,mover(fo,-cant)))},
      destino:{antes:resumenCap(capDeFilas(destFecha,dbk,item.linea,fd)),despues:resumenCap(capDeFilas(destFecha,dbk,item.linea,mover(fd,cant)))}};
  };
  const finBloqueMs=(fecha,bloque)=>NS.inicioBloqueMs(fecha,bloque)+NS.duracionBloqueMin(bloque)*60000;
  const aplicados=new Set();            // identificadores de traslado ya aplicados en este dispositivo
  /* o: {item, destFecha, destTurno, cantidad, motivo, trasladoId, destVersionEsperada?, aceptoExceso?} */
  NS.trasladarSaldo=async function(o){
    if(!NS.puede())throw new Error('Solo Planificación puede trasladar saldo.');
    const item=o.item,cant=Number(o.cantidad),motivo=String(o.motivo||'').trim(),destBloque=NS.valorBloque(o.destTurno),origBloque=NS.valorBloque(item.turno);
    const tid=String(o.trasladoId||'').replace(/[^A-Za-z0-9_-]/g,'');
    if(!tid)throw new Error('Falta el identificador del traslado.');
    if(motivo.length<5)throw new Error('Indica el motivo del traslado (mínimo 5 caracteres).');
    if(!fechaOk(o.destFecha))throw new Error('La fecha de destino no es válida.');
    if(o.destFecha===item.fecha&&destBloque===origBloque)throw new Error('El destino debe ser otro bloque o otra fecha.');
    if(ahoraMs()>=finBloqueMs(o.destFecha,destBloque))throw new Error('El bloque de destino ya terminó: no se puede trasladar producción a un bloque pasado.');
    // mismo identificador ya aplicado (doble clic o reintento): no se repite ni se confunde con un conflicto de versión
    const idO0='h_tr_'+tid+'_o';
    if(aplicados.has(tid))return {trasladoId:tid,duplicado:true};
    try{const prev=await db.collection('historialProgramacion').doc(idO0).get();if(prev.exists){aplicados.add(tid);return {trasladoId:tid,duplicado:true};}}catch(_){/* sin lectura del historial: la transacción vuelve a comprobarlo */}
    // se relee la fila y el saldo actuales (no los que se veían al abrir): si cambiaron, se pide revisar la propuesta
    const fresco=NS.programaciones().find(p=>p.clave===item.clave);
    if(!fresco)throw conflicto('La programación de origen ya no existe (otra persona la quitó). No se trasladó nada.',null,{propuestaCambio:true});
    if(num(fresco.version)!==num(item.version))throw conflicto('La programación de origen cambió mientras revisabas la propuesta. Valor actual: '+fmt(fresco.cantidadProgramada)+' UND. Revisa la propuesta actualizada.',{cantidad:num(fresco.cantidadProgramada)},{propuestaCambio:true});
    const s=NS.saldoDe(fresco);
    if(s.error)throw new Error(s.error);
    if(!Number.isInteger(cant)||cant<=0)throw new Error('La cantidad a trasladar debe ser un entero mayor que cero.');
    if(cant>s.max)throw conflicto('Solo se pueden trasladar '+fmt(s.max)+' UND (saldo comprobado: programado '+fmt(s.programado)+' − producido '+fmt(s.producido)+' = '+fmt(s.saldo)+').',{max:s.max},{propuestaCambio:cant<=num(item.cantidadProgramada)});
    // compromiso original (64) de los bloques que ya empezaron: se guarda antes del cambio, sin bloquear
    if(typeof NS.asegurarCompromiso==='function'){await NS.asegurarCompromiso(item.fecha,item.turno);await NS.asegurarCompromiso(o.destFecha,destBloque);}
    const quien=usuarioNombre(),ref=db.collection('sync').doc('programaciones'),idO='h_tr_'+tid+'_o',idD='h_tr_'+tid+'_d';
    const info={trasladoId:tid,origen:{fecha:item.fecha,bloque:origBloque},destino:{fecha:o.destFecha,bloque:destBloque},cantidad:cant,saldoComprobado:s.saldo,programadoOrigen:s.programado,producidoOrigen:s.producido};
    let lista=null,duplicado=false;
    await db.runTransaction(async tx=>{
      lista=null;duplicado=false;
      const previo=await tx.get(db.collection('historialProgramacion').doc(idO));
      if(previo.exists){duplicado=true;return;}                         // el mismo traslado ya se aplicó (doble clic o reintento)
      const snap=await tx.get(ref);
      const items=snap.exists&&Array.isArray(snap.data().items)?snap.data().items.slice():[];
      const eventos=[];
      const orig=items.find(p=>p.clave===item.clave);
      if(!orig)throw conflicto('La programación de origen ya no existe (otra persona la quitó). No se trasladó nada.',null,{propuestaCambio:true});
      if(num(orig.version)!==num(item.version))throw conflicto('La programación de origen cambió mientras preparabas el traslado. Valor actual: '+fmt(orig.cantidadProgramada)+' UND. No se trasladó nada.',{cantidad:num(orig.cantidadProgramada)},{propuestaCambio:true});
      if(cant>num(orig.cantidadProgramada))throw conflicto('La cantidad de origen es ahora '+fmt(orig.cantidadProgramada)+' UND: no alcanza para trasladar '+fmt(cant)+'.',{cantidad:num(orig.cantidadProgramada)},{propuestaCambio:true});
      const upp=num(orig.unidadesPorPaleta)||num(NS.uppSugerida(item.linea,item.marca,item.presentacion));
      const campos=(c,u)=>({cantidadProgramada:c,unidadesPorPaleta:u,paletasProgramadas:u?c/u:0,actualizadoPor:quien,actualizadoEn:Date.now()});
      const base={linea:item.linea,marca:item.marca,presentacion:item.presentacion};
      // destino: no se reabre producción ni se revive una fila cancelada; y debe seguir tal como se revisó
      const claveDest=NS.clave(item.linea,o.destFecha,destBloque,item.marca,item.presentacion);
      const dest=items.find(p=>p.clave===claveDest)||null;
      if(dest&&NS.estadoDe(dest)==='FINALIZADA')throw conflicto('El producto ya está finalizado en el destino: no se reabre producción automáticamente.',null,{propuestaCambio:true});
      if(dest&&NS.estadoDe(dest)==='CANCELADA'&&num(dest.cantidadProgramada)>0)throw conflicto('El producto está cancelado en el destino: no se reactiva automáticamente.',null,{propuestaCambio:true});
      if(o.destVersionEsperada!==undefined&&num(dest&&dest.version)!==num(o.destVersionEsperada))
        throw conflicto('El destino cambió mientras revisabas la propuesta (ahora tiene '+fmt(dest?dest.cantidadProgramada:0)+' UND de este producto). Revisa la propuesta actualizada.',{cantidad:num(dest&&dest.cantidadProgramada)},{propuestaCambio:true});
      // capacidad del destino con los datos de la transacción
      const sim=NS.simularTraslado(item,o.destFecha,destBloque,cant,items);
      info.capacidad=sim;
      if(sim.destino.despues.estado==='EXCESO'){
        if(!o.aceptoExceso)throw conflicto('El destino quedaría sin capacidad ('+sim.destino.despues.requeridoMin+' min requeridos de '+sim.destino.despues.disponibleMin+' disponibles). Confirma el exceso o traslada menos.',null,{exceso:true});
        info.excesoDestino=true;
      }
      if(sim.destino.despues.estado==='INCOMPLETA')info.destinoIncompleto=true;
      // origen: baja lo trasladado (lo producido se queda)
      const nuevaOrig=num(orig.cantidadProgramada)-cant;
      const rO=programacionAplicarEnLista(items,Object.assign({},base,{fecha:item.fecha,turno:item.turno,cantidadNum:nuevaOrig,uppNum:upp,campos:campos(nuevaOrig,upp),motivo:'Traslado de saldo: '+motivo}),{versionEsperada:num(item.version)});
      // destino: crea o suma
      const nuevaDest=(dest?num(dest.cantidadProgramada):0)+cant,uppDest=num(dest&&dest.unidadesPorPaleta)||upp;
      const rD=programacionAplicarEnLista(items,Object.assign({},base,{fecha:o.destFecha,turno:destBloque,cantidadNum:nuevaDest,uppNum:uppDest,campos:campos(nuevaDest,uppDest),motivo:'Traslado de saldo: '+motivo}),{});
      tx.set(ref,{items,updatedAt:Date.now()});
      lista=items;
      const ev=(r,fecha,turno,ref2,idFijo)=>{
        const e=NS.armarEvento(Object.assign({accion:r.nuevo?(r.previo?'EDICION':'CREACION'):'ELIMINACION',linea:item.linea,fecha,turno,marca:item.marca,presentacion:item.presentacion,
          anterior:programacionValorHistorial(r.previo,true),nuevo:programacionValorHistorial(r.nuevo,false),motivo,referencia:ref2},{extra:{traslado:info}}));
        if(e)e.id=idFijo;                                                // id fijo: es la marca que impide aplicar dos veces el mismo traslado
        return e;
      };
      [ev(rO,item.fecha,rO.turnoFinal,'TRASLADO: a '+o.destFecha+' '+destBloque,idO),ev(rD,o.destFecha,rD.turnoFinal,'TRASLADO: desde '+item.fecha+' '+origBloque,idD)]
        .forEach(e=>{if(e)tx.set(db.collection('historialProgramacion').doc(e.id),e.doc);});
    });
    aplicados.add(tid);
    if(duplicado)return Object.assign({},info,{duplicado:true});
    if(lista&&typeof _programacionesCache!=='undefined')_programacionesCache=lista;
    try{if(typeof NS.programarEvaluacion==='function'){NS.programarEvaluacion(item.fecha,item.turno);NS.programarEvaluacion(o.destFecha,destBloque);}}catch(_){/* informativo */}
    return info;
  };

  const idTraslado=()=>'t'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  /* pref (opcional): {destFecha, destTurno, cantidad, motivo, aviso, destVersion}: lo usa «Ver opciones para completar». */
  NS.abrirTraslado=function(clave,pref){
    if(!NS.puede())return;
    pref=pref||{};
    const item=NS.programaciones().find(p=>p.clave===clave);
    const msg=(t,x)=>NS.abrirDialogo('<h3>'+esc(t)+'</h3><p>'+esc(x)+'</p><div class="plan-acciones"><button type="button" class="btn btn-primary" data-plan-cerrar>Entendido</button></div>').querySelector('[data-plan-cerrar]').addEventListener('click',e=>e.target.closest('.plan-fondo').remove());
    if(!item){msg('Traslado','Esta programación ya no existe.');return;}
    const s=NS.saldoDe(item);
    if(s.error){msg('No se puede trasladar',s.error);return;}
    if(!(s.max>0)){msg('No hay saldo por trasladar','Producido '+fmt(s.producido)+' de '+fmt(s.programado)+' UND.');return;}
    const origBloque=NS.valorBloque(item.turno);
    const sigFecha=pref.destFecha||(origBloque==='NOCHE'?addDias(item.fecha,1):item.fecha),sigBloque=pref.destTurno?NS.valorBloque(pref.destTurno):(origBloque==='NOCHE'?'DÍA':'NOCHE');
    const tid=idTraslado();                         // un identificador por diálogo: un doble clic o un reintento no aplica dos veces
    const fondo=NS.abrirDialogo('<h3>Trasladar saldo</h3>'+(pref.aviso?'<div class="plan-aviso" style="font-weight:700;color:#7A5200">'+esc(pref.aviso)+'</div>':'')+
      '<p style="font-size:13px">'+esc(NS.nombreLinea(item.linea))+' · '+esc(item.marca)+' '+esc(NS.etiquetaPresentacion(item.linea,item.marca,item.presentacion))+' · '+esc(item.fecha)+' · '+esc(NS.etiquetaBloque(item.turno))+'<br>'+
      'Programado <b>'+fmt(s.programado)+'</b> − producido <b>'+fmt(s.producido)+'</b> = saldo <b>'+fmt(s.saldo)+' UND</b>'+(s.max<s.saldo?' (en esta fila se pueden trasladar hasta '+fmt(s.max)+')':'')+'.</p>'+
      '<div class="plan-campos"><label>Fecha de destino<input type="date" id="tr-fecha" value="'+esc(sigFecha)+'"></label>'+
      '<label>Bloque de destino<select id="tr-bloque">'+NS.BLOQUES.map(b=>'<option value="'+b.valor+'"'+(b.valor===sigBloque?' selected':'')+'>'+esc(NS.etiquetaBloqueConHorario(b.valor))+'</option>').join('')+'</select></label>'+
      '<label class="completo">Cantidad a trasladar (UND)<input type="number" id="tr-cant" min="1" max="'+s.max+'" step="1" value="'+esc(Math.min(s.max,Number(pref.cantidad)||s.max))+'"></label>'+
      '<label class="completo">Motivo (obligatorio)<textarea id="tr-motivo" rows="2" maxlength="200">'+esc(pref.motivo||'')+'</textarea></label></div>'+
      '<div id="tr-cap" class="plan-nota"></div><div class="plan-aviso" id="tr-aviso"></div>'+
      '<label id="tr-l-exceso" style="display:none;margin-top:8px;font-size:13px"><input type="checkbox" id="tr-exceso"> Acepto que el destino quede con exceso (queda registrado)</label>'+
      '<div class="plan-error" id="tr-error"></div>'+
      '<p class="plan-nota">El origen baja y el destino sube en la misma operación: el total no se duplica. Lo ya producido se queda en el origen y el plan original del bloque (si ya empezó) queda guardado. Queda en el historial.</p>'+
      '<div class="plan-acciones"><button type="button" class="btn btn-ghost" id="tr-cancelar">Cancelar</button><button type="button" class="btn btn-primary" id="tr-ok">Trasladar</button></div>');
    const q=i=>fondo.querySelector('#'+i);
    const txtCap=(c,t)=>t+': '+({CABE:'cabe',JUSTO:'cabe, ajustado',EXCESO:'no cabe',INCOMPLETA:'cálculo parcial',SIN_PROG:'sin programación'})[c.estado]+(c.estado==='SIN_PROG'||c.estado==='INCOMPLETA'?'':' ('+c.requeridoMin+' / '+c.disponibleMin+' min)');
    const aviso=()=>{
      const f=q('tr-fecha').value,b=q('tr-bloque').value,c=num(q('tr-cant').value);
      const ex=fechaOk(f)?NS.existente(item.linea,f,b,item.marca,item.presentacion):null;
      q('tr-aviso').textContent=ex&&num(ex.cantidadProgramada)>0?'En el destino ya hay '+fmt(ex.cantidadProgramada)+' UND de este producto: quedarán '+fmt(num(ex.cantidadProgramada)+c)+' UND.':'';
      if(fechaOk(f)&&Number.isInteger(c)&&c>0&&c<=s.max){
        try{
          const sim=NS.simularTraslado(item,f,b,c);
          q('tr-cap').innerHTML='<b>Capacidad</b> · origen: '+esc(txtCap(sim.origen.antes,'antes'))+' → '+esc(txtCap(sim.origen.despues,'después'))+'<br>destino: '+esc(txtCap(sim.destino.antes,'antes'))+' → '+esc(txtCap(sim.destino.despues,'después'));
          q('tr-l-exceso').style.display=sim.destino.despues.estado==='EXCESO'?'':'none';
        }catch(_){q('tr-cap').textContent='';}
      }else q('tr-cap').textContent='';
    };
    ['tr-fecha','tr-bloque','tr-cant'].forEach(i=>q(i).addEventListener('input',aviso));aviso();
    q('tr-cancelar').onclick=()=>fondo.remove();
    q('tr-ok').onclick=async()=>{
      q('tr-ok').disabled=true;q('tr-error').textContent='Trasladando…';
      try{
        const dFecha=q('tr-fecha').value,dBloque=q('tr-bloque').value;
        const ex=fechaOk(dFecha)?NS.existente(item.linea,dFecha,dBloque,item.marca,item.presentacion):null;
        const r=await NS.trasladarSaldo({item,destFecha:dFecha,destTurno:dBloque,cantidad:q('tr-cant').value,motivo:q('tr-motivo').value,trasladoId:tid,
          destVersionEsperada:pref.destVersion!==undefined&&dFecha===pref.destFecha&&NS.valorBloque(dBloque)===NS.valorBloque(pref.destTurno||'')?pref.destVersion:num(ex&&ex.version),aceptoExceso:q('tr-exceso').checked});
        fondo.remove();if(typeof NS.pintarPestana==='function')NS.pintarPestana();
        if(r&&r.duplicado)msg('Traslado ya aplicado','Este traslado ya se había aplicado; no se repitió.');
      }catch(e){
        if(e&&e.propuestaCambio){fondo.remove();NS.abrirTraslado(clave,{destFecha:q('tr-fecha').value,destTurno:q('tr-bloque').value,cantidad:q('tr-cant').value,motivo:q('tr-motivo').value,aviso:e.message});return;}
        q('tr-error').textContent=(e&&e.message)||String(e);q('tr-ok').disabled=false;
      }
    };
  };
  document.addEventListener('click',e=>{
    const raiz=e.target.closest&&e.target.closest('#plan-root');
    if(!raiz||!NS.estado||NS.estado.tab!=='programacion')return;
    const b=e.target.closest('[data-plan-trasladar]');
    if(b)NS.abrirTraslado(b.getAttribute('data-plan-trasladar'));
    const o=e.target.closest('[data-plan-opciones]');
    if(o&&typeof NS.abrirOpciones==='function')NS.abrirOpciones(NS.estado.fecha,NS.estado.turno,o.getAttribute('data-plan-opciones'));
  });
})();
