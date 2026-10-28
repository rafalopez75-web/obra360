\set ON_ERROR_STOP 1
create or replace function pg_temp.yo(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c is not true then raise exception 'FAIL: %', msg; end if; raise notice 'PASS: %', msg; end $$;

-- 1. Migración no cierra nada ni cambia estados
select pg_temp.ok((select count(*) from obras where fecha_cierre is not null or cerrada_por is not null) = 0, 'tras migrar, 0 obras archivadas');
select pg_temp.ok(not exists (select 1 from obras o join _snap s using (id) where o.estado <> s.estado or o.proyecto <> s.proyecto or o.updated_at is distinct from s.updated_at), 'estados y datos previos intactos');
select pg_temp.ok((select count(*) from historial) = 1, 'migrar no escribe historial');

-- 2. El comercial creador cierra su obra; el servidor pone fecha y autor
set role authenticated; select pg_temp.yo('00000000-0000-0000-0000-00000000000b');
update obras set fecha_cierre = '2000-01-01', cerrada_por = '00000000-0000-0000-0000-00000000000a' where id = 1 and fecha_cierre is null;
reset role;
select pg_temp.ok((select fecha_cierre > now() - interval '1 minute' and cerrada_por = '00000000-0000-0000-0000-00000000000b' from obras where id = 1), 'cierre: fecha del servidor y autor = quien cierra (no lo que manda el cliente)');
select pg_temp.ok((select estado from obras where id = 1) = 'Ganado', 'cerrar no cambia el estado comercial');
select pg_temp.ok((select count(*) from historial where obra_id = 1 and tipo = 'cierre' and usuario_nombre = 'Comercial Uno' and descripcion = 'Obra cerrada y archivada. Estado: Ganado') = 1, 'cierre registrado en historial con nombre');
select pg_temp.ok((select count(*) from archivos where obra_id = 1) = 1 and (select count(*) from historial where obra_id = 1 and tipo = 'creacion') = 1, 'archivos e historial previos conservados');

-- 3. Re-cerrar una obra archivada no reescribe la fecha ni duplica historial
create temp table f1 as select fecha_cierre from obras where id = 1;
grant select on f1 to authenticated;
set role authenticated; select pg_temp.yo('00000000-0000-0000-0000-00000000000a');
update obras set fecha_cierre = '2030-01-01' where id = 1;
reset role;
select pg_temp.ok((select o.fecha_cierre = f.fecha_cierre and o.cerrada_por = '00000000-0000-0000-0000-00000000000b' from obras o, f1 f where o.id = 1), 'fecha/autor de cierre no se reescriben');
select pg_temp.ok((select count(*) from historial where obra_id = 1 and tipo = 'cierre') = 1, 'sin cierre duplicado en historial');

-- 4. Editar datos de una obra archivada no la reabre ni toca el historial
set role authenticated; select pg_temp.yo('00000000-0000-0000-0000-00000000000a');
update obras set seguimiento = 'nota', updated_at = now() where id = 1;
reset role;
select pg_temp.ok((select fecha_cierre is not null from obras where id = 1) and (select count(*) from historial where obra_id = 1) = 2, 'edición normal no cambia el archivo');

-- 5. Un comercial no puede cerrar la obra de otro (misma política que editar)
set role authenticated; select pg_temp.yo('00000000-0000-0000-0000-00000000000c');
update obras set fecha_cierre = now() where id = 3;
reset role;
select pg_temp.ok((select fecha_cierre is null from obras where id = 3), 'comercial ajeno no puede cerrar');

-- 6. Usuario dado de baja no puede cerrar ni su propia obra
set role authenticated; select pg_temp.yo('00000000-0000-0000-0000-00000000000d');
update obras set fecha_cierre = now() where id = 4;
reset role;
select pg_temp.ok((select fecha_cierre is null from obras where id = 4), 'usuario inactivo no puede cerrar');

-- 7. anon no puede cerrar
set role anon; select pg_temp.yo('');
update obras set fecha_cierre = now() where id = 2;
reset role;
select pg_temp.ok((select fecha_cierre is null from obras where id = 2), 'anon no puede cerrar');

-- 8. KAM reabre: vuelve a viva y el historial guarda cierre + reapertura
set role authenticated; select pg_temp.yo('00000000-0000-0000-0000-00000000000a');
update obras set fecha_cierre = null where id = 1 and fecha_cierre is not null;
reset role;
select pg_temp.ok((select fecha_cierre is null and cerrada_por is null from obras where id = 1), 'reabrir: vuelve a viva');
select pg_temp.ok((select count(*) from historial where obra_id = 1 and tipo = 'reapertura' and usuario_nombre = 'Kam Prueba' and descripcion like 'Obra reabierta (archivada desde el __/__/____ __:__). Estado: Ganado') = 1, 'reapertura en historial con fecha del cierre');
select pg_temp.ok((select count(*) from historial where obra_id = 1 and tipo = 'cierre') = 1, 'el cierre anterior se conserva');

-- 9. Reabrir una viva no hace nada
set role authenticated; select pg_temp.yo('00000000-0000-0000-0000-00000000000a');
update obras set fecha_cierre = null where id = 2;
reset role;
select pg_temp.ok((select count(*) from historial where obra_id = 2) = 0, 'reabrir una viva no escribe historial');

-- 10. Una obra nueva nunca nace archivada
set role authenticated; select pg_temp.yo('00000000-0000-0000-0000-00000000000b');
insert into obras (id, proyecto, region, creado_por, fecha_cierre, cerrada_por) values (10, 'Nueva', 'Cataluña', '00000000-0000-0000-0000-00000000000b', now(), '00000000-0000-0000-0000-00000000000b');
reset role;
select pg_temp.ok((select fecha_cierre is null and cerrada_por is null from obras where id = 10), 'insert con fecha_cierre nace viva');

-- 11. Segundo ciclo cierre/reapertura
set role authenticated; select pg_temp.yo('00000000-0000-0000-0000-00000000000a');
update obras set fecha_cierre = now() where id = 1;
update obras set fecha_cierre = null where id = 1;
reset role;
select pg_temp.ok((select count(*) from historial where obra_id = 1 and tipo in ('cierre','reapertura')) = 4, 'dos ciclos = 4 eventos conservados');

-- 12. Las funciones de trigger no son invocables por la API
select pg_temp.ok(not has_function_privilege('authenticated', 'public.obras_cierre_antes()', 'execute') and not has_function_privilege('anon', 'public.obras_cierre_historial()', 'execute'), 'funciones de trigger sin EXECUTE para anon/authenticated');
select 'TODAS PASS' as resultado;
