/* Mantenimiento · evidencias fotográficas: validación y compresión (límites), subir ANTES de registrar (nunca una referencia a un archivo inexistente), texto
   conservado ante un fallo de foto, reintento sin duplicados ni huérfanos, registro pendiente, doble clic, permisos, obligatoriedad por tipo y nada de base64
   en la base de datos. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const clon=v=>JSON.parse(JSON.stringify(v));
const T0=Date.parse('2099-03-07T08:00:00');
const min=n=>n*60000;

function nube(){
  const docs=new Map(),ver=new Map();const N={docs,falla:false,fallaSoloEvidencia:false};
  N.db={collection:c=>({doc:id=>({__c:c,__id:id,__k:c+'/'+id,get:async()=>({exists:docs.has(c+'/'+id),data:()=>clon(docs.get(c+'/'+id))}),onSnapshot(cb){cb({exists:docs.has(c+'/'+id),data:()=>clon(docs.get(c+'/'+id))});return()=>{};}}),
      where:()=>({onSnapshot(cb){cb({docs:[]});return()=>{};},limit:()=>({get:async()=>({docs:[]})})})}),
    runTransaction:async fn=>{
      for(let i=0;i<5;i++){
        const lect=new Map(),w=[];
        const tx={get:async r=>{lect.set(r.__k,ver.get(r.__k)||0);return {exists:docs.has(r.__k),data:()=>clon(docs.get(r.__k))};},set:(r,d,o)=>w.push([r,d,o])};
        const res=await fn(tx);await new Promise(r=>setTimeout(r,1));
        let ch=false;lect.forEach((v,k)=>{if((ver.get(k)||0)!==v)ch=true;});if(ch)continue;
        if(N.falla||(N.fallaSoloEvidencia&&w.some(([r,d])=>d&&Array.isArray(d.evidencias)&&d.evidencias.length)))throw new Error('sin red');
        w.forEach(([r,d,o])=>{const ant=docs.get(r.__k);
          if(r.__c==='intervenciones'&&ant){if(d.version!==ant.version+1||d.historial.length!==ant.historial.length+1)throw new Error('permission-denied');}
          const nd={};Object.keys(d).forEach(k=>{nd[k]=d[k]==='__TS__'?1:d[k];});docs.set(r.__k,o&&o.merge?Object.assign({},ant||{},clon(nd)):clon(nd));ver.set(r.__k,(ver.get(r.__k)||0)+1);});
        return res;
      }
      throw new Error('aborted');}};
  return N;
}
function almacen(){                       // almacén de archivos falso: devuelve la referencia del archivo subido
  const A={objetos:new Map(),puts:0,fallar:false,disponible:true,porRuta:{}};
  A.subir=(id,carpeta,blob,meta,prog)=>new Promise((ok,er)=>setTimeout(()=>{
    if(A.fallar){er(new Error('network-error'));return;}
    const pid=carpeta+'/'+id;A.puts++;A.porRuta[pid]=(A.porRuta[pid]||0)+1;A.objetos.set(pid,{blob,meta});if(prog)prog(1);ok({publicId:pid});},1));
  A.url=(p,m)=>'https://almacen.demo/fotos/'+(m?'mini/':'')+p+'.jpg';
  return A;
}
function dispositivo(N,A,o){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Promise,Error,Blob,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},db:N.db};
  vm.createContext(sb);sb.window=sb;sb.document={addEventListener(){},createElement:()=>({style:{}}),getElementById:()=>null,body:{appendChild(){}},head:{appendChild(){}}};
  sb.URL={createObjectURL:()=>'blob:x',revokeObjectURL(){}};
  sb.state={user:Object.assign({username:'mant',nombre:'Cuenta',rol:'mantenimiento_compartido'},o.user||{})};
  sb.firebase={auth:()=>({currentUser:{uid:o.uid||'uid-cuenta'}}),firestore:{FieldValue:{serverTimestamp:()=>'__TS__'}}};
  sb.tareoAhoraServidor=()=>o.ahora||T0+min(60);
  sb.esMantCompartido=u=>String((u||sb.state.user).rol)==='mantenimiento_compartido';
  sb.mantTecnicoActivo=()=>o.tecnico===undefined?{workerId:'w1',nombre:'Ana Pérez',token:null}:o.tecnico;
  sb.tienePermiso=()=>false;sb.esUsuarioSoloConsulta=u=>['Gerente General'].includes(String(u&&u.rol));
  sb.glacialCierresSesion=[];sb.__archivosPrueba=A;
  ['67-intervenciones-motor','67b-intervenciones-datos'].forEach(f=>vm.runInContext(leer('js/mantenimiento/'+f+'.js'),sb));
  sb.glacialMantUI={UI:{},pintarDetalle(){},aviso(){},modal(){return {};},formulario(){}};
  vm.runInContext(leer('js/mantenimiento/67d-intervenciones-evidencias.js'),sb);
  return sb;
}
const preparado=()=>async()=>({blob:{size:300000},thumb:{size:20000},ancho:1600,alto:1200,tam:300000});

(async()=>{
  const sbLim=dispositivo(nube(),almacen(),{});
  const E=sbLim.glacialEvidencias;
  /* ---------- validación y límites ---------- */
  ok(E.validarArchivo({type:'image/jpeg',size:2e6})===''&&E.validarArchivo({type:'image/png',size:2e6})==='','imágenes JPG y PNG válidas');
  ok(/Formato no admitido/.test(E.validarArchivo({type:'application/pdf',size:100}))&&/Formato/.test(E.validarArchivo({type:'',size:100}))&&/vacío/.test(E.validarArchivo({type:'image/jpeg',size:0})),'formato no admitido y archivo vacío rechazados');
  ok(/máximo/.test(E.validarArchivo({type:'image/jpeg',size:20*1024*1024}))&&/ninguna/.test(E.validarArchivo(null)),'tamaño máximo de 15 MB y archivo ausente');
  const d1=E.dimensiones(4000,3000,1600),d2=E.dimensiones(800,600,1600),d3=E.dimensiones(3000,4000,320);
  ok(d1.ancho===1600&&d1.alto===1200&&d2.ancho===800&&d2.alto===600&&d3.ancho===240&&d3.alto===320,'la compresión reduce el lado mayor a 1600 px (miniatura 320 px) y nunca agranda');
  ok(E.LIM.maxComprimidoBytes<=1.5*1024*1024&&E.LIM.maxLado===1600,'límites razonables definidos (≈1,2 MB por foto)');
  ok(E.carpetaDe('o_PET1-9')==='mantenimiento/o_PET1-9'&&E.carpetaDe('a/b c')==='mantenimiento/a-b-c','carpeta de Cloudinary saneada, siempre bajo mantenimiento/{intervención}');

  /* ---------- flujo con la misma cuenta ---------- */
  const N=nube(),A=almacen();
  const sb=dispositivo(N,A,{});
  const API=sb.glacialIntervenciones,EV=sb.glacialEvidencias;
  const abierta=await API.abrir({linea:'PET1',problema:'La sopladora pierde presión de aire',origen:{tipo:'PARADA',id:'PET1|7|det',paradaId:'PET1|7|det'}},{iniciar:true});
  const id=abierta.doc.id;
  const archivo={type:'image/jpeg',size:3e6,name:'foto.jpg'};
  /* 1) subir falla: el registro de la intervención NO se pierde y no se publica ninguna referencia */
  A.fallar=true;
  const textoAntes=JSON.stringify(N.docs.get('intervenciones/'+id));
  const r1=await EV.agregar({intervencionId:id,seccion:'PROBLEMA',descripcion:'Manguera suelta',archivo,preparar:preparado(),id:'ev_fijo1'});
  ok(!r1.ok&&r1.etapa==='subir'&&JSON.stringify(N.docs.get('intervenciones/'+id))===textoAntes&&(N.docs.get('intervenciones/'+id).evidencias||[]).length===0,'foto con carga fallida: la intervención conserva su texto y NO se publica una referencia a un archivo que nunca se cargó');
  ok(EV.pendientesDe(id).length===1&&EV.estados.get('ev_fijo1').estado==='PENDIENTE_SUBIR'&&/Reintenta/.test(EV.estados.get('ev_fijo1').mensaje),'queda «Foto pendiente de subir» (distinto de «Registro guardado») con mensaje de error y reintento');
  /* 2) reintento sin duplicar */
  A.fallar=false;
  const r2=await EV.procesar('ev_fijo1');
  const d=N.docs.get('intervenciones/'+id);
  ok(r2.ok&&d.evidencias.length===1&&d.evidencias[0].id==='ev_fijo1'&&d.evidencias[0].path==='mantenimiento/'+id+'/ev_fijo1'&&d.evidencias[0].proveedor==='supabase'&&A.objetos.has(d.evidencias[0].path)&&!('url' in d.evidencias[0]),'reintento: se sube y recién entonces se registra la referencia (solo la referencia del archivo, nunca una dirección)');
  ok(EV.pendientesDe(id).length===0&&A.porRuta[d.evidencias[0].path]===1,'la cola queda vacía; la ruta es la misma (id fijo) y no hay archivos huérfanos distintos');
  ok(d.historial[d.historial.length-1].accion==='EVIDENCIA'&&d.evidencias[0].por.nombre==='Ana Pérez'&&d.evidencias[0].por.uid==='uid-cuenta'&&d.evidencias[0].seccion==='PROBLEMA'&&d.evidencias[0].descripcion==='Manguera suelta'&&d.evidencias[0].en>0,'la referencia lleva autor (técnico y cuenta), fecha, sección y descripción, y deja historial');
  ok(JSON.stringify(d).indexOf('data:image')<0&&JSON.stringify(d).indexOf('base64')<0&&!('blob' in d.evidencias[0]),'no se guarda ninguna imagen (base64) en el documento');
  /* 3) el archivo se subió, pero el registro falló: se reintenta SOLO el registro */
  N.fallaSoloEvidencia=true;
  const putsAntes=A.puts;
  const r3=await EV.agregar({intervencionId:id,seccion:'TRABAJO',descripcion:'Cambio de manguera',archivo,preparar:preparado(),id:'ev_fijo2'});
  ok(!r3.ok&&r3.etapa==='registrar'&&EV.estados.get('ev_fijo2').estado==='SUBIDA_SIN_REGISTRO'&&A.objetos.has('mantenimiento/'+id+'/ev_fijo2'),'subida correcta y registro fallido: estado «subida; registro pendiente»');
  N.fallaSoloEvidencia=false;
  const putsMedio=A.puts;
  const r4=await EV.procesar('ev_fijo2');
  ok(r4.ok&&A.puts===putsMedio&&N.docs.get('intervenciones/'+id).evidencias.length===2,'el reintento solo registra: no vuelve a subir el archivo');
  /* 4) doble clic / reintento simultáneo */
  const rr=await Promise.all([EV.agregar({intervencionId:id,seccion:'CIERRE',archivo,preparar:preparado(),id:'ev_fijo3'}),EV.procesar('ev_fijo3')]);
  ok(N.docs.get('intervenciones/'+id).evidencias.filter(e=>e.id==='ev_fijo3').length===1,'doble clic o proceso simultáneo: una sola referencia registrada');
  /* 5) permisos y entorno */
  const jefe=dispositivo(N,A,{user:{username:'jef',nombre:'Jefe',rol:'Gerente General'},uid:'uid-jef'});
  let er='';try{await jefe.glacialEvidencias.agregar({intervencionId:id,seccion:'PROBLEMA',archivo,preparar:preparado()});}catch(e){er=e.message;}
  ok(/consulta/.test(er)&&N.docs.get('intervenciones/'+id).evidencias.length===3,'el usuario de consulta no agrega fotos');
  const sinTec=dispositivo(N,A,{tecnico:null});sinTec.glacialIntervenciones.recordar(N.docs.get('intervenciones/'+id));
  er='';try{await sinTec.glacialEvidencias.agregar({intervencionId:id,seccion:'PROBLEMA',archivo,preparar:preparado()});}catch(e){er=e.message;}
  ok(/consulta|Identifícate/.test(er),'la cuenta compartida sin técnico identificado no agrega fotos');
  const A2=almacen();A2.disponible=false;
  const sbSin=dispositivo(N,A2,{});er='';try{await sbSin.glacialEvidencias.agregar({intervencionId:id,seccion:'PROBLEMA',archivo,preparar:preparado()});}catch(e){er=e.message;}
  ok(/no están disponibles/.test(er)&&!sbSin.glacialEvidencias.Archivos.disponible(),'sin almacenamiento de archivos (p. ej. puente de Supabase) la función se desactiva y lo dice, sin romper nada');
  er='';try{await EV.agregar({intervencionId:id,seccion:'OTRA',archivo,preparar:preparado()});}catch(e){er=e.message;}
  ok(/corresponde/.test(er),'exige indicar a qué corresponde la foto');
  /* 6) límite de fotos por intervención */
  let ult='';
  for(let i=0;i<12;i++){try{await EV.agregar({intervencionId:id,seccion:'TRABAJO',archivo,preparar:preparado(),id:'ev_l'+i});}catch(e){ult=e.message;break;}}
  ok(/Máximo 12/.test(ult),'máximo de fotos por intervención');
  /* 7) cierre con foto obligatoria por tipo + foto de cierre en intervención cerrada */
  const N2=nube(),A3=almacen(),sb2=dispositivo(N2,A3,{});
  const o2=await sb2.glacialIntervenciones.abrir({linea:'PET2',problema:'Fallo del sensor de nivel'},{iniciar:true});
  N2.docs.set('sync/configMantenimiento',{evidenciasRequeridas:{CORRECTIVO:true}});
  const cierre={equipoId:'eq_9',equipoNombre:'Envasadora',diagnostico:'Sensor con la lente sucia',accion:'Se limpió y calibró el sensor',sinRepuestos:true,resultado:'OPERATIVO_VERIFICADO',finRealMs:T0+min(60),responsableId:'w1'};
  er='';try{await sb2.glacialIntervenciones.accion(o2.doc.id,'CERRAR',cierre);}catch(e){er=e.message;}
  ok(/exige al menos una foto/.test(er)&&N2.docs.get('intervenciones/'+o2.doc.id).estado==='EN_INTERVENCION','si el tipo de trabajo exige foto, no se cierra sin ella (regla explícita)');
  await sb2.glacialEvidencias.agregar({intervencionId:o2.doc.id,seccion:'CIERRE',archivo,preparar:preparado(),id:'ev_c1'});
  await sb2.glacialIntervenciones.accion(o2.doc.id,'CERRAR',cierre);
  ok(N2.docs.get('intervenciones/'+o2.doc.id).estado==='CERRADA','con la foto, cierra');
  const r5=await sb2.glacialEvidencias.agregar({intervencionId:o2.doc.id,seccion:'CIERRE',archivo,preparar:preparado(),id:'ev_c2'});
  ok(r5.ok&&N2.docs.get('intervenciones/'+o2.doc.id).evidencias.length===2,'una intervención cerrada admite fotos de cierre adicionales');
  N2.docs.set('sync/configMantenimiento',{});
  const o3=await sb2.glacialIntervenciones.abrir({linea:'PET2',problema:'Otro problema distinto'},{iniciar:true});
  await sb2.glacialIntervenciones.accion(o3.doc.id,'CERRAR',cierre);
  ok(N2.docs.get('intervenciones/'+o3.doc.id).estado==='CERRADA','sin la regla, la foto NO es obligatoria (por defecto ninguna)');
  /* 8) anular */
  const an=await sb2.glacialIntervenciones.accion(o2.doc.id,'ANULAR_EVIDENCIA',{id:'ev_c2',motivo:'Foto borrosa'});
  ok(an.evidencias.find(e=>e.id==='ev_c2').anulada&&an.evidencias.length===2,'anular conserva el registro con motivo (el archivo no se borra)');
  /* 9) Supabase Storage privado (06b-fotos-supabase.js), sin Cloudinary ni Storage de Firebase */
  const src=leer('js/mantenimiento/67d-intervenciones-evidencias.js'),sinCom=src.replace(/\/\*[^]*?\*\//g,'').replace(/\/\/.*$/gm,'');
  ok(/glacialFotos\.subir\(blob,\{carpeta,id:publicId/.test(src)&&/glacialFotos\.disponible\(\)/.test(src)&&!/cloudinary/i.test(sinCom),'sube a Supabase Storage (bucket privado) y ya no usa Cloudinary');
  ok(!/api_secret|API_SECRET|signature|firebase\.storage|storage\.ref|\.getDownloadURL/.test(sinCom),'no usa Firebase Storage ni claves secretas');
  ok(!fs.existsSync(R+'/storage.rules.mantenimiento.txt'),'ya no hay reglas de Storage que publicar');
  ok(/srcDe\(/.test(src)&&/atributosImg/.test(src)&&!/data:image|base64/.test(sinCom),'las imágenes se muestran con enlace firmado (referencia en la base); ninguna imagen en base64');
  const idx=leer('index.html');
  ok(idx.indexOf('67c-intervenciones-pantalla.js')<idx.indexOf('67d-intervenciones-evidencias.js'),'index.html carga evidencias después de la pantalla');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
