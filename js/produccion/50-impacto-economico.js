/* =========================================================
   IMPACTO ECONÓMICO · MOTOR DE CÁLCULO (cascada de pérdidas por evento)

   Este archivo calcula; la pantalla (dashboard interactivo) está en 57-impacto-estado.js, 58-impacto-dashboard.js y
   59-impacto-analisis.js. renderPerdidasSoles() (la llama renderMain) abre ese dashboard para TODOS los roles; lo que
   cada rol recibe depende de los datos que tiene (ver 55-valores-economicos.js y 56-impacto-resultados.js):
     · Gerencia: tiene los valores unitarios → cada fila lleva soles.
     · Jefatura: recibe las filas ya calculadas por Gerencia (con soles y unidades, nunca los valores).
     · Los demás: calculan sin valores → cada fila lleva solo unidades y minutos (soles = null).

   CASCADA (por producto y turno, con el valor y los costos vigentes en la fecha de cada evento):
     Producción potencial         = tiempo planificado × velocidad estándar
     Pérdida por paradas no prog. = minutos ÷ 60 × velocidad estándar × valor unitario
     Pérdida por velocidad reducida = (velocidad estándar − ratio) × horas efectivas × valor unitario   (si es negativa, cero)
     Pérdida por mermas           = cantidad de cada componente × su costo unitario
     Pérdida total                = paradas + velocidad + mermas
     Incumplimiento del plan      = (programado − producido) × valor unitario  → aparte, NO se suma
   Si falta la velocidad, el valor o un costo, NO se calcula ni se asume cero: la fila queda con soles = null y marcada.

   FILAS (cada fila es un evento de pérdida): {id, tipo:'P'|'V'|'M', fecha, hora, turno, grupo, linea, marca, pres, maquina,
   causa, min, u, s, est, falta}. P = parada no programada, V = velocidad reducida, M = merma.
   MÁQUINA: el sistema no registra la máquina de una parada. Se deduce del texto del motivo/descripción solo cuando nombra una
   máquina conocida (Etiquetadora, Empaquetadora, Sopladora, Envasadora, Rinser); el resto queda «Sin clasificar».

   DATOS: los mismos que el Resumen general (49-resumen-indicadores.js): semáforo en vivo para hoy y registro del turno para los
   turnos anteriores. Cargar después de 49-resumen-indicadores.js.
   ========================================================= */
(function(){
  'use strict';

  const eco=()=>window.glacialEconomico;
  const A=()=>window.glacialReporteIndicadores;

  /* ---------- utilidades ---------- */
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const normKey=t=>norm(t).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  const permitido=()=>{
    try{
      if(typeof esMantCompartido==='function'&&state&&state.user&&esMantCompartido(state.user))return false;
      return !!(eco()&&eco().esGerencia());
    }catch(_){return false;}
  };

  /* =========================================================
     VALORES ECONÓMICOS Y VIGENCIA (solo existen en el navegador de Gerencia)
     ========================================================= */
  const DOCS={get margenes(){return eco().docs().margenes;},get costos(){return eco().docs().costos;},get general(){return eco().docs().general;},get lineas(){return eco().docs().lineas;}};
  function vigente(tabla,clave,fecha){
    const e=tabla&&tabla.valores&&tabla.valores[clave];
    if(!e||!e.v)return null;
    let mejor=null;
    Object.keys(e.v).sort().forEach(d=>{
      if(d<=fecha){const x=e.v[d];if(x&&x.valor!==null&&x.valor!==''&&Number.isFinite(Number(x.valor)))mejor={desde:d,valor:Number(x.valor)};}
    });
    return mejor;
  }
  const claveMargen=p=>eco().claveProducto(p.linea,p.marcaN,p.cat);   // línea + marca + presentación
  const claveCosto=(linea,comp)=>normKey(linea)+'--'+normKey(comp);
  const provDefecto=()=>({
    // 1) valor específico (línea + marca + presentación) vigente en la fecha del evento; 2) valor general de la misma línea vigente en esa
    // fecha; 3) ninguno → sin valor (pendiente). Un cero guardado es un valor válido. Nunca se usa otra línea ni una vigencia futura.
    margenDe:p=>vigente(DOCS.margenes,claveMargen(p),p.fecha)||vigente(DOCS.lineas,p.linea,p.fecha),
    costoDe:(linea,comp,fecha)=>vigente(DOCS.costos,claveCosto(linea,comp),fecha)
  });
  const provSinValores=()=>({margenDe:()=>null,costoDe:()=>null});

  /* =========================================================
     MÁQUINA (solo si el texto la nombra) · TURNO · HORA
     ========================================================= */
  const SIN_CLASIFICAR='Sin clasificar';
  const MAQUINAS=[
    {nombre:'Etiquetadora',patrones:[/\bETQ\b/i,/ETIQUETADORA/i,/ETIQUETADO/i]},
    {nombre:'Empaquetadora',patrones:[/\bEMP\b/i,/\bEMPAQ\b/i,/EMPAQUETADORA/i]},
    {nombre:'Sopladora',patrones:[/\bSOP\b/i,/SOPLADORA/i]},
    {nombre:'Envasadora',patrones:[/\bENV\b/i,/ENVASADORA/i]},
    {nombre:'Rinser',patrones:[/RINSER/i,/RINCER/i]}
  ];
  function inferirMaquina(texto){
    const t=norm(texto);
    for(const m of MAQUINAS)if(m.patrones.some(p=>p.test(t)))return m.nombre;
    return SIN_CLASIFICAR;
  }
  const horaDe=ms=>{if(!(ms>0))return '';const d=new Date(ms);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
  function turnoDe(ms,grupo){
    try{if(ms>0&&window.GlacialIndicadores){const t=window.GlacialIndicadores.turnoVigente(ms);if(t&&t.turno)return t.turno;}}catch(_){/* se usa el grupo */}
    return grupo==='NOCHE'?'NOCHE':'DÍA / INTERMEDIO';
  }

  /* =========================================================
     MOTOR DE PÉRDIDAS (puro: se prueba sin pantalla)
     ========================================================= */
  const NOMBRES_LINEA={PET1:'PET 1',PET2:'PET 2',B7L:'Bidones 7 L',C20L:'Cajas 20 L',B20L:'Bidones 20 L',B10L:'Bidones 10 L'};
  const lineaReal=p=>(p.linea==='B7L'&&/(^|[^0-9])(10000\s*ml|10\s*l)/i.test(norm(p.pres)))?'B10L':p.linea;
  const nombreImp=k=>NOMBRES_LINEA[k]||A().nombreLinea(k);
  const etiquetaParte=p=>nombreImp(lineaReal(p))+' · '+A().etiquetaProd(p.marca,p.pres);
  function calcularImpacto(partes,prov){
    const T={potencialU:0,paradasU:0,velU:0,paradasS:0,velS:0,mermaS:0,incumplS:0,planMin:0,npMin:0,horasEf:0};
    const faltan={velocidad:new Map(),margen:new Map(),costo:new Map()};
    const supuestos=new Map();
    const filas=[];
    let contador=0;
    const fila=(p,tipo,extra)=>filas.push(Object.assign({
      id:p.fecha+'|'+p.linea+'|'+tipo+'|'+(++contador),tipo,fecha:p.fecha,hora:'',turno:turnoDe(0,p.grupo),grupo:p.grupo,linea:p.linea,
      marca:p.marcaN,pres:p.cat,maquina:'',causa:'',min:0,u:0,s:null,est:false,falta:null
    },extra));

    partes.forEach(p=>{
      const etq=etiquetaParte(p);
      const actividad=p.producido>0||p.npMin>0||p.programado>0||p.planMin>0;
      /* mermas: cada componente × su costo unitario vigente (independiente de la velocidad y del valor del producto) */
      Object.keys(p.mermas||{}).forEach(c=>{
        const q=c==='Polietileno'?num(p.mermas[c].peso):num(p.mermas[c].unidades);
        if(!(q>0))return;
        const co=prov.costoDe(p.linea,c,p.fecha);
        let s=null;
        if(!co)faltan.costo.set(p.linea+'|'+c,{linea:p.linea,comp:c,etiqueta:A().nombreLinea(p.linea)+' · '+c});
        else{
          s=q*co.valor;T.mermaS+=s;
          supuestos.set('c|'+p.linea+'|'+c+'|'+co.desde,{tipo:'Costo de insumo',etiqueta:A().nombreLinea(p.linea)+' · '+c,valor:co.valor,unidad:'S/ por '+(c==='Polietileno'?'kg':'unid.'),desde:co.desde});
        }
        fila(p,'M',{causa:'Merma: '+c,u:c==='Polietileno'?0:q,s,falta:co?null:'costo',detalleMerma:c==='Polietileno'?q+' kg':''});
      });
      if(!actividad)return;
      const m=prov.margenDe(p);
      if(!m)faltan.margen.set(claveMargen(p),{linea:p.linea,marca:p.marcaN,pres:p.cat,etiqueta:A().nombreLinea(p.linea)+' · '+p.marcaN+' · '+p.cat});
      else supuestos.set('m|'+p.pkey+'|'+m.desde,{tipo:'Margen por unidad',etiqueta:A().etiquetaProd(p.marca,p.pres),valor:m.valor,unidad:'S/ por unidad',desde:m.desde});
      if(m&&p.progUnit&&p.programado>0)T.incumplS+=Math.max(p.programado-p.producido,0)*m.valor;
      if(!(p.vel>0)){
        if(p.planMin>0||p.availMin>0||p.producido>0)faltan.velocidad.set(p.linea+'|'+p.pkey,{etiqueta:etq});
        return;
      }
      supuestos.set('v|'+p.linea+'|'+p.pkey,{tipo:'Velocidad estándar',etiqueta:etq,valor:p.vel,unidad:'UND/h',desde:''});
      if(!(p.planMin>0||p.availMin>0))return;
      const hEf=p.availMin/60;
      const potencial=p.planMin/60*p.vel;
      const paradasU=p.npMin/60*p.vel;
      const velU=Math.max(p.vel*hEf-p.producido,0);                 // (velocidad estándar − ratio) × horas efectivas, nunca negativa
      T.potencialU+=potencial;T.paradasU+=paradasU;T.velU+=velU;T.planMin+=p.planMin;T.npMin+=p.npMin;T.horasEf+=hEf;
      if(m){T.paradasS+=paradasU*m.valor;T.velS+=velU*m.valor;}      // sin valor no se calcula la pérdida en soles
      if(velU>0)fila(p,'V',{causa:'Velocidad reducida',u:velU,s:m?velU*m.valor:null,falta:m?null:'valor'});
      let items=(p.paradas||[]).filter(i=>num(i.minutos)>0);
      const tot=items.reduce((s,i)=>s+num(i.minutos),0);
      if(p.npMin>0){
        items=tot>0?items.map(i=>({motivo:i.motivo,minutos:num(i.minutos)*p.npMin/tot,estimada:!!i.estimada,inicio:num(i.inicio)})):[{motivo:'Sin motivo',minutos:p.npMin,estimada:true,inicio:0}];
        items.forEach(i=>{
          const und=i.minutos/60*p.vel,motivo=String(i.motivo||'Sin motivo').trim()||'Sin motivo';
          fila(p,'P',{hora:horaDe(i.inicio),turno:turnoDe(i.inicio,p.grupo),maquina:inferirMaquina(motivo),causa:motivo,min:i.minutos,u:und,s:m?und*m.valor:null,est:!!i.estimada,falta:m?null:'valor'});
        });
      }
    });
    const total=T.paradasS+T.velS+T.mermaS;
    return {T,total,paradasS:T.paradasS,velS:T.velS,mermaS:T.mermaS,incumplS:T.incumplS,filas,
      faltan:{velocidad:[...faltan.velocidad.values()],margen:[...faltan.margen.values()],costo:[...faltan.costo.values()]},
      supuestos:[...supuestos.values()].sort((a,b)=>a.tipo.localeCompare(b.tipo,'es')||a.etiqueta.localeCompare(b.etiqueta,'es')),
      hayFaltantes:faltan.velocidad.size+faltan.margen.size+faltan.costo.size>0};
  }

  /* ---------- pantalla: la abre el dashboard (58-impacto-dashboard.js) ---------- */
  window.renderPerdidasSoles=function(main){
    if(!main)return;
    if(window.glacialImpactoDashboard)return window.glacialImpactoDashboard.render(main);
    main.innerHTML='<div class="empty-state"><h4>No se pudo cargar Impacto económico</h4><p>Comprueba que js/produccion/58-impacto-dashboard.js esté cargado.</p></div>';
  };

  window.glacialImpactoEconomico={nombreImp,lineaReal,calcularImpacto,vigente,provDefecto,provSinValores,claveMargen,claveCosto,normKey,permitido,
    inferirMaquina,MAQUINAS,SIN_CLASIFICAR,horaDe,turnoDe};
})();
