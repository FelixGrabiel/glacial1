/* =========================================================
   ANÁLISIS DE PARADAS · MEJORAS (funciones puras + bloques de pantalla)

   No cambia cómo se calculan los minutos (vienen de calcularTiemposLinea, 23b): todo lo de aquí LEE las paradas que ya entrega 47-analisis-paradas.js
   (unidad = {linea,fecha,turno,npItems,pItems,…}; parada = {id,motivo,causa,motivoCat,detalle,equipo,minutos,inicio?,fin?,origen,…}) y agrega vistas:
     1) unidades perdidas = minutos ÷ 60 × velocidad estándar de la presentación que corría (UND/h, la misma tabla del resto; sin valores en soles);
        si falta la velocidad o no se sabe qué presentación corría, lo dice (no muestra 0);
     3) fallas repetitivas: el mismo equipo con N o más paradas por falla en D días (umbral en sync/configMantenimiento → analisisParadas);
     4) frecuencia frente a duración por motivo (frecuentes y cortas ≤ 15 min frente a raras y largas);
     5) mapa de calor por hora del día y turno (solo paradas con hora de inicio; dice cuántas quedan fuera);
     6) calidad del dato: % de minutos en «Otro» o sin causa, % de fallas sin equipo, % de paradas largas sin hora (con meta verde/ámbar configurable);
     9) técnico desde la intervención ligada a la parada (67b); la bitácora queda de respaldo.
   Cargar después de 47-analisis-paradas.js. Sin lecturas nuevas salvo las intervenciones que ya escucha el módulo de Mantenimiento.
   ========================================================= */
(function(){
  'use strict';

  const MS_MIN=60000;
  const LARGA_MIN=15;             // «parada larga»: más de 15 minutos (la misma regla que pide hora de inicio al registrar)
  const FRECUENTE_MIN=3;          // «frecuente»: 3 o más paradas del mismo motivo en el rango
  const SIN_EQUIPO='Equipo sin indicar';
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>Math.round(num(n)).toLocaleString('es-PE');
  const fmt1=n=>(Math.round(num(n)*10)/10).toLocaleString('es-PE',{minimumFractionDigits:0,maximumFractionDigits:1});
  const pct1=n=>(Math.round(num(n)*10)/10).toLocaleString('es-PE')+' %';
  const horaTxt=ms=>{const d=new Date(ms);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
  const esOtroOSinCausa=it=>{const c=norm(it&&it.causa);return !c||c==='otro';};

  /* ---------- 1) unidades perdidas ---------- */
  /* cuadros: [{pres,ini,fin,sopladas}] de la unidad (registro del supervisor). Devuelve la presentación (o el promedio ponderado) que corría cuando se paró. */
  function velocidadDeParada(it,u,cuadros,velFn){
    const cs=(cuadros||[]).filter(c=>c&&c.pres);
    if(!cs.length)return {vel:null,motivo:'sin registro de producción para saber qué presentación corría'};
    let hit=null;
    if(it.inicio)hit=cs.find(c=>c.ini&&c.fin&&it.inicio>=c.ini&&it.inicio<c.fin)||null;
    if(hit){const v=num(velFn(u.linea,hit.pres));return v>0?{vel:v,pres:hit.pres}:{vel:null,motivo:'falta la velocidad estándar de «'+hit.pres+'»'};}
    const pres=[...new Set(cs.map(c=>c.pres))];
    if(pres.length===1){const v=num(velFn(u.linea,pres[0]));return v>0?{vel:v,pres:pres[0]}:{vel:null,motivo:'falta la velocidad estándar de «'+pres[0]+'»'};}
    // Varias presentaciones y no se sabe cuál corría: velocidad promedio ponderada por lo soplado (estimada).
    let peso=0,suma=0;
    for(const p of pres){
      const v=num(velFn(u.linea,p));
      if(!(v>0))return {vel:null,motivo:'falta la velocidad estándar de «'+p+'»'};
      const w=cs.filter(c=>c.pres===p).reduce((s,c)=>s+Math.max(1,num(c.sopladas)),0);peso+=w;suma+=w*v;
    }
    return {vel:suma/peso,pres:pres.join(' / '),estimada:true};
  }
  /* Copia las paradas de cada unidad agregando: unidades (perdidas, o null), velocidad, estimada y motivoSinVel. No toca los minutos. */
  function conUnidadesPerdidas(us,velFn,cuadrosDe){
    return us.map(u=>{
      const cuadros=cuadrosDe?cuadrosDe(u):[];
      const enr=it=>{
        const r=velocidadDeParada(it,u,cuadros,velFn);
        return Object.assign({},it,r.vel?{unidades:num(it.minutos)/60*r.vel,velocidad:r.vel,presentacion:r.pres,estimada:!!r.estimada}:{unidades:null,motivoSinVel:r.motivo});
      };
      return Object.assign({},u,{npItems:u.npItems.map(enr),pItems:u.pItems.map(enr)});
    });
  }

  /* ---------- 3) fallas repetitivas ---------- */
  /* Mismo equipo (de la misma línea) con >= umbral paradas por falla dentro de una ventana de `dias` días. equipoDe(it) devuelve el texto de equipo o null si la causa no pide equipo. */
  function fallasRepetitivas(us,cfg,equipoDe){
    const umbral=cfg.fallasUmbral,dias=cfg.fallasDias;
    const grupos=new Map();
    us.forEach(u=>u.npItems.forEach(it=>{
      const eq=equipoDe(it);
      if(!eq||eq===SIN_EQUIPO)return;
      const k=u.linea+'|'+norm(eq);
      const g=grupos.get(k)||{linea:u.linea,equipo:eq,items:[]};
      g.items.push({fecha:u.fecha,minutos:num(it.minutos),turno:u.turno,motivo:it.motivo});grupos.set(k,g);
    }));
    const dia=f=>Math.round(new Date(f+'T12:00:00').getTime()/86400000);
    const salida=[];
    grupos.forEach(g=>{
      g.items.sort((a,b)=>a.fecha.localeCompare(b.fecha));
      let mejor=null,j=0;
      for(let i=0;i<g.items.length;i++){
        while(dia(g.items[i].fecha)-dia(g.items[j].fecha)>=dias)j++;
        const n=i-j+1;
        if(n>=umbral&&(!mejor||n>mejor.n))mejor={n,desde:g.items[j].fecha,hasta:g.items[i].fecha,i0:j,i1:i};
      }
      if(mejor){const ventana=g.items.slice(mejor.i0,mejor.i1+1);
        salida.push({linea:g.linea,equipo:g.equipo,n:mejor.n,desde:mejor.desde,hasta:mejor.hasta,minutos:ventana.reduce((s,x)=>s+x.minutos,0),total:g.items.length});}
    });
    return salida.sort((a,b)=>b.n-a.n||b.minutos-a.minutos);
  }

  /* ---------- 4) frecuencia frente a duración ---------- */
  function frecuenciaDuracion(us,claveFn){
    const m=new Map();
    us.forEach(u=>u.npItems.forEach(it=>{
      const k=claveFn(it);const g=m.get(k)||{clave:k,cantidad:0,minutos:0};
      g.cantidad++;g.minutos+=num(it.minutos);m.set(k,g);
    }));
    return [...m.values()].map(g=>{
      const media=g.cantidad?g.minutos/g.cantidad:0,frecuente=g.cantidad>=FRECUENTE_MIN,corta=media<=LARGA_MIN;
      return Object.assign(g,{media,tipo:frecuente&&corta?'FRECUENTE_CORTA':!frecuente&&!corta?'RARA_LARGA':frecuente?'FRECUENTE_LARGA':'RARA_CORTA'});
    }).sort((a,b)=>b.minutos-a.minutos);
  }
  const TIPOS_FD={FRECUENTE_CORTA:'Frecuente y corta',RARA_LARGA:'Rara y larga',FRECUENTE_LARGA:'Frecuente y larga',RARA_CORTA:'Rara y corta'};

  /* ---------- 5) mapa de calor ---------- */
  /* Filas: bloque (DÍA / NOCHE); columnas: hora del día 0–23. Los minutos de cada parada se reparten entre las horas que ocupa (inicio–fin);
     sin fin, todo va a la hora de inicio. Las paradas sin hora de inicio no entran y se cuentan aparte. */
  function mapaCalor(us){
    const celdas={DÍA:Array(24).fill(0),NOCHE:Array(24).fill(0)};
    let fuera=0,fueraMin=0,dentro=0,dentroMin=0;
    us.forEach(u=>{
      const fila=celdas[String(u.turno||'').toUpperCase().includes('NOCHE')?'NOCHE':'DÍA'];
      u.npItems.forEach(it=>{
        if(!it.inicio){fuera++;fueraMin+=num(it.minutos);return;}
        dentro++;dentroMin+=num(it.minutos);
        const ini=it.inicio,fin=it.fin&&it.fin>ini?it.fin:null;
        if(!fin){fila[new Date(ini).getHours()]+=num(it.minutos);return;}
        let t=ini;
        while(t<fin){
          const d=new Date(t),sig=new Date(t);sig.setHours(d.getHours()+1,0,0,0);
          const corte=Math.min(sig.getTime(),fin);
          fila[d.getHours()]+=(corte-t)/MS_MIN;t=corte;
        }
      });
    });
    const max=Math.max(0,...celdas.DÍA,...celdas.NOCHE);
    return {celdas,max,fuera,fueraMin,dentro,dentroMin};
  }

  /* ---------- 6) calidad del dato ---------- */
  function indicadoresDato(us,cfg,equipoDe){
    let minTot=0,minOtro=0,fallas=0,fallasSinEq=0,largas=0,largasSinHora=0;
    us.forEach(u=>u.npItems.forEach(it=>{
      const m=num(it.minutos);minTot+=m;
      if(esOtroOSinCausa(it))minOtro+=m;
      const eq=equipoDe(it);
      if(eq){fallas++;if(eq===SIN_EQUIPO)fallasSinEq++;}
      if(m>LARGA_MIN){largas++;if(!it.inicio)largasSinHora++;}
    }));
    const p=(a,b)=>b>0?a/b*100:null;
    const nivel=(v,ve,am)=>v===null?'gris':v<=ve?'verde':v<=am?'ambar':'rojo';
    const mk=(clave,titulo,valor,detalle,ve,am)=>({clave,titulo,valor,detalle,nivel:nivel(valor,ve,am),verde:ve,ambar:am});
    return [
      mk('otro','Minutos en «Otro» o sin causa',p(minOtro,minTot),fmt(minOtro)+' de '+fmt(minTot)+' min',cfg.otroVerde,cfg.otroAmbar),
      mk('sinEquipo','Fallas sin equipo indicado',p(fallasSinEq,fallas),fallasSinEq+' de '+fallas+' paradas con causa que pide equipo',cfg.sinEquipoVerde,cfg.sinEquipoAmbar),
      mk('sinHora','Paradas largas sin hora de inicio',p(largasSinHora,largas),largasSinHora+' de '+largas+' paradas de más de '+LARGA_MIN+' min',cfg.sinHoraVerde,cfg.sinHoraAmbar)
    ];
  }

  /* ---------- 9) técnico desde la intervención ligada a la parada ---------- */
  /* Une la parada con su intervención: primero por el id de origen (paradas de botón); si no, por la misma línea y la hora de apertura dentro de la parada
     (o hasta 10 min antes). Devuelve la intervención o null. Solo cuando la parada tiene hora de inicio. */
  function intervencionDe(it,u,lista){
    if(!Array.isArray(lista)||!lista.length)return null;
    if(it.id){
      const x=lista.find(d=>d&&d.origen&&(d.origen.id===it.id||d.origen.paradaId===it.id));
      if(x)return x;
    }
    if(!it.inicio)return null;
    const fin=it.fin&&it.fin>it.inicio?it.fin:it.inicio+num(it.minutos)*MS_MIN;
    const cand=lista.filter(d=>d&&d.linea===u.linea&&num(d.abiertaMs)>=it.inicio-10*MS_MIN&&num(d.abiertaMs)<=fin);
    if(!cand.length)return null;
    return cand.sort((a,b)=>Math.abs(num(a.abiertaMs)-it.inicio)-Math.abs(num(b.abiertaMs)-it.inicio))[0];
  }
  function tecnicoDeIntervencion(d){
    if(!d)return null;
    const p=(d.participantes||[]).find(x=>x&&x.rol==='RESPONSABLE')||(d.participantes||[])[0];
    return (p&&p.nombre)||(d.abiertaPor&&d.abiertaPor.nombre)||null;
  }
  /* Resolvedor de técnico: intervención primero, bitácora de respaldo. */
  function resolvedorTecnicoCombinado(intervenciones,respaldo){
    return (it,u)=>{
      const t=tecnicoDeIntervencion(intervencionDe(it,u,intervenciones));
      return t||(respaldo?respaldo(it,u):null)||null;
    };
  }

  /* ---------- pantalla: bloques HTML ---------- */
  const COLOR_NIVEL={verde:'#13814a',ambar:'#df8b00',rojo:'#d93a3a',gris:'#9aa9b8'};
  function htmlDato(items){
    return '<div class="ap-kpis" style="margin-bottom:6px">'+items.map(c=>'<div class="ap-kpi" style="border-left-color:'+COLOR_NIVEL[c.nivel]+'" title="Meta: verde hasta '+c.verde+' %, ámbar hasta '+c.ambar+' %"><span>'+esc(c.titulo)+'</span><b style="color:'+COLOR_NIVEL[c.nivel]+'">'+(c.valor===null?'Sin datos':pct1(c.valor))+'</b><small>'+esc(c.detalle)+'</small></div>').join('')+'</div>'+
      '<p class="ap-nota">Calidad del dato: cuanto más bajo, mejor (verde / ámbar / rojo según la meta que configura el Supervisor de Mantenimiento). Las paradas de Nuevo registro no tienen hora de inicio.</p>';
  }
  function htmlFallasRepetitivas(lista,cfg){
    if(!lista.length)return '';
    return '<div class="ap-aviso" role="alert"><b>Fallas repetitivas:</b> '+lista.map(f=>esc(f.equipo)+' ('+esc(f.linea)+'): '+f.n+' paradas por falla entre el '+esc(f.desde.slice(8)+'/'+f.desde.slice(5,7))+' y el '+esc(f.hasta.slice(8)+'/'+f.hasta.slice(5,7))+' ('+fmt(f.minutos)+' min)').join(' · ')+
      '<br><small>Aviso cuando un equipo tiene '+cfg.fallasUmbral+' o más paradas por falla en '+cfg.fallasDias+' días.</small></div>';
  }
  function htmlFrecuencia(lista){
    if(!lista.length)return '';
    const orden=['FRECUENTE_CORTA','FRECUENTE_LARGA','RARA_LARGA','RARA_CORTA'];
    return '<h3 class="ap-sec">Frecuencia frente a duración</h3><p class="ap-nota">Frecuente = '+FRECUENTE_MIN+' o más paradas del motivo en el rango; corta = duración media de '+LARGA_MIN+' min o menos. Las frecuentes y cortas se atacan con ajustes y rutina; las raras y largas, con mantenimiento y repuestos.</p>'+
      '<div class="ap-tabla-scroll"><table class="tareo-table"><thead><tr><th>Motivo</th><th>Tipo</th><th>Cantidad</th><th>Minutos</th><th>Duración media</th></tr></thead><tbody>'+
      orden.map(t=>lista.filter(x=>x.tipo===t).slice(0,8).map(x=>'<tr><td>'+esc(x.clave)+'</td><td>'+TIPOS_FD[x.tipo]+'</td><td>'+fmt(x.cantidad)+'</td><td>'+fmt(x.minutos)+'</td><td>'+fmt1(x.media)+' min</td></tr>').join('')).join('')+'</tbody></table></div>';
  }
  function htmlMapaCalor(mc){
    const horas=[...Array(24).keys()],orden=[...horas.slice(7),...horas.slice(0,7)];       // el día operativo empieza a las 07:00
    const celda=v=>{const a=mc.max>0?v/mc.max:0;return '<td title="'+fmt(v)+' min" style="text-align:center;font-size:11px;padding:3px 2px;background:'+(v>0?'rgba(217,58,58,'+(0.12+0.8*a).toFixed(2)+')':'#f4f7fa')+';color:'+(a>0.55?'#fff':'#1b2a38')+'">'+(v>0?fmt(v):'')+'</td>';};
    const fila=n=>'<tr><td><b>'+n+'</b></td>'+orden.map(h=>celda(mc.celdas[n][h])).join('')+'</tr>';
    return '<h3 class="ap-sec">Mapa de calor: minutos de parada por hora del día</h3>'+
      '<p class="ap-nota">Solo cuenta las paradas con hora de inicio ('+mc.dentro+' paradas, '+fmt(mc.dentroMin)+' min). <b>Quedan fuera '+mc.fuera+' paradas ('+fmt(mc.fueraMin)+' min) por no tener hora de inicio.</b></p>'+
      (mc.dentro?'<div class="ap-tabla-scroll"><table class="tareo-table" style="min-width:640px"><thead><tr><th></th>'+orden.map(h=>'<th style="font-size:10px;padding:3px 2px">'+String(h).padStart(2,'0')+'</th>').join('')+'</tr></thead><tbody>'+fila('DÍA')+fila('NOCHE')+'</tbody></table></div>':'<div class="ap-vacio">Todavía no hay paradas con hora de inicio en este rango.</div>');
  }

  window.glacialAnalisisMejoras={LARGA_MIN,FRECUENTE_MIN,TIPOS_FD,velocidadDeParada,conUnidadesPerdidas,fallasRepetitivas,frecuenciaDuracion,mapaCalor,indicadoresDato,intervencionDe,tecnicoDeIntervencion,
    resolvedorTecnicoCombinado,htmlDato,htmlFallasRepetitivas,htmlFrecuencia,htmlMapaCalor,horaTxt};
})();
