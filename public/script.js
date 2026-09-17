// ── Bubbles ──
(function () {
  const bg = document.getElementById('water-bg');
  for (let i = 0; i < 12; i++) {
    const b = document.createElement('div');
    b.className = 'bubble';
    const size = 20 + Math.random() * 60;
    b.style.cssText = `width:${size}px;height:${size}px;left:${Math.random() * 100}%;
      animation-duration:${8 + Math.random() * 12}s;animation-delay:${-Math.random() * 15}s;`;
    bg.appendChild(b);
  }
})();

let currentUser = null;
let liveInterval = null;

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

// ── Restaurar sesión al cargar ──
window.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!token || !user) return;

  try {
    const res = await authFetch('/api/me');
    if (res.ok) {
      launchApp(user);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  } catch {
    /* sin conexión: no restauramos */
  }
});

// ── Tabs login/register ──
function switchTab(t) {
  document.getElementById('login-form').style.display = t === 'login' ? '' : 'none';
  document.getElementById('register-form').style.display = t === 'register' ? '' : 'none';
  document.querySelectorAll('.tab-btn').forEach((b, i) =>
    b.classList.toggle('active', (i === 0 && t === 'login') || (i === 1 && t === 'register'))
  );
}

// ── LOGIN ──
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');

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
  }
}

// ── REGISTER ──
async function doRegister() {
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
  ]);
  startLiveData();
}

// ── Navigation ──
function showSection(s) {
  ['dashboard', 'piscina', 'historial', 'alertas', 'esp32', 'ia'].forEach(id => {
    const el = document.getElementById('section-' + id);
    if (el) el.style.display = id === s ? '' : 'none';
  });
  document.querySelectorAll('.nav-item').forEach(el => {
    const target = el.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    el.classList.toggle('active', target === s);
  });
  if (s === 'historial') draw7dChart();
  if (s === 'alertas') buildAlertas();
}

// ── Charts ──
function initCharts() {
  const svg = document.getElementById('ph-chart');
  const data = [7.1, 7.3, 7.6, 7.8, 8.1, 7.5, 7.3, 7.2, 7.4, 7.3, 7.1, 7.0, 7.2, 7.3, 7.2, 7.4, 7.5, 7.3, 7.2, 7.1, 7.3, 7.4, 7.3, 7.2];
  drawLine(svg, data, 6.5, 8.5, 500, 120);
}

function drawLine(svg, data, min, max, W, H) {
  if (!svg || data.length === 0) return;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / (max - min)) * H}`);
  const yHi = H - ((7.6 - min) / (max - min)) * H;
  const yLo = H - ((6.8 - min) / (max - min)) * H;
  svg.innerHTML = `
    <rect x="0" y="${yHi}" width="${W}" height="${yLo - yHi}" fill="rgba(34,211,163,0.08)" rx="2"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--aqua)" stroke-width="2.5" stroke-linejoin="round"/>
    ${data.map((v, i) => `<circle cx="${(i / (data.length - 1)) * W}" cy="${H - ((v - min) / (max - min)) * H}" r="3" fill="${v >= 6.8 && v <= 7.6 ? 'var(--green-ok)' : 'var(--yellow-warn)'}"/>`).join('')}
    <line x1="0" y1="${yHi}" x2="${W}" y2="${yHi}" stroke="rgba(34,211,163,0.3)" stroke-dasharray="4"/>
    <line x1="0" y1="${yLo}" x2="${W}" y2="${yLo}" stroke="rgba(34,211,163,0.3)" stroke-dasharray="4"/>
  `;
}

async function draw7dChart() {
  const svg = document.getElementById('ph-chart-7d');
  if (!svg) return;
  try {
    const res = await authFetch('/api/measurements?horas=168');
    const data = await res.json();
    if (!data.ok || !data.mediciones.length) return;
    const phs = data.mediciones.map(m => m.ph).reverse();
    drawLine(svg, phs, 6.5, 8.5, 600, 160);
  } catch { /* silencio */ }
}

// ── Pool ──
async function loadPool() {
  try {
    const res = await authFetch('/api/pool');
    const data = await res.json();
    if (data.ok && data.pool) {
      document.getElementById('pool-largo').value = data.pool.largo;
      document.getElementById('pool-ancho').value = data.pool.ancho;
      document.getElementById('pool-prof').value = data.pool.profundidad;
      calcVol();
    }
  } catch { /* silencio */ }
}

async function savePool() {
  const largo = parseFloat(document.getElementById('pool-largo').value) || 0;
  const ancho = parseFloat(document.getElementById('pool-ancho').value) || 0;
  const profundidad = parseFloat(document.getElementById('pool-prof').value) || 0;
  if (largo <= 0 || ancho <= 0 || profundidad <= 0) return;
  try {
    await authFetch('/api/pool', {
      method: 'PUT',
      body: JSON.stringify({ largo, ancho, profundidad }),
    });
  } catch { /* silencio */ }
}

function calcVol() {
  const l = parseFloat(document.getElementById('pool-largo').value) || 0;
  const a = parseFloat(document.getElementById('pool-ancho').value) || 0;
  const p = parseFloat(document.getElementById('pool-prof').value) || 0;
  const vol = (l * a * p).toFixed(1);
  const textEl = document.getElementById('pool-volume-text');
  if (vol <= 0) {
    textEl.innerHTML = '💧 Ingresá las dimensiones para calcular el volumen';
    return;
  }
  textEl.innerHTML = `💧 Volumen estimado: <strong>${vol} m³</strong> · Equivalente a ${(vol * 1000).toLocaleString('es-AR')} litros de agua`;
  document.getElementById('card-vol').textContent = vol;
  clearTimeout(window._poolSaveTimer);
  window._poolSaveTimer = setTimeout(savePool, 800);
}

// ── Última medición ──
async function loadLatestMeasurement() {
  try {
    const res = await authFetch('/api/measurements/latest');
    const data = await res.json();
    if (data.ok && data.measurement) {
      updateMetrics(data.measurement);
    }
  } catch { /* silencio */ }
}

function updateMetrics(m) {
  if (typeof m.ph === 'number') {
    document.getElementById('card-ph').textContent = m.ph.toFixed(2);
    const pct = (m.ph / 14) * 100;
    document.getElementById('ph-marker').style.left = pct + '%';
  }
  if (typeof m.temperatura === 'number') {
    document.getElementById('card-temp').textContent = m.temperatura.toFixed(1);
  }
  if (typeof m.cloro === 'number') {
    document.getElementById('card-cl').textContent = m.cloro.toFixed(1);
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

    const colors = { acido: 'var(--red-alert)', base: 'var(--green-ok)' };
    tbody.innerHTML = data.eventos.map(e => {
      const fecha = new Date(e.createdAt);
      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
          <td style="padding:10px 0;color:var(--text-secondary)">${fecha.toLocaleDateString('es-AR')}</td>
          <td style="padding:10px 0;color:var(--text-primary)">${fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
          <td style="padding:10px 0;color:var(--text-primary)">—</td>
          <td style="padding:10px 0;color:${colors[e.tipo] || 'var(--text-primary)'}">${e.tipo === 'acido' ? 'Ácido' : 'Base'} · ${e.cantidad} ${e.unidad}</td>
          <td style="padding:10px 0;color:var(--aqua);font-weight:600">—</td>
        </tr>`;
    }).join('');
  } catch { /* silencio */ }
}

// ── Alertas ──
async function buildAlertas() {
  const lista = document.getElementById('alertas-list');
  if (!lista) return;

  try {
    const res = await authFetch('/api/dosing');
    const data = await res.json();
    const alertas = [];

    if (data.ok && data.eventos.length) {
      data.eventos.slice(0, 6).forEach(e => {
        const fecha = new Date(e.createdAt);
        alertas.push({
          type: e.tipo === 'acido' ? 'warn' : 'ok',
          msg: `Dosificación de ${e.tipo === 'acido' ? 'ácido' : 'base'} (${e.cantidad} ${e.unidad}) — ${e.motivo || 'sin motivo registrado'}`,
          time: fecha.toLocaleString('es-AR'),
        });
      });
    }

    if (!alertas.length) {
      alertas.push({
        type: 'ok',
        msg: 'Sin alertas recientes. El sistema está monitoreando.',
        time: '—',
      });
    }

    lista.innerHTML = alertas.map(a => `
      <div class="alert-item">
        <div class="alert-dot ${a.type}"></div>
        <div>
          <div class="alert-text">${a.msg}</div>
          <div class="alert-time">${a.time}</div>
        </div>
      </div>`).join('');
  } catch {
    lista.innerHTML = `
      <div class="alert-item">
        <div class="alert-dot alert"></div>
        <div>
          <div class="alert-text">Error al cargar las alertas</div>
          <div class="alert-time">Verificá la conexión con el servidor</div>
        </div>
      </div>`;
  }
}

// ── Live data ──
function startLiveData() {
  if (liveInterval) clearInterval(liveInterval);
  liveInterval = setInterval(loadLatestMeasurement, 5000);
}

// ── Enter key ──
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const loginVisible = document.getElementById('login-form')?.style.display !== 'none';
  const registerVisible = document.getElementById('register-form')?.style.display !== 'none';
  if (loginVisible) doLogin();
  else if (registerVisible) doRegister();
});