-- Datos ficticios para la prueba de navegador (solo contenedor local)
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c');
insert into public.profiles (id,nombre,email,rol,regiones,acceso_global,activo,es_admin_app) values
 ('00000000-0000-0000-0000-00000000000a','Kam Prueba','kam@prueba.test','kam','[]',true,true,true),
 ('00000000-0000-0000-0000-00000000000b','Comercial Uno','uno@prueba.test','comercial','["Cataluña"]',false,true,false),
 ('00000000-0000-0000-0000-00000000000c','Comercial Dos','dos@prueba.test','comercial','["Madrid"]',false,true,false);
insert into public.obras (id,num_ref,proyecto,region,estado,creado_por,comercial_id,fecha_seguimiento,perdida_contra,constructora) values
 (1,101,'Hospital Norte','Cataluña','Contacto inicial','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b','2026-01-15',null,'Constructora Alfa'),
 (2,102,'Torre Diagonal','Cataluña','En desarrollo','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b',null,null,'Constructora Beta'),
 (3,103,'Nave Logística Sur','Madrid','Ofertado','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c',null,null,null),
 (4,104,'Colegio Mar','Cataluña','Ganado','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b',null,null,'Constructora Alfa'),
 (5,105,'Hotel Playa','Cataluña','Obra terminada','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b',null,null,null),
 (6,106,'Centro Salud Este','Madrid','Perdido','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c',null,'Competidor X',null),
 (7,107,'Parking Plaza','Cataluña','En negociación','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b',null,null,null);
select setval('obras_id_seq', 7);
insert into public.historial (obra_id,tipo,descripcion,usuario_id,usuario_nombre,created_at) values
 (4,'creacion','Obra creada: Colegio Mar','00000000-0000-0000-0000-00000000000b','Comercial Uno','2026-05-01 10:00+02'),
 (4,'estado','Estado: Ofertado → Ganado','00000000-0000-0000-0000-00000000000b','Comercial Uno','2026-07-01 10:00+02');
insert into public.archivos (obra_id,nombre,tipo,tamano,storage_path,subido_por) values (4,'plano_colegio.pdf','application/pdf',20480,'Cataluña/4/plano_colegio.pdf','00000000-0000-0000-0000-00000000000b');
