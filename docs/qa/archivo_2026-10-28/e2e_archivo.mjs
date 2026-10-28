// Prueba de navegador real (Chrome headless + CDP) de cerrar/archivar/reabrir obras.
// Banco local: PostgREST + Postgres con el esquema de producción y datos ficticios. Nada toca producción.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIR = new URL('.', import.meta.url).pathname;
const SHOTS = DIR + 'shots'; fs.mkdirSync(SHOTS, { recursive: true });
const PSQL = '/opt/homebrew/opt/libpq/bin/psql';
const db = (base, sql) => execFileSync(PSQL, [`postgresql://postgres:test@127.0.0.1:55432/${base}`, '-XAtc', sql], { encoding: 'utf8' }).trim();
fs.rmSync(DIR + 'chprof', { recursive: true, force: true });
const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9351', '--user-data-dir=' + DIR + 'chprof', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch('http://127.0.0.1:9351/json')).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; const errores = []; const dialogos = []; const fallidas = [];
ws.onmessage = e => { const m = JSON.parse(e.data);
  if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; }
  if (m.method === 'Runtime.exceptionThrown') errores.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errores.push(m.params.args.map(a => a.value || a.description).join(' ').slice(0, 300));
  if (m.method === 'Page.javascriptDialogOpening') { console.log('DIALOGO NATIVO: ' + m.params.type + ' ' + m.params.message.slice(0, 200)); dialogos.push(m.params.message); ws.send(JSON.stringify({ id: 999999 + dialogos.length, method: 'Page.handleJavaScriptDialog', params: { accept: false } })); }
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) fallidas.push(m.params.response.status + ' ' + m.params.response.url); };
const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; const t = setTimeout(() => j(new Error('CDP sin respuesta: ' + method + ' ' + JSON.stringify(params).slice(0, 120))), 20000); pend[i] = m => { clearTimeout(t); r(m); }; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result; return r.exceptionDetails ? 'EXC ' + JSON.stringify(r.exceptionDetails).slice(0, 400) : r.result.value; };
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${SHOTS}/${n}.png`, Buffer.from(r.result.data, 'base64')); };
const waitFor = async (expr, ms = 10000) => { for (let t = 0; t < ms; t += 200) { if (await ev(expr) === true) return true; await sleep(200); } return false; };
// En Chrome 156 headless, Input.dispatchTouchEvent se queda sin respuesta dentro de la app (también con el
// index.html de producción): HARNESS. En su lugar se comprueba que el punto central del elemento le
// pertenece (no está tapado ni fuera de pantalla) y se pulsa ahí.
const tap = async sel => { const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'no existe'; const b = e.getBoundingClientRect();
  const x = b.x + b.width / 2, y = b.y + b.height / 2; const top = document.elementFromPoint(x, y);
  if (!top || !(top === e || e.contains(top))) return 'tapado por ' + (top ? top.className || top.tagName : 'nada'); top.click(); return 'ok'; })()`);
  ok(r === 'ok', 'pulsación alcanzable en ' + sel + (r === 'ok' ? '' : ': ' + r)); await sleep(700); };

const LISTA_LISTA = `document.getElementById('obrasSubtitle').textContent !== 'Cargando...' && !!document.getElementById('btnVistaArchivo')`;
const visibles = `[...document.querySelectorAll('#obrasList .obra-card')].filter(c => c.style.display !== 'none').map(c => c.querySelector('.obra-tipo').textContent)`;
const contadores = `Object.fromEntries([...document.querySelectorAll('#filtroEstadoEscritorio [data-estado]')].map(b => [b.dataset.estado, +(b.querySelector('.num') || b.querySelector('b')).textContent]))`;
const badge = `(document.querySelector('#btnVistaArchivo .contador-badge') || {}).textContent ?? null`;
const stats = `[...document.querySelectorAll('#statsGrid .stat-card')].map(c => c.querySelector('.stat-label').textContent + '=' + c.querySelector('.stat-value').textContent).join(' ')`;
const buscar = async q => { await ev(`(() => { const i = document.getElementById('searchProyecto'); i.value = ${JSON.stringify(q)}; aplicarBusquedaProyecto(); })()`); return ev(`document.getElementById('searchInfo').textContent`); };
const confirmar = async respuesta => ev(`(() => { window.__confirms = []; window.confirm = m => { window.__confirms.push(m); return ${respuesta}; }; })()`);
const abrirFicha = async nombre => { await ev(`(() => { const c = [...document.querySelectorAll('#obrasList .obra-card')].find(c => c.querySelector('.obra-tipo').textContent === ${JSON.stringify(nombre)}); c.click(); })()`);
  return waitFor(`document.getElementById('sheetDetalle').classList.contains('active') && document.getElementById('sheetDetalleBody').textContent.includes(${JSON.stringify(nombre)})`); };
const botones = `[...document.querySelectorAll('#sheetDetalleBody .form-actions button')].map(b => b.textContent.trim())`;
const ficha = `document.getElementById('sheetDetalleBody').textContent.replace(/\\s+/g, ' ')`;
const toastTxt = `document.getElementById('toast').textContent`;
let nav = 0;
const entrar = async (port, email) => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?n=${++nav}` }); await sleep(800);
  await ev(`localStorage.clear(); sessionStorage.clear();`);
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?n=${++nav}` });
  await waitFor(`!!document.getElementById('loginEmail') && document.getElementById('loginScreen').classList.contains('active')`);
  await ev(`document.getElementById('loginEmail').value = ${JSON.stringify(email)}; document.getElementById('loginPass').value = 'prueba'; document.getElementById('btnLogin').click();`);
  return waitFor(LISTA_LISTA);
};
const recargar = async port => { await send('Page.navigate', { url: `http://127.0.0.1:${port}/?n=${++nav}` }); await sleep(500); return waitFor(LISTA_LISTA); };

process.on('unhandledRejection', e => { console.log('ABORTA ' + e.message); ch.kill(); process.exit(2); });
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

console.log('== Escritorio 1440x900 · KAM · base de datos migrada ==');
ok(await entrar(8899, 'kam@prueba.test'), 'login real por el formulario');
let v = await ev(visibles), c = await ev(contadores);
ok(v.length === 6 && !v.includes('Hotel Playa'), 'obras vivas al inicio: 6 en "Todas activas" (Obra terminada aparte, como antes): ' + v.join(', '));
ok(c['todas'] === 6 && c['Ganado'] === 1 && c['Obra terminada'] === 1, 'contadores iniciales ' + JSON.stringify(c));
ok(await ev(badge) === '0', 'Archivadas = 0 al inicio (ninguna obra se archiva sola)');
ok((await ev(`[...document.querySelectorAll('#filtroEstadoEscritorio .estado-chip')].map(b => b.textContent.trim().replace(/\\s+/g,' ')).join('|')`)).includes('Obra terminada 1'), 'el chip del estado "Obra terminada" ya no se llama "Histórico" (no se confunde con Archivadas)');
ok(db('e2e', "select count(*) from obras where fecha_cierre is not null") === '0', 'BD: 0 obras con fecha_cierre al inicio');
await shot('01_escritorio_vivas_inicio');

// Cerrar: primero cancelar
ok(await abrirFicha('Colegio Mar'), 'abrir ficha de Colegio Mar (Ganado)');
let b = await ev(botones);
ok(b.includes('Cerrar obra') && b.includes('Editar') && !b.includes('Reabrir obra'), 'ficha viva: botones ' + b.join(' · '));
await confirmar(false);
await ev(`[...document.querySelectorAll('#sheetDetalleBody .form-actions button')].find(b => b.textContent.trim() === 'Cerrar obra').click()`); await sleep(800);
const msgCierre = await ev(`window.__confirms[0] || ''`);
ok(/Cerrar la obra «Colegio Mar»/.test(msgCierre) && /No se borra nada/.test(msgCierre) && /reabrirla/.test(msgCierre), 'pide confirmación: ' + msgCierre.replace(/\n+/g, ' / '));
ok(db('e2e', "select coalesce(fecha_cierre::text,'null') from obras where id = 4") === 'null', 'cancelar: no cambia nada en BD');
// Confirmar
await confirmar(true);
await ev(`[...document.querySelectorAll('#sheetDetalleBody .form-actions button')].find(b => b.textContent.trim() === 'Cerrar obra').click()`);
ok(await waitFor(`document.getElementById('sheetDetalleBody').textContent.includes('Obra archivada')`), 'tras confirmar, la ficha muestra "Obra archivada"');
ok(/Obra cerrada/.test(await ev(toastTxt)), 'aviso: ' + await ev(toastTxt));
let f = await ev(ficha);
b = await ev(botones);
ok(b.includes('Reabrir obra') && !b.includes('Editar') && !b.includes('Cerrar obra') && b.includes('Ficha PDF'), 'ficha archivada: botones ' + b.join(' · '));
ok(/Cerrada el \d\d\/\d\d\/\d{4} \d\d:\d\d por Kam Prueba/.test(f), 'fecha y autor del cierre visibles');
ok(f.includes('Constructora Alfa') && f.includes('plano_colegio.pdf') && f.includes('Ofertado → Ganado') && f.includes('Obra creada: Colegio Mar'), 'datos, empresas, archivos e historial previo se conservan');
ok(f.includes('Obra cerradaObra cerrada y archivada. Estado: Ganado') || /Obra cerrada\s*Obra cerrada y archivada\. Estado: Ganado/.test(f), 'historial: apunte de cierre');
ok(/Ganado/.test(await ev(`document.querySelector('#sheetDetalleBody .detail-meta .estado-pill').textContent`)), 'el estado comercial sigue siendo Ganado');
await shot('02_ficha_archivada');
const bdCierre = db('e2e', "select estado || '|' || (fecha_cierre is not null) || '|' || cerrada_por from obras where id = 4");
ok(bdCierre === 'Ganado|true|00000000-0000-0000-0000-00000000000a', 'BD: estado intacto, fecha_cierre puesta, cerrada_por = KAM (' + bdCierre + ')');
ok(db('e2e', "select count(*) from archivos where obra_id = 4") === '1' && db('e2e', "select count(*) from historial where obra_id = 4") === '3', 'BD: archivos (1) e historial (2 + cierre) conservados');
await ev('cerrarSheet()'); await sleep(400);

// Vivas: no aparece en listado, búsquedas ni contadores
v = await ev(visibles); c = await ev(contadores);
ok(v.length === 5 && !v.includes('Colegio Mar'), 'listado vivas: 5 y sin Colegio Mar');
ok(c['todas'] === 5 && c['Ganado'] === 0, 'contadores sin la archivada ' + JSON.stringify(c));
ok(await ev(badge) === '1', 'Archivadas = 1');
ok(await buscar('Colegio') === '0 obra(s) encontrada(s)', 'buscar "Colegio" en vivas: 0');
c = await ev(contadores);
ok(Object.values(c).every(n => n === 0), 'con la búsqueda, todos los contadores a 0 ' + JSON.stringify(c));
await ev(`setFiltroEstado('Ganado')`); await sleep(300);
ok((await ev(visibles)).length === 0, 'filtro Ganado: no sale la archivada');
await ev(`setFiltroEstado('todas')`); await buscar('');
await ev(`buscarProyectoSimilar('Colegio')`);
ok(await ev(`document.getElementById('proyectoSugerencias').style.display === 'none' || !document.getElementById('proyectoSugerencias').textContent.includes('Colegio Mar')`), 'buscador de proyectos similares (formulario): no la ofrece');
await ev(`switchView('dashboard')`); await sleep(300);
const s1 = await ev(stats);
ok(s1 === 'Total=7 En proceso=5 Ganadas=1 Vencidas=1', 'dashboard: la archivada (Ganado) sigue en Total y Ganadas: ' + s1);
ok((await ev(`document.getElementById('dashboardEstados').textContent`)).includes('Ganado'), 'dashboard "Por estado" (histórico) la incluye');
await ev(`switchView('obras')`);

// Recargar: persiste
ok(await recargar(8899), 'recarga de página (sesión guardada)');
v = await ev(visibles);
ok(v.length === 5 && !v.includes('Colegio Mar') && await ev(badge) === '1', 'tras recargar sigue archivada: vivas 5, Archivadas 1');

// Vista Archivadas
await ev(`document.getElementById('btnVistaArchivo').click()`); await sleep(400);
ok(await ev(`document.getElementById('obrasTitulo').textContent`) === 'Obras archivadas', 'vista "Obras archivadas"');
v = await ev(visibles);
ok(JSON.stringify(v) === '["Colegio Mar"]', 'archivo: solo Colegio Mar ' + JSON.stringify(v));
ok(/^Archivada \d\d\/\d\d\/\d{4}$/.test(await ev(`document.querySelector('#obrasList .tag-small.archivada').textContent`)), 'tarjeta con fecha de archivo');
ok(await ev(`getComputedStyle(document.getElementById('filtroEstadoEscritorio')).display === 'none'`), 'en el archivo no se muestra el embudo de obras vivas');
ok(await ev(`document.getElementById('obrasSubtitle').textContent`) === '1 obra archivada', 'subtítulo: 1 obra archivada');
ok(await buscar('colegio') === '1 obra(s) encontrada(s)', 'buscar en el archivo: la encuentra');
ok(await buscar('Torre') === '0 obra(s) encontrada(s)', 'buscar una viva desde el archivo: 0');
await buscar('');
ok(await ev(`[...document.getElementById('filtroComercial').options].map(o => o.text).join('|')`) === 'Todos los comerciales|Comercial Uno', 'filtro de comerciales del archivo: solo los de obras archivadas');
await shot('03_vista_archivadas');
ok(await abrirFicha('Colegio Mar'), 'consultar la ficha completa desde el archivo');
f = await ev(ficha);
ok(f.includes('Constructora Alfa') && f.includes('plano_colegio.pdf') && f.includes('Historial (3)'), 'ficha completa: empresas, archivos e historial (3)');

// Reabrir
await confirmar(false);
await ev(`[...document.querySelectorAll('#sheetDetalleBody .form-actions button')].find(b => b.textContent.trim() === 'Reabrir obra').click()`); await sleep(600);
const msgReab = await ev(`window.__confirms[0] || ''`);
ok(/Reabrir la obra «Colegio Mar»/.test(msgReab) && /estado actual \(Ganado\)/.test(msgReab), 'reabrir pide confirmación: ' + msgReab.replace(/\n+/g, ' / '));
ok(db('e2e', "select (fecha_cierre is not null)::text from obras where id = 4") === 'true', 'cancelar reapertura: sigue archivada');
await confirmar(true);
await ev(`[...document.querySelectorAll('#sheetDetalleBody .form-actions button')].find(b => b.textContent.trim() === 'Reabrir obra').click()`);
ok(await waitFor(`!document.getElementById('sheetDetalleBody').textContent.includes('Obra archivada') && document.getElementById('sheetDetalleBody').textContent.includes('Obra reabierta')`), 'ficha reabierta, con apunte de reapertura');
b = await ev(botones);
ok(b.includes('Editar') && b.includes('Cerrar obra') && !b.includes('Reabrir obra'), 'ficha viva otra vez: ' + b.join(' · '));
f = await ev(ficha);
ok(/Obra reabierta \(archivada desde el \d\d\/\d\d\/\d{4} \d\d:\d\d\)\. Estado: Ganado/.test(f) && f.includes('Obra cerrada y archivada. Estado: Ganado') && f.includes('Historial (4)'), 'historial conserva cierre y reapertura (4 apuntes)');
await shot('04_ficha_reabierta');
await ev('cerrarSheet()'); await sleep(300);
ok(await ev(`document.getElementById('obrasTitulo').textContent`) === 'Obras archivadas' && (await ev(visibles)).length === 0, 'sale del archivo (archivo vacío)');
ok(await ev(`document.getElementById('obrasEmptyTitulo').textContent`) === 'Sin obras archivadas', 'archivo vacío explicado');
await ev(`document.getElementById('btnVistaArchivo').click()`); await sleep(300);
v = await ev(visibles); c = await ev(contadores);
ok(v.length === 6 && v.includes('Colegio Mar') && c['Ganado'] === 1 && await ev(badge) === '0', 'vuelve a vivas: 6, Ganado 1, Archivadas 0');
ok(await recargar(8899) && (await ev(visibles)).includes('Colegio Mar'), 'tras recargar sigue viva');
ok(db('e2e', "select string_agg(tipo, ',' order by id) from historial where obra_id = 4") === 'creacion,estado,cierre,reapertura', 'BD: historial creacion,estado,cierre,reapertura');
ok(db('e2e', "select coalesce(fecha_cierre::text,'null') || '|' || coalesce(cerrada_por::text,'null') || '|' || estado from obras where id = 4") === 'null|null|Ganado', 'BD: viva, sin autor de cierre, estado Ganado');

console.log('\n== Dashboard con varias archivadas + importación CSV ==');
// Se archivan por la API de la app: Hospital Norte (vencida, Contacto inicial), Centro Salud Este (Perdido
// contra Competidor X) y Nave Logística Sur (Ofertado)
const archivar = async (ids, fecha) => ev(`Promise.all(${JSON.stringify(ids)}.map(id => sb.from('obras').update({ fecha_cierre: ${fecha} }).eq('id', id).select('id'))).then(r => r.map(x => (x.data || []).length).join(','))`);
ok(await archivar([1, 6, 3], 'new Date().toISOString()') === '1,1,1', 'archivar 3 obras por la API');
ok(await recargar(8899), 'recarga');
await ev(`switchView('dashboard')`); await sleep(300);
const s2 = await ev(stats);
ok(s2 === 'Total=7 En proceso=3 Ganadas=1 Vencidas=0', 'archivadas fuera de "En proceso" y "Vencidas", dentro de Total y Ganadas: ' + s2);
const est2 = await ev(`[...document.querySelectorAll('#dashboardEstados .dashboard-row')].map(r => r.textContent.replace(/\\s+/g, '')).sort().join('|')`);
ok(est2 === 'Contactoinicial1|Endesarrollo1|Ennegociación1|Ganado1|Obraterminada1|Ofertado1|Perdido1', 'Por estado cuenta las 7 (histórico): ' + est2);
const comp2 = await ev(`document.getElementById('dashboardCompetidores').textContent.replace(/\\s+/g, ' ').trim()`);
ok(/Competidor X\s*1/.test(comp2), 'competidores incluye la perdida archivada: ' + comp2);
ok((await ev(`document.getElementById('dashboardRegiones').textContent.replace(/\\s+/g, '')`)).includes('Madrid2'), 'Por región histórico (Madrid 2, ambas archivadas)');
await ev(`switchView('obras')`);
ok((await ev(visibles)).length === 3 && await ev(badge) === '3', 'listado de vivas: 3 (sin las archivadas), Archivadas 3');
// Importación: una fila de obra archivada (ref 103) y otra viva (ref 102)
const csv = 'Nº Ref;Proyecto;Región;Estado\n103;Nave Logística Sur;Madrid;Ofertado\n102;Torre Diagonal;Cataluña;En desarrollo\n';
await ev(`importarExcel({ target: { files: [new File([${JSON.stringify(csv)}], 'imp.csv', { type: 'text/csv' })], value: '' } })`);
const tImp = await ev(toastTxt);
ok(tImp === '2 actualizadas. Aviso: ref 103 está archivada (actualizada, sigue en Obras archivadas)', 'resumen de importación avisa: ' + tImp);
ok(db('e2e', "select (fecha_cierre is not null)::text from obras where id = 3") === 'true', 'BD: la importación no reabre la archivada');
ok(await archivar([1, 6, 3], 'null') === '1,1,1', 'reabrir las 3 por la API');
ok(db('e2e', "select count(*) from obras where fecha_cierre is not null") === '0', 'BD: 0 archivadas al terminar el bloque');
ok(await recargar(8899), 'recarga');

console.log('\n== iPhone 390x844 · Comercial Uno ==');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
ok(await entrar(8899, 'uno@prueba.test'), 'login comercial');
v = await ev(visibles);
ok(v.length === 4 && !v.includes('Nave Logística Sur'), 'comercial ve sus 4 vivas de Cataluña (sin Obra terminada): ' + v.join(', '));
ok(await ev(`document.documentElement.scrollWidth <= window.innerWidth`), 'sin desplazamiento horizontal');
const h = await ev(`document.getElementById('btnVistaArchivo').getBoundingClientRect().height`);
ok(h >= 40, 'botón Archivadas táctil (' + h + ' px)');
const btnFiltro0 = await ev(`document.querySelector('#btnFiltroEstado .contador-badge').textContent`);
await shot('05_iphone_vivas');
await tap('#obrasList .obra-card');
await waitFor(`document.getElementById('sheetDetalle').classList.contains('active')`);
const nombreMovil = await ev(`document.querySelector('#sheetDetalleBody .detail-tipo').textContent`);
await confirmar(true);
await tap('#sheetDetalleBody .form-actions button:last-child');
ok(await waitFor(`document.getElementById('sheetDetalleBody').textContent.includes('Obra archivada')`), `cerrar desde el iPhone (${nombreMovil})`);
await shot('06_iphone_ficha_archivada');
await ev('cerrarSheet()'); await sleep(400);
const btnFiltro1 = await ev(`document.querySelector('#btnFiltroEstado .contador-badge').textContent`);
ok(+btnFiltro1 === +btnFiltro0 - 1, `contador del filtro de móvil: ${btnFiltro0} → ${btnFiltro1}`);
await tap('#btnFiltroEstado'); await sleep(400);
const hoja = await ev(`[...document.querySelectorAll('#sheetEstadoBody .estado-opcion')].map(o => o.textContent.replace(/\\s+/g, ' ').trim()).join(' | ')`);
ok(hoja.startsWith('Todas activas' + btnFiltro1 + ' |') && hoja.includes('En negociación0'), 'panel de estado sin la archivada (Parking Plaza era En negociación): ' + hoja);
await ev('cerrarSheet()'); await sleep(400);
await tap('#btnVistaArchivo');
v = await ev(visibles);
ok(JSON.stringify(v) === JSON.stringify([nombreMovil]) && await ev(`getComputedStyle(document.getElementById('btnFiltroEstado')).display === 'none'`), 'archivo en móvil: solo la cerrada y sin filtro de estado');
ok(await ev(`document.documentElement.scrollWidth <= window.innerWidth`), 'archivo en móvil sin desplazamiento horizontal');
await shot('07_iphone_archivadas');
// Reabrir en móvil para dejar el banco como estaba
await tap('#obrasList .obra-card'); await waitFor(`document.getElementById('sheetDetalle').classList.contains('active')`);
await confirmar(true);
await ev(`[...document.querySelectorAll('#sheetDetalleBody .form-actions button')].find(b => b.textContent.trim() === 'Reabrir obra').click()`);
ok(await waitFor(`document.getElementById('sheetDetalleBody').textContent.includes('Obra reabierta')`), 'reabrir desde el iPhone');

console.log('\n== Escritorio · Comercial Dos: permisos ==');
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
ok(await entrar(8899, 'dos@prueba.test'), 'login comercial de Madrid');
v = await ev(visibles);
ok(v.length === 2 && v.every(n => ['Nave Logística Sur', 'Centro Salud Este'].includes(n)), 'solo ve Madrid: ' + v.join(', '));
// Intento directo contra la API de cerrar una obra de otra región (no visible): la BD lo impide
const r = await ev(`sb.from('obras').update({ fecha_cierre: new Date().toISOString() }).eq('id', 2).select('id').then(x => JSON.stringify({ n: (x.data || []).length, e: x.error && x.error.code }))`);
ok(JSON.parse(r).n === 0 && db('e2e', "select (fecha_cierre is null)::text from obras where id = 2") === 'true', 'API: no puede cerrar una obra que no es suya ' + r);

console.log('\n== Sin migración (orden de despliegue equivocado) ==');
ok(await entrar(8898, 'kam@prueba.test'), 'app nueva contra BD sin migrar: carga');
v = await ev(visibles);
ok(v.length === 6 && await ev(badge) === '0', 'todas siguen vivas (6), Archivadas 0');
await abrirFicha('Torre Diagonal');
await confirmar(true);
await ev(`[...document.querySelectorAll('#sheetDetalleBody .form-actions button')].find(b => b.textContent.trim() === 'Cerrar obra').click()`);
ok(await waitFor(`/Falta preparar la base de datos/.test(document.getElementById('toast').textContent)`), 'cerrar sin migración: aviso claro, sin romper la app');
ok(db('e2e_sin', "select count(*) from historial") === '2', 'BD sin migrar: nada escrito');

console.log('\n== Errores ==');
const inesperadas = fallidas.filter(u => !/\/functions\/v1\/|\/storage\/v1\/|favicon|icon-192|manifest/.test(u) && !/rest\/v1\/obras\?.*id=eq\.2/.test(u) && !/400 .*rest\/v1\/obras\?id=eq\.2/.test(u));
console.log('respuestas >= 400:', JSON.stringify(fallidas));
ok(inesperadas.every(u => /^400 .*rest\/v1\/obras/.test(u)) && inesperadas.length <= 1, 'sin peticiones fallidas inesperadas (solo el 400 provocado sin migración)');
const errJS = errores.filter(e => !/Error en cierre\/reapertura/.test(e) && !/404|Failed to load resource/.test(e));
console.log('errores consola:', JSON.stringify(errores));
ok(errJS.length === 0, 'sin errores de JavaScript');
console.log(`\nRESULTADO: ${pass} PASS / ${fail} FAIL`);
ch.kill(); process.exit(fail ? 1 : 0);
