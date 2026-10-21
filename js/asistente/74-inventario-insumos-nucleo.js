/* =============================================================
   GLACIAL · INVENTARIO DE INSUMOS — NÚCLEO (puro: sin Firestore ni pantalla; se prueba con node)
   -------------------------------------------------------------
   Documento de diseño: docs/asistente/inventario-insumos.md.
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
  /* La última fila de la tabla dinámica puede llamarse «TOTAL» o «Total general»: es la suma, no un artículo (antes «TOTAL» entraba al catálogo como INS-0182). */
  const esFilaTotal=nombre=>/^TOTAL( GENERAL)?$/.test(norm(nombre));
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
      if(esFilaTotal(etiqueta))break;
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
    const cods=asignarCodigos(lista);                           // los artículos nuevos (y los que aún no tenían) reciben su código interno
    return {lista,nuevos,actualizados,adoptados,sinCambio,resueltos,codigosAsignados:cods.asignados};
  }
  /* Código interno GLACIAL de cada artículo («INS-0001»…): propio del sistema, estable y único; no cambia al reimportar ni al recibir el
     código SAP. Se asigna a los artículos que aún no lo tienen, en orden de categoría y nombre, a partir del número más alto existente. */
  const PREFIJO_CODIGO='INS-';
  const numeroCodigo=c=>{const m=/^INS-(\d+)$/.exec(String(c||''));return m?Number(m[1]):0;};
  const formatoCodigo=n=>PREFIJO_CODIGO+String(n).padStart(4,'0');
  function asignarCodigos(lista){
    let max=0;lista.forEach(x=>{max=Math.max(max,numeroCodigo(x.codigo));});
    const faltan=lista.filter(x=>!numeroCodigo(x.codigo)).sort((a,b)=>String(a.categoria).localeCompare(String(b.categoria),'es')||String(a.nombre).localeCompare(String(b.nombre),'es')||String(a.id).localeCompare(String(b.id)));
    faltan.forEach(x=>{x.codigo=formatoCodigo(++max);});
    return {asignados:faltan.length,desde:faltan.length?numeroCodigo(faltan[0].codigo):0,hasta:faltan.length?max:0};
  }
  const CAMPOS_EDITABLES=['unidad','stockMinimo','puntoReorden','prioritario','activo','sinUso'];
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
    return (catalogo||[]).filter(c=>!esFilaTotal(c.nombre)).map(c=>{      // la fila «TOTAL» que quedó en catálogos ya importados no es un artículo
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
      if(t&&!(norm(x.nombre).includes(t)||norm(x.itemCode).includes(t)||norm(x.codigo).includes(t)))return false;
      return true;
    });
  }
  /* Los artículos marcados «sin uso» van al final de la lista (siguen en el inventario). alFinal=false los deja en su lugar. */
  function ordenarStock(filas,alFinal){
    const abajo=alFinal===false?()=>0:x=>x.sinUso?1:0;
    return filas.slice().sort((a,b)=>abajo(a)-abajo(b)||ORDEN_SEMAFORO[a.semaforo]-ORDEN_SEMAFORO[b.semaforo]||String(a.categoria).localeCompare(String(b.categoria),'es')||String(a.nombre).localeCompare(String(b.nombre),'es'));
  }
  /* Sin movimiento: el stock total no cambió en ningún corte del periodo. cortes: [{fechaCorte, items:[{id,t}]}] (cualquier orden). Necesita al
     menos 3 cortes que abarquen minDias o más; si no, devuelve {ids:[], motivo}. Solo mira artículos activos con stock y que aparecen en todos. */
  function detectarSinMovimiento(catalogo,cortes,minDias){
    const dias=minDias||30,lista=(cortes||[]).filter(c=>c&&c.items).slice().sort((a,b)=>String(a.fechaCorte).localeCompare(String(b.fechaCorte)));
    if(lista.length<3)return {ids:[],motivo:'Hacen falta al menos 3 cortes de stock para saber qué no se mueve (hay '+lista.length+').',desde:'',cortes:lista.length};
    const dd=f=>Date.parse(f+'T00:00:00Z'),span=Math.round((dd(lista[lista.length-1].fechaCorte)-dd(lista[0].fechaCorte))/86400000);
    if(!(span>=dias))return {ids:[],motivo:'Los cortes solo abarcan '+span+' días; se necesitan '+dias+' o más.',desde:lista[0].fechaCorte,cortes:lista.length};
    const mapas=lista.map(c=>new Map(c.items.map(i=>[i.id,i]))),ultimo=mapas[mapas.length-1],ids=[];
    (catalogo||[]).forEach(c=>{
      if(c.activo===false||c.sinUso)return;
      const alias=[c.id,...(c.alias||[])],filaDe=m=>{for(const a of alias){const i=m.get(a);if(i)return i;}return null;};
      const fin=filaDe(ultimo);if(!fin||!(num(fin.t)>0))return;
      if(mapas.every(m=>{const i=filaDe(m);return i&&red(num(i.t),4)===red(num(fin.t),4);}))ids.push(c.id);
    });
    return {ids,motivo:'',desde:lista[0].fechaCorte,cortes:lista.length,dias:span};
  }
  function resumenStock(filas){
    const activas=filas.filter(x=>x.activo!==false&&x.enCorte);
    return {articulos:activas.length,bajoMinimo:activas.filter(x=>x.semaforo==='rojo').length,sinStock:activas.filter(x=>!(x.base>0)).length};
  }

  /* ---------- conteo físico (Fase 2) ---------- */
  const ESTADOS_CONTEO={EN_PROCESO:'En proceso',CERRADO:'Cerrado',ANULADO:'Borrado'};
  const claveConteo=(fecha,instante)=>'K'+String(fecha).replace(/-/g,'')+'_'+Number(instante).toString(36);
  const claveLinea=instante=>'L'+Number(instante).toString(36)+'_'+Math.random().toString(36).slice(2,8);
  const ubicacionLimpia=u=>String(u==null?'':u).replace(/\s+/g,' ').trim().slice(0,60)||'Sin ubicación';
  function validarConteo(c){
    const e=[];
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(c&&c.fecha||'')))e.push('Indica la fecha del conteo.');
    if(!(c&&(c.almacen==='TODOS'||ALMACENES.some(a=>a.clave===c.almacen))))e.push('Elige el almacén que se va a contar.');
    if(String(c&&c.observacion||'').length>500)e.push('La observación admite hasta 500 caracteres.');
    return e;
  }
  function validarLinea(l){
    const e=[];
    if(!String(l&&l.itemId||'').trim())e.push('Elige el artículo.');
    const n=Number(l&&l.cantidad);
    if(l&&l.cantidad!==undefined&&(String(l.cantidad).trim()===''||!Number.isFinite(n)))e.push('Escribe la cantidad contada.');
    else if(!(n>=0))e.push('La cantidad no puede ser negativa.');
    else if(n>1e9)e.push('La cantidad es demasiado grande.');
    if(String(l&&l.ubicacion||'').length>60)e.push('La ubicación admite hasta 60 caracteres.');
    return e;
  }
  /* Artículo del catálogo al que apunta una línea (por id o por un id anterior, ver «alias»). */
  function itemDeLinea(indice,itemId){
    return indice.get(itemId)||null;
  }
  function indiceCatalogo(catalogo){
    const m=new Map();
    (catalogo||[]).forEach(c=>{m.set(c.id,c);(c.alias||[]).forEach(a=>{if(!m.has(a))m.set(a,c);});});
    return m;
  }
  /* Suma por artículo de las líneas de un conteo (varias líneas por ubicación se suman solas: reemplaza =1000+9000). */
  function totalesConteo(lineas,catalogo){
    const idx=indiceCatalogo(catalogo),porItem=new Map(),huerfanas=[];
    (lineas||[]).forEach(l=>{
      const it=itemDeLinea(idx,l.itemId);
      if(!it){huerfanas.push(l);return;}
      let t=porItem.get(it.id);if(!t){t={total:0,lineas:[]};porItem.set(it.id,t);}
      t.total=red(t.total+num(l.cantidad),4);t.lineas.push(l);
    });
    porItem.forEach(t=>t.lineas.sort((a,b)=>num(a.en)-num(b.en)));
    return {porItem,huerfanas};
  }
  /* f: {categoria, texto, prioritarios, soloPendientes, activos}. Una fila por artículo con su total contado. */
  function filasConteo(catalogo,totales,f){
    f=f||{};
    const t=norm(f.texto||'');
    return (catalogo||[]).filter(c=>{
      if(f.activos!==false&&c.activo===false)return false;
      if(f.prioritarios&&!c.prioritario)return false;
      if(f.categoria&&c.categoria!==f.categoria)return false;
      if(t&&!(norm(c.nombre).includes(t)||norm(c.itemCode).includes(t)||norm(c.codigo).includes(t)))return false;
      return true;
    }).map(c=>{
      const x=totales.porItem.get(c.id);
      return {...c,contado:!!x,total:x?x.total:0,lineas:x?x.lineas:[]};
    }).filter(r=>!f.soloPendientes||!r.contado)
      .sort((a,b)=>String(a.categoria).localeCompare(String(b.categoria),'es')||String(a.nombre).localeCompare(String(b.nombre),'es'));
  }
  /* Avance sobre los artículos que se esperaba contar (activos, y prioritarios si ese filtro está puesto). */
  function progresoConteo(catalogo,totales,soloPrioritarios){
    const base=(catalogo||[]).filter(c=>c.activo!==false&&(!soloPrioritarios||c.prioritario));
    const contados=base.filter(c=>totales.porItem.has(c.id)).length;
    return {total:base.length,contados,pendientes:base.length-contados,pct:base.length?Math.round(contados/base.length*100):0};
  }
  const ubicacionesUsadas=lineas=>[...new Set((lineas||[]).map(l=>l.ubicacion).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  function resumenCierre(lineas,catalogo){
    const tot=totalesConteo(lineas,catalogo);
    const pri=progresoConteo(catalogo,tot,true);
    return {articulosContados:tot.porItem.size,lineas:(lineas||[]).length,prioritariosPendientes:pri.pendientes,prioritariosTotal:pri.total};
  }

  /* ---------- importar un conteo desde Excel (columna «CONTEO …» de la hoja RESUMEN) ----------
     hojas: [{nombre, filas}] (filas = hoja como matriz). Busca, en las primeras 40 filas de cada hoja, la fila de títulos con una columna cuyo título
     empieza con «CONTEO» (p. ej. «CONTEO 18.10»); los artículos están en la primera columna. Se ignoran las filas de grupo (solo números), «TOTAL GENERAL» y
     las filas sin cantidad. Cada artículo se une al catálogo por su NOMBRE (sin acentos ni mayúsculas); los que no se encuentran quedan en `sinCatalogo`.
     Devuelve null si ninguna hoja tiene esa columna; si no, {hoja, titulo, dia, mes, lineas:[{itemId,nombre,cantidad}], sinCatalogo:[{nombre,cantidad}], repetidos:[nombre]}. */
  function leerConteoResumen(hojas,catalogo){
    const porNombre=new Map();
    (catalogo||[]).forEach(c=>{const k=norm(c.nombre);if(k&&!porNombre.has(k))porNombre.set(k,c);});
    const ordenadas=(hojas||[]).slice().sort((x,y)=>(norm(y.nombre)==='RESUMEN')-(norm(x.nombre)==='RESUMEN'));
    for(const h of ordenadas){
      const filas=h.filas||[];let ih=-1,jc=-1;
      for(let i=0;i<Math.min(filas.length,40)&&ih<0;i++){
        const f=filas[i]||[];
        for(let j=1;j<f.length;j++){if(/^CONTEO\b/.test(norm(f[j]))){ih=i;jc=j;break;}}
      }
      if(ih<0)continue;
      const titulo=String(filas[ih][jc]).trim(),m=/(\d{1,2})[./-](\d{1,2})/.exec(titulo);
      const out={hoja:h.nombre,titulo,dia:m?Number(m[1]):null,mes:m?Number(m[2]):null,lineas:[],sinCatalogo:[],repetidos:[]};
      const vistos=new Set();
      for(let i=ih+1;i<filas.length;i++){
        const f=filas[i];if(!f||f[0]==null||String(f[0]).trim()==='')continue;
        const nombre=String(f[0]).trim();
        if(esFilaTotal(nombre))break;
        if(/^\d{2,4}$/.test(nombre))continue;
        const bruto=f[jc];if(bruto==null||String(bruto).trim()==='')continue;
        const cantidad=Number(String(bruto).replace(/,/g,''));
        if(!Number.isFinite(cantidad)||cantidad<0)continue;
        const k=norm(nombre),it=porNombre.get(k);
        if(vistos.has(k)){out.repetidos.push(nombre);continue;}
        vistos.add(k);
        if(it)out.lineas.push({itemId:it.id,nombre:it.nombre,cantidad:red(cantidad,4)});else out.sinCatalogo.push({nombre,cantidad:red(cantidad,4)});
      }
      return out;
    }
    return null;
  }

  /* Lee un Excel con el conteo físico. hojas: [{nombre, filas:[[celdas…]]}]. Busca la fila de títulos (artículo/código + cantidad contada) y une cada
     fila con el catálogo por código interno (INS-), código SAP o nombre. Devuelve las líneas listas para guardar y lo que no se pudo unir. */
  const esTitulo=(c,re)=>re.test(norm(c));
  function leerConteoExcel(hojas,catalogo){
    const idx=indiceCatalogo(catalogo),porCod=new Map(),porSap=new Map(),porNombre=new Map();
    (catalogo||[]).forEach(c=>{if(c.codigo)porCod.set(norm(c.codigo),c);if(c.itemCode)porSap.set(norm(c.itemCode),c);
      const k=norm(c.nombre);porNombre.set(k,porNombre.has(k)?null:c);});
    let mejor=null;
    (hojas||[]).forEach(h=>{
      const filas=h.filas||[];
      for(let i=0;i<Math.min(filas.length,40);i++){
        const f=filas[i]||[],cab={};
        f.forEach((c,j)=>{
          if(cab.cant===undefined&&esTitulo(c,/^(CONTEO|CANTIDAD|CONTADO|FISICO|STOCK FISICO|CONTEO FISICO|CANT\.? CONTADA|CANTIDAD CONTADA|TOTAL CONTADO)/))cab.cant=j;
          else if(cab.nom===undefined&&esTitulo(c,/^(ARTICULO|DESCRIPCION|NOMBRE|ITEMNAME|PRODUCTO|MATERIAL|INSUMO|ETIQUETAS DE FILA)/))cab.nom=j;
          else if(cab.cod===undefined&&esTitulo(c,/^(CODIGO|COD\.?|ITEMCODE|CODIGO SAP|CODIGO INTERNO|CODIGO GLACIAL)/))cab.cod=j;
          else if(cab.ubi===undefined&&esTitulo(c,/^(UBICACION|LUGAR|ZONA|RACK)/))cab.ubi=j;
        });
        if(cab.cant!==undefined&&(cab.nom!==undefined||cab.cod!==undefined)){
          const lineas=[],sinUnir=[];let leidas=0,vacias=0;
          for(let r=i+1;r<filas.length;r++){
            const g=filas[r]||[];
            const cantRaw=g[cab.cant];
            const cod=cab.cod!==undefined?String(g[cab.cod]==null?'':g[cab.cod]).trim():'',nom=cab.nom!==undefined?String(g[cab.nom]==null?'':g[cab.nom]).trim():'';
            if(!cod&&!nom)continue;
            if(/^TOTAL/.test(norm(nom||cod)))continue;
            if(cantRaw===null||cantRaw===undefined||String(cantRaw).trim()===''){vacias++;continue;}
            const cant=Number(String(cantRaw).replace(/,/g,''));
            if(!Number.isFinite(cant)||cant<0){sinUnir.push({texto:nom||cod,cantidad:cantRaw,motivo:'Cantidad no válida'});continue;}
            leidas++;
            const it=(cod&&(porCod.get(norm(cod))||porSap.get(norm(cod))))||(nom&&porNombre.get(norm(nom)))||null;
            if(!it){sinUnir.push({texto:nom||cod,cantidad:cant,motivo:cod||nom?(porNombre.get(norm(nom))===null?'Nombre repetido en el catálogo':'No está en el catálogo'):''});continue;}
            lineas.push({itemId:it.id,nombre:it.nombre,codigo:it.codigo||'',cantidad:red(cant,4),ubicacion:cab.ubi!==undefined&&String(g[cab.ubi]==null?'':g[cab.ubi]).trim()?ubicacionLimpia(g[cab.ubi]):'Excel'});
          }
          const puntaje=lineas.length;
          if(!mejor||puntaje>mejor.lineas.length)mejor={hoja:h.nombre,lineas,sinUnir,leidas,vacias};
          break;
        }
      }
    });
    if(!mejor)return {error:'No se encontró la tabla del conteo. El Excel debe tener una fila de títulos con el artículo (o su código) y una columna «Conteo» o «Cantidad».'};
    if(!mejor.lineas.length)return {error:'Se encontró la hoja «'+String(mejor.hoja).trim()+'» pero ningún artículo coincide con el catálogo ('+mejor.sinUnir.length+' sin unir). Revisa que los nombres o códigos sean los mismos del inventario.'};
    return {hoja:mejor.hoja,lineas:mejor.lineas,sinUnir:mejor.sinUnir,resumen:{leidas:mejor.leidas,unidas:mejor.lineas.length,sinUnir:mejor.sinUnir.length,vacias:mejor.vacias}};
  }

  /* ---------- conciliación SAP vs conteo (Fase 3) ---------- */
  const UMBRAL_OK=2,UMBRAL_OBSERVADO=10;                       // % de diferencia sobre el stock SAP: ≤2 OK · ≤10 OBSERVADO · >10 CRÍTICO
  const ESTADOS_CONCILIACION={OK:'OK',OBSERVADO:'Observado',CRITICO:'Crítico',NO_CONTADO:'No contado',SIN_STOCK_SAP:'Sin stock SAP'};
  const ORDEN_CONCILIACION={CRITICO:0,OBSERVADO:1,NO_CONTADO:2,SIN_STOCK_SAP:3,OK:4};
  const almacenesDeConteo=almacen=>almacen==='TODOS'?ALMACENES.map(a=>a.clave):[almacen||'INSUMOS'];
  function estadoConciliacion(contado,sap,conteo){
    if(!contado)return {estado:'NO_CONTADO',pct:null};
    if(!(sap>0))return {estado:conteo>0?'SIN_STOCK_SAP':'OK',pct:null};
    const pct=red(Math.abs(conteo-sap)/sap*100,4);
    return {estado:pct<=UMBRAL_OK?'OK':pct<=UMBRAL_OBSERVADO?'OBSERVADO':'CRITICO',pct};
  }
  /* Compara el conteo con el stock SAP de los MISMOS almacenes contados. comentarios: [{id: itemId, texto, por, en}].
     No se listan los artículos sin stock SAP en esos almacenes que tampoco se contaron. */
  function conciliar({catalogo,corte,lineas,almacen,comentarios}){
    const claves=almacenesDeConteo(almacen),idx=claves.map(c=>ALMACENES.findIndex(a=>a.clave===c)).filter(i=>i>=0);
    const stock=filasStock(catalogo,corte,''),tot=totalesConteo(lineas,catalogo);
    const com=new Map((comentarios||[]).map(c=>[c.id,c]));
    const filas=[];
    stock.forEach(c=>{
      if(c.activo===false&&!tot.porItem.has(c.id))return;
      const sap=red(idx.reduce((s,i)=>s+c.w[i],0),4),x=tot.porItem.get(c.id),contado=!!x,conteo=x?x.total:0;
      if(!contado&&!(sap>0))return;
      const e=estadoConciliacion(contado,sap,conteo),cm=com.get(c.id);
      filas.push({id:c.id,codigo:c.codigo||'',itemCode:c.itemCode,nombre:c.nombre,categoria:c.categoria,w:c.w,sap,contado,conteo,diferencia:contado||sap>0?red(conteo-sap,4):0,
        pct:e.pct,estado:e.estado,lineas:x?x.lineas:[],comentario:cm?cm.texto:'',comentarioPor:cm?cm.por:'',comentarioEn:cm?cm.en:0});
    });
    filas.sort((a,b)=>ORDEN_CONCILIACION[a.estado]-ORDEN_CONCILIACION[b.estado]||(b.pct||0)-(a.pct||0)||String(a.nombre).localeCompare(String(b.nombre),'es'));
    return {filas,huerfanas:tot.huerfanas,claves,resumen:resumenConciliacion(filas)};
  }
  function resumenConciliacion(filas){
    const r={total:filas.length,OK:0,OBSERVADO:0,CRITICO:0,NO_CONTADO:0,SIN_STOCK_SAP:0,conComentario:0};
    filas.forEach(f=>{r[f.estado]++;if(f.comentario)r.conComentario++;});
    r.contados=r.total-r.NO_CONTADO;r.pctContado=r.total?Math.round(r.contados/r.total*100):0;
    return r;
  }
  function validarComentario(t){return String(t==null?'':t).length>500?['El comentario admite hasta 500 caracteres.']:[];}
  /* Líneas por ubicación de todo el conteo (hoja «Detalle por ubicación» del Excel). */
  function detalleUbicaciones(lineas,catalogo){
    const idx=indiceCatalogo(catalogo);
    return (lineas||[]).map(l=>{const it=idx.get(l.itemId);return {nombre:it?it.nombre:l.itemId,codigo:it?(it.codigo||''):'',itemCode:it?it.itemCode:'',ubicacion:l.ubicacion,cantidad:num(l.cantidad),por:l.por||'',en:num(l.en)};})
      .sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),'es')||String(a.ubicacion).localeCompare(String(b.ubicacion),'es'));
  }

  /* ---------- auditoría (Fase 4) ---------- */
  const GRUPOS_AUDITORIA={IMPORTACION:'Importaciones',CATALOGO:'Mínimos y catálogo',CONTEO:'Conteos',LINEA:'Líneas de conteo',COMENTARIO:'Comentarios',EVIDENCIA:'Evidencias de etiquetas'};
  const TIPOS_AUDITORIA={
    IMPORTAR_STOCK:{txt:'Importación de stock SAP',grupo:'IMPORTACION'},
    EDITAR_ARTICULO:{txt:'Edición de artículo (mínimos, reorden, unidad…)',grupo:'CATALOGO'},
    CREAR_CONTEO:{txt:'Conteo creado',grupo:'CONTEO'},EDITAR_CONTEO:{txt:'Observación del conteo',grupo:'CONTEO'},
    CERRAR_CONTEO:{txt:'Conteo cerrado',grupo:'CONTEO'},BORRAR_CONTEO:{txt:'Conteo borrado',grupo:'CONTEO'},REABRIR_CONTEO:{txt:'Conteo reabierto',grupo:'CONTEO'},
    CREAR_LINEA:{txt:'Línea agregada',grupo:'LINEA'},EDITAR_LINEA:{txt:'Línea editada',grupo:'LINEA'},BORRAR_LINEA:{txt:'Línea borrada',grupo:'LINEA'},BORRAR_UBICACION:{txt:'Líneas borradas por ubicación',grupo:'LINEA'},
    ASIGNAR_CODIGOS:{txt:'Códigos internos asignados',grupo:'CATALOGO'},MARCAR_SIN_USO:{txt:'Artículos marcados sin uso',grupo:'CATALOGO'},IMPORTAR_CONTEO:{txt:'Conteo importado desde Excel',grupo:'LINEA'},
    COMENTARIO_CONCILIACION:{txt:'Comentario de conciliación',grupo:'COMENTARIO'},
    IMPORTAR_EVIDENCIA:{txt:'Evidencia de etiqueta importada',grupo:'EVIDENCIA'},EDITAR_EVIDENCIA:{txt:'Dato de evidencia corregido',grupo:'EVIDENCIA'},
    CONFIRMAR_CAMPO:{txt:'Dato de evidencia confirmado',grupo:'EVIDENCIA'},CAMBIAR_ESTADO_EVIDENCIA:{txt:'Estado de evidencia',grupo:'EVIDENCIA'}};
  const CAMPOS_AUDITORIA={proveedor:'Proveedor',cliente:'Cliente',marca:'Marca',producto:'Producto',presentacion:'Presentación',codigo_producto:'Código del producto',lote:'Lote',numero_caja_bobina:'N.º de caja / bobina',
    orden_interna:'Orden interna',orden_compra:'Orden de compra',fecha_produccion:'Fecha de producción',fecha_proceso:'Fecha de proceso',fecha_etiqueta:'Fecha de la etiqueta',fecha_vencimiento:'Fecha de vencimiento',
    cantidad_valor:'Cantidad',cantidad_unidad:'Unidad',peso_neto_kg:'Peso neto (kg)',peso_bruto_kg:'Peso bruto (kg)',peso_declarado_kg:'Peso declarado (kg)',medidas:'Medidas',categoria:'Categoría',tipoDocumento:'Tipo de documento',sinUso:'Sin uso',stockMinimo:'Stock mínimo',puntoReorden:'Punto de reorden',unidad:'Unidad',prioritario:'Prioritario',activo:'Activo',ubicacion:'Ubicación',cantidad:'Cantidad',
    texto:'Comentario',estado:'Estado',motivo:'Motivo',observacion:'Observación',fecha:'Fecha',almacen:'Almacén',fechaCorte:'Fecha del corte',formato:'Formato',articulos:'Artículos',
    nuevos:'Nuevos',actualizados:'Actualizados',adoptados:'Adoptados',excluidos:'Excluidos',almacenes:'Almacenes',lineas:'Líneas',asignados:'Códigos asignados',desde:'Desde',hasta:'Hasta',por:'Registró',conteo:'Conteo'};
  const grupoAuditoria=t=>(TIPOS_AUDITORIA[t]||{}).grupo||'';
  function valorAuditoria(v){
    if(v===null||v===undefined||v==='')return '—';
    if(typeof v==='boolean')return v?'Sí':'No';
    if(typeof v==='number')return fmt(v);
    return String(v);
  }
  /* Cambios de un evento como filas {campo, antes, despues} legibles. */
  function cambiosAuditoria(ev){
    const a=ev&&ev.antes&&typeof ev.antes==='object'?ev.antes:{},d=ev&&ev.despues&&typeof ev.despues==='object'?ev.despues:{};
    return [...new Set([...Object.keys(a),...Object.keys(d)])].map(k=>({campo:CAMPOS_AUDITORIA[k]||k,antes:valorAuditoria(a[k]),despues:valorAuditoria(d[k])}));
  }
  const resumenAuditoria=ev=>cambiosAuditoria(ev).map(c=>c.antes==='—'&&c.despues!=='—'?`${c.campo}: ${c.despues}`:`${c.campo}: ${c.antes} → ${c.despues}`).join(' · ');
  /* f: {grupo, tipo, usuario, texto (artículo/código/conteo), conteoId}; eventos más recientes primero. */
  function filtrarAuditoria(eventos,f){
    f=f||{};const t=norm(f.texto||'');
    return (eventos||[]).filter(e=>(!f.grupo||grupoAuditoria(e.tipo)===f.grupo)&&(!f.tipo||e.tipo===f.tipo)&&(!f.usuario||e.usuario===f.usuario)&&(!f.conteoId||e.conteoId===f.conteoId)
      &&(!t||norm(e.articulo).includes(t)||norm(e.itemId).includes(t)||norm(resumenAuditoria(e)).includes(t)));
  }
  const ordenAuditoria=l=>(l||[]).slice().sort((a,b)=>num(b.enMs)-num(a.enMs));

  /* ---------- permisos (reglas puras; el módulo de datos las aplica al usuario) ---------- */
  const ROLES_SOLO_CONSULTA=['Jefe de Producción','Jefe de Operaciones','Jefatura','Gerente General','Gerente'];
  const ROLES_VER_DEFECTO=['Asistente de Producción','Jefe de Operaciones'];
  const ROLES_ESCRIBIR_DEFECTO=['Asistente de Producción'];

  const API={GRUPOS_VALIDOS,GRUPOS_NOMBRE,ALMACENES,CATEGORIAS,PRIORITARIAS,MARCAS,CAMPOS_EDITABLES,ROLES_SOLO_CONSULTA,ROLES_VER_DEFECTO,ROLES_ESCRIBIR_DEFECTO,
    num,norm,red,fmt,esExcluido,categoriaDe,marcaDe,presentacionDe,esPrioritaria,almacenDe,almacenInfo,idPorNombre,esIdNombre,prefiltrarFilas,leerLibro,
    registroCatalogo,combinarCatalogo,validarEdicion,filaCorte,claveCorte,semaforo,SEMAFORO_TXT,filasStock,filtrarStock,ordenarStock,resumenStock,
    detectarSinMovimiento,leerConteoExcel,leerConteoResumen,ESTADOS_CONTEO,claveConteo,claveLinea,ubicacionLimpia,validarConteo,validarLinea,indiceCatalogo,totalesConteo,filasConteo,progresoConteo,ubicacionesUsadas,resumenCierre,
    PREFIJO_CODIGO,asignarCodigos,UMBRAL_OK,UMBRAL_OBSERVADO,ESTADOS_CONCILIACION,almacenesDeConteo,estadoConciliacion,conciliar,resumenConciliacion,validarComentario,detalleUbicaciones,
    GRUPOS_AUDITORIA,TIPOS_AUDITORIA,CAMPOS_AUDITORIA,grupoAuditoria,cambiosAuditoria,resumenAuditoria,filtrarAuditoria,ordenAuditoria};
  global.glacialInventarioNucleo=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
