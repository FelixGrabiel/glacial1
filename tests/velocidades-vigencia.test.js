/* Velocidad estándar con vigencia e historial (js/nucleo/45b-velocidades-vigencia.js). node tests/velocidades-vigencia.test.js */
'use strict';
const V=require('../js/nucleo/45b-velocidades-vigencia.js');
let fallas=0,total=0;
const ok=(c,t)=>{total++;console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const K='PET1|Pack_Regular_2.5Lx6und';
const cfg0=()=>({velocidades:{[K]:1920,'PET1|Pack_Regular_SC_1Lx12und/lN':2400}});
const ahora=Date.UTC(2026,9,30,15,0);

/* sin historial */
{
  const v=V.vigente(cfg0(),K);
  ok(v.valor===1920&&v.desde===''&&V.historial(cfg0(),K).length===0,'sin vigencia ni historial: vigente 1.920, sin desde y sin historial');
  ok(V.velocidadEn(cfg0(),K,'2026-01-01')===1920&&V.velocidadEn(cfg0(),'PET9|nada','2026-01-01')===null,'sin historial siempre devuelve la vigente (o null si no existe)');
  ok(V.vigente(cfg0(),'pet1|pack_regular_2.5lx6und').valor===1920,'la clave no distingue mayúsculas ni espacios');
}
/* primer cambio */
let cfg=cfg0();
{
  const r=V.prepararCambio(cfg,K,{valor:2050,desde:'2026-10-30',por:'mant1',motivo:'Medición de tres turnos',ahoraMs:ahora});
  ok(!r.error&&r.anterior===1920&&r.nuevo===2050&&r.clave===K,'cambio válido: de 1.920 a 2.050');
  ok(r.patch.velocidades[K]===2050&&r.patch.velocidadesVigencia[K].desde==='2026-10-30'&&r.patch.velocidadesVigencia[K].por==='mant1','el patch trae la velocidad nueva y su vigencia');
  const h=r.patch.velocidadesHistorial[K];
  ok(h.length===1&&h[0].valor===1920&&h[0].reemplazadoPor==='mant1'&&h[0].motivoCambio==='Medición de tres turnos','lo anterior (1.920) pasa al historial con quién y por qué lo reemplazó');
  cfg=Object.assign({},cfg0(),{velocidades:Object.assign({},cfg0().velocidades,r.patch.velocidades),velocidadesVigencia:r.patch.velocidadesVigencia,velocidadesHistorial:r.patch.velocidadesHistorial});
  ok(V.vigente(cfg,K).valor===2050&&V.vigente(cfg,K).desde==='2026-10-30','tras aplicar: vigente 2.050 desde 30/10');
}
/* segundo cambio: se acumula el historial con su periodo */
{
  const r=V.prepararCambio(cfg,K,{valor:2100,desde:'2026-11-10',por:'admin',motivo:'Cambio de sopladora',ahoraMs:ahora});
  const h=r.patch.velocidadesHistorial[K];
  ok(!r.error&&h.length===2&&h[1].valor===2050&&h[1].desde==='2026-10-30'&&h[1].hasta==='2026-11-09','el segundo cambio guarda 2.050 con su periodo (30/10 al 09/11)');
  const cfg2=Object.assign({},cfg,{velocidades:Object.assign({},cfg.velocidades,r.patch.velocidades),velocidadesVigencia:r.patch.velocidadesVigencia,velocidadesHistorial:r.patch.velocidadesHistorial});
  const hist=V.historial(cfg2,K);
  ok(hist.length===2&&hist[0].valor===2050&&hist[1].valor===1920,'el historial se muestra del más reciente al más antiguo');
  ok(V.velocidadEn(cfg2,K,'2026-11-15')===2100&&V.velocidadEn(cfg2,K,'2026-11-09')===2050&&V.velocidadEn(cfg2,K,'2026-10-31')===2050,'velocidad en una fecha: la que regía ese día');
  ok(V.velocidadEn(cfg2,K,'2026-10-29')===1920&&V.velocidadEn(cfg2,K,'2026-01-01')===1920,'antes del primer cambio: 1.920 (la más antigua conocida)');
  ok(V.velocidadEn(cfg2,K,'no-es-fecha')===2100&&V.velocidadEn(cfg2,K,undefined)===2100,'fecha inválida o ausente: la vigente');
}
/* validaciones */
{
  const base={valor:2050,desde:'2026-10-30',por:'mant1',motivo:'Medición real',ahoraMs:ahora};
  const e=o=>V.prepararCambio(cfg0(),K,Object.assign({},base,o)).error||'';
  ok(/mayor que cero/.test(e({valor:0}))&&/mayor que cero/.test(e({valor:'abc'}))&&/mayor que cero/.test(e({valor:-5}))&&/máximo/.test(e({valor:9e9})),'rechaza cero, texto, negativos y valores absurdos');
  ok(/entero/.test(e({valor:2050.5})),'rechaza decimales');
  ok(/fecha/.test(e({desde:'30/10/2026'}))&&/fecha/.test(e({desde:'2026-02-31'})),'rechaza fechas inválidas');
  ok(/motivo/.test(e({motivo:'  '}))&&/motivo/.test(e({motivo:'ok'})),'el motivo es obligatorio (mínimo 5 letras)');
  ok(/quién/.test(e({por:''})),'se necesita saber quién cambia');
  ok(/ya es/.test(e({valor:1920})),'no hace cambios sin diferencia');
  ok(/línea y el formato/.test(V.prepararCambio(cfg0(),'',base).error),'se necesita la clave');
  const conVig=Object.assign(cfg0(),{velocidadesVigencia:{[K]:{desde:'2026-10-30',por:'a',en:1,motivo:'x'}}});
  ok(/antes de la vigente/.test(V.prepararCambio(conVig,K,Object.assign({},base,{valor:2060,desde:'2026-10-20'})).error||''),'no empieza antes de la vigente');
}
/* formato nuevo sin valor previo: no hay nada que mandar al historial */
{
  const r=V.prepararCambio({velocidades:{}},'B7L|7 Litros',{valor:650,desde:'2026-10-30',por:'admin',motivo:'Primera carga',ahoraMs:ahora});
  ok(!r.error&&r.anterior===null&&r.patch.velocidadesHistorial['B7L|7 Litros'].length===0,'primera carga de un formato: historial vacío');
}
/* respeta la clave exacta existente y no modifica sus entradas */
{
  const c=Object.freeze({velocidades:Object.freeze({'PET1|Pack_Regular_2.5Lx6und':1920})});
  const r=V.prepararCambio(c,'pet1|pack_regular_2.5lx6und',{valor:2000,desde:'2026-10-30',por:'a',motivo:'Prueba medida',ahoraMs:ahora});
  ok(r.clave==='PET1|Pack_Regular_2.5Lx6und'&&Object.keys(r.patch.velocidades)[0]==='PET1|Pack_Regular_2.5Lx6und','usa la clave tal como está escrita en la tabla');
  ok(V.partesDeClave('B7L|10 Litros|FONTLIFE').marca==='FONTLIFE'&&V.partesDeClave(K).linea==='PET1','separa línea, presentación y marca de la clave');
}
console.log('\n'+(total-fallas)+' de '+total+' pruebas correctas'+(fallas?' · '+fallas+' FALLAN':''));
