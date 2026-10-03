# GLACIAL · Índice del proyecto

Aplicación web (HTML + JS sin módulos ni empaquetador) con Firebase Auth y Firestore.
Las funciones son **globales** y varios archivos redefinen funciones de otros, por eso
**el orden de carga en `index.html` es parte del código y no debe cambiarse**.

## Estructura

```
index.html                      Página única; carga los scripts en orden
styles.css · tareo.css          Estilos
sidebar-glacial.css · mobile-glacial.css
img/                            Imágenes (logo)
json/                           cors.json, data_personal.json
functions/                      Cloud Functions de ejemplo (PIN de técnicos), no se despliegan solas
firestore.rules.*.txt           Reglas de Firestore: etapa1 (abiertas) y etapa2 (estrictas, archivo final; incluye el rol de Mantenimiento)
js/
  nucleo/         base de la app
  accesos/        inicio de sesión, usuarios y permisos
  produccion/     registro, paletas, programación, semáforo, avance, resúmenes
  personal/       trabajadores, tareo y rotación de supervisores
  mantenimiento/  módulo de Mantenimiento y cuenta compartida
  rrhh/           módulo de RRHH y exportaciones
```

## Qué hace cada archivo

### js/nucleo/
| Archivo | Función |
|---|---|
| 00-logo.js | Logo en base64 para portadas de Excel. **No se carga** en `index.html` (pendiente de decidir) |
| 01-config.js | Configuración de Firebase, banderas de seguridad, catálogos |
| 02-estado.js | Estado global, permisos, sincronización con Firestore |
| 04-sidebar.js | Menú lateral y navegación |
| 05-utils.js | Utilidades comunes |
| 12-init.js | Arranque de la app (siempre el último script) |
| 34-integraciones.js | Google Sheets y WhatsApp |

### js/accesos/
| Archivo | Función |
|---|---|
| 03-auth.js | Inicio y cierre de sesión |
| 10-usuarios.js | Gestión de usuarios y permisos |
| 17-modo-trabajo.js | Modo Visualizar / Trabajar |
| 23-gerente-solo-lecutra.js | Roles de solo consulta (Gerencia/Jefatura) |
| 32-dashboard-perfiles.js | Inicio ejecutivo y operativo según perfil |
| 36-seguridad-auth.js | Cuentas seguras con Firebase Authentication |
| 39-vista-como.js | "Ver como" para el Administrador (solo lectura) |

### js/produccion/
| Archivo | Función |
|---|---|
| 06-registro.js | Nuevo registro de producción |
| 07-historial.js | Historial de registros |
| 08-graficos.js | Gráficos y Excel por línea |
| 09-resumen.js | Resumen de producción |
| 14-exportar-general.js | Exportación general de planta |
| 15-perdidas-soles.js | Impacto económico de paradas |
| 16-paletas.js | Paletas en tiempo real |
| 21-programacion-turno.js | Programación del turno |
| 22-impacto-para-pegar.js | Complemento del impacto económico |
| 23b-tiempos-linea.js | Cálculo central de tiempos y ratios por línea |
| 24-semaforo-produccion-actual.js | Producción actual y semáforo de líneas |
| 25-alertas-lineas.js | Alertas de líneas |
| 29-avance-produccion.js | Avance y cierre de turno |
| 35-autollenado-registro.js | Autollenado del registro desde paletas/paradas |

### js/personal/
| Archivo | Función |
|---|---|
| 11-trabajadores.js | Gestión de trabajadores |
| 13-tareo.js | Tareo, historial, resumen mensual, rotación semanal |
| 20-tareo-control.js | Control de descansos y auditoría del tareo |
| 28-tareo-maquinistas.js | Reglas de maquinistas y técnicos en el tareo |
| 31-rotacion-supervisores.js | Rotación de supervisores |
| 40-tareo-auditoria.js | Registra en `auditoriaTareos` quién cambió qué en un tareo (solo crea eventos) |
| 41-tareo-bloqueo.js | Bloqueo de tareos por plazo (hora del servidor), correcciones de RRHH con motivo y solicitudes |
| 42-tareo-agregar-personal.js | Agregar personal al tareo (ya registrado o personal nuevo) en Producción y Mantenimiento |

### js/mantenimiento/
| Archivo | Función |
|---|---|
| 18-mantenimiento.js | Módulo de Mantenimiento |
| 30-rotacion-mantenimiento.js | Rotación semanal de Mantenimiento |
| 33-rotacion-maquinistas.js | Rotación semanal de maquinistas |
| 37-mantenimiento-tecnicos.js | Cuenta compartida de Mantenimiento (rol y permisos) |
| 37b-mantenimiento-identificacion.js | Identificación del técnico con PIN |

### js/rrhh/
| Archivo | Función |
|---|---|
| 19-rrhh.js | Módulo de RRHH |
| 26-rrhh-panel.js | Panel de RRHH |
| 27-rrhh-excel-operativo.js | Excel operativo anterior (la exportación actual la reemplaza el 38) |
| 38-tareo-rrhh-exportacion.js | Lista única del tareo, grupos de RRHH, Excel e imagen |

## Orden de carga (el de `index.html`)

1. nucleo/01-config.js
2. nucleo/02-estado.js
3. accesos/03-auth.js
4. nucleo/04-sidebar.js
5. nucleo/05-utils.js
6. produccion/06-registro.js
7. produccion/07-historial.js
8. produccion/08-graficos.js
9. produccion/09-resumen.js
10. accesos/10-usuarios.js
11. personal/11-trabajadores.js
12. produccion/15-perdidas-soles.js
13. produccion/22-impacto-para-pegar.js
14. produccion/16-paletas.js
15. accesos/17-modo-trabajo.js
16. mantenimiento/18-mantenimiento.js
17. rrhh/19-rrhh.js
18. produccion/14-exportar-general.js
19. personal/13-tareo.js
20. personal/20-tareo-control.js
21. produccion/21-programacion-turno.js
22. accesos/23-gerente-solo-lecutra.js
23. produccion/23b-tiempos-linea.js
24. produccion/24-semaforo-produccion-actual.js
25. produccion/25-alertas-lineas.js
26. rrhh/26-rrhh-panel.js
27. rrhh/27-rrhh-excel-operativo.js
28. personal/28-tareo-maquinistas.js
29. produccion/29-avance-produccion.js
30. mantenimiento/30-rotacion-mantenimiento.js
31. mantenimiento/33-rotacion-maquinistas.js
32. personal/31-rotacion-supervisores.js
33. accesos/32-dashboard-perfiles.js
34. produccion/35-autollenado-registro.js
35. nucleo/34-integraciones.js
36. accesos/36-seguridad-auth.js
37. mantenimiento/37-mantenimiento-tecnicos.js
38. mantenimiento/37b-mantenimiento-identificacion.js
39. rrhh/38-tareo-rrhh-exportacion.js
40. personal/42-tareo-agregar-personal.js
41. personal/40-tareo-auditoria.js
42. personal/41-tareo-bloqueo.js
43. accesos/39-vista-como.js
44. nucleo/12-init.js

## Cómo agregar un archivo nuevo

1. Elige la carpeta por **área funcional** (nucleo, accesos, produccion, personal, mantenimiento o rrhh).
2. Nómbralo con el siguiente número libre (`40-...js`). El número no define el orden de carga.
3. Agrega su `<script src="js/<carpeta>/<archivo>.js?v=...">` en `index.html` **después** de los
   archivos cuyas funciones redefine o usa al cargarse, y **antes de `nucleo/12-init.js`**, que debe seguir siendo el último.
4. Si el archivo envuelve una función existente (`const anterior = fn; fn = function(){...}`), debe cargarse después del archivo que la define.
5. Sube el `?v=` de la etiqueta cuando cambies el archivo, para evitar caché.
6. Si agrega documentos a Firestore, actualiza las reglas (`firestore.rules.*.txt`).

## Verificar rutas (PowerShell)

```powershell
$rutas = Select-String -Path index.html -Pattern 'src="(js/[^"?]+)' | ForEach-Object { $_.Matches[0].Groups[1].Value }
$faltan = $rutas | Where-Object { -not (Test-Path $_) }
if ($faltan) { "FALTAN:"; $faltan } else { "OK: $($rutas.Count) scripts existen en disco" }
```

## Entornos (PRODUCCIÓN y PRUEBAS)

`js/nucleo/01-config.js` guarda las dos configuraciones de Firebase y elige sola:

| Dirección de la página | Entorno | Proyecto Firebase |
|---|---|---|
| solo los dominios de `DOMINIOS_PRODUCCION` (hoy `felixgrabiel.github.io`) | PRODUCCION | `jefaturaopglacial-fdb95` |
| cualquier otra: `localhost`, `127.0.0.1`, `file://`, IPs de red local, otros dominios | PRUEBAS | `pruebas-b11b7` |

Falla hacia el lado seguro: un dominio nuevo que no esté en la lista abre en PRUEBAS. Para publicar en otro
dominio, agrégalo a `DOMINIOS_PRODUCCION` en `js/nucleo/01-config.js`.

En PRUEBAS: `SHEETS_URL` y `SHEETS_CLAVE` quedan vacías (no se escribe en la hoja real), aparece una franja roja
"BASE DE PRUEBAS" y el título de la pestaña empieza con `[PRUEBAS]`. Al iniciar, la consola del navegador muestra
qué proyecto se usa.
