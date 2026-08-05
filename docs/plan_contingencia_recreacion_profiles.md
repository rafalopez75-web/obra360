# Plan de contingencia — recreación de `public.profiles`

**Estado: PLAN DE CONTINGENCIA, NO EJECUTAR.** Prioridad actual: respuesta de soporte de Supabase (ticket abierto sobre proyecto `bigbxebupzryrdnovnum`). Este documento solo se activa si soporte no resuelve la causa raíz y hace falta desbloquear la funcionalidad sin esperar más.

## Contexto (por qué existe este plan)

La API de datos (PostgREST) de Supabase no refleja las columnas `activo` y `es_admin_app`, añadidas a `public.profiles` vía `ALTER TABLE`, pese a estar confirmadas físicamente en `information_schema` y haber agotado sin éxito: `NOTIFY pgrst reload schema`, reload de caché desde dashboard, restart del servicio de API, drop+re-add de columna, restart de la base de datos, y pausa/reanudación completa del proyecto. Recrear la tabla fuerza un OID nuevo y por tanto una introspección de esquema completamente limpia por parte de PostgREST.

---

## 1. Precondiciones

1. **Bloqueante:** haber obtenido y verificado la auditoría física completa de `public.profiles` (los 9 bloques SQL de `pg_catalog` ya entregados: columnas, índices, constraints, triggers, policies RLS, grants, dependencias). Sin este dato no se puede garantizar reconstruir el 100 % de la tabla — es el principal riesgo técnico de todo el plan (ver sección 8). **No ejecutar sin esto.**
2. Confirmación de que soporte de Supabase no ha resuelto el problema en un plazo razonable, o que ha confirmado que no hay una vía oficial más simple.
3. Ventana de mantenimiento acordada con Rafa (administrador funcional único hoy), con la app fuera de uso durante la ventana.
4. Acceso confirmado con permisos de owner sobre el proyecto de Supabase (necesario para `ALTER`/`CREATE`/`DROP` y para poder revertir sin depender de nadie más).
5. Backup completo verificado y accesible (sección 2) antes de tocar nada.
6. Nadie debe estar creando/editando usuarios u obras durante la ventana — comunicarlo aunque hoy solo Rafa gestiona usuarios.

## 2. Backup completo

Antes de cualquier cambio:

1. **Backup de plataforma:** confirmar en `Settings → Database → Backups` que existe un backup/snapshot reciente y restaurable (Point-in-Time Recovery si el plan de Supabase lo incluye).
2. **Export manual de datos**, independiente del backup de plataforma:
   ```sql
   copy (select * from public.profiles) to stdout with csv header;
   ```
   Ejecutar desde el SQL Editor y guardar el resultado como archivo local (`profiles_backup_YYYY-MM-DD.csv`).
3. **Export de la definición (DDL)** de la tabla, como referencia independiente de la auditoría física ya realizada — guardar también el resultado íntegro de los 9 bloques de auditoría junto al backup de datos.
4. **Verificación del backup:** comparar `select count(*) from public.profiles;` con el número de filas del CSV exportado — deben coincidir exactamente antes de continuar.

## 3. Procedimiento paso a paso

Todos los pasos 1-9 se ejecutan **sin tocar la tabla original** — cero impacto en producción hasta el paso 10 (swap). Ejecutar dentro de una única sesión/transacción donde se indique.

| # | Acción |
|---|---|
| 1 | Re-ejecutar la auditoría física completa sobre `profiles` y guardar el resultado como "estado antes". |
| 2 | `create table public.profiles_new (like public.profiles including all);` — copia columnas, tipos, defaults, constraints, índices y comentarios. **No copia RLS, triggers, ni FKs entrantes desde `obras`.** |
| 3 | `insert into public.profiles_new select * from public.profiles;` — copia de datos. |
| 4 | Recrear manualmente **cada** policy RLS listada en la auditoría (sección 6 del audit), adaptando `profiles` → `profiles_new`, incluida la policy `es_admin_app_puede_actualizar_usuarios`. |
| 5 | `alter table public.profiles_new enable row level security;` (si no quedó heredado). |
| 6 | Recrear **todos** los triggers listados en la auditoría (sección 5), incluido `trg_restringir_columnas_update_profiles`. |
| 7 | Recrear los grants exactos listados en la auditoría (sección 7) sobre `profiles_new`, a nivel de tabla y de columna. |
| 8 | Si la auditoría (sección 8, dependencias) confirma FKs declaradas desde `obras.comercial_id` / `obras.kam_id` hacia `profiles.id`: preparar (sin ejecutar aún) las sentencias para recrearlas apuntando a `profiles_new`. Si no hay FK declarada (solo relación lógica en el código de la app), omitir este paso. |
| 9 | Repetir el `insert`/`upsert` de datos (paso 3) justo antes del swap para capturar altas/bajas ocurridas mientras se preparaban los pasos 4-8. |
| **10** | **Swap atómico, dentro de una transacción:**<br>`begin;`<br>`alter table public.profiles rename to profiles_old_backup;`<br>`alter table public.profiles_new rename to profiles;`<br>`commit;` |
| 11 | Verificación inmediata por API (ver sección 5). |
| 12 | Validación funcional completa con usuario de pruebas (ver sección 5). |
| 13 | Mantener `profiles_old_backup` sin borrar durante un periodo de observación de al menos 7 días antes de eliminarla definitivamente. |

## 4. Validaciones antes de cada paso

| Antes de... | Validar que... |
|---|---|
| Paso 2 | La auditoría física está completa y sin huecos (todas las secciones 1-8 del audit devolvieron resultado, ninguna vacía sin explicación). |
| Paso 3 | `profiles_new` existe y tiene exactamente las mismas columnas que `profiles` (comparar `\d profiles` vs `\d profiles_new`, o el bloque 1-2 de la auditoría repetido sobre `profiles_new`). |
| Paso 4-7 | Cada policy/trigger/grant recreado se compara uno a uno contra el listado original de la auditoría — no "a ojo", sino contando: mismo número de policies, mismo número de triggers. |
| Paso 10 (swap) | `select count(*) from profiles_new` == `select count(*) from profiles` (originales), y pasos 4-7 verificados como completos. Este es el punto de no retorno "barato" — después de aquí, revertir cuesta un segundo swap, no una reconstrucción. |

## 5. Validaciones posteriores

Inmediatamente tras el paso 10:

1. **Por API** (repetir la comprobación de solo lectura de toda esta investigación):
   ```
   GET /rest/v1/profiles?select=id,activo,es_admin_app
   ```
   Debe devolver `200`, no `42703`/`PGRST204`.
2. `select count(*) from public.profiles;` coincide con el conteo pre-swap.
3. Login de un usuario real (no de pruebas) funciona con normalidad.
4. Los selectores de KAM/comercial cargan correctamente en el formulario de obras (confirma que las relaciones lógicas de `id` sobrevivieron).
5. El histórico de obras sigue mostrando el nombre correcto de comercial/KAM asignado (no "Sin asignar").
6. **Validación funcional completa del feature original:** con un usuario de pruebas, dar de baja → confirmar que no puede iniciar sesión → reactivar → confirma que vuelve a poder.
7. Confirmar que un usuario **sin** `es_admin_app = true` recibe error de RLS al intentar el `UPDATE` (la restricción de permisos sigue activa, no se abrió de más).
8. Monitorizar la app durante las horas siguientes por si aparece cualquier error no previsto.

## 6. Plan de rollback

- **Antes del paso 10 (swap):** coste cero. `drop table public.profiles_new;` y no ha pasado nada — la tabla original nunca se tocó.
- **Entre el paso 10 y la validación completa (pasos 11-12):** ventana crítica. Si algo falla, revertir con el swap simétrico:
  ```sql
  begin;
  alter table public.profiles rename to profiles_failed;
  alter table public.profiles_old_backup rename to profiles;
  commit;
  ```
  Posible mientras `profiles_old_backup` no se haya borrado (por eso el periodo de retención de 7 días del paso 13).
- **Después de confirmar todo en la sección 5:** el rollback deja de ser trivial (habría que restaurar desde el backup de la sección 2), pero a partir de aquí el plan se considera cerrado con éxito.

## 7. Tiempo estimado de indisponibilidad

| Fase | Duración | Impacto en producción |
|---|---|---|
| Pasos 1-9 (preparación) | 30-90 min de trabajo | **Ninguno** — la app sigue usando `profiles` original todo este tiempo |
| Paso 10 (swap) | Segundos | Ventana de riesgo empieza aquí |
| Paso 11-12 (validación) | 5-10 min | App inestable/no verificada hasta cerrar esta fase |
| Si hace falta rollback | +1-2 min | Vuelta al estado anterior conocido |

**Total de indisponibilidad real estimada: 5-12 minutos**, concentrados enteramente en el swap + validación — no en la preparación.

## 8. Riesgos técnicos

- **Omitir un constraint, índice, policy, trigger o grant** no capturado por no tener aún la auditoría completa — es el riesgo más alto de todo el plan, y la razón de que la precondición 1 sea bloqueante.
- **Escritura concurrente** en `profiles` entre el primer `insert` (paso 3) y el swap (paso 10) — mitigado por repetir la copia justo antes del swap (paso 9) y por hacerlo en ventana sin uso real de la app.
- **FKs no declaradas explícitamente** desde `obras` hacia `profiles.id` — si solo existen como relación lógica en el código (no como `FOREIGN KEY` real en la base), el swap no las rompe, pero tampoco lo sabremos con certeza sin la auditoría (sección 8 del audit).
- **El problema de fondo podría no ser específico de esta tabla.** Si la causa real es algo a nivel de proyecto (por ejemplo, algo que vea soporte de Supabase y no hayamos podido comprobar), recrear la tabla podría no arreglar nada — es un riesgo de "esfuerzo sin resultado", no de pérdida de datos, pero justifica esperar a soporte antes de ejecutar esto.
- Objetos internos de Supabase (Realtime, extensiones) que referencien `profiles` por OID y no se re-suscriban automáticamente tras el rename.

## 9. Riesgos funcionales

- Durante la ventana de caída (5-12 min estimados), nadie puede iniciar sesión ni ver/crear obras.
- Si algún valor de `regiones`/`acceso_global`/`rol` se copia mal, un usuario podría perder acceso a sus obras o ver un alcance de datos incorrecto hasta corregirlo manualmente.
- Si las relaciones `comercial_id`/`kam_id` no sobreviven exactamente, el histórico de obras podría mostrar temporalmente "Sin asignar" en vez del responsable real.
- Si el rollback se ejecuta tarde, cualquier obra o usuario creado en el intervalo entre el swap fallido y el rollback necesitaría revisión manual tras revertir.
