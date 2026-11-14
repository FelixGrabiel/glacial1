/* Login · carrusel de la izquierda (css/login-glacial.css). Texto fijo: no lee datos de planta ni de usuarios.
   Cambia solo cada 6 s; se pausa con el mouse o el foco dentro del carrusel; flechas, puntos, teclas ← → y deslizar con el dedo;
   si el sistema pide menos animación, no avanza solo. No corre mientras la pantalla de ingreso está oculta ni con la pestaña en segundo plano. */
(function(){
  'use strict';
  var box=document.getElementById('login-carrusel');if(!box)return;
  var slides=[].slice.call(box.querySelectorAll('.lg-slide')),dots=box.querySelector('.lg-dots'),prog=box.querySelector('.lg-prog i');
  if(!slides.length||!dots||!prog)return;
  var T=6000,i=0,timer=null,pausado=false;
  var reducido=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  prog.style.setProperty('--t',T+'ms');
  slides.forEach(function(_,k){var b=document.createElement('button');b.type='button';b.setAttribute('aria-label','Ir a la diapositiva '+(k+1));b.onclick=function(){ir(k)};dots.appendChild(b);});
  var login=document.getElementById('login-screen');
  var visible=function(){return !!login&&login.style.display!=='none'&&!document.hidden&&getComputedStyle(login).display!=='none';};
  function pintar(){
    slides.forEach(function(s,k){s.classList.toggle('on',k===i);s.setAttribute('aria-hidden',k===i?'false':'true');});
    [].forEach.call(dots.children,function(b,k){b.classList.toggle('on',k===i);if(k===i)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');});
  }
  function arrancar(){
    clearTimeout(timer);prog.classList.remove('corre');void prog.offsetWidth;
    if(reducido||!visible())return;
    prog.classList.add('corre');prog.classList.toggle('pausa',pausado);
    if(!pausado)timer=setTimeout(function(){ir(i+1);},T);
  }
  function ir(k){i=(k+slides.length)%slides.length;pintar();arrancar();}
  function pausar(v){pausado=v;if(v){clearTimeout(timer);prog.classList.add('pausa');}else arrancar();}
  box.querySelector('[data-lg="sig"]').onclick=function(){ir(i+1);};
  box.querySelector('[data-lg="ant"]').onclick=function(){ir(i-1);};
  box.addEventListener('mouseenter',function(){pausar(true);});box.addEventListener('mouseleave',function(){pausar(false);});
  box.addEventListener('focusin',function(){pausar(true);});box.addEventListener('focusout',function(){pausar(false);});
  document.addEventListener('keydown',function(e){
    var t=e.target&&e.target.tagName;if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT'||!visible())return;
    if(e.key==='ArrowRight')ir(i+1);else if(e.key==='ArrowLeft')ir(i-1);
  });
  var x0=null;
  box.addEventListener('touchstart',function(e){x0=e.touches[0].clientX;},{passive:true});
  box.addEventListener('touchend',function(e){if(x0===null)return;var d=e.changedTouches[0].clientX-x0;if(Math.abs(d)>40)ir(i+(d<0?1:-1));x0=null;});
  document.addEventListener('visibilitychange',function(){if(document.hidden)clearTimeout(timer);else if(!pausado)arrancar();});
  // al volver a mostrar el login (cerrar sesión), el carrusel retoma
  if(login&&window.MutationObserver)new MutationObserver(function(){if(visible()&&!timer)arrancar();else if(!visible())clearTimeout(timer),timer=null;}).observe(login,{attributes:true,attributeFilter:['style']});
  pintar();arrancar();
})();
