/* =========================================================
   IMPACTO ECONÓMICO · ESTADO CENTRAL DE FILTROS Y AGREGACIÓN (puro: se prueba sin pantalla)

   Un solo estado gobierna todo el dashboard:
     rango (hoy / 7 / 30 / mes / rango) + selección por dimensión (línea, marca, presentación, máquina, causa, turno, tipo, día).
   Cada clic en un gráfico agrega o quita un valor de la selección; los filtros se acumulan (AND entre dimensiones, OR dentro de
   una misma dimensión: PET1 + PET2 compara dos líneas). Los gráficos NO consultan Firestore: calculan sobre las filas en memoria.

   calcularVista(estado, datos, opciones) devuelve TODO lo que se dibuja y se interpreta (KPI, series, tabla, faltantes) en una
   sola pasada, de modo que los gráficos y su análisis automático siempre salen del mismo estado.
   Resaltado tipo Power BI: el gráfico de una dimensión se calcula con todos los filtros MENOS el suyo, así sigue mostrando todas
   sus barras y marca las seleccionadas; los demás gráficos, KPI y tabla sí quedan filtrados.
   Sin Firestore, sin DOM: también se carga desde Node (tests/impacto-estado.test.js).
   ========================================================= */
(function(raiz){
  'use strict';

  const DIMS=['linea','marca','pres','maquina','causa','turno','tipo','dia'];
  const ETQ_DIM={linea:'Línea',marca:'Marca',pres:'Presentación',maquina:'Máquina',causa:'Causa',turno:'Turno',tipo:'Tipo de pérdida',dia:'Día'};
  const TIPOS={P:'Parada no programada',V:'Velocidad reducida',M:'Merma'};
  const ORDEN_TURNO=['DÍA','INTERMEDIO','NOCHE','DÍA / INTERMEDIO'];
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};

  /* ---------- fechas ---------- */
  const parse=f=>{const [y,m,d]=String(f).split('-').map(Number);return new Date(y,m-1,d);};
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const addDias=(f,n)=>{const d=parse(f);d.setDate(d.getDate()+n);return iso(d);};
  const diasEntre=(a,b)=>Math.round((parse(b)-parse(a))/86400000)+1;
  const fechaOk=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''))&&!Number.isNaN(parse(f).getTime());
  const fmtFecha=f=>fechaOk(f)?f.slice(8,10)+'/'+f.slice(5,7)+'/'+f.slice(0,4):String(f||'');

  /* ---------- estado ---------- */
  function crearEstado(){
    const sel={};DIMS.forEach(d=>{sel[d]=[];});
    return {rango:{modo:'mes',desde:'',hasta:''},sel,hist:[],orden:'impacto'};   // hist = orden en que se fueron agregando los filtros
  }
  const clonar=e=>JSON.parse(JSON.stringify(e));
  function alternar(estado,dim,valor){
    if(!DIMS.includes(dim)||valor==null||valor==='')return estado;
    const a=estado.sel[dim],i=a.indexOf(valor);
    if(i>=0){a.splice(i,1);sacarHist(estado,dim,valor);}else{a.push(valor);estado.hist.push({dim,valor});}
    return estado;
  }
  const sacarHist=(estado,dim,valor)=>{estado.hist=estado.hist.filter(h=>!(h.dim===dim&&h.valor===valor));};
  function quitar(estado,dim,valor){const a=estado.sel[dim],i=a?a.indexOf(valor):-1;if(i>=0){a.splice(i,1);sacarHist(estado,dim,valor);}return estado;}
  function fijar(estado,dim,valores){
    if(!DIMS.includes(dim))return estado;
    estado.hist=estado.hist.filter(h=>h.dim!==dim);
    estado.sel[dim]=(valores||[]).filter(v=>v!==''&&v!=null);
    estado.sel[dim].forEach(v=>estado.hist.push({dim,valor:v}));
    return estado;
  }
  function limpiarSeleccion(estado){DIMS.forEach(d=>{estado.sel[d]=[];});estado.hist=[];return estado;}
  function limpiarTodo(estado){limpiarSeleccion(estado);estado.rango={modo:'mes',desde:'',hasta:''};return estado;}
  const chips=estado=>estado.hist.filter(h=>estado.sel[h.dim].includes(h.valor)).map(h=>({dim:h.dim,valor:h.valor,etq:ETQ_DIM[h.dim]+': '+(h.dim==='dia'?fmtFecha(h.valor):h.valor)}));
  const hayFiltros=estado=>DIMS.some(d=>estado.sel[d].length>0);
  /* Firma del estado: sirve para no recalcular ni redibujar si nada cambió. */
  const firma=estado=>JSON.stringify([estado.rango,DIMS.map(d=>estado.sel[d])]);

  /* ---------- periodo actual y comparable ---------- */
  function resolverRango(rango,hoy){
    if(!fechaOk(hoy))throw new Error('hoy inválido');
    const r=rango||{};
    if(r.modo==='hoy')return {desde:hoy,hasta:hoy,modo:'hoy',etiqueta:'hoy '+fmtFecha(hoy)};
    if(r.modo==='7')return {desde:addDias(hoy,-6),hasta:hoy,modo:'7',etiqueta:'últimos 7 días'};
    if(r.modo==='30')return {desde:addDias(hoy,-29),hasta:hoy,modo:'30',etiqueta:'últimos 30 días'};
    if(r.modo==='rango'&&fechaOk(r.desde)&&fechaOk(r.hasta)&&r.hasta>=r.desde)return {desde:r.desde,hasta:r.hasta,modo:'rango',etiqueta:'del '+fmtFecha(r.desde)+' al '+fmtFecha(r.hasta)};
    return {desde:hoy.slice(0,8)+'01',hasta:hoy,modo:'mes',etiqueta:'mes en curso'};
  }
  /* Periodo comparable anterior:
       · mes en curso  → el mes anterior, desde el día 1 hasta el mismo número de día (o su último día si es más corto);
       · los demás     → el mismo número de días inmediatamente antes (hoy → ayer; 7 días → los 7 anteriores…). */
  function periodoAnterior(per){
    if(per.modo==='mes'){
      const d=parse(per.desde);const pm=new Date(d.getFullYear(),d.getMonth()-1,1);
      const ult=new Date(pm.getFullYear(),pm.getMonth()+1,0).getDate();
      const dia=Math.min(Number(per.hasta.slice(8,10)),ult);
      const desde=iso(pm),hasta=desde.slice(0,8)+String(dia).padStart(2,'0');
      return {desde,hasta,etiqueta:'mes anterior ('+fmtFecha(desde)+' al '+fmtFecha(hasta)+')'};
    }
    const n=diasEntre(per.desde,per.hasta);
    const hasta=addDias(per.desde,-1),desde=addDias(hasta,-(n-1));
    return {desde,hasta,etiqueta:'periodo anterior ('+fmtFecha(desde)+' al '+fmtFecha(hasta)+')'};
  }
  const variacion=(actual,previo)=>{
    if(!Number.isFinite(actual)||!Number.isFinite(previo))return {abs:null,pct:null};
    return {abs:actual-previo,pct:previo>0?(actual-previo)/previo*100:null};
  };

  /* ---------- filas ---------- */
  function valorDim(f,d){
    switch(d){
      case 'linea':return f.linea||null;
      case 'marca':return f.marca||null;
      case 'pres':return f.pres||null;
      case 'maquina':return f.tipo==='P'?(f.maquina||'Sin clasificar'):null;     // la máquina solo aplica a las paradas
      case 'causa':return f.causa||null;
      case 'turno':return f.turno||null;
      case 'tipo':return TIPOS[f.tipo]||null;
      case 'dia':return f.fecha||null;
    }
    return null;
  }
  /* Una sola etiqueta por causa (sin distinguir mayúsculas ni acentos). */
  function normalizarFilas(filas){
    const quitar=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
    const mapa=new Map();
    return (filas||[]).map(f=>{
      const k=quitar(f.causa);if(!mapa.has(k))mapa.set(k,f.causa||'Sin motivo');
      return Object.assign({},f,{causa:mapa.get(k)});
    });
  }
  function pasa(f,sel,exceptoDim){
    for(const d of DIMS){
      if(d===exceptoDim)continue;
      const a=sel[d];if(!a||!a.length)continue;
      const v=valorDim(f,d);
      if(v==null||!a.includes(v))return false;
    }
    return true;
  }
  const filtrar=(filas,sel,exceptoDim)=>(filas||[]).filter(f=>pasa(f,sel,exceptoDim));

  /* ---------- agregación ---------- */
  function sumar(filas,econ){
    const r={s:0,u:0,min:0,n:0,sinValor:0};
    filas.forEach(f=>{
      r.u+=num(f.u);r.min+=num(f.min);if(f.tipo==='P')r.n++;
      if(econ){if(f.s==null)r.sinValor++;else r.s+=num(f.s);}
    });
    return r;
  }
  function agrupar(filas,dim,econ,filtroTipo){
    const m=new Map();
    filas.forEach(f=>{
      if(filtroTipo&&f.tipo!==filtroTipo)return;
      const k=valorDim(f,dim);if(k==null)return;
      const o=m.get(k)||{k,s:0,u:0,min:0,n:0,sinValor:0};
      o.u+=num(f.u);o.min+=num(f.min);if(f.tipo==='P')o.n++;
      if(econ){if(f.s==null)o.sinValor++;else o.s+=num(f.s);}
      m.set(k,o);
    });
    const med=econ?'s':'min';
    return [...m.values()].sort((a,b)=>b[med]-a[med]||b.min-a.min||String(a.k).localeCompare(String(b.k),'es'));
  }
  const ordenarTurnos=lista=>lista.slice().sort((a,b)=>{const i=ORDEN_TURNO.indexOf(a.k),j=ORDEN_TURNO.indexOf(b.k);return (i<0?9:i)-(j<0?9:j);});

  /* Serie temporal: por hora si el periodo es un solo día; por día en los demás casos. */
  function serieTemporal(filas,per,econ){
    const med=f=>econ?(f.s==null?0:num(f.s)):num(f.min);
    if(per.desde===per.hasta){
      const claves=[],valores=[];
      for(let h=0;h<24;h++){claves.push(String(h).padStart(2,'0')+':00');valores.push(0);}
      let sinHora=0;
      filas.forEach(f=>{
        const h=parseInt(String(f.hora||'').slice(0,2),10);
        if(Number.isFinite(h)&&h>=0&&h<24)valores[h]+=med(f);else sinHora+=med(f);
      });
      if(sinHora>0){claves.push('Sin hora');valores.push(sinHora);}
      return {claves,valores,unidad:'hora'};
    }
    const claves=[],idx=new Map();
    for(let d=per.desde;d<=per.hasta;d=addDias(d,1)){idx.set(d,claves.length);claves.push(d);}
    const valores=claves.map(()=>0);
    filas.forEach(f=>{const i=idx.get(f.fecha);if(i!=null)valores[i]+=med(f);});
    return {claves,valores,unidad:'día'};
  }
  function tendencia(valores){
    const n=valores.length;if(n<2)return {pendiente:0,puntos:valores.slice(),ok:false};
    let sx=0,sy=0,sxy=0,sxx=0;
    valores.forEach((y,x)=>{sx+=x;sy+=y;sxy+=x*y;sxx+=x*x;});
    const den=n*sxx-sx*sx;
    if(!den)return {pendiente:0,puntos:valores.slice(),ok:false};
    const b=(n*sxy-sx*sy)/den,a=(sy-b*sx)/n;
    return {pendiente:b,puntos:valores.map((_,x)=>a+b*x),ok:true};
  }
  const acumulada=valores=>{let t=0;return valores.map(v=>(t+=v));};

  /* ---------- vista completa ---------- */
  /* datos: {filas, filasPrev, per, perPrev, hoy}. opciones: {economico:boolean}. */
  function calcularVista(estado,datos,opciones){
    const econ=!!(opciones&&opciones.economico);
    const sel=estado.sel,per=datos.per,perPrev=datos.perPrev;
    const filas=datos.filas||[],filasPrev=datos.filasPrev||null;
    const base=filtrar(filas,sel);
    const selPrev=Object.assign({},sel,{dia:[]});                 // la selección de un día concreto pertenece al periodo actual
    const prev=filasPrev?filtrar(filasPrev,selPrev):null;
    const tot=sumar(base,econ),totPrev=prev?sumar(prev,econ):null;
    const med=econ?'s':'min';
    const topLinea=agrupar(base,'linea',econ)[0]||null,topCausa=agrupar(base,'causa',econ)[0]||null;
    // Contexto de la selección: el total sin ningún filtro y el total del paso anterior (sin el último filtro agregado).
    const ch=chips(estado),selSin={},selPadre={};
    DIMS.forEach(d=>{selSin[d]=[];selPadre[d]=[];});
    ch.slice(0,-1).forEach(c=>selPadre[c.dim].push(c.valor));
    const contexto={chips:ch,totalSinFiltros:sumar(filtrar(filas,selSin),econ),totalPadre:ch.length?sumar(filtrar(filas,selPadre),econ):null};
    const propio=(dim,filtroTipo)=>{
      const g=agrupar(filtrar(filas,sel,dim),dim,econ,filtroTipo);
      return dim==='turno'?ordenarTurnos(g):g;
    };
    const serie=serieTemporal(filtrar(filas,sel,'dia'),per,econ);
    const seriePrev=prev&&perPrev?serieTemporal(filtrar(filasPrev,selPrev),perPrev,econ):null;
    const evol={claves:serie.claves,valores:serie.valores,unidad:serie.unidad,previo:seriePrev?seriePrev.valores.slice(0,serie.valores.length):null,tendencia:tendencia(serie.valores)};
    const puntos=base.filter(f=>f.tipo==='P'&&num(f.min)>0).map(f=>({id:f.id,x:num(f.min),y:econ?(f.s==null?null:num(f.s)):num(f.u),fila:f})).filter(p=>p.y!=null);
    const falt=new Map(),faltIns=new Map();
    base.forEach(f=>{
      if(f.falta==='valor')falt.set(f.linea+'|'+f.marca+'|'+f.pres,{linea:f.linea,marca:f.marca,pres:f.pres});
      if(f.falta==='costo')faltIns.set(f.linea+'|'+f.causa,{linea:f.linea,comp:String(f.causa||'').replace('Merma: ','')});
    });
    return {
      econ,medida:med,per,perPrev,hayDatos:base.length>0,
      kpis:{total:tot,previo:totPrev,variacion:totPrev?variacion(tot[med],totPrev[med]):null,topLinea,topCausa},contexto,
      series:{
        evolucion:evol,acumulada:{claves:serie.claves,valores:acumulada(serie.valores)},
        linea:propio('linea'),causa:propio('causa'),maquina:propio('maquina','P'),marca:propio('marca'),pres:propio('pres'),
        turno:propio('turno'),tipo:propio('tipo'),scatter:puntos
      },
      tabla:base,
      faltantes:{productos:[...falt.values()],insumos:[...faltIns.values()]},
      sinValor:econ?base.filter(f=>f.s==null).length:0
    };
  }

  const API={DIMS,ETQ_DIM,TIPOS,ORDEN_TURNO,crearEstado,clonar,alternar,quitar,fijar,limpiarSeleccion,limpiarTodo,chips,hayFiltros,firma,
    resolverRango,periodoAnterior,variacion,addDias,diasEntre,fechaOk,fmtFecha,valorDim,normalizarFilas,filtrar,pasa,sumar,agrupar,ordenarTurnos,
    serieTemporal,tendencia,acumulada,calcularVista};
  raiz.GlacialImpactoEstado=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
