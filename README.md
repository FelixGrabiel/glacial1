# Reporte Diario de Producción

Aplicación web de una sola página para registrar y visualizar el reporte diario de
producción, paradas, insumos, mermas y personal de las líneas **PET 1, PET 2, B7L,
C20L y B20L**, adaptada del libro `DEMO_BASE.xlsm`.

## Estructura del proyecto

```
├── index.html    → estructura de la página
├── styles.css    → estilos (colores, tipografía, layout)
├── app.js        → lógica: usuarios, cálculo de OEE, formularios y gráficos
└── README.md     → este archivo
```

## Cómo usarla

1. Abre `index.html` directamente en el navegador (doble clic), o súbelo a cualquier
   hosting estático (Netlify, GitHub Pages, un servidor interno, etc.). No necesita
   backend ni instalación.
2. Inicia sesión con alguno de los usuarios de demostración:

   | Usuario     | Contraseña | Rol                  | Línea asignada |
   |-------------|------------|----------------------|----------------|
   | admin       | admin123   | Administrador        | Todas          |
   | jefe        | jefe123    | Jefe de Producción   | Todas          |
   | operador1   | oper123    | Operador             | PET 1          |

3. El **Administrador** puede crear, asignar rol/línea y eliminar usuarios desde
   "Gestionar usuarios" en la barra lateral.

## Datos y cálculos

- Cada registro guardado calcula automáticamente: Disponibilidad, Rendimiento,
  Calidad, OEE, Cumplimiento y Eficiencia, con las mismas relaciones que las
  fórmulas del Excel original.
- Los gráficos (OEE, producción, paradas, mermas, insumos y tendencia) se generan
  con [Chart.js](https://www.chartjs.org/), cargado desde un CDN — se necesita
  conexión a internet la primera vez que carga la página.

## Almacenamiento de datos

Todo se guarda en el `localStorage` del navegador (usuarios en una clave, registros
en otra). Esto significa:

- Los datos **no se comparten automáticamente** entre distintos computadores o
  navegadores — cada instalación tiene su propia información.
- Si se borra el caché/datos del navegador, se pierde la información guardada.
- Las contraseñas se guardan en texto plano en el navegador: **es un esquema de
  acceso pensado para uso interno o demostración, no para producción real con
  múltiples usuarios remotos.**

## Siguiente paso sugerido

Para que varios operarios en distintos dispositivos trabajen sobre los mismos datos
en tiempo real, y para un manejo seguro de contraseñas, se necesita un backend
(servidor + base de datos) que reemplace el uso de `localStorage`. El código de
`app.js` está organizado en funciones (`loadUsers`, `saveRecords`, `calcDerived`,
etc.) pensadas para poder conectarse a una API sin rehacer la interfaz.
