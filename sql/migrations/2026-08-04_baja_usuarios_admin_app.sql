-- Obra360 · baja lógica de usuarios + permiso de administración funcional
--
-- Este proyecto NO usa Supabase CLI / migraciones automáticas. Este archivo
-- es solo un registro versionado de lo que hay que ejecutar a mano en el
-- SQL Editor de Supabase (proyecto bigbxebupzryrdnovnum). No se ejecuta solo.
--
-- Orden de aplicación: de arriba a abajo, en una sola sesión.

-- 1. Baja lógica de usuarios (no se puede borrar la cuenta de Auth desde
--    el cliente, solo se bloquea el acceso vía este campo).
alter table public.profiles
  add column activo boolean not null default true;

-- 2. Permiso de administración funcional de la app, independiente del rol
--    de negocio (director/coordinador/kam/comercial). Por defecto nadie lo
--    tiene: se activa a mano, fila a fila, fuera de este script (ver paso 5).
alter table public.profiles
  add column es_admin_app boolean not null default false;

-- 3. Policy de UPDATE: solo quien tiene es_admin_app = true en su propia
--    fila puede actualizar CUALQUIER fila de profiles (incluida la suya).
--    Esta es, a día de hoy, la ÚNICA policy de UPDATE sobre esta tabla.
create policy "es_admin_app_puede_actualizar_usuarios"
on public.profiles
for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.es_admin_app = true
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.es_admin_app = true
  )
);

-- 4. Guardarraíl (defensa en profundidad): aunque la policy conceda acceso
--    a la fila, esta función impide que el UPDATE toque nada que no sea
--    'activo'. Protege incluso frente a una llamada directa a la API que
--    se salte el frontend. Si en el futuro se necesita editar rol/región
--    de un usuario desde la app, este trigger habrá que ampliarlo primero.
create or replace function public.restringir_columnas_update_profiles()
returns trigger
language plpgsql
as $$
begin
  if new.rol is distinct from old.rol
     or new.nombre is distinct from old.nombre
     or new.email is distinct from old.email
     or new.regiones is distinct from old.regiones
     or new.acceso_global is distinct from old.acceso_global
     or new.es_admin_app is distinct from old.es_admin_app
  then
    raise exception 'Solo se permite modificar el campo activo mediante esta vía';
  end if;
  return new;
end;
$$;

create trigger trg_restringir_columnas_update_profiles
before update on public.profiles
for each row execute function public.restringir_columnas_update_profiles();

-- 5. PASO MANUAL, UNA VEZ, FUERA DE ESTE SCRIPT: activar el permiso en tu
--    propia cuenta. No automatizar, no exponer en la app. Sustituye el email:
--
--    update public.profiles set es_admin_app = true where email = '<TU_EMAIL_AQUI>';
