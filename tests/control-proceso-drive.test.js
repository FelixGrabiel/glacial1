/* Control de proceso → Google Sheets: el Apps Script (supabase/drive/apps-script/Codigo.gs) se ejecuta contra un Google simulado (Drive, Sheets, candado, propiedades).
   Verifica: seguridad (clave), libro y hojas creados una sola vez en la carpeta, filas por clave sin duplicar, columnas de planta respetadas, cuadros que desaparecen y límites.
   OJO: es una simulación; la prueba con Google real la hace quien publica el script (guía en docs/asistente/control-proceso-drive.md). node tests/control-proceso-drive.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const codigo=fs.readFileSync(R+'/supabase/drive/apps-script/Codigo.gs','utf8');

/* ---------- Google simulado ---------- */
function google({secreto='x'.repeat(30),carpeta='CARPETA1'}={}){
  const archivos=[];let n=0;
  const props={GLACIAL_SECRETO:secreto,CARPETA_ID:carpeta};
  const a1=s=>{const m=/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(s),c=x=>x.split('').reduce((k,ch)=>k*26+ch.charCodeAt(0)-64,0);return [Number(m[2]),c(m[1]),(m[4]?Number(m[4]):Number(m[2]))-Number(m[2])+1,(m[3]?c(m[3]):c(m[1]))-c(m[1])+1];};
  class Hoja{
    constructor(nombre){this.nombre=nombre;this.celdas=new Map();this.merges=[];this.bordes=[];this.formatos=[];this.ocultas=[];this.congeladas=0;this.imagenes=0;this.manuales=new Set();}
    getName(){return this.nombre;}
    getLastRow(){let m=0;for(const [k,v] of this.celdas)if(v!==''&&v!==null&&v!==undefined)m=Math.max(m,Number(k.split(',')[0]));return m;}
    getRange(a,b,c,d){const [r,col,nr,nc]=typeof a==='string'?a1(a):[a,b,c||1,d||1];return rango(this,r,col,nr,nc);}
    hideColumns(c){this.ocultas.push(c);}setFrozenRows(x){this.congeladas=x;}setHiddenGridlines(){}setColumnWidth(){}setRowHeights(){}
    insertImage(blob){this.imagenes++;return {setWidth(){return this;},setHeight(){return this;}};}
    get(r,c){const v=this.celdas.get(r+','+c);return v===undefined?'':v;}
    poner(r,c,v){this.celdas.set(r+','+c,v);}
  }
  const rango=(hoja,r,c,nr,nc)=>{
    let p=null;
    const o={
      getValues(){const out=[];for(let i=0;i<nr;i++){const f=[];for(let j=0;j<nc;j++)f.push(hoja.get(r+i,c+j));out.push(f);}return out;},
      getValue(){return hoja.get(r,c);},
      setValues(m){for(let i=0;i<nr;i++)for(let j=0;j<nc;j++)hoja.poner(r+i,c+j,m[i][j]);return p;},
      setValue(v){hoja.poner(r,c,v);return p;},
      merge(){hoja.merges.push([r,c,nr,nc]);return p;},
      setBorder(){hoja.bordes.push([r,c,nr,nc]);return p;},
      setNumberFormat(f){hoja.formatos.push([r,c,nr,nc,f]);return p;}
    };
    p=new Proxy(o,{get:(t,k)=>k in t?t[k]:()=>p});                 // setFontSize, setWrap… encadenables sin efecto
    return p;
  };
  class Libro{
    constructor(nombre){this.id='LIBRO'+(++n);this.nombre=nombre;this.hojas=[new Hoja('Hoja 1')];}
    getId(){return this.id;}getUrl(){return 'https://docs.google.com/spreadsheets/d/'+this.id;}getName(){return this.nombre;}
    getSheetByName(x){return this.hojas.find(h=>h.nombre===x)||null;}getSheets(){return this.hojas.slice();}
    insertSheet(x){const h=new Hoja(x);this.hojas.push(h);return h;}deleteSheet(h){this.hojas=this.hojas.filter(x=>x!==h);}
  }
  const ctx={
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null})},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    ContentService:{createTextOutput:t=>({text:t,setMimeType(){return this;}}),MimeType:{JSON:'JSON'}},
    Utilities:{newBlob:()=>({}),base64Decode:()=>[]},
    SpreadsheetApp:{BorderStyle:{SOLID:'S',SOLID_MEDIUM:'M'},create:nombre=>{const l=new Libro(nombre);archivos.push({id:l.id,nombre,carpeta:null,libro:l});return l;},open:f=>f.libro},
    DriveApp:{getFolderById:id=>{if(id!==carpeta)throw new Error('Carpeta no encontrada');return {id,getFilesByName:nombre=>{const a=archivos.filter(f=>f.carpeta===id&&f.nombre===nombre);let i=0;return {hasNext:()=>i<a.length,next:()=>a[i++]};}};},
      getFileById:id=>({moveTo:c=>{archivos.find(f=>f.id===id).carpeta=c.id;}})},
    Date,Math,JSON,String,Number,Array,Object,Error,RegExp
  };
  vm.createContext(ctx);vm.runInContext(codigo,ctx);
  const llamar=cuerpo=>JSON.parse(ctx.doPost({postData:{contents:typeof cuerpo==='string'?cuerpo:JSON.stringify(cuerpo)}}).text);
  return {ctx,archivos,props,llamar};
}
const fila=(clave,o={})=>({clave,lotePT:'CF3-01102027',preforma:'2605008F300',tapa:'30/05-B',etiqueta:'0468-26',asa:'01/06-B',soplado:6552,envasado:6552,empaquetado:6552,fecha:'2026-10-01',turno:'D',...o});
const cuerpo=(hojas,o={})=>({secreto:'x'.repeat(30),libro:{nombre:'C.P_BIDON_7L-OCTUBRE-2026'},formulario:{titulo:'CONTROL DE PORCESO EN EL ENVASADO',codigo:'CF - CA - F - 047'},logo:'AAAA',hojas,...o});
const hoja=(nombre,filas,marca)=>({nombre,marca:marca||nombre,presentacion:'7L',filas});

/* ================= seguridad ================= */
{
  const g=google();
  ok(JSON.parse(g.ctx.doGet().text).ok===true,'doGet responde que el servicio está vivo (sin datos)');
  let r=g.llamar(cuerpo([hoja('SCALA',[fila('a#1')])],{secreto:'otra-clave-distinta-de-treinta-letras'}));
  ok(r.ok===false&&r.codigo==='secreto'&&g.archivos.length===0,'con una clave incorrecta no hace nada (no crea ningún libro)');
  r=g.llamar(cuerpo([hoja('SCALA',[fila('a#1')])],{secreto:undefined}));
  ok(r.ok===false&&r.codigo==='secreto'&&g.archivos.length===0,'sin clave tampoco');
  const sin=google({secreto:'corta'});
  r=sin.llamar(cuerpo([hoja('SCALA',[fila('a#1')])],{secreto:'corta'}));
  ok(r.ok===false&&r.codigo==='sin_configurar'&&sin.archivos.length===0,'si la clave del script es corta (menos de 24) el servicio se niega a funcionar');
  const sinCarpeta=google();delete sinCarpeta.props.CARPETA_ID;
  ok(sinCarpeta.llamar(cuerpo([hoja('SCALA',[fila('a#1')])])).codigo==='sin_configurar','sin CARPETA_ID se niega');
  r=g.llamar('esto no es json');
  ok(r.ok===false&&r.codigo==='interno','un cuerpo que no es JSON da error controlado');
  ok(g.llamar(cuerpo([hoja('A/B',[fila('a#1')])])).codigo==='formato'&&g.llamar(cuerpo([hoja('X'.repeat(32),[fila('a#1')])])).codigo==='formato'&&g.llamar(cuerpo([hoja('SCALA',[{lotePT:'x'}])])).codigo==='formato'&&g.llamar(cuerpo([],{libro:{nombre:'../../x'}})).codigo==='formato','nombres de hoja o libro no válidos y filas sin clave se rechazan');
  ok(g.archivos.length===0,'ninguna solicitud rechazada dejó rastro en Drive');
}

/* ================= primera sincronización ================= */
const g=google();
{
  const r=g.llamar(cuerpo([hoja('SCALA',[fila('r1#1'),fila('r2#1',{fecha:'2026-10-02',turno:'N',envasado:5808,lotePT:'CF3-02102027'})]),hoja('BELLS',[fila('r3#1',{preforma:''})])]));
  ok(r.ok&&r.libro.nuevo&&r.libro.nombre==='C.P_BIDON_7L-OCTUBRE-2026'&&g.archivos.length===1&&g.archivos[0].carpeta==='CARPETA1','crea el libro del mes dentro de la carpeta indicada');
  const lib=g.archivos[0].libro;
  ok(lib.hojas.map(h=>h.nombre).join()==='SCALA,BELLS','una hoja por marca y se elimina la «Hoja 1» que trae un libro nuevo');
  const s=lib.getSheetByName('SCALA');
  ok(s.get(8,1)==='LOTE PROD'&&s.get(8,18)==='CLAVE GLACIAL'&&s.get(1,2)==='CONTROL DE PORCESO EN EL ENVASADO'&&s.get(1,11)==='CF - CA - F - 047'&&s.get(5,5)==='SCALA'&&s.get(5,12)==='7L'&&s.get(7,2)==='SOPLADO ','la hoja nueva trae el formulario: título, código, PRODUCTO, PRESENTACION, grupos y encabezados');
  ok(s.merges.length===9&&s.ocultas.includes(18)&&s.congeladas===8&&s.imagenes===1,'9 celdas combinadas como el original, clave oculta, encabezado fijo y logo');
  ok(s.get(9,1)==='CF3-01102027'&&s.get(9,5)==='2605008F300'&&s.get(9,7)===6552&&s.get(9,8)===6552&&s.get(9,9)==='30/05-B'&&s.get(9,11)==='0468-26'&&s.get(9,13)==='01/06-B'&&s.get(9,15)===6552&&s.get(9,17)==='D'&&s.get(9,18)==='r1#1','la fila 9 trae lote de producción, lotes de insumo, cantidades, turno y clave');
  ok(s.get(9,16) instanceof Date&&s.get(9,16).getFullYear()===2026&&s.get(9,16).getMonth()===9&&s.get(9,16).getDate()===1,'la fecha es una fecha de verdad (no texto)');
  ok(s.get(10,1)==='CF3-02102027'&&s.get(10,8)===5808&&s.get(10,17)==='N'&&s.get(10,18)==='r2#1','la segunda fila va justo debajo');
  ok(r.hojas[0].creadas===2&&r.hojas[0].actualizadas===0&&r.hojas[1].creadas===1,'informa cuántas filas creó en cada hoja');
  ok([2,3,4,6,10,12,14].every(c=>[9,10].every(f=>s.get(f,c)==='')),'MAN, LAV, LLEN, CIERRE, CONF y ROTUL quedan vacías');
}

/* ================= segunda sincronización: sin duplicar ================= */
{
  const antes=JSON.stringify([...g.archivos[0].libro.getSheetByName('SCALA').celdas]);
  const r=g.llamar(cuerpo([hoja('SCALA',[fila('r1#1'),fila('r2#1',{fecha:'2026-10-02',turno:'N',envasado:5808,lotePT:'CF3-02102027'})]),hoja('BELLS',[fila('r3#1',{preforma:''})])]));
  ok(r.ok&&!r.libro.nuevo&&g.archivos.length===1&&r.hojas[0].creadas===0&&r.hojas[0].actualizadas===2,'repetir la misma sincronización no crea otro libro ni duplica filas (las actualiza)');
  ok(JSON.stringify([...g.archivos[0].libro.getSheetByName('SCALA').celdas])===antes,'y el contenido queda idéntico (idempotente)');
}

/* ================= lo que planta anota no se pierde ================= */
{
  const s=g.archivos[0].libro.getSheetByName('SCALA');
  s.poner(9,2,'OK');s.poner(9,3,'OK');s.poner(9,4,'OK');s.poner(9,6,'1');s.poner(9,10,'C');s.poner(9,12,'C');s.poner(9,14,'C');s.poner(10,2,'NO');
  const r=g.llamar(cuerpo([hoja('SCALA',[fila('r1#1',{envasado:6600,tapa:'31/05-A'}),fila('r2#1',{fecha:'2026-10-02',turno:'N',envasado:5808,lotePT:'CF3-02102027'})]),hoja('BELLS',[fila('r3#1',{preforma:''})])]));
  ok(r.ok&&s.get(9,8)===6600&&s.get(9,9)==='31/05-A','GLACIAL actualiza sus columnas cuando el reporte cambia');
  ok(['OK','OK','OK','1','C','C','C'].every((v,i)=>s.get(9,[2,3,4,6,10,12,14][i])===v)&&s.get(10,2)==='NO','MAN, LAV, LLEN, CIERRE, CONF y ROTUL que anotó planta se respetan');
}

/* ================= filas nuevas y cuadros que desaparecen ================= */
{
  const s=g.archivos[0].libro.getSheetByName('SCALA');
  g.llamar(cuerpo([hoja('SCALA',[fila('r1#1',{envasado:6600,tapa:'31/05-A'}),fila('r2#1',{fecha:'2026-10-02',turno:'N',envasado:5808}),fila('r4#1',{fecha:'2026-10-05',envasado:777})]),hoja('BELLS',[fila('r3#1',{preforma:''})])]));
  ok(s.get(11,18)==='r4#1'&&s.get(11,8)===777&&s.get(9,2)==='OK','una fila nueva se agrega debajo de la última con clave sin mover las existentes');
  const r=g.llamar(cuerpo([hoja('SCALA',[fila('r1#1',{envasado:6600,tapa:'31/05-A'}),fila('r4#1',{fecha:'2026-10-05',envasado:777})]),hoja('BELLS',[fila('r3#1',{preforma:''})])]));
  ok(r.hojas[0].vaciadas===1&&s.get(10,1)===''&&s.get(10,8)===''&&s.get(10,18)==='r2#1'&&s.get(10,2)==='NO'&&s.get(11,8)===777,'un cuadro que desaparece vacía sus columnas de GLACIAL pero conserva su clave, lo que planta anotó y las demás filas (no se borra ni se corre nada)');
  g.llamar(cuerpo([hoja('SCALA',[fila('r1#1',{envasado:6600,tapa:'31/05-A'}),fila('r2#1',{fecha:'2026-10-02',turno:'N',envasado:4000}),fila('r4#1',{fecha:'2026-10-05',envasado:777})]),hoja('BELLS',[fila('r3#1',{preforma:''})])]));
  ok(s.get(10,8)===4000&&s.get(10,2)==='NO'&&s.get(12,18)==='','si el cuadro vuelve, reutiliza su misma fila (no se agrega otra)');
  const r2=g.llamar(cuerpo([hoja('SCALA',[fila('r1#1',{envasado:6600,tapa:'31/05-A'}),fila('r2#1',{fecha:'2026-10-02',turno:'N',envasado:4000}),fila('r4#1',{fecha:'2026-10-05',envasado:777})])]));
  const b=g.archivos[0].libro.getSheetByName('BELLS');
  ok(r2.hojas.some(h=>h.nombre==='BELLS'&&h.vaciadas===1)&&b.get(9,1)===''&&b.get(9,18)==='r3#1','una hoja cuya marca ya no tiene filas ese mes también se vacía (conserva la clave)');
}

/* ================= nunca pisa un libro llenado a mano ================= */
{
  const m=google();
  const manual=m.ctx.SpreadsheetApp.create('C.P_BIDON_7L-OCTUBRE-2026');m.archivos[0].carpeta='CARPETA1';
  const h=manual.insertSheet('SCALA');h.poner(9,1,'CF3-01102027');h.poner(9,5,'2605008F300');h.poner(9,7,6552);
  const r=m.llamar(cuerpo([hoja('SCALA',[fila('r1#1')])]));
  ok(r.ok===false&&r.codigo==='hoja_ajena'&&/no fue creada por GLACIAL/.test(r.error)&&h.get(9,1)==='CF3-01102027'&&h.get(9,5)==='2605008F300'&&h.get(9,7)===6552&&h.get(9,18)==='','si el libro ya existe con una hoja que no creó GLACIAL (el de planta, hecho a mano) se rechaza antes de escribir y no se pierde nada');
  const mixto=m.llamar(cuerpo([hoja('BELLS',[fila('b#1')]),hoja('SCALA',[fila('r1#1')])]));
  ok(mixto.codigo==='hoja_ajena'&&manual.getSheetByName('BELLS')===null,'y tampoco crea las demás hojas a medias');
}

/* ================= otro mes y volumen ================= */
{
  const r=g.llamar(cuerpo([hoja('SCALA',[fila('n1#1')])],{libro:{nombre:'C.P_BIDON_7L-NOVIEMBRE-2026'}}));
  ok(r.ok&&r.libro.nuevo&&g.archivos.length===2&&g.archivos[1].nombre==='C.P_BIDON_7L-NOVIEMBRE-2026'&&g.archivos.every(a=>a.carpeta==='CARPETA1'),'otro mes = otro libro en la misma carpeta');
  const muchas=Array.from({length:60},(_,i)=>fila('m'+i+'#1',{envasado:100+i}));
  const v=google();
  const r2=v.llamar(cuerpo([hoja('SCALA',muchas)]));
  const s=v.archivos[0].libro.getSheetByName('SCALA');
  ok(r2.ok&&r2.hojas[0].creadas===60&&s.get(9+59,18)==='m59#1'&&s.get(9+59,8)===159,'60 filas: pasa de las 22 iniciales sin problema');
  ok(s.bordes.some(b=>b[0]===9+22&&b[2]>=38),'las filas que exceden las 22 iniciales también reciben borde');
  const dup=v.llamar(cuerpo([hoja('SCALA',muchas)]));
  ok(dup.hojas[0].creadas===0&&dup.hojas[0].actualizadas===60,'repetir con 60 filas no duplica ninguna');
}

/* ================= el código no hace de más ================= */
ok(/COLUMNAS_GLACIAL/.test(codigo)&&!/clearContent|deleteRow|deleteRows|\.clear\(/.test(codigo),'el script nunca borra filas ni limpia rangos: solo reescribe las columnas de GLACIAL');
ok(/MIN_SECRETO = 24/.test(codigo)&&/iguales_/.test(codigo)&&/LockService/.test(codigo),'compara la clave en tiempo constante, exige 24 caracteres y usa candado contra ejecuciones simultáneas');
console.log(fallas?('\n'+fallas+' fallas'):'\ntodo correcto');
