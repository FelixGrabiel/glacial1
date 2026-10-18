/* Comprueba que cada src/href local de index.html y de tests/visual/*.html existe en disco (0 faltantes).
   Uso: node tests/verificar-rutas.js */
'use strict';
const fs=require('fs'),path=require('path');
const raiz=path.resolve(__dirname,'..');
const paginas=['index.html',...fs.readdirSync(path.join(__dirname,'visual')).filter(f=>f.endsWith('.html')).map(f=>'tests/visual/'+f)];
let faltan=0,total=0;
for(const p of paginas){
  const s=fs.readFileSync(path.join(raiz,p),'utf8');
  const base=(s.match(/<base\s+href=["']([^"']+)["']/i)||[])[1]; // <base href="/"> hace que las rutas cuenten desde la raíz del servidor
  for(const m of s.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)){
    let r=m[1].split('?')[0].split('#')[0];
    if(!r||/^([a-z]+:|\/\/|data:|#|javascript:)/i.test(r)||/^(mailto|tel):/.test(r))continue;
    total++;
    const abs=r.startsWith('/')||base==='/'?path.join(raiz,r):path.resolve(path.dirname(path.join(raiz,p)),r);
    if(!fs.existsSync(abs)){faltan++;console.log('✘ falta '+r+'  ← '+p);}
  }
}
console.log((faltan?'✘ ':'✔ ')+total+' rutas revisadas, '+faltan+' faltantes');
process.exit(faltan?1:0);
