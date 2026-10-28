-- Datos ficticios (solo contenedor local)
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c'),('00000000-0000-0000-0000-00000000000d');
insert into public.profiles (id,nombre,email,rol,regiones,acceso_global,activo) values
 ('00000000-0000-0000-0000-00000000000a','Kam Prueba','kam@test','kam','[]',true,true),
 ('00000000-0000-0000-0000-00000000000b','Comercial Uno','c1@test','comercial','["Cataluña"]',false,true),
 ('00000000-0000-0000-0000-00000000000c','Comercial Dos','c2@test','comercial','["Cataluña"]',false,true),
 ('00000000-0000-0000-0000-00000000000d','Baja Prueba','baja@test','comercial','["Cataluña"]',false,false);
insert into public.obras (id,proyecto,region,estado,creado_por,comercial_id) values
 (1,'Obra viva A','Cataluña','Ganado','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b'),
 (2,'Obra viva B','Cataluña','En desarrollo','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c'),
 (3,'Obra terminada C','Cataluña','Obra terminada','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b'),
 (4,'Obra baja D','Cataluña','Contacto inicial','00000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-00000000000d');
insert into public.historial (obra_id,tipo,descripcion) values (1,'creacion','Obra creada: Obra viva A');
insert into public.archivos (obra_id,nombre,storage_path) values (1,'plano.pdf','Cataluña/1/plano.pdf');
create table public._snap as select id, estado, proyecto, updated_at from public.obras;
