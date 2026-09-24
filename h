[35mindex.html[m[36m:[m[32m769[m[36m:[m            .[1;31mpassword[m-toggle {
[35mindex.html[m[36m:[m[32m798[m[36m:[m            .[1;31mpassword[m-toggle:hover {
[35mindex.html[m[36m:[m[32m2295[m[36m:[m                            type="[1;31mpassword[m"
[35mindex.html[m[36m:[m[32m2296[m[36m:[m                            autocomplete="current-[1;31mpassword[m"
[35mindex.html[m[36m:[m[32m2303[m[36m:[m                            class="[1;31mpassword[m-toggle"
[35mindex.html[m[36m:[m[32m2304[m[36m:[m                            id="[1;31mpassword[m-toggle"
[35mindex.html[m[36m:[m[32m2306[m[36m:[m                            onclick="toggle[1;31mPassword[m()"
[35mindex.html[m[36m:[m[32m2881[m[36m:[m        function toggle[1;31mPassword[m() {
[35mindex.html[m[36m:[m[32m2883[m[36m:[m            const [1;31mpassword[m =
[35mindex.html[m[36m:[m[32m2887[m[36m:[m                document.getElementById("[1;31mpassword[m-toggle");
[35mindex.html[m[36m:[m[32m2889[m[36m:[m            if (![1;31mpassword[m || !button) {
[35mindex.html[m[36m:[m[32m2893[m[36m:[m            if ([1;31mpassword[m.type === "[1;31mpassword[m") {
[35mindex.html[m[36m:[m[32m2895[m[36m:[m                [1;31mpassword[m.type = "text";
[35mindex.html[m[36m:[m[32m2906[m[36m:[m                [1;31mpassword[m.type = "[1;31mpassword[m";
[35mjs/02-estado.js[m[36m:[m[32m179[m[36m:[m      username:'admin',[1;31mpassword[m:'admin123',rol:'Administrador',
[35mjs/02-estado.js[m[36m:[m[32m184[m[36m:[m      username:'jefe',[1;31mpassword[m:'jefe123',rol:'Jefe de Producción',
[35mjs/02-estado.js[m[36m:[m[32m189[m[36m:[m      username:'supervisor',[1;31mpassword[m:'supervisor123',rol:'Supervisor',
[35mjs/03-auth.js[m[36m:[m[32m51[m[36m:[m  let [1;31mpassword[mCorrecta = false;
[35mjs/03-auth.js[m[36m:[m[32m55[m[36m:[m    if(found.[1;31mpassword[mHash && found.salt){
[35mjs/03-auth.js[m[36m:[m[32m60[m[36m:[m        await calcularHash[1;31mPassword[m(pass, found.salt);
[35mjs/03-auth.js[m[36m:[m[32m62[m[36m:[m      [1;31mpassword[mCorrecta =
[35mjs/03-auth.js[m[36m:[m[32m63[m[36m:[m        (intento === found.[1;31mpassword[mHash);
[35mjs/03-auth.js[m[36m:[m[32m65[m[36m:[m    } else if(found.[1;31mpassword[m){
[35mjs/03-auth.js[m[36m:[m[32m74[m[36m:[m      [1;31mpassword[mCorrecta =
[35mjs/03-auth.js[m[36m:[m[32m75[m[36m:[m        (found.[1;31mpassword[m === pass);
[35mjs/03-auth.js[m[36m:[m[32m77[m[36m:[m      if([1;31mpassword[mCorrecta){
[35mjs/03-auth.js[m[36m:[m[32m78[m[36m:[m        await migrarUsuarioA[1;31mPassword[mSeguro(found);
[35mjs/03-auth.js[m[36m:[m[32m86[m[36m:[m  if(!found || ![1;31mpassword[mCorrecta){
[35mjs/03-auth.js[m[36m:[m[32m157[m[36m:[m   correctamente. Reemplaza el campo "[1;31mpassword[m" por
[35mjs/03-auth.js[m[36m:[m[32m158[m[36m:[m   "salt" + "[1;31mpassword[mHash" tanto en Firestore como en el
[35mjs/03-auth.js[m[36m:[m[32m162[m[36m:[masync function migrarUsuarioA[1;31mPassword[mSeguro(usuario){
[35mjs/03-auth.js[m[36m:[m[32m165[m[36m:[m    await crearCredencial[1;31mPassword[m(usuario.[1;31mpassword[m);
[35mjs/03-auth.js[m[36m:[m[32m177[m[36m:[m  delete users[idx].[1;31mpassword[m;
[35mjs/03-auth.js[m[36m:[m[32m180[m[36m:[m  users[idx].[1;31mpassword[mHash = cred.[1;31mpassword[mHash;
[35mjs/03-auth.js[m[36m:[m[32m187[m[36m:[m  delete usuario.[1;31mpassword[m;
[35mjs/03-auth.js[m[36m:[m[32m190[m[36m:[m  usuario.[1;31mpassword[mHash = cred.[1;31mpassword[mHash;
[35mjs/05-utils.js[m[36m:[m[32m1496[m[36m:[m     - [1;31mpassword[mHash: resultado de aplicar PBKDF2 (SHA-256,
[35mjs/05-utils.js[m[36m:[m[32m1537[m[36m:[masync function calcularHash[1;31mPassword[m([1;31mpassword[m, saltHex){
[35mjs/05-utils.js[m[36m:[m[32m1543[m[36m:[m    enc.encode([1;31mpassword[m),
[35mjs/05-utils.js[m[36m:[m[32m1566[m[36m:[m   salt nuevo y devuelve {salt, [1;31mpassword[mHash} listos para
[35mjs/05-utils.js[m[36m:[m[32m1571[m[36m:[masync function crearCredencial[1;31mPassword[m([1;31mpassword[m){
[35mjs/05-utils.js[m[36m:[m[32m1575[m[36m:[m  const [1;31mpassword[mHash =
[35mjs/05-utils.js[m[36m:[m[32m1576[m[36m:[m    await calcularHash[1;31mPassword[m([1;31mpassword[m, salt);
[35mjs/05-utils.js[m[36m:[m[32m1578[m[36m:[m  return { salt, [1;31mpassword[mHash };
[35mjs/05-utils.js[m[36m:[m[32m1591[m[36m:[m    [1;31mpassword[m,
[35mjs/05-utils.js[m[36m:[m[32m1592[m[36m:[m    [1;31mpassword[mHash,
[35mjs/10-usuarios.js[m[36m:[m[32m101[m[36m:[m              onclick="migrarTodasLas[1;31mPassword[ms()">
[35mjs/10-usuarios.js[m[36m:[m[32m154[m[36m:[m                id="nu-[1;31mpassword[m"
[35mjs/10-usuarios.js[m[36m:[m[32m859[m[36m:[m  const [1;31mpassword[m=
[35mjs/10-usuarios.js[m[36m:[m[32m861[m[36m:[m      'nu-[1;31mpassword[m'
[35mjs/10-usuarios.js[m[36m:[m[32m934[m[36m:[m    ![1;31mpassword[m ||
[35mjs/10-usuarios.js[m[36m:[m[32m986[m[36m:[m    await crearCredencial[1;31mPassword[m(
[35mjs/10-usuarios.js[m[36m:[m[32m987[m[36m:[m      [1;31mpassword[m
[35mjs/10-usuarios.js[m[36m:[m[32m1000[m[36m:[m    [1;31mpassword[mHash:
[35mjs/10-usuarios.js[m[36m:[m[32m1001[m[36m:[m      cred.[1;31mpassword[mHash,
[35mjs/10-usuarios.js[m[36m:[m[32m1037[m[36m:[m    'nu-[1;31mpassword[m'
[35mjs/10-usuarios.js[m[36m:[m[32m1572[m[36m:[masync function migrarTodasLas[1;31mPassword[ms(){
[35mjs/10-usuarios.js[m[36m:[m[32m1600[m[36m:[m      !u.[1;31mpassword[mHash &&
[35mjs/10-usuarios.js[m[36m:[m[32m1601[m[36m:[m      u.[1;31mpassword[m
[35mjs/10-usuarios.js[m[36m:[m[32m1605[m[36m:[m        await crearCredencial[1;31mPassword[m(
[35mjs/10-usuarios.js[m[36m:[m[32m1606[m[36m:[m          u.[1;31mpassword[m
[35mjs/10-usuarios.js[m[36m:[m[32m1610[m[36m:[m      delete u.[1;31mpassword[m;
[35mjs/10-usuarios.js[m[36m:[m[32m1617[m[36m:[m      u.[1;31mpassword[mHash=
[35mjs/10-usuarios.js[m[36m:[m[32m1618[m[36m:[m        cred.[1;31mpassword[mHash;
