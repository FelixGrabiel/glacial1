# Aviso «Falta la programación»

Centro de avisos (campana). Avisa cuando el bloque productivo vigente (Día + Intermedio, o Noche) no tiene **ninguna** programación cargada.

- **Cuándo:** desde 60 minutos antes de que empiece el bloque hasta que termina. Ámbar antes del inicio; **rojo** cuando el bloque ya empezó.
- **Qué cuenta como programación:** filas del bloque y la fecha con cantidad mayor que 0 y que no estén canceladas. Día e Intermedio forman un solo bloque.
- **Quién lo ve:** Jefatura, Administrador y quien tiene el permiso de Planificación. El supervisor de una sola línea no lo ve.
- **No avisa** mientras la programación no haya terminado de cargar, ni fuera del horario de producción.
- **Al tocarlo:** abre Planificación → Programación turno.
- Código: `js/produccion/46-proyeccion-avisos.js` (`avisoSinProgramacion`, función pura) · prueba: `tests/avisos-sin-programacion.test.js`.
