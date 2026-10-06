/* Cierre de producción: cada parada real se muestra y se suma UNA sola vez (identidad por id, no por nombre). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const f29=fs.readFileSync(R+'/js/produccion/29-avance-produccion.js','utf8').replace(/\r\n/g,'\n');
const f35=fs.readFileSync(R+'/js/produccion/35-autollenado-registro.js','utf8').replace(/\r\n/g,'\n');

/* Se extraen solo las dos funciones puras de identidad. */
const trozo=n=>{const i=f29.indexOf('function '+n+'(');let d=0,j=f29.indexOf('{',i);for(let k=j;k<f29.length;k++){if(f29[k]==='{')d++;else if(f29[k]==='}'&&--d===0)return f29.slice(i,k+1);}};
const sb={};vm.createContext(sb);
vm.runInContext('const avNum=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};'+trozo('avDepurarParadasBloque')+trozo('avParadasAvanceNuevas')+';this.dep=avDepurarParadasBloque;this.nuevas=avParadasAvanceNuevas;',sb);
const sum=l=>l.reduce((s,p)=>s+p.minutos,0);

/* B7L de la captura: 5 paradas de Avance copiadas al cuadro + las mismas en Avance = 102 min, no 204. */
const av=[['avp_1','Recepción de personal',10,'PROGRAMADA'],['avp_2','Habilitación de línea',5,'PROGRAMADA'],['avp_3','Caída plancha del horno',37,'NO_PROGRAMADA'],['avp_4','Parada SOP azul',40,'NO_PROGRAMADA'],['avp_5','Cierre de turno',10,'PROGRAMADA']]
  .map(([id,descripcion,minutos,tipo])=>({id,descripcion,minutos,tipo,origen:'AVANCE'}));
const copias=av.map(p=>({descripcion:p.descripcion,minutos:p.minutos,tipo:p.tipo,origenId:p.id,origen:'AVANCE',auto:true}));
let b=sb.dep(copias),extra=sb.nuevas({paradas:av},b);
ok(extra.length===0&&sum(b)+sum(extra)===102,'las paradas de Avance ya copiadas al cuadro no se agregan otra vez (102 min, no 204)');
/* Sin copia en el cuadro: aparecen una vez. */
extra=sb.nuevas({paradas:av},[]);ok(extra.length===5&&sum(extra)===102,'si no están en el cuadro, aparecen una sola vez');
/* Mismo nombre, eventos distintos: se conservan ambos. */
const dos=[{id:'avp_a',descripcion:'Falla de máquina',minutos:10,tipo:'NO_PROGRAMADA',origen:'AVANCE'},{id:'avp_b',descripcion:'Falla de máquina',minutos:15,tipo:'NO_PROGRAMADA',origen:'AVANCE'}];
ok(sum(sb.nuevas({paradas:dos},[]))===25,'dos «Falla de máquina» distintas (10 + 15) siguen apareciendo ambas: 25 min');
const copiaA=[{descripcion:'Falla de máquina',minutos:10,origenId:'avp_a',origen:'AVANCE',auto:true}];
extra=sb.nuevas({paradas:dos},copiaA);ok(extra.length===1&&extra[0].id==='avp_b','solo se omite la que realmente está copiada (por id), no la de igual nombre');
/* Parada única. */
ok(sum(sb.nuevas({paradas:[{id:'x',descripcion:'Falla de máquina',minutos:20,origen:'AVANCE'}]},[]))===20,'una parada de 20 min aparece una vez: 20 min');
/* Botón duplicado: registro + reconstrucción histórica (mismo origen y minutos). */
const boton=[{descripcion:'Refrigerio',minutos:58,tipo:'PROGRAMADA',origen:'PAUSA',origenId:'r1',auto:true},{descripcion:'Pausa programada',minutos:58,tipo:'PROGRAMADA',origen:'PAUSA',origenId:'legado:PAUSA:1000:0',auto:true}];
b=sb.dep(boton);ok(b.length===1&&b[0].descripcion==='Refrigerio','la reconstrucción histórica duplicada se descarta y queda la de registro');
const distintos=[{descripcion:'Refrigerio',minutos:58,origen:'PAUSA',origenId:'r1',auto:true},{descripcion:'Pausa programada',minutos:30,origen:'PAUSA',origenId:'legado:PAUSA:1000:0',auto:true}];
ok(sb.dep(distintos).length===2,'si los minutos difieren no se descarta nada');
const sinRegistro=[{descripcion:'Pausa programada',minutos:30,origen:'PAUSA',origenId:'legado:PAUSA:1000:0',auto:true}];
ok(sb.dep(sinRegistro).length===1,'una reconstrucción histórica sin registro equivalente se conserva');
const manual=[{descripcion:'Charla',minutos:10,tipo:'PROGRAMADA'},{descripcion:'Charla',minutos:10,tipo:'PROGRAMADA'}];
ok(sb.dep(manual).length===2,'filas manuales con igual nombre y minutos no se tocan');

/* Los tres lugares que dibujan el cierre usan la lista sin duplicados. */
ok(/b\.paradasAvance/.test(f29)&&!/\(l\.paradas\|\|\[\]\)\.filter\(p=>p\.origen==='AVANCE'\)\);\s*\n\s*const paradas=\[\.\.\.paradasBloque/.test(f29),'texto, detalle e imagen usan b.paradasAvance (sin volver a agregar todas las de Avance)');
ok(/r\.legado&&todas\.some/.test(f35),'35: la reconstrucción histórica del mismo intervalo no se copia como otra fila');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
