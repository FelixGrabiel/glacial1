/* Botón flotante Avance/Cierre y encabezado móvil: posición, arrastre, instancia única, listeners y CSS. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const f29=leer('js/produccion/29-avance-produccion.js');
function extraer(n){const m=new RegExp('function[ ]+'+n+'[ ]*[(]').exec(f29);if(!m)throw new Error('falta '+n);let i=f29.indexOf('{',m.index),d=0,j=i;for(;j<f29.length;j++){if(f29[j]==='{')d++;else if(f29[j]==='}'&&!--d)break;}return f29.slice(m.index,j+1);}

/* ---- entorno con botón simulado ---- */
function boton(){
  const estilos={},clases=new Set(),attrs={},oyentes={};
  return {estilos,clases,attrs,oyentes,
    style:{setProperty(){},removeProperty(p){delete estilos[p];},getPropertyValue(p){return estilos[p]||'';},
      set left(v){estilos.left=v;},set top(v){estilos.top=v;},set right(v){estilos.right=v;},set bottom(v){estilos.bottom=v;},
      get left(){return estilos.left;},get top(){return estilos.top;}},
    classList:{add:c=>clases.add(c),remove:c=>clases.delete(c),contains:c=>clases.has(c)},
    setAttribute:(k,v)=>{attrs[k]=v;},getAttribute:k=>attrs[k],
    getBoundingClientRect:()=>({left:parseFloat(estilos.left)||0,top:parseFloat(estilos.top)||0,width:150,height:48}),offsetWidth:150,offsetHeight:48,
    addEventListener:(t,f)=>{(oyentes[t]=oyentes[t]||[]).push(f);},setPointerCapture(){},releasePointerCapture(){}};
}
function entorno(ancho,guardado){
  const sb={console,Math,Number,Array,Object,String,JSON,innerWidth:ancho,innerHeight:700};
  vm.createContext(sb);
  sb.avNum=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  sb.localStorage={getItem:()=>guardado===undefined?null:JSON.stringify(guardado),setItem(){}};
  sb.matchMedia=q=>({matches:/max-width:700px/.test(q)?sb.innerWidth<=700:false});
  sb.aperturas=0;sb.avAbrirFlotante=()=>{sb.aperturas++;};
  vm.runInContext(['avEsMovil','avNormalizarBotonFlotante','avLimitarPosicionFlotante','avRestaurarPosicionFlotante','avGuardarPosicionFlotante','avActivarArrastre'].map(extraer).join('\n'),sb);
  return sb;
}
const ev=(o)=>Object.assign({pointerType:'touch',button:0,clientX:200,clientY:600,pointerId:1,cancelable:true,preventDefault(){},detail:1},o);

/* 1) primera carga en móvil sin posición guardada */
let sb=entorno(360);let b=boton();
sb.avNormalizarBotonFlotante(b);
ok(b.attrs['data-modo']==='movil'&&b.clases.has('av-floating-movil')&&!b.estilos.left&&!b.estilos.top,'móvil sin posición guardada: modo móvil, sin left/top inline');
/* 2) posición antigua cerca del encabezado + móvil: no se aplica */
sb=entorno(360,{left:120,top:90});b=boton();
sb.avActivarArrastre(b);
ok(!b.estilos.left&&!b.estilos.top&&!b.estilos.right&&!b.estilos.bottom,'móvil con posición antigua guardada (120, 90): NO se escriben coordenadas inline');
sb.avRestaurarPosicionFlotante(b);ok(!b.estilos.left,'avRestaurarPosicionFlotante no hace nada en móvil');
/* 3) escritorio conserva la posición válida y el arrastre */
sb=entorno(1280,{left:120,top:90});b=boton();
sb.avActivarArrastre(b);sb.avNormalizarBotonFlotante(b);
ok(b.attrs['data-modo']==='escritorio'&&b.estilos.left==='120px'&&b.estilos.top==='90px'&&b.estilos.right==='auto','escritorio: se restaura la posición guardada válida (120, 90)');
b.oyentes.pointerdown[0](ev({pointerType:'mouse',clientX:150,clientY:110}));
b.oyentes.pointermove[0](ev({pointerType:'mouse',clientX:300,clientY:210}));
ok(parseFloat(b.estilos.left)>120&&b.clases.has('dragging'),'escritorio: el arrastre sigue funcionando');
b.oyentes.pointerup[0](ev({pointerType:'mouse',clientX:300,clientY:210}));
ok(b.clases.has('dragging')===false,'escritorio: al soltar termina el arrastre');
/* 4) móvil: sin arrastre y un solo toque abre */
sb=entorno(360,{left:120,top:90});b=boton();sb.avActivarArrastre(b);
b.oyentes.pointerdown[0](ev({}));b.oyentes.pointermove[0](ev({clientX:260,clientY:300}));b.oyentes.pointerup[0](ev({clientX:260,clientY:300}));
ok(!b.estilos.left&&!b.estilos.top&&!b.clases.has('dragging')&&sb.aperturas===0,'móvil: arrastrar no mueve el botón ni lo abre por error');
b.oyentes.click[0]({detail:1,preventDefault(){}});
ok(sb.aperturas===1,'móvil: un único toque abre Avance/Cierre (una sola vez)');
/* 5) cambio móvil → escritorio → móvil (giro / tamaño) */
sb=entorno(1280,{left:120,top:90});b=boton();sb.avActivarArrastre(b);sb.avNormalizarBotonFlotante(b);
const enEscritorio=b.estilos.left==='120px';
sb.innerWidth=360;sb.avNormalizarBotonFlotante(b);
const enMovil=!b.estilos.left&&!b.estilos.top&&b.attrs['data-modo']==='movil';
sb.innerWidth=1280;sb.avNormalizarBotonFlotante(b);
ok(enEscritorio&&enMovil&&b.estilos.left==='120px'&&b.attrs['data-modo']==='escritorio','escritorio → móvil → escritorio: se limpian las coordenadas en móvil y se restauran después (sin mezclarlas)');
/* 6) posición guardada inválida/fuera de pantalla se acomoda */
sb=entorno(1280,{left:99999,top:99999});b=boton();sb.avActivarArrastre(b);
ok(parseFloat(b.estilos.left)<=1280&&parseFloat(b.estilos.top)<=700,'escritorio: una posición fuera de pantalla se limita a la ventana');

/* 7) instalación: una sola instancia, listeners una vez, permiso y sesión */
const inst=extraer('avInstalarBotonFlotante'),enl=extraer('avEnlazarNormalizacionFlotante');
ok(/querySelectorAll\('#av-floating-trigger,\.av-floating-trigger'\)/.test(inst)&&/todos\[i\]\.remove\(\)/.test(inst),'avInstalarBotonFlotante elimina instancias duplicadas');
ok(/window\.__avFlotanteEnlazado/.test(enl)&&/if\(window\.__avFlotanteEnlazado\)return/.test(enl),'los listeners de resize/orientación se registran una sola vez');
ok(/!state\?\.user\|\|!tienePermiso\('avanceProduccion'\)\|\|!avPantallaOperativaVisible\(\)/.test(inst),'se conservan las comprobaciones de sesión, permiso y pantalla operativa');
ok(/addEventListener\('resize'/.test(enl)&&/orientationchange/.test(enl)&&/matchMedia/.test(enl),'se normaliza al cambiar de tamaño, al girar y al cruzar el punto de corte móvil');

/* 8) CSS: ubicación móvil fija, compacta y por encima del contenido */
const css=f29;
ok(/#av-floating-trigger\.av-floating-trigger\{position:fixed!important;left:auto!important;top:auto!important;right:max\(14px,env\(safe-area-inset-right\)\)!important;bottom:calc\(14px \+ env\(safe-area-inset-bottom\)\)!important;height:48px/.test(css),'CSS móvil: fijo abajo a la derecha, 48 px de alto, con área segura (también protege si hubiera estilos inline)');
ok(/\.av-floating-trigger\[data-modo="movil"\] \.av-drag-handle\{display:none\}/.test(css)&&/#av-floating-trigger \.av-drag-handle\{display:none\}/.test(css),'en móvil se oculta el asa de arrastre');
ok(/body\.av-modal-open #av-floating-trigger\{visibility:hidden;pointer-events:none\}/.test(css),'con un modal abierto el disparador se oculta y no intercepta toques');
ok(/body\.av-con-flotante #app-screen \.shell>\.main\{padding-bottom:calc\(84px \+ env\(safe-area-inset-bottom\)\)!important\}/.test(css),'se reserva espacio al final del contenido mientras exista el botón');
ok(/<b>Avance \/ Cierre<\/b>/.test(f29)&&/aria-label','Abrir Avance y Cierre de turno'/.test(f29),'texto «Avance / Cierre» y nombre accesible');

/* 9) encabezado móvil */
const html=leer('index.html'),mob=leer('mobile-glacial.css');
ok(/<div class="topbar-title" title="Reporte Diario de Producción">/.test(html)&&/<span class="tt-full">Reporte Diario de Producción<\/span><span class="tt-short" aria-hidden="true">GLACIAL · Producción<\/span>/.test(html),'título: nombre completo accesible + versión corta «GLACIAL · Producción»');
ok(/\.tt-short\{display:none\}/.test(mob)&&/#app-screen \.topbar-title \.tt-full\{position:absolute;width:1px/.test(mob)&&/#app-screen \.topbar-title \.tt-short\{display:inline\}/.test(mob),'en móvil se muestra la versión corta y el nombre completo queda solo para lectores de pantalla');
ok(/#app-screen \.topbar-title\{flex:1 1 auto;min-width:0;overflow:hidden\}/.test(mob),'el contenedor del título se reduce (min-width:0) en lugar de empujar los botones');
ok(/grid-template-columns:44px minmax\(0,1fr\) 44px 44px !important/.test(mob)&&/\.btn-topbar\.topbar-logout\{width:44px !important;min-width:44px !important;height:44px !important/.test(mob),'menú, campana y salida reservan 44 × 44 px y no se encogen');
ok(/\.al-badge\{position:absolute;top:-5px;right:-5px/.test(mob)&&/\.al-bar\{min-height:44px!important;position:relative;overflow:visible!important\}/.test(mob),'el badge de la campana queda en su esquina sin recortarse');
ok(!/html\s*,\s*body[^{]*\{[^}]*overflow-x:\s*hidden/.test(mob.split('GLACIAL · ENCABEZADO MÓVIL')[1]||''),'la corrección no oculta el desbordamiento de toda la página');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
