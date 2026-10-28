# Cerrar y archivar obras (rama `dev-archivo`, 28/10/2026)

Estado: preparado y verificado en banco local. **No desplegado. Migración NO aplicada en producción.**

## Qué hace

- **Cerrar obra**: botón en la ficha, con confirmación. Lo ve quien puede editar la obra. Son los mismos permisos que en la base de datos (política `editar_obras`): quien la creó, más director, coordinador y KAM.
- **Al cerrar**:
  - la base de datos registra la fecha de cierre y quién cerró;
  - añade un apunte «Obra cerrada» al historial, en la misma transacción;
  - no borra nada ni toca el estado comercial.
- **Obra archivada**:
  - deja de aparecer en el listado, el buscador, los contadores (embudo, chips y panel de móvil), el dashboard, las notificaciones, «proyectos similares» y el Excel general de obras vivas;
  - no cuenta como vencida.
- **Obras archivadas**: botón junto al título.
  - En esta vista solo salen las cerradas, con su fecha de archivo.
  - Funcionan el buscador y los filtros de región y comercial. Excel exporta las archivadas.
  - Se abre la ficha completa: datos, empresas, archivos e historial.
  - Mientras está archivada, la ficha no deja editar. Se reabre primero.
- **Reabrir obra**: botón en la ficha archivada, con confirmación.
  - La obra vuelve a las vivas con el mismo estado que tenía.
  - El historial conserva el cierre y añade la reapertura, con la fecha del cierre.
- **Estado y archivo son cosas distintas**:
  - `estado` (Contacto inicial … Obra terminada) no cambia al cerrar ni al reabrir.
  - El chip «Histórico» pasa a llamarse **«Obra terminada»**, que es el estado que filtra, para no confundirlo con «Archivadas». Las obras en ese estado siguen siendo vivas, como hasta ahora.
- **Obras existentes**: la migración no cierra ninguna. Todas quedan vivas con su estado actual.

## Ficheros

| Fichero | Cambio |
|---|---|
| `sql/migrations/2026-10-28_obras_cierre_archivo.sql` | Añade las columnas `obras.fecha_cierre` y `obras.cerrada_por`, y 2 triggers. Uno pone la fecha y el autor del cierre en el servidor; el otro escribe el historial de cierre y reapertura. Incluye la reversión. |
| `index.html` | Botones de cerrar y reabrir, vista de archivadas, y exclusión de las archivadas en listados, búsquedas y contadores. Nuevos tipos de historial y marca «ARCHIVADA» en la ficha PDF. |
| `docs/qa/archivo_2026-10-28/` | Pruebas, banco local, resultados y capturas. |

## Despliegue (pendiente de OK)

1. Aplicar la migración en `bigbxebupzryrdnovnum`.
   - Es compatible con la app actual: solo añade columnas que admiten valor vacío.
   - Comprobar después que hay 0 archivadas y el mismo total de obras.
2. Fusionar `dev-archivo` y desplegar `index.html`.
   - Si se desplegara antes de la migración, la app sigue funcionando y no archiva nada. Cerrar mostraría «Falta preparar la base de datos para archivar obras». Esto está probado.

## Pruebas

- **SQL** (Postgres 17 en Docker, con el esquema de producción y datos ficticios): **20/20**.
  - Ninguna obra se archiva al migrar y los estados quedan intactos.
  - La fecha y el autor los pone el servidor, aunque el cliente envíe otros valores.
  - Cerrar no cambia el estado ni borra archivos o historial.
  - No se puede volver a cerrar una obra archivada ni duplicar su apunte. Editarla no la reabre.
  - No pueden cerrar: un comercial ajeno, un usuario dado de baja ni un usuario anónimo.
  - Reabrir conserva el cierre. Dos ciclos de cierre y reapertura dejan 4 apuntes.
  - Una obra nueva no puede nacer archivada.
- **Chrome real** (CDP; PostgREST 12 con la aplicación de la rama): **75/75**. Escenarios: escritorio 1440×900 como KAM, iPhone 390×844 como comercial, permisos de un comercial de otra región, y base de datos sin migrar.
  - Se comprobó: login real, cancelar y confirmar, persistencia al recargar, listado, buscador, contadores, panel de móvil, dashboard, sugerencias, vista de archivadas y ficha completa.
  - También: reapertura, historial en BD, ningún error de JavaScript y ninguna petición fallida inesperada.

## No probado

- Toque en dispositivo real. En Chrome 156 headless la emulación de toque se queda sin respuesta dentro de la app; con el `index.html` de producción pasa lo mismo, así que es del banco de pruebas. En móvil se comprobó que cada botón es alcanzable en su punto central y se pulsó ahí.
- La Edge Function `send-push`, por si calcula vencidas por su cuenta (ya estaba pendiente). Hay que revisar que ignore las obras con `fecha_cierre`.
- La importación CSV: si importas una fila con la referencia de una obra archivada, actualiza sus datos y la obra sigue archivada.
