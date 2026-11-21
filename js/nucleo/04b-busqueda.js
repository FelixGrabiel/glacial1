/* GLACIAL · Búsqueda de texto común (21/11/2026)
   Una sola regla para todos los buscadores de la página, para que «preforma 13», «bolsa 3 kg», «Maria Perez» o «perez maria» encuentren lo que la persona espera:
   · sin importar mayúsculas, tildes ni signos (guiones, comas, puntos y comas);
   · TODAS las palabras escritas deben aparecer, en cualquier orden (no hace falta escribir el texto completo ni en el mismo orden);
   · cada palabra puede ser el inicio de una palabra del texto («prefo» → PREFORMA); si tiene 3 letras o más (4 si lleva números) también vale dentro de la palabra
     (así un DNI o un lote se encuentran por las últimas cifras); un número corto como «3» solo vale al inicio (3 kg no coincide con 13 kg);
   · el apóstrofo se ignora («Bell's» = «Bells»);
   · «3 kg» y «3kg», «250 ml» y «250ml», «13,5» y «13.5» son lo mismo.
   Funciona en la página y en las pruebas de Node. */
(function(raiz){
  'use strict';
  const UNIDADES='KG|KGS|G|GR|GRS|ML|L|LT|LTS|UND|MM|CM';
  const REG_UNIDAD=new RegExp('(\\d)\\s+('+UNIDADES+')\\b','g');
  /** Texto en palabras: sin tildes, en mayúsculas, con los signos como espacios. */
  function norm(t){
    return String(t==null?'':t).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase()
      .replace(/['’`´]/g,'').replace(/(\d),(\d)/g,'$1.$2').replace(/[^A-Z0-9.]+/g,' ').replace(/\.(?!\d)/g,' ').replace(/(^|\s)\.(\d)/g,'$1$2')
      .replace(REG_UNIDAD,'$1$2').replace(/\s+/g,' ').trim();
  }
  const palabras=q=>norm(q).split(' ').filter(Boolean);
  /** ¿El texto (o lista de textos) contiene todas las palabras de la consulta? Una consulta vacía coincide con todo. */
  function coincide(texto,consulta){
    const qs=palabras(consulta);if(!qs.length)return true;
    const H=' '+norm(Array.isArray(texto)?texto.join(' '):texto)+' ';
    return qs.every(t=>H.includes(' '+t)||((t.length>=4||(t.length>=3&&!/\d/.test(t)))&&H.includes(t)));
  }
  /** lista.filter con la regla de arriba; campos(x) devuelve el texto o la lista de textos de cada elemento. */
  const filtrar=(lista,consulta,campos)=>palabras(consulta).length?(lista||[]).filter(x=>coincide(campos(x),consulta)):(lista||[]);
  const API={norm,palabras,coincide,filtrar};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  if(raiz)raiz.glacialBusqueda=API;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:null));
