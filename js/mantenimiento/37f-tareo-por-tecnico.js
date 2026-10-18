/* =============================================================
   GLACIAL · MANTENIMIENTO — TAREO POR TÉCNICO EN LA CUENTA COMPARTIDA
   -------------------------------------------------------------
   Con la cuenta compartida (rol mantenimiento_compartido), cada técnico identificado con su PIN (37b) ve SOLO su
   propia información en Tareo General, Historial y Resumen mensual (contadores, HORAS EXTRAS, gráficos y «Ver detalle»),
   y las exportaciones (Excel / imagen) salen con esos mismos datos.

   DÓNDE QUEDA EL FILTRO (un solo punto): obtenerTareos() (13-tareo.js). Todas las pantallas, resúmenes, horas extras
   (46) y exportaciones (27, 38 y las de 13-tareo.js) leen los tareos con esa función (y el Resumen mensual, además, la lista
   sembrada de trabajadores: obtenerResumenMensualTareo se filtra igual); aquí se envuelve y, solo para la
   cuenta compartida, devuelve copias de cada tareo con únicamente las filas (personal y personal por día) del técnico
   identificado. Los tareos donde él no figura se omiten. Sin técnico identificado devuelve [] y las tres pestañas
   muestran el aviso «Identifícate con tu PIN para ver tu tareo».
   Coincidencia de persona: ID de trabajador o DNI (como turnoRotacion en 37b); el nombre solo cuando la fila no trae ni
   ID ni DNI (misma regla de tareoIdentidades).

   CAMBIO DE TÉCNICO EN VIVO: se escucha 'mant:tecnico' (37b) y se vuelve a dibujar la pestaña activa; nunca queda en pantalla
   el tareo del técnico anterior.

   SOLO LECTURA: las copias filtradas llevan una marca interna y NO se pueden guardar (guardarTareos, guardarTareoEnMemoria,
   tareoGuardarEnNube las rechazan): evita que un guardado con una copia parcial pise las filas de otros técnicos.

   SEGURIDAD — LÍMITE CONOCIDO: es UNA sola cuenta de Firebase para todos los técnicos, así que las reglas de Firestore no
   pueden separar los datos por técnico. El filtro es de la APLICACIÓN, no del servidor: quien use la cuenta compartida con
   herramientas del navegador puede leer los documentos completos. No se cambian las reglas de Firestore.

   NO CAMBIA: Equipos por línea, Motivos de parada y Producción actual. Cualquier otro usuario (Administrador, Supervisor de
   Mantenimiento, RRHH, Jefatura…) ve exactamente lo mismo que antes.

   Cargar DESPUÉS de 13-tareo.js, 46-tareo-horas-extras.js, 37b y 38-tareo-rrhh-exportacion.js; ANTES de 12-init.js.
   ============================================================= */
(function instalarTareoPorTecnico(){
  'use strict';

  const compartida=()=>typeof window.esMantCompartido==='function'&&window.esMantCompartido();
  const tecnicoActivo=()=>typeof window.mantTecnicoActivo==='function'?window.mantTecnicoActivo():null;
  const norm=t=>typeof tareoNormalizarTexto==='function'
    ? tareoNormalizarTexto(t)
    : String(t==null?'':t).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

  /* Identidades del técnico: ID, DNI (de la ficha del trabajador) y nombre. */
  function identidadesTecnico(t){
    const claves=new Set();
    const id=String(t&&t.workerId!=null?t.workerId:'').trim();
    if(id)claves.add('ID:'+id);
    let ficha=null;
    try{ficha=(typeof loadWorkers==='function'?(loadWorkers()||[]):[]).find(w=>w&&String(w.id)===id)||null;}catch(_){ficha=null;}
    const dni=String((ficha&&ficha.dni)||'').replace(/\D/g,'');
    if(dni)claves.add('DNI:'+dni);
    const nombre=norm((ficha&&ficha.nombre)||(t&&t.nombre)||'').replace(/\s+/g,' ');
    if(nombre)claves.add('NOM:'+nombre);
    return claves;
  }
  const esDelTecnico=(persona,claves)=>
    typeof tareoIdentidades==='function'&&tareoIdentidades(persona).some(c=>claves.has(c));

  /* Copia del tareo con solo las filas del técnico (las filas son las mismas referencias; el tareo es una copia superficial). */
  function filtrarTareo(tareo,claves){
    const personal=(Array.isArray(tareo.personal)?tareo.personal:[]).filter(p=>esDelTecnico(p,claves));
    const porDia=(Array.isArray(tareo.personalPorDia)?tareo.personalPorDia:[]).filter(p=>esDelTecnico(p,claves));
    if(!personal.length&&!porDia.length)return null;
    const copia=Object.assign({},tareo,{personal});
    if(Array.isArray(tareo.personalPorDia))copia.personalPorDia=porDia;
    Object.defineProperty(copia,'__soloTecnico',{value:true,enumerable:false});
    return copia;
  }

  /* ---------- filtro único ---------- */
  if(typeof obtenerTareos==='function'){
    const original=obtenerTareos;
    obtenerTareos=function(){
      const lista=original.apply(this,arguments);
      if(!compartida())return lista;
      const t=tecnicoActivo();
      if(!t)return [];
      const claves=identidadesTecnico(t);
      return (Array.isArray(lista)?lista:[]).map(x=>filtrarTareo(x,claves)).filter(Boolean);
    };
    window.obtenerTareos=obtenerTareos;
  }

  /* El Resumen mensual siembra una fila por cada trabajador de Mantenimiento aunque no tenga tareos: con la cuenta compartida
     solo queda la fila del técnico identificado (la misma regla de identidad que el resto). */
  if(typeof obtenerResumenMensualTareo==='function'){
    const original=obtenerResumenMensualTareo;
    obtenerResumenMensualTareo=function(){
      const filas=original.apply(this,arguments);
      if(!compartida())return filas;
      const t=tecnicoActivo();
      if(!t)return [];
      const claves=identidadesTecnico(t);
      return (Array.isArray(filas)?filas:[]).filter(f=>esDelTecnico(f,claves));
    };
    window.obtenerResumenMensualTareo=obtenerResumenMensualTareo;
  }

  /* ---------- solo lectura de las copias filtradas ---------- */
  const marcado=x=>!!x&&x.__soloTecnico===true;
  ['guardarTareoEnMemoria','tareoGuardarEnNube'].forEach(nombre=>{
    const fn=globalThis[nombre];
    if(typeof fn!=='function')return;
    const envuelta=function(tareo){
      if(marcado(tareo)){
        if(typeof tareoAvisoSinPermisoEscritura==='function')tareoAvisoSinPermisoEscritura('tareo filtrado por técnico (solo lectura)');
        return undefined;
      }
      return fn.apply(this,arguments);
    };
    globalThis[nombre]=envuelta;
    window[nombre]=envuelta;
  });
  if(typeof guardarTareos==='function'){
    const original=guardarTareos;
    guardarTareos=function(tareos){
      if(compartida()&&Array.isArray(tareos)&&tareos.some(marcado)){
        if(typeof tareoAvisoSinPermisoEscritura==='function')tareoAvisoSinPermisoEscritura('tareos filtrados por técnico (solo lectura)');
        return undefined;
      }
      return original.apply(this,arguments);
    };
    window.guardarTareos=guardarTareos;
  }

  /* ---------- aviso sin técnico identificado ---------- */
  const PESTANAS=[
    {clave:'general',fn:'renderTareoGeneral'},
    {clave:'historial',fn:'renderHistorialTareo'},
    {clave:'resumen',fn:'renderResumenMensualTareoUI'}
  ];
  function pintarAviso(clave){
    const main=document.getElementById('main');
    if(!main)return;
    const esc=typeof escaparHtml==='function'?escaparHtml:(typeof escaparHTML==='function'?escaparHTML:s=>String(s));
    const titulo={general:'Tareo de Mantenimiento',historial:'Historial de Tareo',resumen:'Resumen mensual'}[clave]||'Tareo';
    main.innerHTML=
      '<div class="main-head"><div><h2>'+esc(titulo)+'</h2></div></div>'+
      (typeof tareoRenderTabs==='function'?tareoRenderTabs(clave):'')+
      '<div class="panel" id="mant-tareo-aviso" data-pestana="'+esc(clave)+'"><div class="panel-body">'+
      '<div class="empty-state"><h4>Identifícate con tu PIN para ver tu tareo</h4>'+
      '<p>En la cuenta compartida cada técnico ve solo su propia información.</p>'+
      '<button type="button" class="btn btn-primary" onclick="mantAbrirIdentificacion()">Identificarme</button></div>'+
      '</div></div>';
  }
  PESTANAS.forEach(({clave,fn})=>{
    const original=globalThis[fn];
    if(typeof original!=='function')return;
    const envuelta=function(){
      if(compartida()&&!tecnicoActivo()){pintarAviso(clave);return undefined;}
      return original.apply(this,arguments);
    };
    globalThis[fn]=envuelta;
    window[fn]=envuelta;
  });

  /* El espejo «Maquinistas · información de Producción» (28) muestra personal de otros: la cuenta compartida no lo ve. */
  ['renderTareoLectura','renderTareoFormulario'].forEach(nombre=>{
    const original=globalThis[nombre];
    if(typeof original!=='function')return;
    const envuelta=function(){
      const r=original.apply(this,arguments);
      if(compartida()){const e=document.getElementById('tareo-maquinistas-espejo');if(e)e.remove();}
      return r;
    };
    globalThis[nombre]=envuelta;
    window[nombre]=envuelta;
  });

  /* ---------- cambio de técnico en vivo ---------- */
  function redibujar(){
    if(!compartida()||typeof state==='undefined'||state.currentTab!=='mantenimiento')return;
    const main=document.getElementById('main');
    if(!main)return;
    const aviso=main.querySelector('#mant-tareo-aviso');
    let clave=aviso?aviso.getAttribute('data-pestana'):'';
    if(!clave){
      const activa=main.querySelector('.tareo-tab.active');
      if(activa){
        const onclick=activa.getAttribute('onclick')||'';
        const p=PESTANAS.find(x=>onclick.indexOf(x.fn)>=0);
        if(!p)return;                       // otra pestaña (catálogos, etc.): no se toca
        clave=p.clave;
      }else if(main.querySelector('.tareo-table')){
        clave='general';                    // detalle de un tareo del técnico anterior: se vuelve a la lista
      }else return;
    }
    const p=PESTANAS.find(x=>x.clave===clave);
    if(p&&typeof globalThis[p.fn]==='function')globalThis[p.fn]();
  }
  document.addEventListener('mant:tecnico',redibujar);

  window.__tareoPorTecnico={filtrarTareo,identidadesTecnico,esDelTecnico};
})();
