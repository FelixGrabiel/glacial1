/* Corre todas las pruebas (tests/*.test.js) y resume el resultado.
   Uso: node tests/correr-todo.js            → todas
        node tests/correr-todo.js tareo plan → solo las que contienen esas palabras
   Sale con código 1 si alguna falla. */
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const dir=__dirname,raiz=path.resolve(dir,'..');
const filtros=process.argv.slice(2);
const pruebas=fs.readdirSync(dir).filter(f=>f.endsWith('.test.js')).sort()
  .filter(f=>!filtros.length||filtros.some(p=>f.includes(p)));
if(!pruebas.length){console.log('No hay pruebas que coincidan.');process.exit(1);}
const fallidas=[];const t0=Date.now();
for(const f of pruebas){
  const r=spawnSync(process.execPath,[path.join(dir,f)],{cwd:raiz,encoding:'utf8'});
  const bien=r.status===0;
  console.log((bien?'✔ ':'✘ ')+f);
  if(!bien)fallidas.push({f,salida:((r.stdout||'')+(r.stderr||'')).split('\n').filter(l=>!l.startsWith('✔ ')).join('\n').trim()});
}
for(const x of fallidas)console.log('\n── '+x.f+' ──\n'+x.salida);
/* Algunas pruebas comparan con commits antiguos (git show <hash>): en un clon superficial fallan por eso. */
if(fallidas.some(x=>/invalid object name|bad object/.test(x.salida)))
  console.log('\nAviso: faltan commits antiguos en este clon. Ejecuta «git fetch --unshallow» y vuelve a correr.');
console.log('\n'+(pruebas.length-fallidas.length)+' de '+pruebas.length+' pruebas correctas ('+((Date.now()-t0)/1000).toFixed(1)+' s)'+(fallidas.length?' · '+fallidas.length+' con fallas':''));
process.exit(fallidas.length?1:0);
