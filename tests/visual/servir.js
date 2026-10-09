/* Servidor estático mínimo para la validación visual (tests/visual/reporte-linea.html). Uso: node tests/visual/servir.js */
const http=require('http'),fs=require('fs'),path=require('path');
const RAIZ=path.resolve(__dirname,'..','..'),PUERTO=Number(process.env.PORT)||5599;
const TIPOS={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.json':'application/json'};
http.createServer((req,res)=>{
  const ruta=path.join(RAIZ,decodeURIComponent(req.url.split('?')[0]));
  if(!ruta.startsWith(RAIZ)||!fs.existsSync(ruta)||fs.statSync(ruta).isDirectory()){res.writeHead(404);return res.end('no encontrado');}
  res.writeHead(200,{'Content-Type':TIPOS[path.extname(ruta)]||'application/octet-stream'});fs.createReadStream(ruta).pipe(res);
}).listen(PUERTO,()=>console.log('http://localhost:'+PUERTO));
