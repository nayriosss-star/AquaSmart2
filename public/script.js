// ── Bubbles ──
(function () {
  const bg = document.getElementById('water-bg');
  if (!bg) return;
  for (let i = 0; i < 12; i++) {
    const b = document.createElement('div');
    b.className = 'bubble';
    const size = 20 + Math.random() * 60;
    b.style.cssText = `width:${size}px;height:${size}px;left:${Math.random() * 100}%; animation-duration:${8 + Math.random() * 12}s;animation-delay:${-Math.random() * 15}s;`;
    bg.appendChild(b);
  }
})();

let sistemaActivo = true;
let currentUser = null;
let liveInterval = null;
let statusInterval = null;
let chartInterval = null;
let modoActual = 'automatico';
let ultimoDosingId = null;
let dosingCheckInterval = null;
let alertInterval = null;
let iaInterval = null;
let tabAlertasActual = 'activas';
let alertasCache = { activas: [], historial: [] };
let alertasVistas = new Set();

// ── Helper para fetch autenticado ──
function authFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(options.headers || {}),
    },
  });
}

// ── Refresca los íconos de Lucide ──
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// ── Restaurar sesión al cargar ──
window.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!token || !user) return;
  try {
    const res = await authFetch('/api/me');
    if (res.ok) {
      const data = await res.json();
      launchApp({ name: data.name, email: data.email });
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  } catch { /* sin conexión */ }
});

// ── Tabs login/register ──
function switchTab(t) {
  document.getElementById('login-form').style.display = t === 'login' ? '' : 'none';
  document.getElementById('register-form').style.display = t === 'register' ? '' : 'none';
  document.querySelectorAll('.tab-btn').forEach((b, i) =>
    b.classList.toggle('active', (i === 0 && t === 'login') || (i === 1 && t === 'register'))
  );
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('register-error').style.display = 'none';
}

// ── LOGIN ──
async function doLogin(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');
  const btn = document.querySelector('#login-form .btn-primary');

  if (btn) { btn.textContent = 'Ingresando...'; btn.disabled = true; }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
    const data = await res.json();
    if (data.ok) {
      err.style.display = 'none';
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify({ name: data.name, email: data.email }));
      launchApp({ name: data.name, email: data.email });
    } else {
      err.textContent = data.error || 'Error al iniciar sesión.';
      err.style.display = 'block';
    }
  } catch {
    err.textContent = 'Error de conexión con el servidor.';
    err.style.display = 'block';
  } finally {
    if (btn) { btn.textContent = 'Ingresar al sistema'; btn.disabled = false; }
  }
}

// ── LOGIN DEMO ──
async function loginDemo() {
  const btn = document.querySelector('.btn-demo');
  if (!btn) return;

  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px;"></i> Ingresando...';
  btn.disabled = true;
  refreshIcons();

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'demo@aquasmart.com',
        password: 'aqua1234',
      }),
    });
    const data = await res.json();

    if (data.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify({ name: data.name, email: data.email }));
      launchApp({ name: data.name, email: data.email });
    } else {
      mostrarNotificacion('❌ Cuenta demo no disponible', 'alert');
    }
  } catch (err) {
    console.error('Error en loginDemo:', err);
    mostrarNotificacion('❌ Error de conexión', 'alert');
  } finally {
    btn.innerHTML = originalHTML;
    btn.disabled = false;
    refreshIcons();
  }
}

// ── REGISTER ──
async function doRegister(e) {
  if (e) e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-pass').value;
  const pass2 = document.getElementById('reg-pass2').value;
  const err = document.getElementById('register-error');

  if (!name || !email || !pass) {
    err.textContent = 'Completá todos los campos.';
    err.style.display = 'block'; return;
  }
  if (pass.length < 6) {
    err.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    err.style.display = 'block'; return;
  }
  if (pass !== pass2) {
    err.textContent = 'Las contraseñas no coinciden.';
    err.style.display = 'block'; return;
  }

  const btn = document.querySelector('#register-form .btn-primary');
  if (btn) { btn.textContent = 'Creando cuenta...'; btn.disabled = true; }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password: pass }),
    });
    const data = await res.json();
    if (data.ok) {
      err.style.display = 'none';
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify({ name: data.name, email: data.email }));
      launchApp({ name: data.name, email: data.email });
    } else {
      err.textContent = data.error || 'Error al registrarse.';
      err.style.display = 'block';
    }
  } catch {
    err.textContent = 'Error de conexión con el servidor.';
    err.style.display = 'block';
  } finally {
    if (btn) { btn.textContent = 'Crear cuenta'; btn.disabled = false; }
  }
}

// ── LOGOUT ──
function doLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  currentUser = null;
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
  if (liveInterval) clearInterval(liveInterval);
  if (statusInterval) clearInterval(statusInterval);
  if (alertInterval) clearInterval(alertInterval);
  if (iaInterval) clearInterval(iaInterval);
  if (dosingCheckInterval) clearInterval(dosingCheckInterval);
  if (chartInterval) clearInterval(chartInterval);
}

// ── Launch app ──
async function launchApp(user) {
  currentUser = user;
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';

  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('sidebar-avatar').textContent = initials;
  document.getElementById('sidebar-name').textContent = user.name.split(' ')[0];
  document.getElementById('sidebar-email').textContent = user.email;

  initCharts();
  await Promise.all([
    loadPool(),
    loadLatestMeasurement(),
    loadHistorial(),
    buildAlertas(),
    buildActividadReciente(),
    actualizarDosificacionesHoy(),
    cargarRecomendaciones(),
    cargarReporteMensual(),
    cargarModo(),
    cargarEstadoSistema(),
  ]);
  refreshIcons();
  startLiveData();
  iniciarAutoRefreshIA();
  iniciarCheckDosing();
}

// ── Navigation ──
function showSection(s, element) {
  ['dashboard', 'piscina', 'historial', 'alertas', 'ia'].forEach(id => {
    const el = document.getElementById('section-' + id);
    if (el) el.style.display = id === s ? '' : 'none';
  });

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (element) element.classList.add('active');

  if (s === 'alertas') buildAlertas();
  if (s === 'dashboard') buildActividadReciente();
  if (s === 'ia') {
    cargarRecomendaciones();
    cargarReporteMensual();
  }
  if (s === 'piscina') actualizarDosificacionRecomendada();

  if (window.innerWidth <= 900) closeSidebar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  refreshIcons();
}

// ── Menú hamburguesa ──
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('show');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
}

// ── Charts ──
async function initCharts() {
  await dibujarGraficoPH24h();
}

async function dibujarGraficoPH24h() {
  const svg = document.getElementById('ph-chart');
  if (!svg) return;

  // Mostrar estado de carga
  svg.innerHTML = `
    <text x="250" y="60" text-anchor="middle" fill="var(--text-secondary)" font-size="12" font-family="Inter">
      Cargando datos...
    </text>
  `;

  try {
    const res = await authFetch('/api/measurements?horas=24');
    const data = await res.json();

    if (!data.ok || !data.mediciones || data.mediciones.length === 0) {
      svg.innerHTML = `
        <text x="250" y="55" text-anchor="middle" fill="var(--text-secondary)" font-size="12" font-family="Inter">
          Sin datos suficientes todavía
        </text>
        <text x="250" y="75" text-anchor="middle" fill="var(--text-secondary)" font-size="10" font-family="Inter">
          El gráfico se va a llenar con las mediciones del ESP32
        </text>
      `;
      return;
    }

    // Ordenar de más antigua a más nueva
    const mediciones = [...data.mediciones].reverse();

    // Extraer los pH
    const phs = mediciones.map(m => m.ph);

    // Si hay muy pocos datos, mostrar aviso
    if (phs.length < 2) {
      svg.innerHTML = `
        <text x="250" y="55" text-anchor="middle" fill="var(--text-secondary)" font-size="12" font-family="Inter">
          Esperando más mediciones...
        </text>
        <text x="250" y="75" text-anchor="middle" fill="var(--text-secondary)" font-size="10" font-family="Inter">
          (${phs.length} de 2 mínimas)
        </text>
      `;
      return;
    }

    // Dibujar
    drawLine(svg, phs, 6.5, 8.5, 500, 120);

    // Actualizar subtítulo con info real
    const subtitle = document.querySelector('#section-dashboard .chart-card .chart-subtitle');
    if (subtitle && subtitle.textContent.includes('Rango óptimo')) {
      const phMin = Math.min(...phs).toFixed(2);
      const phMax = Math.max(...phs).toFixed(2);
      const phProm = (phs.reduce((a, b) => a + b, 0) / phs.length).toFixed(2);
      subtitle.textContent = `${phs.length} mediciones · mín ${phMin} · máx ${phMax} · prom ${phProm}`;
    }
  } catch (err) {
    console.error('Error en dibujarGraficoPH24h:', err);
    svg.innerHTML = `
      <text x="250" y="60" text-anchor="middle" fill="var(--red-alert)" font-size="12" font-family="Inter">
        Error al cargar datos
      </text>
    `;
  }
}

function drawLine(svg, data, min, max, W, H) {
  if (!svg || data.length === 0) return;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / (max - min)) * H}`);
  const yHi = H - ((7.6 - min) / (max - min)) * H;
  const yLo = H - ((6.8 - min) / (max - min)) * H;
  svg.innerHTML = `
    <rect x="0" y="${yHi}" width="${W}" height="${yLo - yHi}" fill="rgba(34,211,163,0.08)" rx="2"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--aqua)" stroke-width="2.5" stroke-linejoin="round"/>
    ${data.map((v, i) => `<circle cx="${(i / (data.length - 1)) * W}" cy="${H - ((v - min) / (max - min)) * H}" r="3" fill="${v >= 6.8 && v <= 7.6 ? 'var(--green-ok)' : 'var(--yellow-warn)'}" />`).join('')}
    <line x1="0" y1="${yHi}" x2="${W}" y2="${yHi}" stroke="rgba(34,211,163,0.3)" stroke-dasharray="4"/>
    <line x1="0" y1="${yLo}" x2="${W}" y2="${yLo}" stroke="rgba(34,211,163,0.3)" stroke-dasharray="4"/>
  `;
}

// ── Pool ──
async function loadPool() {
  try {
    const res = await authFetch('/api/pool');
    const data = await res.json();
    if (data.ok && data.pool) {
      document.getElementById('pool-largo').value = data.pool.largo || '';
      document.getElementById('pool-ancho').value = data.pool.ancho || '';
      document.getElementById('pool-prof').value = data.pool.profundidad || '';
      calcVol();
    }
    await actualizarDosificacionRecomendada();
  } catch { /* silencio */ }
}

function calcVol() {
  const l = parseFloat(document.getElementById('pool-largo').value) || 0;
  const a = parseFloat(document.getElementById('pool-ancho').value) || 0;
  const p = parseFloat(document.getElementById('pool-prof').value) || 0;
  const vol = (l * a * p).toFixed(1);
  const textEl = document.getElementById('pool-volume-text');
  const cardVol = document.getElementById('card-vol');

  if (vol <= 0) {
    if (textEl) textEl.innerHTML = 'Ingresá las dimensiones para calcular el volumen';
    return;
  }

  if (textEl) {
    textEl.innerHTML = `Volumen estimado: <strong>${vol} m³</strong> · Equivalente a ${(vol * 1000).toLocaleString('es-AR')} litros de agua`;
  }
  if (cardVol) cardVol.textContent = vol;

  actualizarDosificacionRecomendada();
}

// ═══════════════════════════════════════════
// GUARDAR DIMENSIONES
// ═══════════════════════════════════════════

async function guardarDimensiones() {
  const largo = parseFloat(document.getElementById('pool-largo').value) || 0;
  const ancho = parseFloat(document.getElementById('pool-ancho').value) || 0;
  const profundidad = parseFloat(document.getElementById('pool-prof').value) || 0;
  const btn = document.getElementById('btn-save-pool');

  if (largo <= 0 || ancho <= 0 || profundidad <= 0) {
    mostrarFeedbackPool('⚠️ Ingresá todas las dimensiones (mayores a 0)', 'warn');
    return;
  }
  if (largo > 200 || ancho > 200 || profundidad > 10) {
    mostrarFeedbackPool('⚠️ Las dimensiones parecen demasiado grandes. Verificalas.', 'warn');
    return;
  }

  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px;"></i> Guardando...';
  btn.disabled = true;
  refreshIcons();

  try {
    const res = await authFetch('/api/pool', {
      method: 'PUT',
      body: JSON.stringify({ largo, ancho, profundidad }),
    });
    const data = await res.json();

    if (data.ok) {
      mostrarFeedbackPool(`✅ Dimensiones guardadas: ${largo} × ${ancho} × ${profundidad} m (${data.pool.volumen} m³)`, 'ok');
      mostrarNotificacion('✅ Dimensiones guardadas correctamente', 'ok');
      actualizarDosificacionRecomendada();
    } else {
      mostrarFeedbackPool(`❌ ${data.error || 'Error al guardar'}`, 'alert');
    }
  } catch (err) {
    console.error('Error guardando dimensiones:', err);
    mostrarFeedbackPool('❌ Error de conexión con el servidor', 'alert');
  } finally {
    btn.innerHTML = originalHTML;
    btn.disabled = false;
    refreshIcons();
  }
}

function mostrarFeedbackPool(mensaje, tipo = 'ok') {
  const feedback = document.getElementById('pool-save-feedback');
  if (!feedback) return;

  const estilos = {
    ok:    { bg: 'rgba(34,211,163,0.1)',  border: 'rgba(34,211,163,0.3)',  color: 'var(--green-ok)' },
    warn:  { bg: 'rgba(255,184,48,0.1)',  border: 'rgba(255,184,48,0.3)',  color: 'var(--yellow-warn)' },
    alert: { bg: 'rgba(255,77,109,0.1)',  border: 'rgba(255,77,109,0.3)',  color: 'var(--red-alert)' },
  };
  const s = estilos[tipo] || estilos.ok;

  feedback.style.display = 'block';
  feedback.style.background = s.bg;
  feedback.style.border = `1px solid ${s.border}`;
  feedback.style.color = s.color;
  feedback.textContent = mensaje;

  clearTimeout(window._poolFeedbackTimer);
  window._poolFeedbackTimer = setTimeout(() => {
    feedback.style.display = 'none';
  }, 5000);
}

// ═══════════════════════════════════════════
// DOSIFICACIÓN RECOMENDADA (DINÁMICA)
// ═══════════════════════════════════════════

async function actualizarDosificacionRecomendada() {
  const cont = document.getElementById('dosificacion-recomendada-content');
  const subtitle = document.getElementById('dosificacion-subtitle');
  if (!cont) return;

  let volumen = 0;
  let phActual = null;
  let ultimaDosisCloro = null;

  try {
    const [resPool, resMed, resDosing] = await Promise.all([
      authFetch('/api/pool'),
      authFetch('/api/measurements/latest'),
      authFetch('/api/dosing'),
    ]);

    const dataPool = await resPool.json();
    const dataMed = await resMed.json();
    const dataDosing = await resDosing.json();

    if (dataPool.ok && dataPool.pool) {
      volumen = dataPool.pool.volumen || (dataPool.pool.largo * dataPool.pool.ancho * dataPool.pool.profundidad) || 0;
    }
    if (dataMed.ok && dataMed.measurement) {
      phActual = dataMed.measurement.ph;
    }
    if (dataDosing.ok && dataDosing.eventos) {
      // Buscar la última dosificación de cloro
      ultimaDosisCloro = dataDosing.eventos.find(e => e.tipo === 'cloro') || null;
    }
  } catch (err) {
    console.error('Error obteniendo datos:', err);
  }

  if (volumen <= 0) {
    cont.innerHTML = `
      <div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px;">
        Ingresá las dimensiones de tu piscina para ver las recomendaciones
      </div>`;
    if (subtitle) subtitle.textContent = 'Primero configurá las dimensiones';
    return;
  }

  if (phActual === null) {
    cont.innerHTML = `
      <div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px;">
        Esperando la primera medición del sensor de pH
      </div>`;
    if (subtitle) subtitle.textContent = 'Sin datos de pH todavía';
    return;
  }

  if (subtitle) {
    subtitle.textContent = `Basada en el volumen actual (${volumen} m³) y el último pH medido (${phActual.toFixed(2)})`;
  }

  // ── Calcular ácido y base (según pH) ──
  let acidoCantidad = 0;
  let baseCantidad = 0;
  let estadoPH = 'ok';

  if (phActual > 7.6) {
    acidoCantidad = Math.round((phActual - 7.2) * volumen * 8);
    estadoPH = 'alto';
  } else if (phActual < 6.8) {
    baseCantidad = Math.round((7.2 - phActual) * volumen * 12);
    estadoPH = 'bajo';
  }

  const colorEstado = {
    ok: 'var(--green-ok)',
    alto: 'var(--yellow-warn)',
    bajo: 'var(--yellow-warn)',
  }[estadoPH];

  const mensajeEstado = {
    ok: `✓ pH en rango óptimo (6.8 – 7.6) — sin dosificación necesaria`,
    alto: `⚠ pH por encima del rango — se recomienda dosificar ácido`,
    bajo: `⚠ pH por debajo del rango — se recomienda dosificar base`,
  }[estadoPH];

  // ── Calcular cloro (según volumen y última dosificación) ──
  const cloroCantidad = Math.round(volumen * 1.5);

  let horasDesdeCloro = null;
  let textoUltimaCloro = 'Nunca';
  let textoProximaCloro = 'Se recomienda dosificar ahora';
  let estadoCloro = 'recomendado'; // 'recomendado' | 'esperar' | 'ok'

  if (ultimaDosisCloro) {
    horasDesdeCloro = (Date.now() - new Date(ultimaDosisCloro.createdAt).getTime()) / (60 * 60 * 1000);
    textoUltimaCloro = tiempoRelativo(new Date(ultimaDosisCloro.createdAt));

    if (horasDesdeCloro >= 24) {
      textoProximaCloro = 'Se recomienda dosificar ahora';
      estadoCloro = 'recomendado';
    } else {
      const horasRestantes = 24 - horasDesdeCloro;
      if (horasRestantes < 1) {
        textoProximaCloro = 'Próxima en menos de 1 hora';
      } else {
        textoProximaCloro = `Próxima en ${Math.round(horasRestantes)} horas`;
      }
      estadoCloro = horasRestantes < 12 ? 'ok' : 'esperar';
    }
  }

  const colorCloro = {
    recomendado: 'var(--yellow-warn)',
    esperar: 'var(--aqua)',
    ok: 'var(--text-secondary)',
  }[estadoCloro];

  const opacidadCloro = estadoCloro === 'ok' ? '0.65' : '1';

  // ── Render ──
  cont.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:18px;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);font-size:13px;color:${colorEstado};font-weight:500;">
      ${mensajeEstado}
    </div>

    <div class="dosage-row" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
      <div class="dosage-item" style="opacity:${acidoCantidad > 0 ? '1' : '0.45'};">
        <div class="dosage-name">ÁCIDO MURIÁTICO (para bajar pH)</div>
        <div class="dosage-val" style="color:${acidoCantidad > 0 ? 'var(--red-alert)' : 'var(--text-secondary)'};">
          ${acidoCantidad} <span class="dosage-unit">ml</span>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">
          ${acidoCantidad > 0
            ? `Dosificar para llevar el pH de ${phActual.toFixed(2)} a ~7.2`
            : 'pH actual en rango — sin necesidad'}
        </div>
      </div>

      <div class="dosage-item" style="opacity:${baseCantidad > 0 ? '1' : '0.45'};">
        <div class="dosage-name">BICARBONATO (para subir pH)</div>
        <div class="dosage-val" style="color:${baseCantidad > 0 ? 'var(--green-ok)' : 'var(--text-secondary)'};">
          ${baseCantidad} <span class="dosage-unit">g</span>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">
          ${baseCantidad > 0
            ? `Dosificar para llevar el pH de ${phActual.toFixed(2)} a ~7.2`
            : 'pH actual en rango — sin necesidad'}
        </div>
      </div>

      <div class="dosage-item" style="opacity:${opacidadCloro};">
        <div class="dosage-name">CLORO (dosificación diaria)</div>
        <div class="dosage-val" style="color:${colorCloro};">
          ${cloroCantidad} <span class="dosage-unit">g</span>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">
          Última: ${textoUltimaCloro}<br>
          ${textoProximaCloro}
        </div>
      </div>
    </div>

    ${(acidoCantidad > 0 || baseCantidad > 0 || estadoCloro === 'recomendado' || estadoCloro === 'esperar') ? `
      <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;">
        ${acidoCantidad > 0 ? `
          <button class="btn-dosificar-acido" onclick="dosificarDesdeRecomendacion('ph_bajar', ${acidoCantidad}, 'ml')">
            <i data-lucide="beaker" style="width:16px;height:16px;"></i>
            <span>Dosificar ${acidoCantidad} ml de ácido</span>
          </button>
        ` : ''}
        ${baseCantidad > 0 ? `
          <button class="btn-dosificar-base" onclick="dosificarDesdeRecomendacion('ph_subir', ${baseCantidad}, 'g')">
            <i data-lucide="beaker" style="width:16px;height:16px;"></i>
            <span>Dosificar ${baseCantidad} g de base</span>
          </button>
        ` : ''}
        ${(estadoCloro === 'recomendado' || estadoCloro === 'esperar') ? `
          <button class="btn-dosificar-cloro" onclick="dosificarCloroDesdeRecomendacion(${cloroCantidad}, ${horasDesdeCloro !== null ? Math.round(24 - horasDesdeCloro) : 0})">
            <i data-lucide="droplets" style="width:16px;height:16px;"></i>
            <span>Dosificar ${cloroCantidad} g de cloro</span>
          </button>
        ` : ''}
      </div>
    ` : ''}
  `;

  refreshIcons();
}



async function dosificarDesdeRecomendacion(tipo, cantidad, unidad) {
  if (!confirm(`¿Ejecutar dosificación de ${cantidad} ${unidad} (${tipo === 'ph_bajar' ? 'ácido' : 'base'})?`)) return;

  try {
    const res = await authFetch('/api/ia/recommendations/execute', {
      method: 'POST',
      body: JSON.stringify({
        tipo,
        cantidad,
        unidad,
        motivo: 'Dosificación desde sección Mi Piscina',
      }),
    });
    const data = await res.json();
    if (data.ok) {
      mostrarNotificacion('✅ Dosificación ejecutada', 'ok');
      await Promise.all([
        loadHistorial(),
        buildAlertas(),
        loadLatestMeasurement(),
      ]);
    } else {
      mostrarNotificacion(`❌ ${data.error}`, 'alert');
    }
  } catch {
    mostrarNotificacion('❌ Error de conexión', 'alert');
  }
}

// ── Última medición ──
async function loadLatestMeasurement() {
  try {
    const res = await authFetch('/api/measurements/latest');
    const data = await res.json();
    if (data.ok && data.measurement) {
      updateMetrics(data.measurement);
    } else {
      actualizarEstadoESP32(null);
    }
  } catch { /* silencio */ }
}

function updateMetrics(m) {
  const phEl = document.getElementById('card-ph');
  const tempEl = document.getElementById('card-temp');
  const clEl = document.getElementById('card-cl');
  const markerEl = document.getElementById('ph-marker');

  if (typeof m.ph === 'number' && phEl) {
    phEl.textContent = m.ph.toFixed(2);
    if (markerEl) {
      const pct = Math.max(0, Math.min(100, (m.ph / 14) * 100));
      markerEl.style.left = pct + '%';
    }
  }
  if (typeof m.temperatura === 'number' && tempEl) {
    tempEl.textContent = m.temperatura.toFixed(1);
  }
  if (typeof m.cloro === 'number' && clEl) {
    clEl.textContent = m.cloro.toFixed(1);
  }

  actualizarEstadoESP32(m.createdAt);

  // Refrescar dosificación si estamos en la sección piscina
  const seccionPiscina = document.getElementById('section-piscina');
  if (seccionPiscina && seccionPiscina.style.display !== 'none') {
    actualizarDosificacionRecomendada();
  }
}

// ── Estado del ESP32 ──
function actualizarEstadoESP32(ultimaMedicionFecha) {
  const pill = document.getElementById('esp32-status-pill');
  const dot = document.getElementById('esp32-status-dot');
  const text = document.getElementById('esp32-status-text');
  const subtitle = document.getElementById('dashboard-subtitle');

  if (!pill || !dot || !text) return;

  if (!ultimaMedicionFecha) {
    pill.style.background = 'rgba(255,255,255,0.05)';
    pill.style.borderColor = 'rgba(255,255,255,0.15)';
    pill.style.color = 'var(--text-secondary)';
    dot.style.background = 'var(--text-secondary)';
    dot.style.boxShadow = 'none';
    dot.style.animation = 'none';
    text.textContent = 'Sin datos';
    if (subtitle) subtitle.textContent = 'Esperando la primera medición...';
    return;
  }

  const diff = Date.now() - new Date(ultimaMedicionFecha).getTime();
  const minutos = diff / 60000;

  let estado = 'conectado';
  let label = 'ESP32 conectado';
  let color = 'var(--green-ok)';
  let bg = 'rgba(34,211,163,0.12)';
  let border = 'rgba(34,211,163,0.3)';

  if (minutos > 10) {
    estado = 'desconectado';
    label = 'ESP32 desconectado';
    color = 'var(--red-alert)';
    bg = 'rgba(255,77,109,0.12)';
    border = 'rgba(255,77,109,0.3)';
  } else if (minutos > 2) {
    estado = 'inactivo';
    label = 'ESP32 inactivo';
    color = 'var(--yellow-warn)';
    bg = 'rgba(255,184,48,0.12)';
    border = 'rgba(255,184,48,0.3)';
  }

  pill.style.background = bg;
  pill.style.borderColor = border;
  pill.style.color = color;
  dot.style.background = color;
  dot.style.boxShadow = `0 0 8px ${color}`;
  dot.style.animation = estado === 'conectado' ? 'pulse-dot 2s ease-in-out infinite' : 'none';
  text.textContent = label;

  if (subtitle) {
    const hace = tiempoRelativo(ultimaMedicionFecha);
    subtitle.textContent = `Monitoreo en tiempo real · Última actualización: ${hace}`;
  }
}

async function dosificarCloroDesdeRecomendacion(cantidad, horasRestantes) {
  // Validación: si faltan horas, preguntar
  if (horasRestantes > 0) {
    const confirmacion = confirm(
      `Todavía no le toca al cloro.\n\n` +
      `Faltan aproximadamente ${horasRestantes} horas para la próxima dosificación automática.\n\n` +
      `¿Seguro querés dosificar ${cantidad} g de cloro ahora?`
    );
    if (!confirmacion) return;
  } else {
    if (!confirm(`¿Ejecutar dosificación de ${cantidad} g de cloro?`)) return;
  }

  try {
    const res = await authFetch('/api/ia/recommendations/execute', {
      method: 'POST',
      body: JSON.stringify({
        tipo: 'cloro',
        cantidad,
        unidad: 'g',
        motivo: 'Dosificación de cloro desde sección Mi Piscina',
      }),
    });
    const data = await res.json();

    if (data.ok) {
      mostrarNotificacion('✅ Cloro dosificado correctamente', 'ok');
      // Refrescar todo
      await Promise.all([
        actualizarDosificacionRecomendada(),
        loadHistorial(),
        buildAlertas(),
        actualizarDosificacionesHoy(),
      ]);
    } else {
      mostrarNotificacion(`❌ ${data.error}`, 'alert');
    }
  } catch (err) {
    console.error('Error en dosificarCloroDesdeRecomendacion:', err);
    mostrarNotificacion('❌ Error de conexión', 'alert');
  }
}

// ── Historial ──
async function loadHistorial() {
  try {
    const res = await authFetch('/api/dosing');
    const data = await res.json();
    if (!data.ok) return;
    const tbody = document.getElementById('historial-table');
    if (!tbody) return;
    if (!data.eventos.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="padding:16px;color:var(--text-secondary);text-align:center">Sin dosificaciones registradas</td></tr>`;
      return;
    }
    const colors = { acido: 'var(--red-alert)', base: 'var(--green-ok)', cloro: '#FFD700' };
    const labels = { acido: 'Ácido', base: 'Base', cloro: 'Cloro' };
    tbody.innerHTML = data.eventos.map(e => {
      const fecha = new Date(e.createdAt);
      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
          <td style="padding:10px 0;color:var(--text-secondary)">${fecha.toLocaleDateString('es-AR')}</td>
          <td style="padding:10px 0;color:var(--text-primary)">${fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
          <td style="padding:10px 0;color:${colors[e.tipo] || 'var(--text-primary)'}">${labels[e.tipo] || e.tipo}</td>
          <td style="padding:10px 0;color:var(--text-primary)">${e.cantidad} ${e.unidad}</td>
          <td style="padding:10px 0;color:var(--aqua);font-weight:600">${e.modo || '—'}</td>
        </tr>`;
    }).join('');
  } catch { /* silencio */ }
}

// ═══════════════════════════════════════════
// ALERTAS
// ═══════════════════════════════════════════

async function buildAlertas() {
  try {
    const [resActivas, resHistorial] = await Promise.all([
      authFetch('/api/alerts'),
      authFetch('/api/alerts/history'),
    ]);

    const dataActivas = await resActivas.json();
    const dataHistorial = await resHistorial.json();

    if (dataActivas.ok) alertasCache.activas = dataActivas.alerts;
    if (dataHistorial.ok) alertasCache.historial = dataHistorial.alerts;

    actualizarContadoresAlertas();
    renderAlertas();
    detectarAlertasNuevas();
  } catch (err) {
    console.error('Error en buildAlertas:', err);
  }
}

function actualizarContadoresAlertas() {
  const countActivas = document.getElementById('count-activas');
  const countHistorial = document.getElementById('count-historial');
  if (countActivas) countActivas.textContent = alertasCache.activas.length;
  if (countHistorial) countHistorial.textContent = alertasCache.historial.length;
}

function cambiarTabAlertas(tab) {
  tabAlertasActual = tab;
  document.querySelectorAll('.alerts-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.getElementById('alertas-activas').style.display = tab === 'activas' ? '' : 'none';
  document.getElementById('alertas-historial').style.display = tab === 'historial' ? '' : 'none';
  renderAlertas();
}

function renderAlertas() {
  const contActivas = document.getElementById('alertas-activas');
  const contHistorial = document.getElementById('alertas-historial');
  if (!contActivas || !contHistorial) return;

  if (alertasCache.activas.length === 0) {
    contActivas.innerHTML = `
      <div class="alert-empty">
        <i data-lucide="check-circle" style="width:40px;height:40px;color:var(--green-ok);"></i>
        <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-top:12px;">Todo en orden</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">No hay alertas activas. El sistema está monitoreando.</div>
      </div>`;
  } else {
    contActivas.innerHTML = alertasCache.activas.map(a => renderAlertaItem(a, false)).join('');
  }

  if (alertasCache.historial.length === 0) {
    contHistorial.innerHTML = `
      <div class="alert-empty">
        <i data-lucide="history" style="width:40px;height:40px;color:var(--text-secondary);"></i>
        <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-top:12px;">Sin historial</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">Las alertas resueltas aparecerán acá.</div>
      </div>`;
  } else {
    contHistorial.innerHTML = alertasCache.historial.map(a => renderAlertaItem(a, true)).join('');
  }

  refreshIcons();
}

function renderAlertaItem(alerta, esHistorial) {
  const fecha = new Date(alerta.createdAt);
  const hace = tiempoRelativo(fecha);

  const config = {
    ph_muy_alto:      { icon: 'trending-up',   color: 'var(--red-alert)',   bg: 'rgba(255,77,109,0.08)' },
    ph_muy_bajo:      { icon: 'trending-down', color: 'var(--red-alert)',   bg: 'rgba(255,77,109,0.08)' },
    ph_alto:          { icon: 'trending-up',   color: 'var(--yellow-warn)', bg: 'rgba(255,184,48,0.08)' },
    ph_bajo:          { icon: 'trending-down', color: 'var(--yellow-warn)', bg: 'rgba(255,184,48,0.08)' },
    temp_extrema_alta:{ icon: 'thermometer',   color: 'var(--red-alert)',   bg: 'rgba(255,77,109,0.08)' },
    temp_extrema_baja:{ icon: 'thermometer',   color: 'var(--red-alert)',   bg: 'rgba(255,77,109,0.08)' },
    temp_alta:        { icon: 'thermometer',   color: 'var(--yellow-warn)', bg: 'rgba(255,184,48,0.08)' },
    temp_baja:        { icon: 'thermometer',   color: 'var(--yellow-warn)', bg: 'rgba(255,184,48,0.08)' },
    esp32_inactivo:   { icon: 'wifi-off',      color: 'var(--yellow-warn)', bg: 'rgba(255,184,48,0.08)' },
    sin_dosificacion: { icon: 'clock',         color: 'var(--yellow-warn)', bg: 'rgba(255,184,48,0.08)' },
    cloro_recomendacion: { icon: 'droplet',    color: 'var(--aqua)',        bg: 'rgba(0,200,224,0.08)' },
  };
  const c = config[alerta.tipo] || { icon: 'bell', color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.04)' };

  const estadoBadge = esHistorial
    ? `<span class="alert-estado-badge ${alerta.estado}">${alerta.estado === 'activa' ? 'Activa' : 'Resuelta'}</span>`
    : '';

  const botonResolver = !esHistorial
    ? `<button class="alert-resolve-btn" onclick="resolverAlerta('${alerta._id}')" title="Marcar como resuelta">
         <i data-lucide="check" style="width:14px;height:14px;"></i>
       </button>`
    : '';

  const tieneAccion = alerta.accionSugerida && alerta.accionSugerida.tipo && alerta.accionSugerida.cantidad > 0;
  const botonEjecutar = tieneAccion
    ? `<button class="alert-execute-btn" onclick='ejecutarDesdeAlerta("${alerta._id}", ${JSON.stringify(alerta.accionSugerida).replace(/'/g, "&#39;")})'>
         <i data-lucide="play" style="width:12px;height:12px;"></i>
         Ejecutar
       </button>`
    : '';

  return `
    <div class="alert-card-item" style="background:${c.bg};border-left-color:${c.color};">
      <div class="alert-item-icon" style="background:${c.bg};">
        <i data-lucide="${c.icon}" style="width:18px;height:18px;color:${c.color};"></i>
      </div>
      <div class="alert-item-content">
        <div class="alert-item-header">
          <div class="alert-item-title">${alerta.titulo}</div>
          ${estadoBadge}
        </div>
        <div class="alert-item-message">${alerta.mensaje}</div>
        <div class="alert-item-footer">
          <span class="alert-item-time">
            <i data-lucide="clock" style="width:11px;height:11px;"></i>
            ${hace}
          </span>
          <span class="alert-item-severidad ${alerta.severidad}">
            ${alerta.severidad === 'critica' ? '🔴 Crítica' : alerta.severidad === 'advertencia' ? '🟡 Advertencia' : '🤖 IA'}
          </span>
        </div>
      </div>
      <div class="alert-item-actions">
        ${botonEjecutar}
        ${botonResolver}
      </div>
    </div>`;
}

async function resolverAlerta(id) {
  try {
    const res = await authFetch(`/api/alerts/${id}/resolve`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      mostrarNotificacion('✅ Alerta resuelta', 'ok');
      await buildAlertas();
    }
  } catch {
    mostrarNotificacion('❌ Error al resolver', 'alert');
  }
}

async function ejecutarDesdeAlerta(idAlerta, accion) {
  const { tipo, cantidad, unidad } = accion;
  if (!confirm(`¿Ejecutar dosificación de ${cantidad} ${unidad} (${tipo})?`)) return;

  try {
    const res = await authFetch('/api/ia/recommendations/execute', {
      method: 'POST',
      body: JSON.stringify({ tipo, cantidad, unidad, motivo: accion.motivo || 'Ejecutado desde alerta' }),
    });
    const data = await res.json();
    if (data.ok) {
      mostrarNotificacion('✅ Dosificación ejecutada', 'ok');
      await resolverAlerta(idAlerta);
    } else {
      mostrarNotificacion(`❌ ${data.error}`, 'alert');
    }
  } catch {
    mostrarNotificacion('❌ Error de conexión', 'alert');
  }
}

function tiempoRelativo(fecha) {
  const diff = Date.now() - new Date(fecha).getTime();
  const seg = Math.floor(diff / 1000);
  const min = Math.floor(seg / 60);
  const hs = Math.floor(min / 60);
  const dias = Math.floor(hs / 24);

  if (seg < 60) return 'hace unos segundos';
  if (min < 60) return `hace ${min} min`;
  if (hs < 24) return `hace ${hs} hs`;
  return `hace ${dias} día${dias > 1 ? 's' : ''}`;
}

function detectarAlertasNuevas() {
  alertasCache.activas.forEach(a => {
    if (a.severidad === 'critica' && !alertasVistas.has(a._id)) {
      alertasVistas.add(a._id);
      mostrarPopupAlerta(a);
    }
  });
}

function mostrarPopupAlerta(alerta) {
  const popup = document.createElement('div');
  popup.className = 'alert-popup critica';
  popup.innerHTML = `
    <div class="alert-popup-header">
      <i data-lucide="alert-triangle" style="width:18px;height:18px;"></i>
      <span>Alerta crítica</span>
      <button class="alert-popup-close" onclick="this.parentElement.parentElement.remove()">
        <i data-lucide="x" style="width:14px;height:14px;"></i>
      </button>
    </div>
    <div class="alert-popup-title">${alerta.titulo}</div>
    <div class="alert-popup-message">${alerta.mensaje}</div>
  `;
  document.body.appendChild(popup);
  refreshIcons();

  setTimeout(() => {
    popup.style.opacity = '0';
    popup.style.transition = 'opacity 0.3s';
    setTimeout(() => popup.remove(), 300);
  }, 8000);
}

// ═══════════════════════════════════════════
// DOSIFICACIONES DE HOY (Dashboard)
// ═══════════════════════════════════════════

async function actualizarDosificacionesHoy() {
  try {
    const res = await authFetch('/api/dosing');
    const data = await res.json();
    if (!data.ok) return;

    // Filtrar solo las de hoy
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const eventosHoy = data.eventos.filter(e => new Date(e.createdAt) >= hoy);

    const conteo = { acido: 0, base: 0, cloro: 0 };
    eventosHoy.forEach(e => {
      if (conteo[e.tipo] !== undefined) conteo[e.tipo]++;
    });

    const total = eventosHoy.length;

    // Actualizar subtítulo
    const subtitle = document.getElementById('dosificaciones-subtitle');
    if (subtitle) {
      subtitle.textContent = total === 0
        ? 'Sin dosificaciones registradas hoy'
        : `${total} dosificación${total > 1 ? 'es' : ''} en total`;
    }

    // Calcular máximo para las barras
    const maxConteo = Math.max(conteo.acido, conteo.base, conteo.cloro, 1);

    // Actualizar cada uno
    actualizarItemDosis('acido', conteo.acido, maxConteo);
    actualizarItemDosis('base', conteo.base, maxConteo);
    actualizarItemDosis('cloro', conteo.cloro, maxConteo);
  } catch (err) {
    console.error('Error en actualizarDosificacionesHoy:', err);
  }
}

function actualizarItemDosis(tipo, cantidad, maxConteo) {
  const countEl = document.getElementById(`dosis-${tipo}-count`);
  const labelEl = document.getElementById(`dosis-${tipo}-label`);
  const barEl = document.getElementById(`dosis-${tipo}-bar`);

  if (countEl) countEl.textContent = cantidad;
  if (labelEl) labelEl.textContent = cantidad === 1 ? 'vez' : 'veces';
  if (barEl) {
    const pct = (cantidad / maxConteo) * 100;
    barEl.style.width = pct + '%';
  }
}

// ── Actividad reciente (dashboard) ──
async function buildActividadReciente() {
  const cont = document.getElementById('actividad-reciente');
  if (!cont) return;
  try {
    const res = await authFetch('/api/dosing');
    const data = await res.json();
    const items = [];
    if (data.ok && data.eventos.length) {
      data.eventos.slice(0, 5).forEach(e => {
        const fecha = new Date(e.createdAt);
        const labels = { acido: 'ácido', base: 'base', cloro: 'cloro' };
        items.push({
          type: e.tipo === 'acido' ? 'warn' : 'ok',
          msg: `Dosificación de ${labels[e.tipo] || e.tipo} (${e.cantidad} ${e.unidad}) — ${e.motivo || ''}`,
          time: fecha.toLocaleString('es-AR'),
        });
      });
    }
    if (!items.length) {
      items.push({ type: 'ok', msg: 'Sin actividad reciente.', time: '—' });
    }
    cont.innerHTML = items.map(a => `
      <div class="alert-item">
        <div class="alert-dot ${a.type}"></div>
        <div>
          <div class="alert-text">${a.msg}</div>
          <div class="alert-time">${a.time}</div>
        </div>
      </div>`).join('');
  } catch { /* silencio */ }
}

// ── DOSIFICACIÓN MANUAL ──
async function dosificar(tipo, ev) {
  const btn = ev?.currentTarget || window.event?.currentTarget;
  if (!btn) return;

  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<div style="opacity:0.6;">Procesando...</div>';
  btn.disabled = true;

  try {
    const res = await authFetch('/api/dosing', {
      method: 'POST',
      body: JSON.stringify({ tipo, modo: 'manual' }),
    });
    const data = await res.json();

    if (data.ok) {
      mostrarNotificacion(`✅ Dosificación registrada (manual)`, 'ok');
      await Promise.all([
        loadLatestMeasurement(),
        loadHistorial(),
        buildAlertas(),
        buildActividadReciente(),
      ]);
      refreshIcons();
    } else {
      mostrarNotificacion(`❌ ${data.error || 'Error al dosificar'}`, 'alert');
    }
  } catch (err) {
    console.error('Error en dosificar:', err);
    mostrarNotificacion('❌ Error de conexión con el servidor', 'alert');
  } finally {
    btn.innerHTML = originalHTML;
    btn.disabled = false;
    refreshIcons();
  }
}

// ── Notificaciones ──
function mostrarNotificacion(mensaje, tipo = 'ok') {
  const notif = document.createElement('div');
  notif.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 1000;
    padding: 14px 20px; border-radius: 12px;
    background: ${tipo === 'ok' ? 'rgba(34,211,163,0.15)' : 'rgba(255,77,109,0.15)'};
    border: 1px solid ${tipo === 'ok' ? 'var(--green-ok)' : 'var(--red-alert)'};
    color: var(--text-primary); font-size: 14px; font-weight: 500;
    backdrop-filter: blur(10px);
    animation: slideIn 0.3s ease;
  `;
  notif.textContent = mensaje;
  document.body.appendChild(notif);

  setTimeout(() => {
    notif.style.opacity = '0';
    notif.style.transition = 'opacity 0.3s';
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

// ═══════════════════════════════════════════
// SECCIÓN IA
// ═══════════════════════════════════════════

async function cargarRecomendaciones() {
  const cont = document.getElementById('recomendaciones-list');
  if (!cont) return;

  cont.innerHTML = `
    <div style="text-align:center;padding:24px;">
      <div style="display:inline-block;width:24px;height:24px;border:3px solid rgba(0,200,224,0.3);border-top-color:var(--aqua);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
      <div style="font-size:13px;color:var(--text-secondary);margin-top:12px;">Analizando patrones...</div>
    </div>`;

  try {
    const res = await authFetch('/api/ia/recommendations');
    const data = await res.json();

    if (!data.ok) {
      cont.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);">Error al cargar recomendaciones</div>';
      return;
    }

    if (data.recomendaciones.length === 0) {
      cont.innerHTML = `
        <div class="ia-empty">
          <i data-lucide="sparkles" style="width:40px;height:40px;color:var(--aqua);"></i>
          <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-top:12px;">Sin recomendaciones todavía</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;line-height:1.5;">
            Necesitamos más datos históricos para detectar patrones.<br>
            Seguí usando el sistema y en unos días aparecerán recomendaciones automáticas.
          </div>
        </div>`;
      refreshIcons();
      return;
    }

    cont.innerHTML = data.recomendaciones.map(r => renderRecomendacion(r)).join('');
    refreshIcons();
  } catch (err) {
    console.error('Error en cargarRecomendaciones:', err);
    cont.innerHTML = '<div style="padding:20px;text-align:center;color:var(--red-alert);">Error de conexión</div>';
  }
}

function renderRecomendacion(r) {
  const config = {
    prediccion_ph:           { icon: 'trending-up',  color: 'var(--yellow-warn)', bg: 'rgba(255,184,48,0.06)', border: 'rgba(255,184,48,0.25)' },
    patron_horario:          { icon: 'clock',        color: 'var(--aqua)',        bg: 'rgba(0,200,224,0.06)', border: 'rgba(0,200,224,0.25)' },
    eficiencia_dosificacion: { icon: 'zap',          color: '#A78BFA',            bg: 'rgba(167,139,250,0.06)', border: 'rgba(167,139,250,0.25)' },
    recomendacion_cloro:     { icon: 'droplet',      color: 'var(--green-ok)',    bg: 'rgba(34,211,163,0.06)', border: 'rgba(34,211,163,0.25)' },
  };
  const c = config[r.tipo] || { icon: 'sparkles', color: 'var(--aqua)', bg: 'rgba(0,200,224,0.06)', border: 'rgba(0,200,224,0.25)' };

  const botonEjecutar = r.accionSugerida && r.accionSugerida.tipo
    ? `<button class="ia-execute-btn" onclick='ejecutarRecomendacionIA(${JSON.stringify(r.accionSugerida).replace(/'/g, "&#39;")})'>
         <i data-lucide="play" style="width:14px;height:14px;"></i>
         Ejecutar dosificación
       </button>`
    : '';

  return `
    <div class="ia-card" style="background:${c.bg};border-color:${c.border};">
      <div class="ia-card-header">
        <div class="ia-card-icon" style="color:${c.color};">
          <i data-lucide="${c.icon}" style="width:20px;height:20px;"></i>
        </div>
        <div style="flex:1;">
          <div class="ia-card-title">${r.titulo}</div>
          <div class="ia-card-confianza">
            Confianza: ${r.confianza}%
            <div class="ia-confianza-bar">
              <div class="ia-confianza-fill" style="width:${r.confianza}%;background:${c.color};"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="ia-card-message">${r.mensaje}</div>
      ${botonEjecutar ? `<div class="ia-card-actions">${botonEjecutar}</div>` : ''}
    </div>`;
}

async function ejecutarRecomendacionIA(accion) {
  const { tipo, cantidad, unidad, motivo } = accion;

  if (!confirm(`¿Ejecutar dosificación de ${cantidad} ${unidad} de ${tipo}?\n\n${motivo || ''}`)) return;

  try {
    const res = await authFetch('/api/ia/recommendations/execute', {
      method: 'POST',
      body: JSON.stringify({ tipo, cantidad, unidad, motivo }),
    });
    const data = await res.json();
    if (data.ok) {
      mostrarNotificacion('✅ Dosificación ejecutada', 'ok');
      await Promise.all([cargarRecomendaciones(), buildAlertas(), loadHistorial()]);
    } else {
      mostrarNotificacion(`❌ ${data.error}`, 'alert');
    }
  } catch {
    mostrarNotificacion('❌ Error de conexión', 'alert');
  }
}

// ═══════════════════════════════════════════
// REPORTE MENSUAL
// ═══════════════════════════════════════════

async function cargarReporteMensual() {
  try {
    const res = await authFetch('/api/ia/monthly-report');
    const data = await res.json();
    if (!data.ok) return;

    const mesEl = document.getElementById('mes-actual');
    if (mesEl) mesEl.textContent = `Período: ${data.mes}`;

    const tAcido = document.getElementById('total-acido');
    const tBase = document.getElementById('total-base');
    const tCloro = document.getElementById('total-cloro');
    const tEventos = document.getElementById('total-eventos');

    if (tAcido) tAcido.innerHTML = `${Math.round(data.totales.acido)} <span class="summary-unit">ml</span>`;
    if (tBase) tBase.innerHTML = `${Math.round(data.totales.base)} <span class="summary-unit">g</span>`;
    if (tCloro) tCloro.innerHTML = `${Math.round(data.totales.cloro)} <span class="summary-unit">g</span>`;
    if (tEventos) tEventos.textContent = data.totalEventos;

    renderMonthlyChart(data);

    const diasConActividad = Object.keys(data.porDia).length;
    const promedioDiario = diasConActividad > 0 ? (data.totalEventos / diasConActividad).toFixed(1) : 0;

    const promedioEl = document.getElementById('promedio-diario');
    if (promedioEl) promedioEl.textContent = promedioDiario;

    let diaMax = null, totalMax = 0;
    Object.entries(data.porDia).forEach(([dia, tipos]) => {
      const total = tipos.acido + tipos.base + tipos.cloro;
      if (total > totalMax) {
        totalMax = total;
        diaMax = dia;
      }
    });

    const diaMaxEl = document.getElementById('dia-mas-activo');
    const diaMaxDetalleEl = document.getElementById('dia-mas-activo-detalle');
    if (diaMaxEl) diaMaxEl.textContent = diaMax ? `Día ${diaMax}` : '—';
    if (diaMaxDetalleEl) diaMaxDetalleEl.textContent = diaMax ? `${totalMax} ml/g dosificados` : '—';

    const tiposTotales = {
      ácido: data.totales.acido,
      base: data.totales.base,
      cloro: data.totales.cloro,
    };
    const tipoMax = Object.entries(tiposTotales).sort((a, b) => b[1] - a[1])[0];
    const tipoMaxEl = document.getElementById('tipo-mas-usado');
    if (tipoMaxEl) tipoMaxEl.textContent = tipoMax[1] > 0 ? tipoMax[0] : '—';

    refreshIcons();
  } catch (err) {
    console.error('Error en cargarReporteMensual:', err);
  }
}

function renderMonthlyChart(data) {
  const cont = document.getElementById('monthly-chart');
  if (!cont) return;

  const ahora = new Date();
  const diasEnMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();

  let maxTotal = 0;
  for (let dia = 1; dia <= diasEnMes; dia++) {
    const d = data.porDia[dia] || { acido: 0, base: 0, cloro: 0 };
    const total = d.acido + d.base + d.cloro;
    if (total > maxTotal) maxTotal = total;
  }
  if (maxTotal === 0) maxTotal = 1;

  let html = '<div class="monthly-bars">';

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const d = data.porDia[dia] || { acido: 0, base: 0, cloro: 0 };
    const total = d.acido + d.base + d.cloro;
    const alturaTotal = (total / maxTotal) * 100;

    const alturaAcido = total > 0 ? (d.acido / total) * alturaTotal : 0;
    const alturaBase = total > 0 ? (d.base / total) * alturaTotal : 0;
    const alturaCloro = total > 0 ? (d.cloro / total) * alturaTotal : 0;

    const esHoy = dia === ahora.getDate();

    html += `
      <div class="monthly-bar-col ${esHoy ? 'hoy' : ''}" title="Día ${dia}: ${Math.round(d.acido)} ml ácido, ${Math.round(d.base)} g base, ${Math.round(d.cloro)} g cloro">
        <div class="monthly-bar" style="height:${alturaTotal}%;">
          ${alturaCloro > 0 ? `<div style="height:${(alturaCloro / alturaTotal) * 100}%;background:#FFD700;"></div>` : ''}
          ${alturaBase > 0 ? `<div style="height:${(alturaBase / alturaTotal) * 100}%;background:var(--green-ok);"></div>` : ''}
          ${alturaAcido > 0 ? `<div style="height:${(alturaAcido / alturaTotal) * 100}%;background:var(--red-alert);"></div>` : ''}
        </div>
        <div class="monthly-bar-label">${dia}</div>
      </div>`;
  }

  html += '</div>';
  cont.innerHTML = html;
}

// ═══════════════════════════════════════════
// AUTO-REFRESH IA
// ═══════════════════════════════════════════

function iniciarAutoRefreshIA() {
  if (iaInterval) clearInterval(iaInterval);
  iaInterval = setInterval(cargarRecomendaciones, 10 * 60 * 1000);
}

// ═══════════════════════════════════════════
// MODO MANUAL / AUTOMÁTICO
// ═══════════════════════════════════════════

async function cargarModo() {
  try {
    const res = await authFetch('/api/mode');
    const data = await res.json();
    if (data.ok) actualizarUImodo(data.modo);
  } catch (err) {
    console.error('Error cargando modo:', err);
  }
}

async function cambiarModo() {
  const toggle = document.getElementById('auto-mode');
  const nuevoModo = toggle.checked ? 'automatico' : 'manual';
  actualizarUImodo(nuevoModo);

  try {
    const res = await authFetch('/api/mode', {
      method: 'PUT',
      body: JSON.stringify({ modo: nuevoModo }),
    });
    const data = await res.json();

    if (data.ok) {
      mostrarNotificacion(
        nuevoModo === 'automatico'
          ? '🤖 Modo automático: el sistema dosificará solo'
          : '🔧 Modo manual: te preguntaremos antes de dosificar',
        'ok'
      );
    } else {
      actualizarUImodo(modoActual);
      mostrarNotificacion(`❌ ${data.error}`, 'alert');
    }
  } catch {
    actualizarUImodo(modoActual);
    mostrarNotificacion('❌ Error de conexión', 'alert');
  }
}

function actualizarUImodo(modo) {
  modoActual = modo;

  const toggle = document.getElementById('auto-mode');
  const label = document.getElementById('modo-label');
  const descripcion = document.getElementById('modo-descripcion');
  const aviso = document.getElementById('modo-aviso');

  if (!toggle || !label || !descripcion) return;

  if (modo === 'automatico') {
    toggle.checked = true;
    label.textContent = 'Automático';
    label.style.color = 'var(--green-ok)';
    descripcion.textContent = 'El sistema dosifica solo cuando detecta pH fuera de rango';

    if (aviso) {
      aviso.style.display = 'block';
      aviso.style.background = 'rgba(34,211,163,0.08)';
      aviso.style.border = '1px solid rgba(34,211,163,0.25)';
      aviso.style.color = 'var(--green-ok)';
      aviso.innerHTML = '🤖 <strong>Automático:</strong> si el pH sale del rango, el sistema activará las bombas automáticamente y te notificará.';
    }
  } else {
    toggle.checked = false;
    label.textContent = 'Manual';
    label.style.color = 'var(--yellow-warn)';
    descripcion.textContent = 'Te preguntamos antes de dosificar';

    if (aviso) {
      aviso.style.display = 'block';
      aviso.style.background = 'rgba(255,184,48,0.08)';
      aviso.style.border = '1px solid rgba(255,184,48,0.25)';
      aviso.style.color = 'var(--yellow-warn)';
      aviso.innerHTML = '🔧 <strong>Manual:</strong> el sistema te avisa cuando el pH sale del rango, pero vos decidís cuándo activar las bombas (con los botones de abajo o desde las alertas).';
    }
  }

  refreshIcons();
}

// ═══════════════════════════════════════════
// DETECCIÓN DE DOSIFICACIONES AUTOMÁTICAS
// ═══════════════════════════════════════════

function iniciarCheckDosing() {
  if (dosingCheckInterval) clearInterval(dosingCheckInterval);
  dosingCheckInterval = setInterval(async () => {
    try {
      const res = await authFetch('/api/dosing');
      const data = await res.json();
      if (!data.ok || !data.eventos.length) return;

      const ultimo = data.eventos[0];
      if (ultimoDosingId && ultimo._id !== ultimoDosingId && ultimo.modo === 'automatico') {
        mostrarPopupDosificacion(ultimo);
      }
      ultimoDosingId = ultimo._id;
    } catch { /* silencio */ }
  }, 30000);
}

function mostrarPopupDosificacion(evento) {
  const tipo = { acido: 'ácido', base: 'base', cloro: 'cloro' }[evento.tipo] || evento.tipo;
  const popup = document.createElement('div');
  popup.className = 'alert-popup';
  popup.style.borderColor = 'rgba(0,200,224,0.5)';
  popup.innerHTML = `
    <div class="alert-popup-header" style="color:var(--aqua);">
      <i data-lucide="zap" style="width:18px;height:18px;"></i>
      <span>Dosificación automática</span>
      <button class="alert-popup-close" onclick="this.parentElement.parentElement.remove()">
        <i data-lucide="x" style="width:14px;height:14px;"></i>
      </button>
    </div>
    <div class="alert-popup-title">🤖 Se dosificó ${evento.cantidad} ${evento.unidad} de ${tipo}</div>
    <div class="alert-popup-message">${evento.motivo || 'Dosificación automática ejecutada por el sistema.'}</div>
  `;
  document.body.appendChild(popup);
  refreshIcons();
  setTimeout(() => {
    popup.style.opacity = '0';
    popup.style.transition = 'opacity 0.3s';
    setTimeout(() => popup.remove(), 300);
  }, 8000);
}

// ═══════════════════════════════════════════
// LIVE DATA
// ═══════════════════════════════════════════

function startLiveData() {
  if (liveInterval) clearInterval(liveInterval);
  if (statusInterval) clearInterval(statusInterval);
  if (alertInterval) clearInterval(alertInterval);
  if (chartInterval) clearInterval(chartInterval);

  liveInterval = setInterval(loadLatestMeasurement, 5000);

  statusInterval = setInterval(async () => {
    try {
      const res = await authFetch('/api/measurements/latest');
      const data = await res.json();
      if (data.ok && data.measurement) {
        actualizarEstadoESP32(data.measurement.createdAt);
      } else {
        actualizarEstadoESP32(null);
      }
    } catch { /* silencio */ }
  }, 30000);

  alertInterval = setInterval(() => {
    buildAlertas();
    actualizarDosificacionesHoy();      // ⚡ NUEVO
  }, 30000);

    chartInterval = setInterval(dibujarGraficoPH24h, 60000);
}

// ═══════════════════════════════════════════
// ESTADO DEL SISTEMA (encendido/apagado)
// ═══════════════════════════════════════════

async function cargarEstadoSistema() {
  try {
    const res = await authFetch('/api/status');
    const data = await res.json();
    if (data.ok) {
      sistemaActivo = data.activo;
      actualizarUISistema();
    }
  } catch (err) {
    console.error('Error cargando estado del sistema:', err);
  }
}

async function toggleSistema() {
  const btn = document.getElementById('btn-toggle-system');
  if (btn) btn.disabled = true;

  const nuevoEstado = !sistemaActivo;

  try {
    const res = await authFetch('/api/status', {
      method: 'PUT',
      body: JSON.stringify({ activo: nuevoEstado }),
    });
    const data = await res.json();

    if (data.ok) {
      sistemaActivo = data.activo;
      actualizarUISistema();
      mostrarNotificacion(
        sistemaActivo
          ? '▶️ Sistema encendido — el ESP32 vuelve a medir'
          : '⏸️ Sistema apagado — el ESP32 dejó de medir',
        'ok'
      );
    } else {
      mostrarNotificacion(`❌ ${data.error}`, 'alert');
    }
  } catch {
    mostrarNotificacion('❌ Error de conexión', 'alert');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function actualizarUISistema() {
  const btn = document.getElementById('btn-toggle-system');
  const text = document.getElementById('btn-toggle-system-text');
  const aviso = document.getElementById('modo-aviso');

  if (!btn || !text) return;

  if (sistemaActivo) {
    btn.classList.remove('suspended');
    btn.classList.add('active');
    text.textContent = 'Apagar sistema';
    btn.title = 'Clic para apagar el sistema completo';
  } else {
    btn.classList.remove('active');
    btn.classList.add('suspended');
    text.textContent = 'Encender sistema';
    btn.title = 'Clic para encender el sistema';
  }

  // Deshabilitar botones de dosificación si está apagado
  document.querySelectorAll('.dosage-btn, .btn-dosificar-acido, .btn-dosificar-base, .ia-execute-btn, .alert-execute-btn').forEach(el => {
    if (sistemaActivo) {
      el.disabled = false;
      el.style.opacity = '1';
      el.style.cursor = 'pointer';
    } else {
      el.disabled = true;
      el.style.opacity = '0.4';
      el.style.cursor = 'not-allowed';
    }
  });

  // Mostrar aviso si está apagado
  if (aviso && !sistemaActivo) {
    aviso.style.display = 'block';
    aviso.style.background = 'rgba(255,77,109,0.08)';
    aviso.style.border = '1px solid rgba(255,77,109,0.25)';
    aviso.style.color = 'var(--red-alert)';
    aviso.innerHTML = '⏸️ <strong>Sistema apagado:</strong> el ESP32 dejó de medir y publicar. Apretá "Encender sistema" en el menú lateral para reactivarlo.';
  }

  refreshIcons();
}

// ── Enter key en login/register ──
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const loginVisible = document.getElementById('login-form')?.style.display !== 'none';
  const registerVisible = document.getElementById('register-form')?.style.display !== 'none';
  if (loginVisible) doLogin();
  else if (registerVisible) doRegister();
});