/* =============================================================
   PLANIFICACIÓN · NÚCLEO (Parte A)

   La programación NO se guarda en otro sitio: sigue en sync/programaciones (items), con la misma
   forma de siempre. Aquí no hay una segunda lógica de programación: toda escritura pasa por
   guardarProgramacionPaleta() (16-paletas.js), que valida el permiso «planificacion», exige motivo si
   la programación ya está en producción y deja el historial. Este archivo solo añade:
     · validaciones, copia de programación (día anterior, semana pasada, semana completa) y lectura de Excel;
     · la lectura/regla para Paletas («Ver en Planificación», «Solicitar programación»);
     · el registro de escuchas (catálogo, solicitudes) y su cierre al salir de la sesión.
   Los datos ya guardados no se migran ni se alteran.
   ============================================================= */
(function(){
  'use strict';

  const NS=window.glacialPlanificacion=window.glacialPlanificacion||{};
  NS.escuchas=NS.escuchas||[];          // funciones que abren una escucha y devuelven su cierre
  NS.alRefrescar=NS.alRefrescar||[];    // funciones que se avisan cuando cambia la programación
  NS.pestanas=NS.pestanas||[];          // {clave,titulo,orden,pintar(cont),actualizar()}

  const TURNOS=['DÍA','INTERMEDIO','NOCHE'];
  const ESTADOS_EN_PRODUCCION=['EN_PRODUCCION','PAUSA','DETENIDA','LISTA','FINALIZADA'];
  NS.TURNOS=TURNOS;
  /* Se programa por BLOQUE: «Día + Intermedio» y «Noche», con una sola cantidad por producto. Lo de Día + Intermedio se guarda en la
     fila DÍA (no se crea fila de INTERMEDIO, así no cambia la clave ni hay que migrar datos). Las filas INTERMEDIO ya guardadas
     siguen valiendo: el programado del bloque es la suma (GlacialProgramadoBloque, 23b). */
  NS.BLOQUES=[{valor:'DÍA',etq:window.GlacialIndicadores.nombreBloque('DÍA','pantalla','titulo')},{valor:'NOCHE',etq:window.GlacialIndicadores.nombreBloque('NOCHE','pantalla','titulo')}];
  NS.valorBloque=t=>String(t||'').toUpperCase().includes('NOCHE')?'NOCHE':'DÍA';
  NS.etiquetaBloque=t=>window.GlacialIndicadores.nombreBloque(NS.valorBloque(t),'pantalla','titulo');
  /* Horario productivo del bloque, tomado de la configuración de bloques (sync/configIndicadores → bloques). */
  NS.horarioBloque=t=>{
    try{
      const c=typeof window.glacialConfigIndicadores==='function'?window.glacialConfigIndicadores().bloques:undefined;
      const b=window.GlacialIndicadores.normalizarBloques(c)[NS.valorBloque(t)==='NOCHE'?'noche':'diaInter'];
      return b.inicio+'–'+b.fin;
    }catch(_){return '';}
  };
  NS.etiquetaBloqueConHorario=t=>NS.etiquetaBloque(t)+(NS.horarioBloque(t)?' · '+NS.horarioBloque(t):'');
  /* Intermedio ya no se programa: lo que llegue como INTERMEDIO va a la fila DÍA, salvo que ese producto YA tenga una fila
     INTERMEDIO guardada (se edita esa misma). El escritor único (guardarProgramacionPaleta, 16) aplica la misma regla. */
  NS.turnoDeGuardado=f=>{
    if(!f||f.turno!=='INTERMEDIO')return f?f.turno:'';
    const ex=NS.existente(f.linea,f.fecha,'INTERMEDIO',f.marca,f.presentacion);
    return ex&&num(ex.cantidadProgramada)>0?'INTERMEDIO':'DÍA';
  };

  /* ---------- utilidades ---------- */
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const norm=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[_\s]+/g,' ').trim();
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const parseISO=f=>{const [y,m,d]=String(f).split('-').map(Number);return new Date(y,m-1,d);};
  const fechaOk=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''))&&!Number.isNaN(parseISO(f).getTime());
  const addDias=(f,n)=>{const d=parseISO(f);d.setDate(d.getDate()+n);return iso(d);};
  const lunesDe=f=>addDias(f,-((parseISO(f).getDay()+6)%7));
  NS.util={num,norm,esc,ahoraMs,iso,parseISO,fechaOk,addDias,lunesDe};

  const puede=()=>typeof tienePermiso==='function'&&tienePermiso('planificacion');
  NS.puede=puede;
  NS.puedeVer=()=>typeof puedeEntrarPlanificacion==='function'&&puedeEntrarPlanificacion();
  const lineas=()=>typeof LINES!=='undefined'?LINES:[];
  const programaciones=()=>{try{return (typeof loadProgramaciones==='function'?loadProgramaciones():[])||[];}catch(_){return [];}};
  NS.lineas=lineas;
  NS.programaciones=programaciones;
  NS.nombreLinea=k=>{const l=lineas().find(x=>x.key===k);return l?l.name:k;};
  NS.marcas=l=>(typeof MARCAS_POR_LINEA!=='undefined'&&MARCAS_POR_LINEA[l])||[];
  NS.presentacionesBrutas=l=>(typeof PRESENTACIONES_POR_LINEA!=='undefined'&&PRESENTACIONES_POR_LINEA[l])||[];
  NS.etiquetaPresentacion=(l,m,p)=>typeof nombrePresentacionUI==='function'?nombrePresentacionUI(l,m,p):String(p||'');
  /* Opciones de presentación de una línea: las mismas que ofrece Paletas ({value,label}). */
  NS.presentaciones=l=>{
    let lista=[];
    try{if(typeof presentacionesUnicasPaletas==='function')lista=presentacionesUnicasPaletas(l)||[];}catch(_){lista=[];}
    if(!lista.length)lista=NS.presentacionesBrutas(l).map(p=>({value:p,label:NS.etiquetaPresentacion(l,'',p)}));
    return lista;
  };

  /* ---------- lectura de la programación ---------- */
  NS.clave=(l,f,t,m,p)=>typeof claveProgramacionPaleta==='function'?claveProgramacionPaleta(l,f,t,m,p):[l,f,t,m,p].join('|');
  NS.existente=(l,f,t,m,p)=>typeof obtenerProgramacionPaleta==='function'?obtenerProgramacionPaleta(l,f,t,m,p):null;
  NS.estadoDe=item=>(item&&item.estadoOperacion&&item.estadoOperacion.estado)||'PENDIENTE';
  NS.enProduccion=item=>ESTADOS_EN_PRODUCCION.includes(NS.estadoDe(item));
  NS.estadoTexto=e=>({PENDIENTE:'Pendiente',EN_PRODUCCION:'En producción',PAUSA:'En pausa',DETENIDA:'Detenida',LISTA:'Detenida',FINALIZADA:'Finalizada',CANCELADA:'Cancelada'})[e]||e||'Pendiente';
  NS.items=(fecha,turno)=>{
    const orden=lineas().map(l=>l.key);
    const bloque=turno?(NS.valorBloque(turno)==='NOCHE'?['NOCHE']:['DÍA','INTERMEDIO']):null;
    return programaciones().filter(p=>p&&p.fecha===fecha&&(!bloque||bloque.includes(p.turno))&&num(p.cantidadProgramada)>0)
      .sort((a,b)=>(orden.indexOf(a.linea)-orden.indexOf(b.linea))||String(a.marca).localeCompare(String(b.marca),'es')||String(a.presentacion).localeCompare(String(b.presentacion),'es'));
  };
  /* Productos con la MISMA cantidad en Día e Intermedio (posible duplicado): solo se avisa, nunca se corrige solo. */
  NS.duplicadosPosibles=fecha=>{
    const por=new Map();
    programaciones().forEach(p=>{
      if(!p||p.fecha!==fecha||!(num(p.cantidadProgramada)>0)||NS.estadoDe(p)==='CANCELADA')return;
      if(p.turno!=='DÍA'&&p.turno!=='INTERMEDIO')return;
      const k=[p.linea,p.marca,p.presentacion].join('|');const o=por.get(k)||{};o[p.turno]=num(p.cantidadProgramada);por.set(k,o);
    });
    const salida=new Set();por.forEach((o,k)=>{if(o['DÍA']>0&&o['DÍA']===o['INTERMEDIO'])salida.add(k);});
    return salida;
  };
  NS.paletasEquivalentes=(cant,upp)=>num(upp)>0?num(cant)/num(upp):0;
  /* Unidades por paleta: el catálogo (53) manda; si no hay, la tabla fija de siempre. */
  NS.uppCatalogo=NS.uppCatalogo||(()=>0);
  NS.uppSugerida=(l,m,p)=>num(NS.uppCatalogo(l,m,p))||(typeof obtenerUnidadesPorPalet==='function'?num(obtenerUnidadesPorPalet(l,m,p)):0);

  /* ---------- validación ---------- */
  /* fila: {linea,fecha,turno,marca,presentacion,cantidad,upp}. Devuelve {errores:[], avisos:[]}. */
  NS.validar=function(f){
    f=Object.assign({},f,{turno:NS.turnoDeGuardado(f)});
    const errores=[],avisos=[];
    if(!lineas().some(l=>l.key===f.linea))errores.push('La línea no es válida.');
    if(!fechaOk(f.fecha))errores.push('La fecha no es válida.');
    if(!TURNOS.includes(f.turno))errores.push('El turno debe ser Mañana + Intermedio o Noche.');
    if(!f.marca)errores.push('Selecciona la marca.');
    else if(lineas().some(l=>l.key===f.linea)&&!NS.marcas(f.linea).includes(f.marca))errores.push('La marca «'+f.marca+'» no existe en '+NS.nombreLinea(f.linea)+'.');
    if(!f.presentacion)errores.push('Selecciona la presentación.');
    else if(lineas().some(l=>l.key===f.linea)&&!NS.presentacionesBrutas(f.linea).includes(f.presentacion))errores.push('La presentación «'+f.presentacion+'» no es válida para '+NS.nombreLinea(f.linea)+'.');
    const cant=Number(f.cantidad),upp=Number(f.upp);
    if(!Number.isInteger(cant)||cant<=0)errores.push('La cantidad programada debe ser un entero mayor que cero.');
    if(!Number.isInteger(upp)||upp<=0)errores.push('Las unidades por paleta deben ser un entero mayor que cero.');
    if(!errores.length){
      if(typeof NS.productoInactivo==='function'&&NS.productoInactivo(f.linea,f.marca,f.presentacion))avisos.push('Este producto está marcado como inactivo en el catálogo.');
      const ex=NS.existente(f.linea,f.fecha,f.turno,f.marca,f.presentacion);
      if(ex&&num(ex.cantidadProgramada)>0){
        avisos.push('Ya existe esta programación (misma línea, turno y producto): se reemplazará su cantidad ('+num(ex.cantidadProgramada).toLocaleString('es-PE')+' UND).');
        if(NS.enProduccion(ex))avisos.push('Está '+NS.estadoTexto(NS.estadoDe(ex)).toLowerCase()+': el cambio exige motivo.');
      }
    }
    return {errores,avisos};
  };

  /* Crea o edita UNA programación con la función única de 16-paletas.js. */
  NS.guardar=async function(f,opc){
    opc=opc||{};
    if(!puede())throw new Error('Solo Planificación puede crear o editar la programación.');
    const v=NS.validar(f);
    if(v.errores.length)throw new Error(v.errores.join(' '));
    return guardarProgramacionPaleta(f.linea,f.fecha,NS.turnoDeGuardado(f),f.marca,f.presentacion,Number(f.cantidad),Number(f.upp),opc);
  };
  /* ---------- Unificar en Día ---------- */
  NS.hoyOperativo=()=>window.GlacialIndicadores?window.GlacialIndicadores.diaOperativo(ahoraMs()):iso(new Date(ahoraMs()));
  /* Solo filas INTERMEDIO PENDIENTES, de hoy en adelante y sin paletas de ese producto en Intermedio. Lo pasado o en producción no se toca. */
  NS.puedeUnificar=item=>{
    if(!item||item.turno!=='INTERMEDIO'||!(num(item.cantidadProgramada)>0)||NS.estadoDe(item)!=='PENDIENTE')return false;
    if(!fechaOk(item.fecha)||item.fecha<NS.hoyOperativo())return false;
    const paletas=typeof loadPaletas==='function'?(loadPaletas()||[]):[];
    return !paletas.some(r=>r&&r.linea===item.linea&&r.fecha===item.fecha&&r.turno==='INTERMEDIO'&&r.marca===item.marca&&r.presentacion===item.presentacion);
  };
  /* Mueve la fila INTERMEDIO al bloque Día en UNA transacción sobre sync/programaciones: si el producto ya tiene fila DÍA se suma;
     si no, la fila pasa a ser DÍA (misma cantidad, unidades por paleta y secuencia). La fila DÍA conserva el rastro en
     unificadoDeIntermedio[] (reversible) y el historial recibe EDICIÓN/CREACIÓN del DÍA y ELIMINACIÓN del INTERMEDIO con la referencia UNIFICACION. */
  NS.unificarEnDia=async function(item,motivo){
    if(!puede())throw new Error('Solo Planificación puede unificar programaciones.');
    const m=String(motivo||'').trim();
    if(m.length<5)throw new Error('Indica el motivo de la unificación (mínimo 5 caracteres).');
    if(!NS.puedeUnificar(item))throw new Error('Solo se pueden unificar programaciones de Intermedio pendientes, de hoy en adelante y sin producción registrada.');
    const claveInter=item.clave,claveDia=NS.clave(item.linea,item.fecha,'DÍA',item.marca,item.presentacion);
    const quien=typeof nombreUsuarioActualPaletas==='function'?nombreUsuarioActualPaletas():'';
    const ref=db.collection('sync').doc('programaciones');
    let antesDia=null,despuesDia=null,antesInter=null;
    const items=await db.runTransaction(async tx=>{
      antesDia=null;despuesDia=null;antesInter=null;
      const snap=await tx.get(ref);
      const act=snap.exists&&Array.isArray(snap.data().items)?snap.data().items.slice():[];
      const i=act.findIndex(p=>p.clave===claveInter);
      if(i<0)throw new Error('La fila INTERMEDIO ya no existe (otra persona la cambió). Actualiza la pantalla.');
      const inter=act[i];
      if(((inter.estadoOperacion&&inter.estadoOperacion.estado)||'PENDIENTE')!=='PENDIENTE')throw new Error('La programación de Intermedio ya no está pendiente: no se puede unificar.');
      antesInter=inter;
      const traza={cantidad:num(inter.cantidadProgramada),claveOriginal:claveInter,por:quien,motivo:m,fecha:Date.now()};
      const j=act.findIndex(p=>p.clave===claveDia);
      if(j>=0){
        antesDia=act[j];
        const upp=num(act[j].unidadesPorPaleta)||num(inter.unidadesPorPaleta),cant=num(act[j].cantidadProgramada)+num(inter.cantidadProgramada);
        act[j]=Object.assign({},act[j],{cantidadProgramada:cant,unidadesPorPaleta:upp,paletasProgramadas:upp?cant/upp:0,unificadoDeIntermedio:(act[j].unificadoDeIntermedio||[]).concat([traza]),actualizadoPor:quien,actualizadoEn:Date.now()});
        despuesDia=act[j];act.splice(i,1);
      }else{
        act[i]=Object.assign({},inter,{id:'prog_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),clave:claveDia,turno:'DÍA',unificadoDeIntermedio:[traza],actualizadoPor:quien,actualizadoEn:Date.now()});
        despuesDia=act[i];
      }
      tx.set(ref,{items:act,updatedAt:Date.now()});
      return act;
    });
    if(typeof _programacionesCache!=='undefined')_programacionesCache=items;
    const ref2='UNIFICACION: '+claveInter;
    const val=p=>p?{cantidad:num(p.cantidadProgramada),unidadesPorPaleta:num(p.unidadesPorPaleta),estado:(p.estadoOperacion&&p.estadoOperacion.estado)||''}:null;
    const base={linea:item.linea,fecha:item.fecha,marca:item.marca,presentacion:item.presentacion,motivo:m,referencia:ref2};
    await NS.registrarHistorial(Object.assign({},base,{accion:antesDia?'EDICION':'CREACION',turno:'DÍA',anterior:val(antesDia),nuevo:val(despuesDia)}));
    await NS.registrarHistorial(Object.assign({},base,{accion:'ELIMINACION',turno:'INTERMEDIO',anterior:val(antesInter),nuevo:null}));
    return {antesDia,despuesDia,antesInter};
  };

  /* Quita una programación (cantidad 0, como siempre). */
  NS.quitar=async function(item,motivo){
    if(!puede())throw new Error('Solo Planificación puede quitar la programación.');
    return guardarProgramacionPaleta(item.linea,item.fecha,item.turno,item.marca,item.presentacion,0,num(item.unidadesPorPaleta)||0,{motivo});
  };
  /* Aplica varias filas, una por una, con la misma función. */
  NS.aplicarLote=async function(filas,opc){
    const ok=[],fallos=[];
    for(const f of filas){
      try{await NS.guardar(f,opc);ok.push(f);}
      catch(e){fallos.push({fila:f,error:(e&&e.message)||String(e)});}
    }
    return {ok,fallos};
  };

  /* ---------- copiar programación ---------- */
  /* modo: 'DIA_ANTERIOR' | 'SEMANA_PASADA' (mismo día de la semana pasada) | 'SEMANA_COMPLETA'.
     fecha: día destino (en SEMANA_COMPLETA, la semana lunes–domingo que contiene esa fecha).
     Devuelve {candidatos:[fila+existe], omitidos:[{texto}]}. */
  NS.planCopia=function(o){
    const turnos=o.soloTurno?(NS.valorBloque(o.soloTurno)==='NOCHE'?['NOCHE']:['DÍA','INTERMEDIO']):TURNOS;
    const pares=[];   // {origen,destino}
    if(o.modo==='DIA_ANTERIOR')pares.push({origen:addDias(o.fecha,-1),destino:o.fecha});
    else if(o.modo==='SEMANA_PASADA')pares.push({origen:addDias(o.fecha,-7),destino:o.fecha});
    else{const lun=lunesDe(o.fecha);for(let i=0;i<7;i++){const d=addDias(lun,i);pares.push({origen:addDias(d,-7),destino:d});}}
    const candidatos=[],omitidos=[];
    pares.forEach(({origen,destino})=>{
      programaciones().forEach(p=>{
        if(!p||p.fecha!==origen||!turnos.includes(p.turno)||num(p.cantidadProgramada)<=0)return;
        if(NS.estadoDe(p)==='CANCELADA')return;
        // Día + Intermedio es UN bloque: la copia va a la fila DÍA y, si el producto tenía fila en ambos turnos, se SUMA.
        const fila={linea:p.linea,fecha:destino,turno:NS.valorBloque(p.turno),marca:p.marca,presentacion:p.presentacion,
          cantidad:num(p.cantidadProgramada),upp:num(p.unidadesPorPaleta)||NS.uppSugerida(p.linea,p.marca,p.presentacion)};
        const prev=candidatos.find(c=>c.linea===fila.linea&&c.fecha===fila.fecha&&c.turno===fila.turno&&c.marca===fila.marca&&c.presentacion===fila.presentacion);
        if(prev){prev.cantidad+=fila.cantidad;return;}
        const etiqueta=destino+' · '+p.turno+' · '+NS.nombreLinea(p.linea)+' · '+p.marca+' '+NS.etiquetaPresentacion(p.linea,p.marca,p.presentacion);
        const ex=NS.existente(fila.linea,fila.fecha,fila.turno,fila.marca,fila.presentacion);
        if(ex&&num(ex.cantidadProgramada)>0){
          if(NS.enProduccion(ex)){omitidos.push({texto:etiqueta+': ya está en producción, no se toca.'});return;}
          if(!o.reemplazar){omitidos.push({texto:etiqueta+': ya existe (no se reemplaza).'});return;}
          fila.existe=true;
        }
        const v=NS.validar(fila);
        if(v.errores.length){omitidos.push({texto:etiqueta+': '+v.errores.join(' ')});return;}
        candidatos.push(fila);
      });
    });
    return {candidatos,omitidos};
  };

  /* ---------- Excel ----------
     Columnas (en la primera hoja): Fecha, Turno, Línea, Marca, Presentación, Cantidad, Unidades por paleta
     (la última es opcional: si falta se toma el catálogo). */
  NS.COLUMNAS_EXCEL=['Fecha','Turno','Línea','Marca','Presentación','Cantidad','Unidades por paleta'];
  const fechaDeCelda=v=>{
    if(v instanceof Date&&!Number.isNaN(v.getTime()))return iso(v);
    if(typeof v==='number'&&Number.isFinite(v)){const d=new Date(Math.round((v-25569)*86400000));return iso(new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));}
    const t=String(v||'').trim();
    let m=t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(m)return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
    m=t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if(m)return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
    return '';
  };
  const turnoDeCelda=v=>{const t=norm(v);if(t==='dia')return 'DÍA';if(t==='intermedio'||t==='tarde')return 'INTERMEDIO';if(t==='noche')return 'NOCHE';return String(v||'').trim().toUpperCase();};
  const lineaDeCelda=v=>{const t=norm(v);const l=lineas().find(x=>norm(x.key)===t||norm(x.name)===t);return l?l.key:String(v||'').trim().toUpperCase();};
  const marcaDeCelda=(linea,v)=>{const t=norm(v);return NS.marcas(linea).find(m=>norm(m)===t)||String(v||'').trim();};
  const presentacionDeCelda=(linea,v)=>{
    const t=norm(v);if(!t)return '';
    const lista=NS.presentacionesBrutas(linea);
    return lista.find(p=>norm(p)===t)||
      (NS.presentaciones(linea).find(p=>norm(p.label)===t)||{}).value||
      lista.find(p=>norm(p).startsWith(t))||String(v||'').trim();
  };
  /* Devuelve {filas:[{fila,numero,errores,avisos}]}; no escribe nada. */
  NS.leerExcel=async function(archivo){
    if(typeof XLSX==='undefined')throw new Error('No se cargó la librería de Excel.');
    const libro=XLSX.read(await archivo.arrayBuffer(),{type:'array',cellDates:true});
    const hoja=libro.Sheets[libro.SheetNames[0]];
    const filas=XLSX.utils.sheet_to_json(hoja,{defval:'',raw:true});
    if(!filas.length)throw new Error('La primera hoja está vacía.');
    const col=(fila,nombres)=>{
      const e=Object.entries(fila);
      for(const n of nombres){const h=e.find(([k])=>norm(k)===norm(n));if(h)return h[1];}
      return '';
    };
    const salida=[],vistos=new Set();
    filas.forEach((r,i)=>{
      const crudo=[col(r,['Fecha']),col(r,['Línea','Linea']),col(r,['Marca']),col(r,['Presentación','Presentacion']),col(r,['Cantidad','Cantidad programada'])];
      if(crudo.every(x=>x===''))return;
      const linea=lineaDeCelda(col(r,['Línea','Linea']));
      let turnoLeido=turnoDeCelda(col(r,['Turno']));
      const eraIntermedio=turnoLeido==='INTERMEDIO';
      if(eraIntermedio)turnoLeido='DÍA';        // Día + Intermedio es UN bloque: se guarda en la fila DÍA
      const fila={
        linea,fecha:fechaDeCelda(col(r,['Fecha'])),turno:turnoLeido,
        marca:marcaDeCelda(linea,col(r,['Marca'])),presentacion:presentacionDeCelda(linea,col(r,['Presentación','Presentacion'])),
        cantidad:Number(col(r,['Cantidad','Cantidad programada'])),upp:Number(col(r,['Unidades por paleta','UND por paleta','Unidades x paleta']))
      };
      if(!(fila.upp>0))fila.upp=NS.uppSugerida(fila.linea,fila.marca,fila.presentacion);
      const v=NS.validar(fila);
      const clave=NS.clave(fila.linea,fila.fecha,fila.turno,fila.marca,fila.presentacion);
      if(eraIntermedio)v.avisos.push('Fila INTERMEDIO: se carga en Mañana + Intermedio; se guarda en la fila DÍA.');
      const previa=vistos.has(clave)?salida.find(x=>x.clave===clave&&!x.errores.length):null;
      if(previa&&!v.errores.length&&(eraIntermedio||previa.conIntermedio)){
        // Día + Intermedio del mismo producto: se SUMAN (no gana la última).
        const antes=previa.fila.cantidad;previa.fila.cantidad=antes+fila.cantidad;previa.conIntermedio=true;
        previa.avisos.push('Se sumó la fila '+(i+2)+' (Intermedio): '+antes.toLocaleString('es-PE')+' + '+fila.cantidad.toLocaleString('es-PE')+' = '+previa.fila.cantidad.toLocaleString('es-PE')+' UND.');
        if(antes===fila.cantidad){previa.posibleDuplicado=true;previa.avisos.push('POSIBLE DUPLICADO: Mañana e Intermedio traen la misma cantidad ('+antes.toLocaleString('es-PE')+' UND). Confirma antes de importar.');}
        return;
      }
      if(vistos.has(clave))v.avisos.push('Se repite en este archivo: gana la última fila.');
      let dupGuardado=false;
      if(!v.errores.length){
        const ex=NS.existente(fila.linea,fila.fecha,'INTERMEDIO',fila.marca,fila.presentacion);
        if(ex&&num(ex.cantidadProgramada)>0)v.avisos.push('Ya hay una fila INTERMEDIO guardada ('+num(ex.cantidadProgramada).toLocaleString('es-PE')+' UND): el programado del bloque será la suma'+(num(ex.cantidadProgramada)===fila.cantidad?' (POSIBLE DUPLICADO: misma cantidad; confirma antes de importar).':'.'));
        if(ex&&num(ex.cantidadProgramada)>0&&num(ex.cantidadProgramada)===fila.cantidad)dupGuardado=true;
      }
      vistos.add(clave);
      salida.push({fila,numero:i+2,errores:v.errores,avisos:v.avisos,clave,conIntermedio:eraIntermedio,posibleDuplicado:dupGuardado});
    });
    if(!salida.length)throw new Error('No se encontraron filas con datos.');
    return {filas:salida};
  };
  NS.descargarPlantilla=function(){
    if(typeof XLSX==='undefined'){alert('No se cargó la librería de Excel.');return;}
    const l0=lineas()[0]?lineas()[0].key:'PET1';
    // La plantilla solo trae DÍA (incluye Intermedio) y NOCHE.
    const hoyP=addDias(iso(new Date(ahoraMs())),0),m0=NS.marcas(l0)[0]||'',p0=NS.presentacionesBrutas(l0)[0]||'';
    const ejemplo=[NS.COLUMNAS_EXCEL,[hoyP,'DÍA',l0,m0,p0,10000,''],[hoyP,'NOCHE',l0,m0,p0,8000,'']];
    const libro=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro,XLSX.utils.aoa_to_sheet(ejemplo),'Programación');
    XLSX.writeFile(libro,'plantilla-programacion.xlsx');
  };

  /* ---------- Paletas: dato + «Ver en Planificación» + «Solicitar programación» ---------- */
  NS.htmlPaletas=function(d){
    if(!d)return '';
    const prog=NS.existente(d.linea,d.fecha,d.turno,d.marca,d.presentacion);
    const delBloque=typeof window.glacialProgramadoBloque==='function'?window.glacialProgramadoBloque(d.linea,d.fecha,d.turno,{marca:d.marca,presentacion:d.presentacion}).cantidad:num(prog&&prog.cantidadProgramada);
    const hay=delBloque>0;
    const btn='background:none;border:0;padding:0;color:#005b96;cursor:pointer;font:inherit;font-weight:600;text-decoration:underline';
    let h='';
    if(NS.puedeVer())h+='<button type="button" style="'+btn+'" onclick="glacialPlanificacion.irA(\''+esc(d.fecha)+'\',\''+esc(d.turno)+'\')">Ver en Planificación →</button>';
    if(!hay&&!puede()&&typeof NS.solicitarProgramacion==='function'&&d.marca&&d.presentacion){
      h+='<button type="button" class="btn btn-ghost btn-sm" onclick="glacialPlanificacion.solicitarProgramacion(\''+esc(d.linea)+'\',\''+esc(d.fecha)+'\',\''+esc(d.turno)+'\',\''+esc(d.marca)+'\',\''+esc(d.presentacion)+'\')">Solicitar programación</button>';
    }
    return h?'<div style="margin-top:6px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">'+h+'</div>':'';
  };
  /* Abre Planificación en una fecha y turno. */
  NS.irA=function(fecha,turno){
    NS.estado=NS.estado||{};
    if(fechaOk(fecha))NS.estado.fecha=fecha;
    if(TURNOS.includes(turno))NS.estado.turno=NS.valorBloque(turno);
    NS.estado.tab='programacion';
    if(typeof goPlanificacion==='function')goPlanificacion();
  };
  NS.irASolicitudes=function(){NS.estado=NS.estado||{};NS.estado.tab='solicitudes';if(typeof NS.pintarPestana==='function')NS.pintarPestana();};

  /* ---------- escuchas y refresco en vivo ---------- */
  let cierres=[];
  function cerrarEscuchas(){cierres.splice(0).forEach(c=>{try{c();}catch(_){/* ya cerrada */}});}
  window.glacialPlanificacionEscuchas=function(){
    cerrarEscuchas();
    if(typeof state==='undefined')return;
    NS.escuchas.forEach(f=>{
      try{const c=f();if(typeof c==='function')cierres.push(c);}
      catch(e){console.warn('Planificación: no se pudo abrir una escucha:',e&&e.message||e);}
    });
  };
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(cerrarEscuchas);

  let temporizador=null;
  window.glacialPlanificacionRefrescar=function(){
    clearTimeout(temporizador);
    temporizador=setTimeout(()=>{
      NS.alRefrescar.forEach(f=>{try{f();}catch(_){/* ajeno */}});
      try{if(typeof NS.repintar==='function')NS.repintar();}catch(e){console.warn('Planificación:',e&&e.message||e);}
      try{if(typeof window.glacialAlertasPintar==='function')window.glacialAlertasPintar();}catch(_){/* informativo */}
    },120);
  };
  NS.refrescar=window.glacialPlanificacionRefrescar;
})();
