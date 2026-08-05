# Proceso — Obra360

Registro cronológico de avances por sesión. Cada sesión de trabajo añade una
entrada nueva al final con fecha: qué se hizo, decisiones tomadas y qué queda
pendiente. No se reescribe el historial anterior.

Para el plan de contingencia técnico abierto, ver
`plan_contingencia_recreacion_profiles.md` en esta misma carpeta.

---

## 2026-08-05

- Creación de este archivo de proceso (petición de Rafa: cada proyecto
  lleva su propio log de avances por sesión).
- Sesión de revisión (sin cambios de código): resumen técnico del repo a
  petición de Rafa — PWA de un único `index.html` (vanilla JS +
  `@supabase/supabase-js`, sin build), backend Supabase, desplegado en
  Netlify. 4 roles de negocio (director/coordinador/kam/comercial) con
  alcance por región, gestión de obras, import/export Excel, push vía
  service worker, administración de usuarios.
- Pendiente conocido a esta fecha: incidente abierto con soporte de
  Supabase — PostgREST no refleja las columnas nuevas `activo`/
  `es_admin_app` de `public.profiles` pese a existir físicamente. Hay un
  plan de contingencia detallado (recrear la tabla con swap atómico) pero
  marcado explícitamente como NO EJECUTAR salvo que soporte no resuelva
  la causa raíz. La feature de baja de usuarios está lista pero bloqueada
  por esto.
