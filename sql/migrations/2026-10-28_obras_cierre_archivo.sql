-- 2026-10-28 · Cerrar y archivar obras (rama dev-archivo). NO APLICADA.
--
-- Archivo y estado son cosas distintas:
--   estado        → situación comercial/de ejecución (Contacto inicial … Obra terminada). No se toca.
--   fecha_cierre  → NULL = obra viva; con fecha = obra cerrada y archivada.
-- Cerrar/reabrir es un UPDATE de fecha_cierre, con los mismos permisos que editar la obra
-- (política editar_obras). Archivar nunca borra: la fila, sus archivos e historial se quedan.
--
-- Las obras existentes quedan con fecha_cierre NULL: ninguna se cierra ni archiva sola.
-- Compatible con la app actual en producción (columnas nuevas opcionales; nadie las escribe).
-- Orden de despliegue: primero esta migración, después el index.html de dev-archivo.

begin;

alter table public.obras
  add column fecha_cierre timestamptz,
  add column cerrada_por uuid references public.profiles(id);

comment on column public.obras.fecha_cierre is
  'NULL = obra viva. Con fecha = cerrada y archivada (la pone el servidor). Independiente de estado.';
comment on column public.obras.cerrada_por is
  'Quién cerró la obra (auth.uid() del servidor). NULL si está viva.';

-- Antes de guardar: la fecha y el autor del cierre los pone el servidor, no el cliente.
create or replace function public.obras_cierre_antes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Una obra nueva siempre nace viva
    new.fecha_cierre := null;
    new.cerrada_por := null;
  elsif old.fecha_cierre is null and new.fecha_cierre is not null then
    new.fecha_cierre := now();
    new.cerrada_por := auth.uid();
  elsif old.fecha_cierre is not null and new.fecha_cierre is not null then
    -- Ya archivada: la fecha y el autor del cierre no se reescriben
    new.fecha_cierre := old.fecha_cierre;
    new.cerrada_por := old.cerrada_por;
  else
    new.cerrada_por := null;
  end if;
  return new;
end;
$$;

-- Después de guardar: el cierre y la reapertura quedan en el historial, en la misma transacción.
-- Si el historial no se puede escribir, el cierre/reapertura tampoco se guarda.
create or replace function public.obras_cierre_historial()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_nombre text;
begin
  if (old.fecha_cierre is null) = (new.fecha_cierre is null) then
    return null;
  end if;
  select p.nombre into v_nombre from public.profiles p where p.id = auth.uid();
  insert into public.historial (obra_id, tipo, descripcion, usuario_id, usuario_nombre)
  values (
    new.id,
    case when new.fecha_cierre is not null then 'cierre' else 'reapertura' end,
    case when new.fecha_cierre is not null
      then 'Obra cerrada y archivada. Estado: ' || new.estado
      else 'Obra reabierta (archivada desde el '
           || to_char(old.fecha_cierre at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI')
           || '). Estado: ' || new.estado
    end,
    auth.uid(),
    v_nombre
  );
  return null;
end;
$$;

create trigger obras_cierre_antes
  before insert or update of fecha_cierre, cerrada_por on public.obras
  for each row execute function public.obras_cierre_antes();

create trigger obras_cierre_historial
  after update of fecha_cierre on public.obras
  for each row execute function public.obras_cierre_historial();

-- Funciones de trigger: nadie debe llamarlas por la API
revoke execute on function public.obras_cierre_antes() from public, anon, authenticated;
revoke execute on function public.obras_cierre_historial() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación tras aplicar (debe dar 0 archivadas y el mismo total que antes):
--   select count(*) filter (where fecha_cierre is not null) archivadas, count(*) total from public.obras;
-- Reversión (pierde las fechas de cierre; el historial se conserva):
--   drop trigger obras_cierre_historial on public.obras; drop trigger obras_cierre_antes on public.obras;
--   drop function public.obras_cierre_historial(); drop function public.obras_cierre_antes();
--   alter table public.obras drop column cerrada_por, drop column fecha_cierre;
