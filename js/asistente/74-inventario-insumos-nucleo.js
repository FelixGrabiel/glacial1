/* =============================================================
   GLACIAL · INVENTARIO DE INSUMOS — NÚCLEO (puro: sin Firestore ni pantalla; se prueba con node)
   -------------------------------------------------------------
   Documento de diseño: docs/INVENTARIO-INSUMOS.md.
   · Lee el Excel que la asistente exporta de SAP Business One (consulta «Consulta2»):
       - PLANO: una fila por almacén × artículo (WhsName, ItemCode, ItemName, ItmsGrpCod, OnHand…);
       - TABLA DINÁMICA: artículos en filas (agrupados por ItmsGrpCod) y almacenes en columnas. Esa tabla NO trae ItemCode: el
         artículo se identifica por grupo + nombre (id «N:…»). Si después llega el export plano, el artículo adopta su ItemCode.
   · Solo interesan los almacenes de planta «AP - …» (6) y los grupos 105, 106, 107 y 109. Se excluyen «NO USAR» y «ETIQUETA ERROR».
   · Categoría, marca y presentación se detectan del nombre. Stock mínimo, punto de reorden, unidad, prioritario y activo se
     definen en GLACIAL y NO se sobrescriben al reimportar (el reimport solo actualiza nombre y grupo).
   ============================================================= */
(function instalarInventarioInsumosNucleo(global){
  'use strict';

  /* ---------- constantes ---------- */
  const GRUPOS_VALIDOS=[105,106,107,109];
  const GRUPOS_NOMBRE={105:'Envases y empaques',106:'Embalaje',107:'Materia prima y químicos',109:'Parihuelas'};
  /* Orden de columnas: Insumos y Suministros primero. */
  const ALMACENES=[
    {clave:'INSUMOS',nombre:'AP - INSUMOS Y SUMINISTROS',corto:'Insumos y Suministros'},
    {clave:'PRODUCCION',nombre:'AP - PRODUCCIÓN',corto:'Producción'},
    {clave:'INMOVILIZADOS',nombre:'AP - ALMANCE DE PRODUCTOS INMOVILIZADOS',corto:'Inmovilizados'},
    {clave:'CUARENTENA',nombre:'AP - CUARENTENA',corto:'Cuarentena'},
    {clave:'DEVOLUCIONES',nombre:'AP - DEVOLUCIONES',corto:'Devoluciones'},
    {clave:'PRODUCTO_TERMINADO',nombre:'AP - PRODUCTO TERMINADO',corto:'Producto terminado'}
  ];
  const CATEGORIAS=['PREFORMA','TAPA','ETIQUETA','BOBINA','BOLSA','BOLSON','ASA','CAJA','LAMINA TERMOENCOGIBLE','STRETCH FILM','BIDON/BOTELLON','CARTON',
    'PRECINTO','STICKER','VASO','QUIMICO/MATERIA PRIMA','PARIHUELA','OTROS'];
  const PRIORITARIAS=['PREFORMA','BOBINA','STRETCH FILM','ASA','TAPA','ETIQUETA','BOLSA','CAJA','LAMINA TERMOENCOGIBLE'];
  const MARCAS=['GLACIAL','BELLS','CUISINE & CO','SCALA','TOTTUS','ARO','LISTO','MERKAT','PRECIO UNO','SAN JORGE','FONT LIFE','YAQUA','LAIVE',
    'SAN FERNANDO','OXXO','WONG','METRO','AUSTRAL'];

  /* ---------- utilidades ---------- */
  const num=v=>{
    if(typeof v==='number')return Number.isFinite(v)?v:0;
    const n=Number(String(v==null?'':v).replace(/,/g,''));return Number.isFinite(n)?n:0;
  };
  /* Mayúsculas sin tildes, espacios simples: solo para COMPARAR. */
  const norm=v=>String(v==null?'':v).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  /* Redondeo sin residuos de coma flotante (SAP trae valores como 0.090909). */
  function red(v,dec){
    const n=num(v),f=Math.pow(10,dec===undefined?2:dec);
    const r=Math.round((n+(n>=0?1:-1)*Number.EPSILON)*f)/f;
    return Object.is(r,-0)?0:r;
  }
  /* Miles con coma y hasta 2 decimales: 1,234.5 */
  function fmt(v,dec){
    if(v===null||v===undefined||v==='')return '—';
    const n=num(v);
    return n.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:dec===undefined?2:dec});
  }
  const esExcluido=nombre=>{const n=norm(nombre);return n.includes('NO USAR')||n.includes('ETIQUETA ERROR');};

  /* ---------- clasificación por nombre ---------- */
  function categoriaDe(nombre,grupo){
    const n=norm(nombre);
    const r=c=>({categoria:c,subtipo:''});
    if(Number(grupo)===109||/PARIHUELA|PALLET|\bPALET\b/.test(n))return r('PARIHUELA');
    if(/PREFORMA/.test(n))return r('PREFORMA');
    if(/LAMINA/.test(n)&&/TERMOENCOG/.test(n))return r('LAMINA TERMOENCOGIBLE');
    if(/TERMOENCOGIBLE|TERMOCONTRAIBLE/.test(n))return r('LAMINA TERMOENCOGIBLE');
    if(/STRE?T?CH\s*FILM|STRETCH|STRECH/.test(n))return r('STRETCH FILM');
    if(/BOBINA/.test(n))return r('BOBINA');
    if(/BOLSON/.test(n))return r('BOLSON');
    if(/\bBOLSA/.test(n))return r('BOLSA');
    if(/ETIQUETA/.test(n))return {categoria:'ETIQUETA',subtipo:/ROLL ?FEED/.test(n)?'ROLL FEED':''};
    if(/STICKER/.test(n))return r('STICKER');
    if(/BIDON|BOTELLON|GARRAFA/.test(n))return r('BIDON/BOTELLON');
    if(/\bASA\b|\bASAS\b/.test(n))return r('ASA');
    if(/\bTAPA/.test(n))return r('TAPA');
    if(/\bCAJAS?\b/.test(n))return r('CAJA');
    if(/CARTON|CARTULINA/.test(n))return r('CARTON');
    if(/PRECINTO|AMARRE/.test(n))return r('PRECINTO');
    if(/\bVASOS?\b/.test(n))return r('VASO');
    if(Number(grupo)===107||/\bCO2\b|CONCENTRADO|TINTA|SOLVENTE|SILICONA|PEGAMENTO|QUIMIC|HIPOCLORITO|SODA CAUSTICA|ACIDO|LUBRICANTE/.test(n))return r('QUIMICO/MATERIA PRIMA');
    return r('OTROS');
  }
  function marcaDe(nombre){
    const n=norm(nombre);
    const alias={'CUISINE & CO':/CUISINE/,'FONT LIFE':/FONT ?LIFE|FONTILFE/,'SAN JORGE':/SAN JORGE/,'SAN FERNANDO':/SAN FERNANDO|SAN FER\b/,'PRECIO UNO':/PRECIO UNO/};
    for(const m of MARCAS){
      const re=alias[m]||new RegExp('(^|[^A-Z0-9])'+m.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'($|[^A-Z0-9])');
      if(re.test(n))return m;
    }
    return '';
  }
  function presentacionDe(nombre){
    const n=norm(nombre).replace(/(\d),(\d)/g,'$1.$2');
    const unidades=[[/(\d+(?:\.\d+)?)\s*(?:ML|MLS)\b/,'ML'],[/(\d+(?:\.\d+)?)\s*(?:KG|KGS|KILOS?)\b/,'KG'],[/(\d+(?:\.\d+)?)\s*(?:LT|LTS|LITROS?)\b/,'LT'],
      [/(\d+(?:\.\d+)?)\s*(?:L)\b/,'LT'],[/(\d+(?:\.\d+)?)\s*(?:GR|GRS|G)\b/,'GR'],[/(\d+(?:\.\d+)?)\s*(?:MM)\b/,'MM']];
    let mejor=null;
    unidades.forEach(([re,u])=>{const m=re.exec(n);if(m&&(!mejor||m.index<mejor.i))mejor={i:m.index,txt:String(Number(m[1]))+' '+u};});
    return mejor?mejor.txt:'';
  }
  const esPrioritaria=categoria=>PRIORITARIAS.includes(categoria);

  /* ---------- almacenes ---------- */
  function almacenDe(whsName){
    const n=norm(whsName);
    if(!/^AP\s*-/.test(n))return null;
    if(/INMO/.test(n))return 'INMOVILIZADOS';
    if(/CUARENTENA/.test(n))return 'CUARENTENA';
    if(/DEVOLUC/.test(n))return 'DEVOLUCIONES';
    if(/PRODUCTO TERMINADO/.test(n))return 'PRODUCTO_TERMINADO';
    if(/INSUMOS/.test(n))return 'INSUMOS';
    if(/PRODUCCION/.test(n))return 'PRODUCCION';
    return null;
  }
  const almacenInfo=clave=>ALMACENES.find(a=>a.clave===clave)||{clave,nombre:clave,corto:clave};

  /* ---------- identificación del artículo ---------- */
  const idPorNombre=(grupo,nombre)=>'N:'+Number(grupo)+':'+norm(nombre);
  const esIdNombre=id=>/^N:/.test(String(id||''));

  /* ---------- lectura del Excel ---------- */
  /* Reduce una hoja PLANA a lo que interesa (se ejecuta dentro del Web Worker; no puede usar nada de afuera, por eso es autónoma). */
  function prefiltrarFilas(filas){
    const quitar=s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
    let ih=-1;
    for(let i=0;i<Math.min(filas.length,30);i++){
      const f=(filas[i]||[]).map(quitar);
      if(f.includes('WHSNAME')&&f.includes('ITEMCODE')&&f.includes('ONHAND')){ih=i;break;}
    }
    if(ih<0)return filas;                                       // no es plana (tabla dinámica u otra hoja): es pequeña, pasa completa
    const cab=filas[ih].map(quitar),iw=cab.indexOf('WHSNAME'),ig=cab.indexOf('ITMSGRPCOD');
    const salida=filas.slice(0,ih+1);
    for(let i=ih+1;i<filas.length;i++){
      const f=filas[i];if(!f)continue;
      if(!/^AP\s*-/.test(quitar(f[iw])))continue;
      const g=Number(f[ig]);
      if(ig>=0&&![105,106,107,109].includes(g))continue;
      salida.push(f);
    }
    return salida;
  }

  function buscarCabeceraPlana(filas){
    for(let i=0;i<Math.min(filas.length,30);i++){
      const c=(filas[i]||[]).map(norm);
      if(c.includes('WHSNAME')&&c.includes('ITEMCODE')&&c.includes('ONHAND')){
        const idx=n=>c.indexOf(n);
        return {fila:i,whs:idx('WHSNAME'),codigo:idx('ITEMCODE'),nombre:idx('ITEMNAME'),grupo:idx('ITMSGRPCOD'),onHand:idx('ONHAND'),precio:idx('AVGPRICE')};
      }
    }
    return null;
  }
  function vacio(){
    return {articulos:[],resumen:{filas:0,leidas:0,articulos:0,excluidosNombre:0,fueraDeGrupo:0,fueraDeAlmacen:0},almacenes:[]};
  }
  const nuevoArticulo=(id,codigo,nombre,grupo)=>({id,itemCode:codigo||'',nombre:String(nombre||'').trim(),grupo:Number(grupo),stock:{},precio:0});

  function leerPlana(filas,cab){
    const r=vacio(),mapa=new Map(),almacenes=new Set();
    for(let i=cab.fila+1;i<filas.length;i++){
      const f=filas[i];if(!f||!f.length)continue;
      r.resumen.filas++;
      const codigo=String(f[cab.codigo]==null?'':f[cab.codigo]).trim(),nombre=String(f[cab.nombre]==null?'':f[cab.nombre]).trim();
      if(!codigo&&!nombre)continue;
      const w=almacenDe(f[cab.whs]);
      if(!w){r.resumen.fueraDeAlmacen++;continue;}
      const g=cab.grupo>=0?Number(f[cab.grupo]):NaN;
      if(!GRUPOS_VALIDOS.includes(g)){r.resumen.fueraDeGrupo++;continue;}
      if(esExcluido(nombre)){r.resumen.excluidosNombre++;continue;}
      r.resumen.leidas++;almacenes.add(w);
      const id=codigo||idPorNombre(g,nombre);
      let a=mapa.get(id);
      if(!a){a=nuevoArticulo(id,codigo,nombre,g);mapa.set(id,a);}
      a.stock[w]=(a.stock[w]||0)+num(f[cab.onHand]);
      if(cab.precio>=0&&num(f[cab.precio])>0)a.precio=num(f[cab.precio]);
    }
    r.articulos=[...mapa.values()];r.resumen.articulos=r.articulos.length;r.almacenes=ALMACENES.map(a=>a.clave).filter(c=>almacenes.has(c));
    return r;
  }

  function leerPivot(filas){
    const r=vacio();
    let ih=-1;
    for(let i=0;i<Math.min(filas.length,40);i++){
      const f=filas[i]||[];
      if(norm(f[0])==='ETIQUETAS DE FILA'&&f.slice(1).some(c=>almacenDe(c))){ih=i;break;}
    }
    if(ih<0)return null;
    const cols=[];
    (filas[ih]||[]).forEach((c,j)=>{if(j>0){const w=almacenDe(c);if(w&&!cols.some(x=>x.w===w))cols.push({j,w});}});
    const mapa=new Map(),almacenes=new Set();let grupo=null;
    for(let i=ih+1;i<filas.length;i++){
      const f=filas[i];if(!f||f[0]===undefined||f[0]===null||String(f[0]).trim()==='')continue;
      const etiqueta=String(f[0]).trim();
      if(norm(etiqueta)==='TOTAL GENERAL')break;
      if(/^\d{2,4}$/.test(etiqueta)){grupo=Number(etiqueta);continue;}      // fila de grupo (ItmsGrpCod): trae el subtotal, no es un artículo
      r.resumen.filas++;
      if(grupo===null||!GRUPOS_VALIDOS.includes(grupo)){r.resumen.fueraDeGrupo++;continue;}
      if(esExcluido(etiqueta)){r.resumen.excluidosNombre++;continue;}
      r.resumen.leidas++;
      const id=idPorNombre(grupo,etiqueta);
      let a=mapa.get(id);
      if(!a){a=nuevoArticulo(id,'',etiqueta,grupo);mapa.set(id,a);}
      cols.forEach(({j,w})=>{a.stock[w]=(a.stock[w]||0)+num(f[j]);almacenes.add(w);});
    }
    r.articulos=[...mapa.values()];r.resumen.articulos=r.articulos.length;r.almacenes=ALMACENES.map(a=>a.clave).filter(c=>almacenes.has(c));
    return r;
  }

  /* hojas: [{nombre, filas:[[celdas…]]}]. Devuelve la mejor hoja (la que más artículos válidos da) o {error}. */
  function leerLibro(hojas){
    let mejor=null;
    (hojas||[]).forEach(h=>{
      const filas=h.filas||[];
      const cab=buscarCabeceraPlana(filas);
      let r=null,formato='';
      if(cab){r=leerPlana(filas,cab);formato='plano';}
      else{r=leerPivot(filas);formato=r?'pivot':'';}
      if(r&&r.articulos.length&&(!mejor||r.articulos.length>mejor.r.articulos.length))mejor={r,formato,hoja:h.nombre};
    });
    if(!mejor){
      return {error:'No se encontró la hoja con el stock. Sube el export PLANO de SAP (una fila por almacén y artículo, con las columnas WhsName, ItemCode, ItemName, '+
        'ItmsGrpCod y OnHand) o una tabla dinámica con los artículos en filas (agrupados por ItmsGrpCod) y los almacenes «AP - …» en columnas.'};
    }
    const avisos=[];
    if(mejor.formato==='pivot')avisos.push('Es una tabla dinámica: no trae el código SAP (ItemCode). Los artículos se identifican por grupo y nombre; cuando subas el export plano se les asignará su ItemCode.');
    const sinAlmacen=ALMACENES.filter(a=>!mejor.r.almacenes.includes(a.clave)).map(a=>a.nombre);
    if(sinAlmacen.length)avisos.push('No aparecen estos almacenes: '+sinAlmacen.join(', ')+'. Su stock quedará en 0.');
    return {formato:mejor.formato,hoja:mejor.hoja,articulos:mejor.r.articulos,almacenes:mejor.r.almacenes,resumen:mejor.r.resumen,avisos};
  }

  /* ---------- catálogo ---------- */
  function registroCatalogo(a){
    const c=categoriaDe(a.nombre,a.grupo);
    return {id:a.id,itemCode:a.itemCode||'',nombre:a.nombre,grupo:Number(a.grupo),categoria:c.categoria,subtipo:c.subtipo,marca:marcaDe(a.nombre),
      presentacion:presentacionDe(a.nombre),unidad:'UND',stockMinimo:0,puntoReorden:0,activo:true,prioritario:esPrioritaria(c.categoria),
      precio:a.precio>0?red(a.precio,4):0};
  }
  /* Artículos nuevos se agregan; los existentes solo actualizan nombre y grupo (lo demás lo define GLACIAL y no se pisa). Sin duplicar:
     un artículo de tabla dinámica (id «N:…») adopta su ItemCode cuando llega del export plano. */
  function combinarCatalogo(actual,articulos){
    const lista=(actual||[]).map(x=>({...x}));
    const porId=new Map(lista.map(x=>[x.id,x]));
    const porNombre=new Map();
    lista.forEach(x=>{if(esIdNombre(x.id))porNombre.set(idPorNombre(x.grupo,x.nombre),x);});
    /* Todos los artículos por grupo + nombre: una tabla dinámica (sin ItemCode) que llega DESPUÉS del export plano se une al artículo con código. */
    const conCodigo=new Map();
    lista.forEach(x=>{if(!esIdNombre(x.id)){const k=idPorNombre(x.grupo,x.nombre);if(!conCodigo.has(k))conCodigo.set(k,x);}});
    const resueltos=new Map();                                  // id del artículo leído → id que tiene en el catálogo
    let nuevos=0,actualizados=0,adoptados=0,sinCambio=0;
    articulos.forEach(a=>{
      let x=porId.get(a.id);
      if(!x&&!a.itemCode)x=conCodigo.get(idPorNombre(a.grupo,a.nombre));
      if(!x&&a.itemCode){
        const viejo=porNombre.get(idPorNombre(a.grupo,a.nombre));
        if(viejo){porNombre.delete(idPorNombre(a.grupo,a.nombre));porId.delete(viejo.id);
          viejo.alias=[...(viejo.alias||[]),viejo.id];           // los cortes anteriores siguen apuntando al id viejo
          viejo.id=a.id;viejo.itemCode=a.itemCode;porId.set(a.id,viejo);x=viejo;adoptados++;}
      }
      if(!x){
        const n=registroCatalogo(a);lista.push(n);porId.set(n.id,n);resueltos.set(a.id,n.id);nuevos++;return;
      }
      resueltos.set(a.id,x.id);
      let cambio=false;
      if(a.nombre&&x.nombre!==a.nombre){x.nombre=a.nombre;cambio=true;}
      if(Number(x.grupo)!==Number(a.grupo)){x.grupo=Number(a.grupo);cambio=true;}
      if(a.itemCode&&x.itemCode!==a.itemCode){x.itemCode=a.itemCode;cambio=true;}
      if(a.precio>0&&red(a.precio,4)!==x.precio){x.precio=red(a.precio,4);cambio=true;}
      if(cambio)actualizados++;else sinCambio++;
    });
    return {lista,nuevos,actualizados,adoptados,sinCambio,resueltos};
  }
  const CAMPOS_EDITABLES=['unidad','stockMinimo','puntoReorden','prioritario','activo'];
  function validarEdicion(c){
    const e=[];
    if('unidad' in c&&!String(c.unidad||'').trim())e.push('Indica la unidad.');
    if('unidad' in c&&String(c.unidad||'').length>20)e.push('La unidad admite hasta 20 caracteres.');
    ['stockMinimo','puntoReorden'].forEach(k=>{if(k in c&&!(Number.isFinite(Number(c[k]))&&Number(c[k])>=0))e.push('El '+(k==='stockMinimo'?'stock mínimo':'punto de reorden')+' debe ser un número mayor o igual a 0.');});
    if('stockMinimo' in c&&'puntoReorden' in c&&Number(c.puntoReorden)>0&&Number(c.stockMinimo)>Number(c.puntoReorden))e.push('El punto de reorden no puede ser menor que el stock mínimo.');
    return e;
  }

  /* ---------- cortes de stock ---------- */
  /* Fila compacta: w en el orden de ALMACENES, t = total de los 6. */
  function filaCorte(a){
    const w=ALMACENES.map(x=>red(a.stock[x.clave]||0,4));
    return {id:a.id,w,t:red(w.reduce((s,v)=>s+v,0),4)};
  }
  const claveCorte=(fecha,instante)=>'C'+String(fecha).replace(/-/g,'')+'_'+Number(instante).toString(36);

  /* ---------- stock actual ---------- */
  function semaforo(total,minimo,reorden){
    const t=num(total),m=num(minimo),r=num(reorden);
    if(!(m>0)&&!(r>0))return 'gris';
    if(m>0&&t<m)return 'rojo';
    if(r>0&&t<r)return 'naranja';
    return 'verde';
  }
  const SEMAFORO_TXT={rojo:'Bajo mínimo',naranja:'Bajo punto de reorden',verde:'OK',gris:'Sin mínimo definido'};

  /* Une catálogo + corte. almacen: clave de almacén o '' (total). Devuelve filas listas para la tabla. */
  function filasStock(catalogo,corte,almacen){
    const porId=new Map(((corte&&corte.items)||[]).map(i=>[i.id,i]));
    return (catalogo||[]).map(c=>{
      let i=porId.get(c.id);
      if(!i&&c.alias&&c.alias.length){for(const al of c.alias){i=porId.get(al);if(i)break;}}
      const w=ALMACENES.map((_,k)=>i?num(i.w[k]):0);
      const total=i?num(i.t):0;
      const base=almacen?w[ALMACENES.findIndex(a=>a.clave===almacen)]:total;
      // Sin fila en el corte no hay dato de stock: no se marca en rojo (evita falsas alarmas con artículos viejos del catálogo).
      return {...c,enCorte:!!i,w,total,base,semaforo:i?semaforo(base,c.stockMinimo,c.puntoReorden):'gris'};
    });
  }
  const ORDEN_SEMAFORO={rojo:0,naranja:1,verde:2,gris:3};
  /* f: {categoria, marca, prioritarios (bool), soloBajoMinimo, texto, activos (bool)} */
  function filtrarStock(filas,f){
    f=f||{};
    const t=norm(f.texto||'');
    return filas.filter(x=>{
      if(f.activos!==false&&x.activo===false)return false;
      if(f.prioritarios&&!x.prioritario)return false;
      if(f.categoria&&x.categoria!==f.categoria)return false;
      if(f.marca&&x.marca!==f.marca)return false;
      if(f.soloBajoMinimo&&!(x.semaforo==='rojo'))return false;
      if(t&&!(norm(x.nombre).includes(t)||norm(x.itemCode).includes(t)))return false;
      return true;
    });
  }
  function ordenarStock(filas){
    return filas.slice().sort((a,b)=>ORDEN_SEMAFORO[a.semaforo]-ORDEN_SEMAFORO[b.semaforo]||String(a.categoria).localeCompare(String(b.categoria),'es')||String(a.nombre).localeCompare(String(b.nombre),'es'));
  }
  function resumenStock(filas){
    const activas=filas.filter(x=>x.activo!==false&&x.enCorte);
    return {articulos:activas.length,bajoMinimo:activas.filter(x=>x.semaforo==='rojo').length,sinStock:activas.filter(x=>!(x.base>0)).length};
  }

  /* ---------- permisos (reglas puras; el módulo de datos las aplica al usuario) ---------- */
  const ROLES_SOLO_CONSULTA=['Jefe de Producción','Jefe de Operaciones','Jefatura','Gerente General','Gerente'];
  const ROLES_VER_DEFECTO=['Asistente de Producción','Jefe de Operaciones'];
  const ROLES_ESCRIBIR_DEFECTO=['Asistente de Producción'];

  const API={GRUPOS_VALIDOS,GRUPOS_NOMBRE,ALMACENES,CATEGORIAS,PRIORITARIAS,MARCAS,CAMPOS_EDITABLES,ROLES_SOLO_CONSULTA,ROLES_VER_DEFECTO,ROLES_ESCRIBIR_DEFECTO,
    num,norm,red,fmt,esExcluido,categoriaDe,marcaDe,presentacionDe,esPrioritaria,almacenDe,almacenInfo,idPorNombre,esIdNombre,prefiltrarFilas,leerLibro,
    registroCatalogo,combinarCatalogo,validarEdicion,filaCorte,claveCorte,semaforo,SEMAFORO_TXT,filasStock,filtrarStock,ordenarStock,resumenStock};
  global.glacialInventarioNucleo=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
