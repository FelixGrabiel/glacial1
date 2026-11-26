/* =============================================================
   GLACIAL · ESPACIOS DE NOMBRES LIGEROS · window.Glacial.<Area> (26/11/2026) · docs/00-general/contratos-js.md
   Base de la migración gradual de las funciones globales: cada área pública pasa a colgar de `window.Glacial.<Area>` y el nombre
   global de siempre se conserva como ALIAS que apunta a la MISMA función (no se rompe ninguna llamada existente).
   NO es un módulo ES ni un empaquetador: es un objeto global más. Se carga antes de 01-config.js y no depende de nada.

   Uso (al final de un archivo, ya definidas sus funciones):
     if(window.Glacial)Glacial.exponer('Fecha', window.GlacialFecha);                       // área = objeto ya existente
     if(window.Glacial)Glacial.exponer('Tareo', {puedeEditar:tareoPuedeEditar}, {alias:true});  // alias global con el mismo nombre
     if(window.Glacial)Glacial.exponer('Tareo', {puedeEditar:tareoPuedeEditar}, {alias:{tareoPuedeEditar:'puedeEditar'}}); // alias con otro nombre

   Reglas:
   · El alias global solo se crea si el nombre está LIBRE. Si ya existe otro valor distinto se anota en Glacial.conflictos()
     (no se pisa nada). Si ya es la misma función, no hay nada que hacer.
   · Un archivo que redefine una función a propósito sigue usando la lista blanca scripts/sobrescrituras-permitidas.json.
   · Convención de nombres: Glacial.<Area> en PascalCase, una por área funcional (Fecha, Tareo, Hielo, Asistente…).
   ============================================================= */
(function(root){
  'use strict';
  const G=root.Glacial=root.Glacial||{};
  if(G.version)return;                         // ya cargado (por ejemplo, páginas de prueba que lo incluyen dos veces)
  G.version=1;
  const conflictos=[];

  function definirArea(nombre){
    if(!/^[A-Z][A-Za-z0-9]*$/.test(String(nombre)))throw new Error('Glacial.definirArea: el área debe ir en PascalCase («'+nombre+'»)');
    if(!G[nombre]||typeof G[nombre]!=='object'&&typeof G[nombre]!=='function')G[nombre]={};
    return G[nombre];
  }

  /* exponer(area, miembros, {alias}) → objeto del área. `miembros` puede ser un objeto con funciones/valores. */
  function exponer(area,miembros,opciones){
    const o=opciones||{};
    let destino;
    if(!G[area]){
      destino=G[area]=(miembros&&typeof miembros==='object'&&!Array.isArray(miembros)&&o.copiar!==true)?miembros:definirArea(area);
    }else destino=G[area];
    if(destino!==miembros)Object.keys(miembros||{}).forEach(k=>{destino[k]=miembros[k];});
    let alias=o.alias;
    if(alias===true)alias=Object.keys(miembros||{});
    if(Array.isArray(alias)){const m={};alias.forEach(n=>{m[n]=n;});alias=m;}
    if(alias&&typeof alias==='object')Object.keys(alias).forEach(nombreGlobal=>{
      const miembro=destino[alias[nombreGlobal]];
      if(miembro===undefined){conflictos.push({area,nombre:nombreGlobal,motivo:'el miembro «'+alias[nombreGlobal]+'» no existe en el área'});return;}
      if(!(nombreGlobal in root)){root[nombreGlobal]=miembro;return;}
      if(root[nombreGlobal]!==miembro)conflictos.push({area,nombre:nombreGlobal,motivo:'ya existe un global distinto con ese nombre; no se pisó'});
    });
    return destino;
  }

  G.definirArea=definirArea;
  G.exponer=exponer;
  G.areas=()=>Object.keys(G).filter(k=>/^[A-Z]/.test(k));
  G.conflictos=()=>conflictos.slice();
})(typeof window!=='undefined'?window:globalThis);
