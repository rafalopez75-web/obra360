begin read only;
select 'profiles' t, count(*), md5(string_agg(to_jsonb(x)::text, '|' order by x.id)) from public.profiles x
union all select 'obras', count(*), md5(string_agg((to_jsonb(x) - 'fecha_cierre' - 'cerrada_por')::text, '|' order by x.id)) from public.obras x
union all select 'historial', count(*), md5(string_agg(to_jsonb(x)::text, '|' order by x.id)) from public.historial x
union all select 'archivos', count(*), md5(string_agg(to_jsonb(x)::text, '|' order by x.id)) from public.archivos x
union all select 'push_subscriptions', count(*), md5(string_agg(to_jsonb(x)::text, '|' order by x::text)) from public.push_subscriptions x;
select estado, count(*) from public.obras group by 1 order by 1;
select count(*) filter (where column_name in ('fecha_cierre','cerrada_por')) as columnas_archivo from information_schema.columns where table_schema='public' and table_name='obras';
rollback;
