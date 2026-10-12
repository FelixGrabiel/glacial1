/* =============================================================
   PLANIFICACIÓN · MOTOR DE TIEMPOS Y CAPACIDAD (etapa 4)

   Funciones PURAS (sin pantalla ni base de datos): reciben los datos y devuelven el cálculo. Las usan Programación, la Vista semanal,
   las opciones para completar y las pruebas, así el mismo bloque da el mismo número en todas partes.

   MODELO
     bloque            = {inicioMs, duracionMin}. Noche cruza la medianoche: todo se mide en «minutos desde el inicio del bloque».
     ventana prevista  = línea + fecha + bloque + inicio + (fin | duración). Es tiempo en que se PREVÉ detener la línea (mantenimiento,
                         refrigerio con detención, limpieza en ventana fija, otra). El refrigerio del personal NO es una ventana salvo
                         que de verdad se detenga la línea. Si dos ventanas se solapan se usa la UNIÓN (un minuto no se descuenta dos veces).
     regla de preparación = línea + tipo + (origen/destino opcionales) + minutos. Gana la regla más específica; un valor general de la línea
                         (sin origen ni destino) y, al final, el «valor general de respaldo» antiguo solo sirven de respaldo.
     Un cambio de marca y de formato a la vez es UNA intervención: regla combinada; sin ella se aplica la MAYOR de las dos, nunca la suma.
     Una limpieza ya descontada como ventana de limpieza no se suma otra vez como preparación.

   CAPACIDAD (plan)   disponible = duración − unión de ventanas
                      requerido  = Σ (UND ÷ velocidad estándar) + preparaciones (cada una UNA vez)
                      saldo      = disponible − requerido        utilización = requerido ÷ disponible (solo si disponible > 0)
   COLOCACIÓN         con secuencia (tramos de Paletas) se simula el bloque: la producción de un tramo es continua y se detiene mientras dura
                      una ventana; una preparación NO se parte (necesita un hueco libre completo). Un total de horas que «cabe» puede no ser
                      ejecutable: se marca «No cabe» con el motivo. Sin secuencia, la colocación no se puede verificar y se dice.
   CAPACIDAD RESTANTE bloque iniciado: tiempo que queda desde «ahora» (menos ventanas futuras) contra el saldo de cada producto
                      (programado − producido oficial) y las preparaciones que faltan. Sin producido de algún producto → no se calcula.
   Nada de lo anterior crea paradas oficiales ni toca el ratio real: son previsiones de planificación.
   ============================================================= */
(function(){
  'use strict';
  const NS=window.glacialPlanificacion=window.glacialPlanificacion||{};
  const M=NS.motor={};
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const norm=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[_\s]+/g,' ').trim();
  const ent=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isInteger(Number(v))&&Number(v)>=0?Number(v):null;

  M.TIPOS_REGLA={
    CAMBIO_MARCA:'Cambio de marca',CAMBIO_FORMATO:'Cambio de presentación / formato',CAMBIO_MARCA_FORMATO:'Cambio de marca y formato (una sola intervención)',
    LIMPIEZA_INICIO:'Limpieza de inicio',LIMPIEZA_FIN:'Limpieza de fin',LIMPIEZA_ENTRE:'Limpieza entre productos',OTRA:'Otra preparación'};
  M.TIPOS_VENTANA={MANTENIMIENTO:'Mantenimiento previsto',REFRIGERIO:'Refrigerio con detención de línea',LIMPIEZA:'Limpieza en ventana fija',OTRA:'Otra parada prevista'};
  M.APLICA_OTRA={INICIO:'Al inicio del bloque',FIN:'Al final del bloque',ENTRE:'En cada cambio de producto',BLOQUE:'Una vez en el bloque'};
  M.MAX_MIN=720;

  /* ---------- parámetros: normaliza lo guardado (descarta lo inválido, nunca inventa) ---------- */
  M.normalizarTiempos=function(raw){
    raw=raw&&typeof raw==='object'?raw:{};
    const parte=p=>p&&typeof p==='object'&&(p.marca||p.presentacion)?{marca:p.marca?String(p.marca):'',presentacion:p.presentacion?String(p.presentacion):''}:null;
    const reglas=(Array.isArray(raw.reglas)?raw.reglas:[]).filter(r=>r&&r.id&&r.linea&&M.TIPOS_REGLA[r.tipo]&&ent(r.minutos)!==null).map(r=>({
      id:String(r.id),linea:String(r.linea),tipo:r.tipo,aplica:M.APLICA_OTRA[r.aplica]?r.aplica:'',origen:parte(r.origen),destino:parte(r.destino),minutos:Number(r.minutos),
      activo:r.activo!==false,descripcion:String(r.descripcion||''),actualizadoPor:String(r.actualizadoPor||''),actualizadoUid:String(r.actualizadoUid||''),actualizadoEn:num(r.actualizadoEn)}));
    const ventanas=(Array.isArray(raw.ventanas)?raw.ventanas:[]).filter(v=>v&&v.id&&v.linea&&v.fecha&&M.TIPOS_VENTANA[v.tipo]).map(v=>({
      id:String(v.id),linea:String(v.linea),fecha:String(v.fecha),bloque:String(v.bloque)==='NOCHE'?'NOCHE':'DÍA',tipo:v.tipo,inicio:String(v.inicio||''),fin:v.fin?String(v.fin):'',
      duracionMin:ent(v.duracionMin),motivo:String(v.motivo||''),activo:v.activo!==false,responsable:String(v.responsable||''),actualizadoUid:String(v.actualizadoUid||''),actualizadoEn:num(v.actualizadoEn)}));
    return {version:ent(raw.version)||0,reglas,ventanas,
      legacy:{cambioMin:ent(raw.cambioMin),fijoDiaMin:ent(raw.fijoDiaMin),fijoNocheMin:ent(raw.fijoNocheMin)},
      evaluaciones:raw.evaluaciones&&typeof raw.evaluaciones==='object'?raw.evaluaciones:{}};
  };

  /* ---------- horas y ventanas ---------- */
  M.aMin=h=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(h||'').trim());if(!m)return null;const hh=+m[1],mm=+m[2];return hh>23||mm>59?null:hh*60+mm;};
  const minDelDia=ms=>{const d=new Date(ms);return d.getHours()*60+d.getMinutes();};
  M.hhmm=ms=>new Date(ms).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false});
  /* Posición de una ventana dentro del bloque, en minutos desde su inicio. Devuelve {a,z} o {error}. Noche cruza la medianoche. */
  M.posicionVentana=function(v,b){
    const ini=M.aMin(v.inicio);
    if(ini===null)return {error:'La hora de inicio no es válida (usa HH:MM).'};
    if(!(b&&b.duracionMin>0&&b.inicioMs))return {error:'El bloque no tiene horario configurado.'};
    const base=minDelDia(b.inicioMs),a=(ini-base+1440)%1440;
    let z;
    if(v.fin){
      const f=M.aMin(v.fin);if(f===null)return {error:'La hora de fin no es válida (usa HH:MM).'};
      z=(f-base+1440)%1440;
      if(z<=a)return {error:'El fin debe ser posterior al inicio y estar dentro del bloque.'};
    }else if(ent(v.duracionMin)!==null&&Number(v.duracionMin)>0)z=a+Number(v.duracionMin);
    else return {error:'Indica la hora de fin o la duración en minutos.'};
    if(a>=b.duracionMin)return {error:'El inicio queda fuera del horario del bloque.'};
    if(z>b.duracionMin)return {error:'La ventana sale del bloque (el bloque termina a las '+M.hhmm(b.inicioMs+b.duracionMin*60000)+').'};
    return {a,z};
  };
  M.union=function(intervalos){
    const l=intervalos.filter(x=>x&&x[1]>x[0]).map(x=>[x[0],x[1]]).sort((p,q)=>p[0]-q[0]||p[1]-q[1]);
    const sal=[];
    l.forEach(x=>{const u=sal[sal.length-1];if(u&&x[0]<=u[1])u[1]=Math.max(u[1],x[1]);else sal.push(x);});
    return {intervalos:sal,total:sal.reduce((s,x)=>s+(x[1]-x[0]),0)};
  };
  /* Ventanas activas de una línea en un bloque, con su posición y la unión. */
  M.ventanasDe=function(tp,linea,fecha,bloque,b){
    const lista=[],errores=[];
    ((tp&&tp.ventanas)||[]).forEach(v=>{
      if(v.activo===false||v.linea!==linea||v.fecha!==fecha||v.bloque!==bloque)return;
      const p=M.posicionVentana(v,b);
      if(p.error){errores.push({ventana:v,error:p.error});return;}
      lista.push(Object.assign({},v,{a:p.a,z:p.z,inicioMs:b.inicioMs+p.a*60000,finMs:b.inicioMs+p.z*60000,minutos:p.z-p.a}));
    });
    lista.sort((x,y)=>x.a-y.a);
    const u=M.union(lista.map(v=>[v.a,v.z]));
    return {lista,errores,union:u.intervalos,unionMin:u.total,sumaMin:lista.reduce((s,v)=>s+v.minutos,0)};
  };
  /* Valida una ventana nueva o editada contra el bloque y las que ya existen (solape = aviso: se usa la unión). */
  M.validarVentana=function(v,b,existentes){
    const errores=[],avisos=[];
    if(!M.TIPOS_VENTANA[v.tipo])errores.push('Elige el tipo de parada prevista.');
    if(!v.linea)errores.push('Elige la línea.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v.fecha||'')))errores.push('La fecha no es válida.');
    if(v.tipo==='OTRA'&&String(v.motivo||'').trim().length<3)errores.push('Indica el motivo de la parada prevista.');
    const p=M.posicionVentana(v,b);
    if(p.error)errores.push(p.error);
    else{
      (existentes||[]).filter(x=>x.activo!==false&&x.id!==v.id&&x.linea===v.linea&&x.fecha===v.fecha&&x.bloque===v.bloque).forEach(x=>{
        const q=M.posicionVentana(x,b);
        if(!q.error&&q.a<p.z&&p.a<q.z)avisos.push('Se solapa con «'+(M.TIPOS_VENTANA[x.tipo]||x.tipo)+' '+x.inicio+(x.fin?'–'+x.fin:'')+'»: el tiempo indisponible se calcula como unión, sin contar dos veces los minutos comunes.');
      });
    }
    return {errores,avisos,pos:p.error?null:p};
  };

  /* ---------- reglas de preparación ---------- */
  const coincide=(parte,prod)=>{
    if(!parte)return 0;
    let s=0;
    if(parte.marca){if(norm(parte.marca)!==norm(prod.marca))return -1;s++;}
    if(parte.presentacion){if(norm(parte.presentacion)!==norm(prod.presentacion))return -1;s++;}
    return s;
  };
  /* Regla activa más específica (más campos de origen/destino coincidentes); a igualdad, la modificada más recientemente. */
  M.mejorRegla=function(tp,linea,tipo,A,B,aplica){
    let mejor=null;
    ((tp&&tp.reglas)||[]).forEach(r=>{
      if(r.activo===false||r.linea!==linea||r.tipo!==tipo)return;
      if(tipo==='OTRA'&&aplica&&r.aplica!==aplica)return;
      const a=A?coincide(r.origen,A):(r.origen?-1:0),b=B?coincide(r.destino,B):(r.destino?-1:0);
      if(a<0||b<0)return;
      const esp=a+b;
      if(!mejor||esp>mejor.esp||(esp===mejor.esp&&num(r.actualizadoEn)>num(mejor.r.actualizadoEn)))mejor={r,esp};
    });
    return mejor?mejor.r:null;
  };
  const nombreProd=p=>(p.marca||'')+(p.presentacion?' '+(p.etiqueta||p.presentacion):'');
  /* Tiempo del cambio entre dos productos de una línea, o el dato que falta. Un cambio de marca Y formato no suma ambos. */
  M.resolverCambio=function(tp,linea,A,B){
    const cm=norm(A.marca)!==norm(B.marca),cf=norm(A.presentacion)!==norm(B.presentacion);
    const base={tipo:'CAMBIO',desde:nombreProd(A),hacia:nombreProd(B),cambiaMarca:cm,cambiaFormato:cf};
    if(!cm&&!cf)return Object.assign(base,{minutos:0,cambio:false,explicacion:'Mismo producto: no hay cambio.'});
    const ya=(r,txt,extra)=>Object.assign(base,{minutos:r.minutos,cambio:true,regla:{id:r.id,tipo:r.tipo,descripcion:r.descripcion},explicacion:txt},extra||{});
    const alcance=r=>r.origen||r.destino?'regla específica':'valor general de la línea';
    if(cm&&cf){
      const c=M.mejorRegla(tp,linea,'CAMBIO_MARCA_FORMATO',A,B);
      if(c)return ya(c,'Regla combinada de marca y formato ('+alcance(c)+'): una sola intervención, no se suman marca y formato.');
      const rm=M.mejorRegla(tp,linea,'CAMBIO_MARCA',A,B),rf=M.mejorRegla(tp,linea,'CAMBIO_FORMATO',A,B);
      if(rm&&rf){
        const mayor=rm.minutos>=rf.minutos?rm:rf;
        return ya(mayor,'Cambian marca y formato a la vez y no hay regla combinada: se aplica la mayor entre marca ('+rm.minutos+' min) y formato ('+rf.minutos+' min), sin sumarlas. Conviene configurar la regla combinada.',{advertencia:true});
      }
    }else{
      const r=M.mejorRegla(tp,linea,cm?'CAMBIO_MARCA':'CAMBIO_FORMATO',A,B);
      if(r)return ya(r,(cm?'Cambio de marca':'Cambio de formato')+' ('+alcance(r)+').');
    }
    const g=tp&&tp.legacy?tp.legacy.cambioMin:null;
    if(g!==null&&g!==undefined)return Object.assign(base,{minutos:g,cambio:true,respaldo:true,explicacion:'Valor general de respaldo ('+g+' min, todas las líneas): no hay una regla para esta transición.'});
    return Object.assign(base,{minutos:null,cambio:true,faltante:'tiempo de cambio de '+(cm&&cf?'marca y formato':cm?'marca':'formato')+' ('+nombreProd(A)+' → '+nombreProd(B)+')',
      explicacion:'No hay regla ni valor general para esta transición.'});
  };
  /* Preparaciones del bloque en orden: inicio, entre productos, fin, y «otras». ordenProd = productos en el orden de ejecución. */
  M.preparaciones=function(tp,linea,ordenProd,opciones){
    const o=opciones||{},tareas=[],omitidas=[];
    if(!ordenProd.length)return {tareas,omitidas};
    const limpiezaVentana=!!o.limpiezaEnVentana;
    const simple=(tipo,A,B,etq,aplica)=>{
      const r=M.mejorRegla(tp,linea,tipo,A,B,aplica);
      if(!r)return;
      if(limpiezaVentana&&/^LIMPIEZA/.test(tipo)){omitidas.push({tipo,etiqueta:etq,motivo:'La limpieza ya está descontada como ventana de limpieza: no se suma otra vez.',minutos:r.minutos});return;}
      tareas.push({tipo,etiqueta:etq+(tipo==='OTRA'&&r.descripcion?' · '+r.descripcion:''),minutos:r.minutos,posicion:aplica||(tipo==='LIMPIEZA_INICIO'?'INICIO':tipo==='LIMPIEZA_FIN'?'FIN':'ENTRE'),
        desde:A?nombreProd(A):'',hacia:B?nombreProd(B):'',regla:{id:r.id,tipo:r.tipo,descripcion:r.descripcion},explicacion:M.TIPOS_REGLA[tipo]+(r.origen||r.destino?' (regla específica)':' (general de la línea)')+'.'});
    };
    simple('LIMPIEZA_INICIO',null,ordenProd[0],'Limpieza de inicio');
    simple('OTRA',null,ordenProd[0],'Preparación al inicio','INICIO');
    for(let i=1;i<ordenProd.length;i++){
      const A=ordenProd[i-1],B=ordenProd[i];
      if(A.clave===B.clave)continue;
      const c=M.resolverCambio(tp,linea,A,B);
      if(c.cambio)tareas.push(Object.assign({},c,{etiqueta:'Cambio '+nombreProd(A)+' → '+nombreProd(B),posicion:'ENTRE'}));
      simple('LIMPIEZA_ENTRE',A,B,'Limpieza entre '+nombreProd(A)+' y '+nombreProd(B));
      simple('OTRA',A,B,'Preparación entre productos','ENTRE');
    }
    simple('LIMPIEZA_FIN',ordenProd[ordenProd.length-1],null,'Limpieza de fin');
    simple('OTRA',ordenProd[ordenProd.length-1],null,'Preparación al final','FIN');
    simple('OTRA',null,null,'Preparación del bloque','BLOQUE');
    return {tareas,omitidas};
  };

  /* ---------- línea de tiempo del bloque (huecos libres entre ventanas) ---------- */
  function lineaLibre(union){
    const libres=[];let c=0;
    union.forEach(([a,z])=>{if(a>c)libres.push([c,a]);c=Math.max(c,z);});
    libres.push([c,Infinity]);                       // pasado el final del bloque ya no hay ventanas
    return {
      libres,
      siguienteLibre(c0){for(const [a,z] of libres)if(c0<z)return Math.max(c0,a);return c0;},
      hueco(c0,d){for(const [a,z] of libres){const s=Math.max(c0,a);if(s+d<=z)return s;}return null;},
      caminar(c0,m){let rest=m,pos=c0;for(const [a,z] of libres){if(pos>=z)continue;const s=Math.max(pos,a),cab=z-s;if(rest<=cab)return s+rest;rest-=cab;pos=z;}return pos+rest;},
      libreEntre(c0,e){let t=0;libres.forEach(([a,z])=>{const s=Math.max(a,c0),f=Math.min(z,e);if(f>s)t+=f-s;});return t;}
    };
  }

  /* ---------- productos y orden ---------- */
  const claveP=(m,p)=>norm(m)+'|'+norm(p);
  function agrupar(filas,etiq){
    const mapa=new Map();
    (filas||[]).forEach(f=>{
      if(!(num(f.cantidad)>0))return;
      const k=claveP(f.marca,f.presentacion),o=mapa.get(k)||{clave:k,marca:f.marca,presentacion:f.presentacion,etiqueta:(etiq&&etiq(f.marca,f.presentacion))||f.presentacion,cantidad:0};
      o.cantidad+=num(f.cantidad);mapa.set(k,o);
    });
    return [...mapa.values()];
  }
  /* Orden de ejecución: con tramos, el de la secuencia (un producto repetido genera un cambio por cada vez); sin tramos, el de la lista (supuesto). */
  function ordenEjecucion(prods,tramos){
    const porClave=new Map(prods.map(p=>[p.clave,p]));
    if(!tramos||!tramos.length)return {orden:prods.slice(),conSecuencia:false};
    const orden=[];
    tramos.slice().sort((a,b)=>num(a.orden)-num(b.orden)).forEach(t=>{
      const p=porClave.get(claveP(t.marca,t.presentacion));
      if(p&&(!orden.length||orden[orden.length-1].clave!==p.clave))orden.push(p);
    });
    prods.forEach(p=>{if(!orden.some(x=>x.clave===p.clave))orden.push(p);});    // sin tramo: al final, solo para contar cambios
    return {orden,conSecuencia:true};
  }

  /* ---------- simulación de la secuencia dentro del bloque ---------- */
  /* Coloca preparaciones (no se parten) y producción (continua, se detiene en las ventanas). Cada producto reparte SOLO lo programado entre sus
     tramos. Devuelve eventos con inicio/fin en minutos desde el inicio del bloque. */
  M.secuencia=function(e,prods,tareasPorPos){
    const b=e.bloque,tl=lineaLibre(e.union||[]);
    const tramos=(e.tramos||[]).slice().sort((x,y)=>num(x.orden)-num(y.orden));
    const rest=new Map(prods.map(p=>[p.clave,p.cantidad]));
    const ultimo=new Map();tramos.forEach((t,i)=>ultimo.set(claveP(t.marca,t.presentacion),i));
    const eventos=[],avisos=[],conflictos=[];
    let cursor=0,espera=0,incompleta=false,previo=null;
    const colocarTarea=t=>{
      const d=num(t.minutos);
      const s=d>0?tl.hueco(cursor,d):cursor;
      if(s>cursor)espera+=s-cursor;
      eventos.push({tipo:'PREP',etiqueta:t.etiqueta,minutos:d,a:s,z:s+d,regla:t.regla||null});
      if(d>0&&s>cursor)avisos.push('«'+t.etiqueta+'» ('+d+' min) no cabe antes de una ventana: se coloca después, porque una preparación no se parte.');
      cursor=s+d;
    };
    (tareasPorPos.INICIO||[]).forEach(colocarTarea);
    tramos.forEach((t,i)=>{
      const k=claveP(t.marca,t.presentacion),p=prods.find(x=>x.clave===k);
      if(!p){return;}
      const v=e.vel(p.marca,p.presentacion);
      const ev={tipo:'TRAMO',orden:t.orden,marca:p.marca,presentacion:p.presentacion,etiqueta:p.etiqueta,tipoFin:t.tipoFin,horaFin:t.horaFin,a:null,z:null,qty:null,estimado:false};
      if(!(v>0)){incompleta=true;ev.motivo='falta la velocidad estándar de este producto';eventos.push(ev);previo=k;return;}
      if(incompleta){ev.motivo='depende de un tramo anterior sin dato';eventos.push(ev);return;}
      if(previo!==null&&previo!==k)(tareasPorPos['ENTRE|'+previo+'>'+k]||[]).forEach(colocarTarea);
      previo=k;
      const ini=tl.siguienteLibre(cursor);
      if(ini>cursor)espera+=ini-cursor;
      const queda=rest.get(k)||0;
      let fin,qty;
      if(t.tipoFin==='HORA'){
        const hm=M.aMin(t.horaFin);
        let tope=hm===null?null:(hm-minDelDia(b.inicioMs)+1440)%1440;
        if(tope===null){conflictos.push('El tramo '+t.orden+' tiene una hora de fin no válida.');tope=ini;}
        if(tope<=ini){conflictos.push('El tramo '+t.orden+' ('+p.marca+') debe terminar a las '+t.horaFin+', pero por los cambios y ventanas previos no puede empezar antes de las '+M.hhmm(b.inicioMs+ini*60000)+'.');qty=0;fin=ini;}
        else{qty=Math.min(queda,v*tl.libreEntre(ini,tope)/60);fin=tope;}
      }else{
        if(i!==ultimo.get(k))avisos.push('El producto '+p.marca+' tiene varios tramos con «fin por cantidad o cierre»: su cantidad no se duplica; este tramo toma lo que le falta.');
        qty=queda;fin=tl.caminar(ini,qty/v*60);
      }
      rest.set(k,Math.max(0,queda-qty));
      Object.assign(ev,{a:ini,z:fin,qty,estimado:true});
      eventos.push(ev);cursor=Math.max(cursor,fin);
    });
    if(!incompleta)(tareasPorPos.FIN||[]).forEach(colocarTarea);
    const quedan=[];rest.forEach((q,k)=>{if(q>0.5&&tramos.some(t=>claveP(t.marca,t.presentacion)===k)){const p=prods.find(x=>x.clave===k);quedan.push({marca:p.marca,presentacion:p.presentacion,etiqueta:p.etiqueta,cantidad:Math.round(q)});}});
    const sinTramo=prods.filter(p=>!tramos.some(t=>claveP(t.marca,t.presentacion)===p.clave)).map(p=>({marca:p.marca,presentacion:p.presentacion,etiqueta:p.etiqueta,cantidad:p.cantidad}));
    return {eventos,avisos,conflictos,incompleta,quedan,sinTramo,finOff:incompleta?null:cursor,esperaMin:espera,
      inicioMs:b.inicioMs,finBloqueOff:b.duracionMin};
  };

  /* ---------- capacidad del plan ---------- */
  M.capacidad=function(e){
    const b=e.bloque||{inicioMs:0,duracionMin:0},tp=e.tp||M.normalizarTiempos({});
    const prods=agrupar(e.filas,e.etiqueta);
    if(!prods.length)return null;
    const faltantes=[],notas=[],detalle=[];
    let prodMin=0;
    prods.forEach(p=>{
      const v=num(e.vel(p.marca,p.presentacion));
      if(!(v>0)){faltantes.push({marca:p.marca,presentacion:p.presentacion,etiqueta:p.etiqueta,dato:'velocidad estándar'});detalle.push(Object.assign({},p,{vel:0,min:null}));return;}
      const min=p.cantidad/v*60;prodMin+=min;detalle.push(Object.assign({},p,{vel:v,min}));
    });
    const duracion=num(b.duracionMin);
    if(!(duracion>0))faltantes.push({marca:'',presentacion:'',etiqueta:'',dato:'duración del bloque'});
    // ventanas previstas (unión) o, si no hay ninguna registrada, el respaldo antiguo de minutos fijos por bloque
    const vt=M.ventanasDe(tp,e.linea,e.fecha,e.bloqueClave,b);
    let indisponible=vt.unionMin,sinHorario=0;
    if(!vt.lista.length){
      const g=e.bloqueClave==='NOCHE'?tp.legacy.fijoNocheMin:tp.legacy.fijoDiaMin;
      if(g!==null&&g!==undefined){indisponible=g;sinHorario=g;notas.push('Paradas previstas generales del bloque ('+g+' min, sin horario): configuradas en el Catálogo; no hay ventanas con horario para esta línea y día.');}
    }
    vt.errores.forEach(x=>notas.push('Una ventana prevista no es válida y no se descontó: '+x.error));
    // preparaciones
    const ord=ordenEjecucion(prods,e.tramos);
    const limpiezaVentana=vt.lista.some(v=>v.tipo==='LIMPIEZA');
    const prep=M.preparaciones(tp,e.linea,ord.orden,{limpiezaEnVentana:limpiezaVentana});
    prep.tareas.forEach(t=>{if(t.minutos===null)faltantes.push({marca:'',presentacion:'',etiqueta:'',dato:t.faltante||('tiempo de '+t.etiqueta)});});
    prep.omitidas.forEach(o=>notas.push(o.etiqueta+': '+o.motivo));
    if(!ord.conSecuencia&&ord.orden.length>1)notas.push('No hay secuencia definida en Paletas: el número de cambios supone un cambio entre productos consecutivos de la lista.');
    const preparacionMin=prep.tareas.reduce((s,t)=>s+(t.minutos||0),0);
    const cambiosMin=prep.tareas.filter(t=>t.tipo==='CAMBIO').reduce((s,t)=>s+(t.minutos||0),0);
    const cambios=prep.tareas.filter(t=>t.tipo==='CAMBIO').length;
    const hayReglas=tp.reglas.some(r=>r.activo!==false&&r.linea===e.linea)||tp.legacy.cambioMin!==null;
    if(!hayReglas&&ord.orden.length>1)notas.push('Faltan tiempos previstos de cambio en esta línea (Catálogo → Tiempos previstos).');
    const disponible=duracion-indisponible,requerido=prodMin+preparacionMin;
    const r={fecha:e.fecha,bloque:e.bloqueClave,linea:e.linea,productos:detalle,faltantes,notas,
      brutoMin:duracion,duracionMin:duracion,indisponibleMin:indisponible,paradasMin:indisponible,ventanasSinHorarioMin:sinHorario,ventanas:vt.lista,ventanasInvalidas:vt.errores,ventanasSolapadasMin:vt.sumaMin-vt.unionMin,
      preparaciones:prep.tareas,preparacionesOmitidas:prep.omitidas,cambios,cambiosMin,preparacionMin,produccionMin:prodMin,requeridoMin:requerido,
      disponibleMin:disponible,holguraMin:disponible-requerido,saldoMin:disponible-requerido,cargaPct:null,utilizacionPct:null,estado:'INCOMPLETA',
      parcial:!hayReglas&&ord.orden.length>1,secuencia:ord.conSecuencia,parametrosVersion:tp.version,colocacion:{verificada:false,motivo:''},motivoExceso:'',inicioEstMs:null,finEstMs:null};
    // colocación entre ventanas (solo con secuencia completa y sin datos faltantes)
    if(ord.conSecuencia&&!faltantes.length&&duracion>0){
      const porPos={INICIO:prep.tareas.filter(x=>x.posicion==='INICIO'),FIN:prep.tareas.filter(x=>x.posicion==='FIN'||x.posicion==='BLOQUE')};
      // las preparaciones entre productos se buscan por pareja de claves: se arma el índice con los productos reales
      const entre={};
      for(let i=1;i<ord.orden.length;i++){
        const A=ord.orden[i-1],B=ord.orden[i];
        if(A.clave===B.clave)continue;
        entre['ENTRE|'+A.clave+'>'+B.clave]=prep.tareas.filter(t=>t.posicion==='ENTRE'&&t.desde===nombreProd(A)&&t.hacia===nombreProd(B));
      }
      const sim=M.secuencia({bloque:b,tramos:e.tramos,union:vt.union,vel:e.vel},prods,Object.assign({INICIO:porPos.INICIO,FIN:porPos.FIN},entre));
      const pasa=sim.finOff!==null&&sim.finOff>duracion+0.5;
      const ok=!sim.incompleta&&!sim.conflictos.length&&!sim.quedan.length&&!pasa&&!sim.sinTramo.length;
      r.colocacion={verificada:!sim.incompleta&&!sim.sinTramo.length,ejecutable:ok,eventos:sim.eventos,avisos:sim.avisos,conflictos:sim.conflictos,quedan:sim.quedan,sinTramo:sim.sinTramo,
        finOff:sim.finOff,excedeMin:pasa?sim.finOff-duracion:0,esperaMin:sim.esperaMin,motivo:''};
      if(sim.finOff!==null&&!sim.incompleta){r.inicioEstMs=b.inicioMs;r.finEstMs=b.inicioMs+sim.finOff*60000;}
    }else{
      r.colocacion.motivo=!ord.conSecuencia?'Sin secuencia definida en Paletas: no se puede verificar la colocación de los tramos entre las ventanas.':'Faltan datos para verificar la colocación.';
      if(!faltantes.length&&duracion>0)r.finEstMs=null;
    }
    if(faltantes.length||!(duracion>0))return r;
    r.utilizacionPct=disponible>0?requerido/disponible*100:null;
    r.cargaPct=r.utilizacionPct;
    if(disponible<=0){r.estado='EXCESO';r.motivoExceso='No queda tiempo disponible en el bloque (las paradas previstas cubren todo el bloque).';return r;}
    if(requerido>disponible){r.estado='EXCESO';r.motivoExceso='El tiempo requerido supera al disponible en '+Math.round(requerido-disponible)+' min.';return r;}
    if(r.colocacion.verificada&&r.colocacion.ejecutable===false){
      r.estado='EXCESO';
      const c=r.colocacion;
      r.motivoExceso='Las horas totales caben, pero la secuencia no es ejecutable entre las ventanas: '+(c.conflictos[0]||(c.quedan.length?'queda cantidad sin producir dentro del bloque':c.excedeMin>0?'termina '+Math.round(c.excedeMin)+' min después del fin del bloque':'revisa la colocación'))+'.';
      return r;
    }
    r.estado=r.cargaPct>=95?'JUSTO':'CABE';
    return r;
  };

  /* ---------- capacidad restante (bloque ya iniciado) ---------- */
  const INICIADOS=['EN_PRODUCCION','PAUSA','DETENIDA','LISTA','FINALIZADA'];
  M.restante=function(e){
    const b=e.bloque||{inicioMs:0,duracionMin:0},tp=e.tp||M.normalizarTiempos({}),ahora=num(e.ahora);
    const fuente='Hora del cálculo '+M.hhmm(ahora)+' · producido oficial de Producción Actual · velocidad estándar · ventanas y reglas vigentes.';
    const prods=agrupar(e.filas,e.etiqueta);
    if(!prods.length)return {aplica:false,motivo:'Sin programación.'};
    const fin=b.inicioMs+b.duracionMin*60000;
    if(!(b.inicioMs>0)||ahora<b.inicioMs)return {aplica:false,motivo:'El bloque todavía no empieza.'};
    const estadoDe=p=>(e.estado&&e.estado(p.marca,p.presentacion))||'PENDIENTE';
    if(!prods.some(p=>INICIADOS.includes(estadoDe(p))))return {aplica:false,motivo:'El bloque todavía no se inició en Producción Actual: vale la capacidad del plan.'};
    const faltantes=[],det=[];
    let prodMin=0;
    prods.forEach(p=>{
      const v=num(e.vel(p.marca,p.presentacion)),pr=e.producido?e.producido(p.marca,p.presentacion):null;
      if(pr===null||pr===undefined){faltantes.push({etiqueta:p.etiqueta,marca:p.marca,dato:'registro de producción de '+p.marca+' '+p.etiqueta});det.push(Object.assign({},p,{producido:null}));return;}
      const saldo=Math.max(0,p.cantidad-num(pr));
      if(saldo>0&&!(v>0)){faltantes.push({etiqueta:p.etiqueta,marca:p.marca,dato:'velocidad estándar de '+p.marca+' '+p.etiqueta});det.push(Object.assign({},p,{producido:num(pr),saldo,vel:0}));return;}
      const min=saldo>0?saldo/v*60:0;prodMin+=min;det.push(Object.assign({},p,{producido:num(pr),saldo,vel:v,min}));
    });
    const base={aplica:true,ahoraMs:ahora,fuente,productos:det,faltantes};
    if(faltantes.length)return Object.assign(base,{estado:'SIN_DATOS',sugerenciaAplicable:false,motivo:'No se puede calcular la capacidad restante: falta '+faltantes.map(f=>f.dato).join('; ')+'.'});
    if(ahora>=fin)return Object.assign(base,{estado:prodMin>0?'EXCESO':'CABE',tiempoRestanteMin:0,disponibleMin:0,requeridoMin:prodMin,holguraMin:-prodMin,cargaPct:null,sugerenciaAplicable:prodMin>0,preparaciones:[],notas:['El bloque ya terminó.']});
    const vt=M.ventanasDe(tp,e.linea,e.fecha,e.bloqueClave,b);
    const off=Math.max(0,(ahora-b.inicioMs)/60000),tl=lineaLibre(vt.union);
    const disponible=tl.libreEntre(off,b.duracionMin);          // solo ventanas FUTURAS: las ya pasadas no se descuentan otra vez
    // preparaciones que faltan: desde el producto en marcha (o el último iniciado) hacia los que aún tienen saldo
    const ord=ordenEjecucion(prods,e.tramos).orden;
    let idx=-1;ord.forEach((p,i)=>{if(INICIADOS.includes(estadoDe(p)))idx=i;});
    const pendientes=ord.slice(Math.max(0,idx)).filter((p,i)=>i===0||det.find(d=>d.clave===p.clave).saldo>0);
    const prep=M.preparaciones(tp,e.linea,pendientes,{limpiezaEnVentana:vt.lista.some(v=>v.tipo==='LIMPIEZA')});
    const tareas=prep.tareas.filter(t=>t.posicion!=='INICIO');
    const notas=[];
    tareas.forEach(t=>{if(t.minutos===null)faltantes.push({dato:t.faltante||('tiempo de '+t.etiqueta)});});
    if(faltantes.length)return Object.assign(base,{estado:'INCOMPLETA',sugerenciaAplicable:false,motivo:'Falta '+faltantes.map(f=>f.dato).join('; ')+'.'});
    const prepMin=tareas.reduce((s,t)=>s+(t.minutos||0),0),requerido=prodMin+prepMin;
    if(!ordenEjecucion(prods,e.tramos).conSecuencia&&pendientes.length>1)notas.push('Sin secuencia definida: los cambios pendientes suponen el orden de la lista.');
    return Object.assign(base,{estado:requerido>disponible?'EXCESO':(disponible>0&&requerido/disponible>=0.95?'JUSTO':'CABE'),tiempoRestanteMin:(fin-ahora)/60000,disponibleMin:disponible,
      ventanasFuturasMin:(b.duracionMin-off)-disponible>0?(b.duracionMin-off)-disponible:0,produccionMin:prodMin,preparacionMin:prepMin,preparaciones:tareas,requeridoMin:requerido,holguraMin:disponible-requerido,
      cargaPct:disponible>0?requerido/disponible*100:null,sugerenciaAplicable:true,notas});
  };

  /* ---------- huella del plan (para saber si una evaluación guardada sigue siendo de este plan) ---------- */
  M.huella=function(filas){
    const t=agrupar(filas).sort((a,b)=>a.clave<b.clave?-1:1).map(p=>p.clave+':'+Math.round(p.cantidad)).join(';');
    let h=5381;for(let i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))|0;
    return String(h>>>0);
  };
  M.agrupar=agrupar;
  M.ordenEjecucion=ordenEjecucion;
})();
