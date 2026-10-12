/* =============================================================
   MANTENIMIENTO · CATÁLOGO DE EQUIPOS (maestro)

   Catálogo mínimo y reutilizable de las máquinas realmente presentes. Cada equipo tiene un ID ESTABLE (no cambia aunque se cambie el nombre o el código),
   código y nombre visibles, línea o ubicación, tipo, estado activo/inactivo y datos técnicos opcionales. Permite distinguir equipos del mismo tipo
   («Sopladora 1» y «Sopladora 2»), tener varias máquinas por línea y una máquina COMPARTIDA con una ubicación explícita (linea + compartidoCon).
   No hay ningún inventario precargado: los ejemplos de la pantalla son sugerencias de tipo, no datos. Un equipo inactivo no se ofrece para
   intervenciones nuevas pero se conserva para el historial.

   DÓNDE SE GUARDA: sync/configMantenimiento → campo equiposMaestro (el mismo documento que ya escribe el Supervisor de Mantenimiento y lee la cuenta
   compartida; sin reglas nuevas). Cada cambio es una TRANSACCIÓN sobre ese documento (set con merge: no pisa lo demás) y solo toca el equipo editado.
   Relación con Producción: la parada de Producción guarda el equipo como TEXTO (37c). Cuando el catálogo tiene equipos para una línea, 37c ofrece sus
   nombres; la intervención se vincula por ID. Un texto de Producción sin equivalente exacto queda «sin equipo identificado» (no se infiere por palabras).
   Cargar después de 37c-equipos-catalogo.js.
   ============================================================= */
(function(){
  'use strict';

  const DOC='configMantenimiento',CAMPO='equiposMaestro';
  const LINEAS=['PET1','PET2','B7L','C20L','B20L'],PLANTA='PLANTA';
  const TIPOS_SUGERIDOS=['Sopladora','Envasadora','Etiquetadora','Empaquetadora','Rinser','Tapadora','Lavadora','Compresor','Transportador','Otro'];
  const norm=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const txt=v=>String(v==null?'':v).trim();
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const nombreLinea=k=>{if(k===PLANTA)return 'Planta / servicios';try{const l=(typeof LINES!=='undefined'?LINES:[]).find(x=>x.key===k);return l?l.name:k;}catch(_){return k;}};

  let items=[],listo=false,desub=null,reintento=null;
  const oyentes=[];
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(e){console.warn('Equipos (maestro):',e&&e.message||e);}});

  function limpiar(raw){
    return (Array.isArray(raw)?raw:[]).filter(e=>e&&e.id&&txt(e.nombre)).map(e=>({
      id:String(e.id),codigo:txt(e.codigo),nombre:txt(e.nombre),linea:LINEAS.includes(e.linea)||e.linea===PLANTA?e.linea:PLANTA,
      compartidoCon:(Array.isArray(e.compartidoCon)?e.compartidoCon:[]).filter(l=>LINEAS.includes(l)&&l!==e.linea),
      tipo:txt(e.tipo),activo:e.activo!==false,
      datos:{marca:txt(e.datos&&e.datos.marca),modelo:txt(e.datos&&e.datos.modelo),serie:txt(e.datos&&e.datos.serie),notas:txt(e.datos&&e.datos.notas)},
      creadoPor:txt(e.creadoPor),creadoEn:Number(e.creadoEn)||0,actualizadoPor:txt(e.actualizadoPor),actualizadoEn:Number(e.actualizadoEn)||0}));
  }

  function escuchar(){
    if(desub||typeof db==='undefined'||typeof state==='undefined'||!state.user)return;
    try{
      desub=db.collection('sync').doc(DOC).onSnapshot(s=>{
        items=limpiar(s.exists?s.data()[CAMPO]:[]);listo=true;avisar();
      },e=>{console.warn('Catálogo de equipos:',e&&e.message||e);desub=null;});
    }catch(_){desub=null;}
  }
  function cerrar(){if(typeof desub==='function'){try{desub();}catch(_){/* ya cerrada */}}desub=null;items=[];listo=false;}
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(cerrar);
  reintento=setInterval(()=>{if(!desub)escuchar();},4000);
  escuchar();

  const lista=()=>{escuchar();return items.slice();};
  const porId=id=>items.find(e=>e.id===id)||null;
  /* Equipos de una línea: los propios y los compartidos con ella. */
  function delaLinea(linea,o){
    const inc=!!(o&&o.incluirInactivos);
    return items.filter(e=>(inc||e.activo)&&(e.linea===linea||e.compartidoCon.includes(linea)))
      .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{numeric:true}));
  }
  const etiqueta=e=>e?(e.codigo?e.codigo+' · ':'')+e.nombre:'';
  /* Equipo cuyo nombre coincide exactamente con el texto que guardó Producción en una línea; null si no hay una coincidencia ÚNICA (nunca se infiere por palabras). */
  function buscarPorNombre(linea,nombre){
    const n=norm(nombre);
    if(!n)return null;
    const c=items.filter(e=>(e.linea===linea||e.compartidoCon.includes(linea))&&norm(e.nombre)===n);
    return c.length===1?c[0]:null;
  }

  /* ---------- validación y escritura ---------- */
  function validar(eq,existentes){
    const errores=[];
    const nombre=txt(eq.nombre),codigo=txt(eq.codigo),tipo=txt(eq.tipo);
    if(nombre.length<2||nombre.length>60)errores.push('El nombre debe tener entre 2 y 60 caracteres.');
    if(codigo.length<2||codigo.length>20)errores.push('El código debe tener entre 2 y 20 caracteres.');
    if(!tipo||tipo.length>40)errores.push('Indica el tipo de equipo (máximo 40 caracteres).');
    if(!(LINEAS.includes(eq.linea)||eq.linea===PLANTA))errores.push('Elige la línea o ubicación.');
    const comp=Array.isArray(eq.compartidoCon)?eq.compartidoCon:[];
    if(comp.some(l=>!LINEAS.includes(l)))errores.push('Una línea compartida no es válida.');
    if(comp.includes(eq.linea))errores.push('La línea principal no se repite como compartida.');
    ['marca','modelo','serie','notas'].forEach(k=>{if(txt(eq.datos&&eq.datos[k]).length>(k==='notas'?200:80))errores.push('El dato técnico «'+k+'» es demasiado largo.');});
    (existentes||[]).forEach(x=>{
      if(x.id===eq.id)return;
      if(norm(x.codigo)===norm(codigo))errores.push('Ya existe un equipo con el código «'+codigo+'» ('+x.nombre+').');
      if(norm(x.nombre)===norm(nombre)&&(x.linea===eq.linea))errores.push('Ya existe «'+nombre+'» en '+nombreLinea(eq.linea)+': distingue los equipos del mismo tipo (por ejemplo «Sopladora 1» y «Sopladora 2»).');
    });
    return {errores};
  }
  function puedeConfigurar(){
    const u=(typeof state!=='undefined'&&state.user)||null;
    if(!u)return false;
    if(typeof window.esMantCompartido==='function'&&window.esMantCompartido(u))return false;
    if(typeof esUsuarioSoloConsulta==='function'&&esUsuarioSoloConsulta(u))return false;
    if(window.glacialVista&&window.glacialVista.activo&&window.glacialVista.activo())return false;
    return String(u.rol||'').trim()==='Administrador'||(typeof puedeGestionarRotacionMtto==='function'&&puedeGestionarRotacionMtto());
  }
  const sinConexion=()=>!!(window.glacialEstadoDatos&&window.glacialEstadoDatos.enLinea===false);
  const quien=()=>(typeof state!=='undefined'&&state.user&&(state.user.nombre||state.user.username))||'';
  const idNuevo=()=>'eq_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);

  async function modificar(fn){
    if(!puedeConfigurar())throw new Error('Solo el Supervisor de Mantenimiento o el Administrador pueden cambiar el catálogo de equipos.');
    if(sinConexion())throw new Error('Sin conexión: el cambio NO se guardó.');
    const ref=db.collection('sync').doc(DOC);
    let resultado=null;
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const doc=snap.exists?snap.data():{};
      const actuales=limpiar(doc[CAMPO]);
      const crudos=Array.isArray(doc[CAMPO])?doc[CAMPO].slice():[];
      const r=fn(actuales,crudos);
      tx.set(ref,{[CAMPO]:r.lista,updatedAt:Date.now()},{merge:true});
      resultado=r.resultado;
    });
    return resultado;
  }
  /* Crea o edita UN equipo. eq.id vacío = nuevo (ID estable generado). esperadoEn evita pisar una edición de otra persona. */
  async function guardar(eq,opc){
    const o=opc||{};
    const nuevo={id:txt(eq.id),codigo:txt(eq.codigo),nombre:txt(eq.nombre),linea:eq.linea,compartidoCon:Array.isArray(eq.compartidoCon)?eq.compartidoCon.slice():[],tipo:txt(eq.tipo),
      activo:eq.activo!==false,datos:{marca:txt(eq.datos&&eq.datos.marca),modelo:txt(eq.datos&&eq.datos.modelo),serie:txt(eq.datos&&eq.datos.serie),notas:txt(eq.datos&&eq.datos.notas)}};
    return modificar(actuales=>{
      const v=validar(nuevo,actuales);
      if(v.errores.length)throw new Error(v.errores.join(' '));
      const i=nuevo.id?actuales.findIndex(e=>e.id===nuevo.id):-1;
      if(nuevo.id&&i<0)throw new Error('El equipo ya no existe.');
      if(i>=0&&o.esperadoEn!==undefined&&Number(actuales[i].actualizadoEn)!==Number(o.esperadoEn))throw new Error('El equipo cambió mientras lo editabas ('+etiqueta(actuales[i])+'). Ciérralo y vuelve a abrirlo para ver el valor actual.');
      const reg=Object.assign({},i>=0?actuales[i]:{creadoPor:quien(),creadoEn:ahora()},nuevo,{id:i>=0?actuales[i].id:idNuevo(),actualizadoPor:quien(),actualizadoEn:ahora()});
      const lista=actuales.slice();if(i>=0)lista[i]=reg;else lista.push(reg);
      return {lista,resultado:reg};
    });
  }
  async function cambiarActivo(id,activo){
    return modificar(actuales=>{
      const i=actuales.findIndex(e=>e.id===id);
      if(i<0)throw new Error('El equipo ya no existe.');
      const reg=Object.assign({},actuales[i],{activo:!!activo,actualizadoPor:quien(),actualizadoEn:ahora()});
      const lista=actuales.slice();lista[i]=reg;
      return {lista,resultado:reg};
    });
  }

  window.glacialEquiposMaestro={LINEAS,PLANTA,TIPOS_SUGERIDOS,lista,porId,delaLinea,buscarPorNombre,etiqueta,nombreLinea,validar,guardar,cambiarActivo,puedeConfigurar,
    listo:()=>listo,alCambiar:f=>{if(typeof f==='function'&&!oyentes.includes(f))oyentes.push(f);},escuchar,cerrar};
})();
