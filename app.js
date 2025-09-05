// ==========================
// Variables globales
// ==========================
let bloques = [];
let bloqueActual = 0, serieActual = 0, tiempoRestante = 0;
let timer = null, cronometroTotal = null, tiempoTotal = 0, seriesCompletadas = 0;
let audioCtx; // contexto global

// Wake Lock
let wakeLock = null;
let entrenoEnCurso = false;

// Estado
let enPausa = false;
let faseActual = null; 
let cuentaCallback = null;
let tiempoGuardado = 0;
let currentOsc = null;
let totalEtapa = 0;

// ==========================
// Volumen maestro
// ==========================
let masterVolume = parseFloat(localStorage.getItem('masterVolume')) || 0.5;
function setMasterVolume(value) {
  masterVolume = Math.min(1, Math.max(0, value));
  localStorage.setItem('masterVolume', masterVolume);
}

// ==========================
// Wake Lock + eventos
// ==========================
async function lockScreen() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {} }
function unlockScreen() { try { wakeLock?.release(); } catch {} wakeLock = null; }

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLock) lockScreen();
});

window.addEventListener('beforeunload', (e) => {
  if (entrenoEnCurso) { e.preventDefault(); e.returnValue = ''; }
});

// ==========================
// Atajos de teclado
// ==========================
window.addEventListener('keydown', (e) => {
  if (!entrenoEnCurso) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (['input','textarea','select','button'].includes(tag)) return;
  if (e.code === 'Space') { e.preventDefault(); togglePausa(); }
  if (e.code === 'ArrowRight') { e.preventDefault(); saltarCiclo(); }
});

// ==========================
// Vibración
// ==========================
function vibrar(ms = 150) {
  try {
    if ('vibrate' in navigator) navigator.vibrate(ms);
  } catch (_) {}
}

// ==========================
// Sonidos
// ==========================
function playTone(freq, durMs = 300, type = 'sine') {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.value = freq;

  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(masterVolume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + durMs / 1000);
}

// Pre-cuenta atrás (3-2-1)
function reproducirPreCuenta(callback) {
  vibrar(100);
  faseActual = 'preCuenta';
  let delay = 0;
  [880, 660, 440].forEach((f) => {
    setTimeout(() => playTone(f, 250, 'sine'), delay);
    delay += 600;
  });
  setTimeout(() => {
    if (!enPausa && typeof callback === 'function') callback();
  }, delay);
}

// Beeps personalizados
function reproducirBeepInicio(callback) {
  vibrar(150);
  faseActual = 'beepSerie';
  reproducirPreCuenta(() => {
    playTone(880, 500, 'sine');
    if (!enPausa && typeof callback === 'function') callback();
  });
  ocultarBarra();
}

function reproducirBeepDescanso(callback) {
  vibrar(150);
  faseActual = 'beepDescanso';
  playTone(660, 400, 'triangle');
  setTimeout(() => {
    if (!enPausa && typeof callback === 'function') callback();
  }, 400);
  ocultarBarra();
}

function reproducirBeepDescansoBloque(callback) {
  vibrar(200);
  faseActual = 'beepBloque';
  playTone(520, 500, 'square');
  setTimeout(() => {
    if (!enPausa && typeof callback === 'function') callback();
  }, 500);
  ocultarBarra();
}

// Beep final especial
function reproducirBeepFinal() {
  vibrar([200,100,200]);
  playTone(220, 800, 'sawtooth');
  setTimeout(() => playTone(440, 500, 'sine'), 900);
}

// ==========================
// Mostrar/ocultar títulos
// ==========================
function ocultarTituloConTañ() {
  const t = document.getElementById('titulo');
  if (!t) return;
  t.classList.add('titulo-oculto');
  setTimeout(() => { t.style.display = 'none'; }, 250);
}
function mostrarTituloConTañ() {
  const t = document.getElementById('titulo');
  if (!t) return;
  t.style.display = '';
  requestAnimationFrame(() => t.classList.remove('titulo-oculto'));
}
function mostrarTituloEjercicio(nombre) {
  const te = document.getElementById('tituloEjercicio');
  te.textContent = nombre || '';
  te.classList.remove('oculto');
}
function ocultarTituloEjercicio() {
  const te = document.getElementById('tituloEjercicio');
  te.textContent = '';
  te.classList.add('oculto');
}

// ==========================
// UI modo entreno
// ==========================
function setEntrenandoUI(on){
  document.documentElement.classList.toggle('entrenando', !!on);
}

function agregarBloque() {
  const nombre = document.getElementById('nombre').value;
  const series = parseInt(document.getElementById('series').value);
  const serieTime = parseInt(document.getElementById('serieTime').value);
  const descansoTime = parseInt(document.getElementById('descansoTime').value);
  const descansoBloque = parseInt(document.getElementById('descansoBloque').value);

  if (!nombre || isNaN(series) || isNaN(serieTime) || isNaN(descansoTime) || isNaN(descansoBloque)) {
    alert("Por favor, rellena todos los campos correctamente.");
    return;
  }

  bloques.push({ nombre, series, serieTime, descansoTime, descansoBloque });

  const div = document.createElement('div');
  div.className = 'bloque-item';
  div.textContent = `${nombre} - ${series}x${serieTime}s + ${descansoTime}s descanso, ${descansoBloque}s entre bloques`;
  document.getElementById('bloques').appendChild(div);

  limpiarCampos();
  guardarRutinas();
}

// ===== Inicio/flujo =====
function iniciarEntrenamiento() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  if (bloques.length === 0) {
    alert("Agrega al menos un ejercicio.");
    return;
  }
  document.getElementById('formulario').classList.add('oculto');
  document.getElementById('bloques').classList.add('oculto');
  document.getElementById('btnReset').style.display = 'inline-block';
  document.getElementById('btnPauseResume').style.display = 'inline-block';
  document.getElementById('btnPauseResume').innerText = 'Pausar';
  document.getElementById('btnSkip').style.display = 'inline-block';
  document.getElementById('cuenta').style.display = 'block';
  document.getElementById('seccionRutinas').style.display = 'none';

  const wrap = document.getElementById('progressWrap');
  wrap.style.display = 'block';
  wrap.style.visibility = 'hidden';

  enPausa = false;
  entrenoEnCurso = true;
  lockScreen();

  bloqueActual = 0;
  serieActual = 0;
  tiempoTotal = 0;
  seriesCompletadas = 0;
  document.getElementById('tiempoTotal').innerText = tiempoTotal;
  document.getElementById('seriesCompletadas').innerText = seriesCompletadas;
  iniciarCronometroTotal();

  ocultarTituloConTañ();
  ocultarTituloEjercicio();

  setEntrenandoUI(true); 
  iniciarSerie();
}

function stopBeepIfAny() {
  if (currentOsc) { try { currentOsc.onended = null; currentOsc.stop(); } catch(e) {} currentOsc = null; }
}

// Flujo
function iniciarSerie() {
  const bloque = bloques[bloqueActual];
  if (serieActual < bloque.series) {
    serieActual++;
    mostrarTituloEjercicio(bloque.nombre);
    reproducirBeepInicio(() => {
      cuentaAtras(bloque.serieTime, iniciarDescanso, 'serie');
    });
  } else {
    iniciarDescansoBloque();
  }
}

function iniciarDescanso() {
  const bloque = bloques[bloqueActual];
  seriesCompletadas++;
  document.getElementById('seriesCompletadas').innerText = seriesCompletadas;
  mostrarTituloEjercicio(`Descanso — ${bloque.nombre}`);
  reproducirBeepDescanso(() => {
    cuentaAtras(bloque.descansoTime, iniciarSerie, 'descanso');
  });
}

function iniciarDescansoBloque() {
  mostrarTituloEjercicio(`Descanso entre bloques`);
  const bloque = bloques[bloqueActual];
  reproducirBeepDescansoBloque(() => {
    cuentaAtras(bloque.descansoBloque, () => {
      bloqueActual++;
      serieActual = 0;
      if (bloqueActual < bloques.length) {
        iniciarSerie();
      } else {
        finalizarEntrenamiento();
      }
    }, 'descansoBloque');
  });
}

// Temporizador preciso
function cuentaAtras(segundos, callback, etapa) {
  faseActual = etapa || faseActual || null;
  totalEtapa = segundos;
  cuentaCallback = callback;

  mostrarBarra(faseActual || 'Cuenta', totalEtapa);

  const end = Date.now() + segundos * 1000;
  if (timer) clearInterval(timer);

  const tick = () => {
    const ms = end - Date.now();
    tiempoRestante = Math.max(0, Math.ceil(ms / 1000));
    actualizarCuenta();
    actualizarProgreso();

    if (ms <= 0) {
      clearInterval(timer);
      const bar = document.getElementById('progressBar');
      const txt = document.getElementById('progressText');
      bar.style.transform = 'scaleX(1)';
      txt.innerText = `${nombreEtapa(faseActual)}: ${totalEtapa}/${totalEtapa}s`;
      setTimeout(() => callback(), 220);
    }
  };

  tick();
  timer = setInterval(tick, 200);
}

function actualizarCuenta() {
  const cuentaDiv = document.getElementById('cuenta');
  cuentaDiv.innerText = tiempoRestante;
  cuentaDiv.classList.add('animar');
  setTimeout(() => cuentaDiv.classList.remove('animar'), 200);
}

function nombreEtapa(etapa) {
  switch (etapa) {
    case 'serie': return 'Serie';
    case 'descanso': return 'Descanso';
    case 'descansoBloque': return 'Descanso entre bloques';
    default: return 'Cuenta';
  }
}

function estiloBarraPorEtapa(etapa) {
  const bar = document.getElementById('progressBar');
  if (etapa === 'serie') bar.style.background = '#28a745';
  else if (etapa === 'descanso') bar.style.background = '#ff9800';
  else if (etapa === 'descansoBloque') bar.style.background = '#6f42c1';
  else bar.style.background = '#007BFF';
}

function mostrarBarra(etapa, total) {
  const wrap = document.getElementById('progressWrap');
  const bar  = document.getElementById('progressBar');
  const txt  = document.getElementById('progressText');
  wrap.style.display = 'block';
  wrap.style.visibility = 'hidden';
  bar.style.transition = 'none';
  bar.style.transform  = 'scaleX(0)';
  estiloBarraPorEtapa(etapa);
  txt.innerText = `${nombreEtapa(etapa)}: 0/${total}s`;
  void bar.offsetWidth; 
  requestAnimationFrame(() => {
    bar.style.transition = 'transform 0.2s linear';
    wrap.style.visibility = 'visible';
  });
}

function ocultarBarra() {
  const wrap = document.getElementById('progressWrap');
  wrap.style.visibility = 'hidden'; 
}

function actualizarProgreso() {
  const bar = document.getElementById('progressBar');
  const txt = document.getElementById('progressText');
  if (totalEtapa <= 0 || document.getElementById('progressWrap').style.display === 'none') return;
  const transcurrido = Math.max(0, totalEtapa - tiempoRestante);
  const ratio = Math.min(1, Math.max(0, transcurrido / totalEtapa));
  bar.style.transform = `scaleX(${ratio})`;
  txt.innerText = `${nombreEtapa(faseActual)}: ${transcurrido}/${totalEtapa}s`;
}

// Pausar / Reanudar
function togglePausa() {
  const btn = document.getElementById('btnPauseResume');
  if (!enPausa) {
    enPausa = true; btn.innerText = 'Reanudar';
    if (timer) { clearInterval(timer); timer = null; tiempoGuardado = tiempoRestante; }
    stopBeepIfAny();
  } else {
    enPausa = false; btn.innerText = 'Pausar';
    const bloque = bloques[bloqueActual];
    if (faseActual === 'beepSerie') {
      reproducirBeepInicio(() => cuentaAtras(bloque.serieTime, iniciarDescanso, 'serie'));
    } else if (faseActual === 'beepDescanso') {
      reproducirBeepDescanso(() => cuentaAtras(bloque.descansoTime, iniciarSerie, 'descanso'));
    } else if (faseActual === 'beepBloque') {
      reproducirBeepDescansoBloque(() => cuentaAtras(bloque.descansoBloque, () => {
        bloqueActual++; serieActual = 0; (bloqueActual < bloques.length) ? iniciarSerie() : finalizarEntrenamiento();
      }, 'descansoBloque'));
    } else {
      if (tiempoGuardado > 0 && cuentaCallback) cuentaAtras(tiempoGuardado, cuentaCallback, faseActual);
    }
  }
}

// Saltar ciclo
function saltarCiclo() {
  if (timer) { clearInterval(timer); timer = null; }
  stopBeepIfAny();
  enPausa = false;

  const bloque = bloques[bloqueActual];
  switch (faseActual) {
    case 'beepSerie':
      cuentaAtras(bloque.serieTime, iniciarDescanso, 'serie'); break;
    case 'serie':
      iniciarDescanso(); break;
    case 'beepDescanso':
      cuentaAtras(bloque.descansoTime, iniciarSerie, 'descanso'); break;
    case 'descanso':
      iniciarSerie(); break;
    case 'beepBloque':
      cuentaAtras(bloque.descansoBloque, () => {
        bloqueActual++; serieActual = 0;
        (bloqueActual < bloques.length) ? iniciarSerie() : finalizarEntrenamiento();
      }, 'descansoBloque'); break;
    case 'descansoBloque':
      bloqueActual++; serieActual = 0;
      (bloqueActual < bloques.length) ? iniciarSerie() : finalizarEntrenamiento(); break;
    default: iniciarSerie(); break;
  }
}

// Finalizar entrenamiento con beep especial
function finalizarEntrenamiento() {
  clearInterval(timer); clearInterval(cronometroTotal); stopBeepIfAny();
  enPausa = false; entrenoEnCurso = false; unlockScreen();

  reproducirBeepFinal();

  document.getElementById('cuenta').innerText = "00";
  document.getElementById('btnReset').style.display = 'none';
  document.getElementById('btnPauseResume').style.display = 'none';
  document.getElementById('btnSkip').style.display = 'none';
  document.getElementById('formulario').classList.remove('oculto');
  document.getElementById('bloques').classList.remove('oculto');
  document.getElementById('bloques').innerHTML = '';
  document.getElementById('cuenta').style.display = 'none';
  document.getElementById('seccionRutinas').style.display = 'block';

  limpiarCampos();
  bloques = [];
  guardarRutinas();

  ocultarBarra();
  document.getElementById('progressWrap').style.display = 'none';

  mostrarTituloConTañ();
  mostrarTituloEjercicio('');
  ocultarTituloEjercicio();

  setEntrenandoUI(false);
}

function confirmarReset() {
  const ok = confirm("¿Seguro que quieres resetear el entrenamiento? Perderás el progreso de esta sesión.");
  if (ok) { reiniciarEntrenamiento(); }
}




function reiniciarEntrenamiento() {
  clearInterval(timer); clearInterval(cronometroTotal); stopBeepIfAny();
  enPausa = false; entrenoEnCurso = false; unlockScreen();

  const msg = document.getElementById('mensaje');
  if (msg) {
    msg.innerText = "";
    msg.classList.remove('mensaje-final');
  }
  document.getElementById('cuenta').innerText = "00";
  document.getElementById('tiempoTotal').innerText = "0";
  document.getElementById('seriesCompletadas').innerText = "0";
  document.getElementById('btnReset').style.display = 'none';
  document.getElementById('btnPauseResume').style.display = 'none';
  document.getElementById('btnSkip').style.display = 'none';
  document.getElementById('formulario').classList.remove('oculto');
  document.getElementById('bloques').classList.remove('oculto');
  document.getElementById('bloques').innerHTML = '';
  document.getElementById('cuenta').style.display = 'none';
  document.getElementById('seccionRutinas').style.display = 'block';

  limpiarCampos();
  bloques = [];
  guardarRutinas();

  ocultarBarra();
  document.getElementById('progressWrap').style.display = 'none';

  mostrarTituloConTañ();
  mostrarTituloEjercicio('');
  ocultarTituloEjercicio();

  setEntrenandoUI(false);
}

// ==========================
// Utilidades UI
// ==========================
function limpiarCampos() {
  document.getElementById('nombre').value = '';
  document.getElementById('series').value = '';
  document.getElementById('serieTime').value = '';
  document.getElementById('descansoTime').value = '';
  document.getElementById('descansoBloque').value = '';
}

function iniciarCronometroTotal() {
  clearInterval(cronometroTotal);
  cronometroTotal = setInterval(() => {
    if (!enPausa) {
      tiempoTotal++;
      document.getElementById('tiempoTotal').innerText = tiempoTotal;
    }
  }, 1000);
}

// ==========================
// Rutinas (localStorage)
// ==========================
function guardarRutinas() { localStorage.setItem('rutinas', JSON.stringify(bloques)); }
function cargarRutinas() {
  const datos = localStorage.getItem('rutinas');
  if (datos) {
    bloques = JSON.parse(datos);
    document.getElementById('bloques').innerHTML = '';
    bloques.forEach(b => {
      const div = document.createElement('div');
      div.className = 'bloque-item';
      div.textContent = `${b.nombre} - ${b.series}x${b.serieTime}s + ${b.descansoTime}s descanso, ${b.descansoBloque}s entre bloques`;
      document.getElementById('bloques').appendChild(div);
    });
  }
}
function guardarComoRutina() {
  const nombre = document.getElementById('nombreRutina').value.trim();
  if (!nombre) { alert("Pon un nombre para la rutina."); return; }
  let rutinasGuardadas = JSON.parse(localStorage.getItem('rutinasGuardadas')) || {};
  rutinasGuardadas[nombre] = bloques;
  localStorage.setItem('rutinasGuardadas', JSON.stringify(rutinasGuardadas));
  actualizarSelectRutinas();
  alert(`Rutina "${nombre}" guardada.`);
}
function actualizarSelectRutinas() {
  const select = document.getElementById('selectRutinas');
  select.innerHTML = '<option value="">--Selecciona una rutina--</option>';
  const rutinas = JSON.parse(localStorage.getItem('rutinasGuardadas')) || {};
  for (const nombre in rutinas) {
    const option = document.createElement('option');
    option.value = nombre; option.textContent = nombre; select.appendChild(option);
  }
}
function cargarRutinaSeleccionada() {
  const nombre = document.getElementById('selectRutinas').value;
  if (!nombre) return;
  const rutinas = JSON.parse(localStorage.getItem('rutinasGuardadas')) || {};
  if (rutinas[nombre]) {
    bloques = rutinas[nombre];
    document.getElementById('bloques').innerHTML = '';
    bloques.forEach(b => {
      const div = document.createElement('div');
      div.className = 'bloque-item';
      div.textContent = `${b.nombre} - ${b.series}x${b.serieTime}s + ${b.descansoTime}s descanso, ${b.descansoBloque}s entre bloques`;
      document.getElementById('bloques').appendChild(div);
    });
  }
}
function eliminarRutina() {
  const nombre = document.getElementById('selectRutinas').value;
  if (!nombre) return;
  const rutinas = JSON.parse(localStorage.getItem('rutinasGuardadas')) || {};
  delete rutinas[nombre];
  localStorage.setItem('rutinasGuardadas', JSON.stringify(rutinas));
  actualizarSelectRutinas();
  alert(`Rutina "${nombre}" eliminada.`);
}

// ==========================
// Tema (claro/oscuro)
// ==========================
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('theme', theme); } catch(_) {}
  const sw = document.getElementById('themeSwitch');
  if (sw) sw.checked = (theme === 'dark');
}
function toggleThemeSwitch(el) { setTheme(el && el.checked ? 'dark' : 'light'); }
function initTheme() {
  let theme = 'light';
  try {
    const saved = localStorage.getItem('theme');
    if (saved) theme = saved;
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
  } catch(_) {}
  setTheme(theme);
}

// ==========================
// Inicialización (una sola vez)
// ==========================
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  cargarRutinas();
  actualizarSelectRutinas();

  // Splash
  setTimeout(() => {
    const splash = document.getElementById("splash");
    if (splash) splash.classList.add("oculto");
  }, 800);

  // PWA opcional
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
});
