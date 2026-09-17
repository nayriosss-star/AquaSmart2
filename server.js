const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);


require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const User = require('./models/User');
const Pool = require('./models/Pool');
const Measurement = require('./models/Measurement');
const DosingEvent = require('./models/DosingEvent');
const { verificarToken, verificarDispositivo } = require('./middleware/auth');

// ── Validaciones de entorno ──
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'DEVICE_API_KEY', 'DEVICE_OWNER_ID'];
const faltantes = REQUIRED_ENV.filter(k => !process.env[k]);
if (faltantes.length) {
  console.error(`❌ Faltan variables de entorno: ${faltantes.join(', ')}`);
  process.exit(1);
}

const app = express();

// ── Seguridad base ──
app.use(helmet({
  contentSecurityPolicy: false, // permitimos Google Fonts y estilos inline
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// ── Rate limiting ──
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Probá más tarde.' },
});

const deviceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // 2 lecturas por segundo como máximo
  message: { error: 'Demasiadas lecturas del dispositivo.' },
});

// ── Archivos estáticos (solo /public) ──
app.use(express.static(path.join(__dirname, 'public')));

// ── Conexión a MongoDB ──
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => {
    console.error('❌ Error MongoDB:', err.message);
    process.exit(1);
  });

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

function generarToken(user) {
  return jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Simula el cloro a partir de la temperatura (solo para demo)
function simularCloro(temperatura) {
  const base = 2.0;
  const efectoTemp = (temperatura - 24) * -0.05;
  const ruido = (Math.random() - 0.5) * 0.2;
  return +Math.max(0, base + efectoTemp + ruido).toFixed(2);
}

// Evalúa pH y decide si dosificar (con cooldown de 15 min)
async function evaluarYdosificar(userId, medicion, pool) {
  const { ph } = medicion;
  const volumen = pool ? pool.volumen : 10;

  // Cooldown: no dosificar si hubo un evento en los últimos 15 minutos
  const reciente = await DosingEvent.findOne({
    userId,
    createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
  });
  if (reciente) return null;

  let tipo = null, cantidad = 0, unidad = 'ml', motivo = '';

  if (ph > 7.6) {
    tipo = 'acido';
    unidad = 'ml';
    cantidad = Math.round((ph - 7.2) * volumen * 8);
    motivo = `pH ${ph} detectado — por encima del rango óptimo (6.8–7.6)`;
  } else if (ph < 6.8) {
    tipo = 'base';
    unidad = 'g';
    cantidad = Math.round((7.2 - ph) * volumen * 12);
    motivo = `pH ${ph} detectado — por debajo del rango óptimo (6.8–7.6)`;
  }

  if (!tipo) return null;

  const evento = await DosingEvent.create({
    userId, measurementId: medicion._id, tipo, cantidad, unidad, motivo,
  });

  return {
    tipo: evento.tipo,
    cantidad: evento.cantidad,
    unidad: evento.unidad,
    motivo: evento.motivo,
    eventId: evento._id,
  };
}

// ═══════════════════════════════════════════
// RUTAS DE AUTENTICACIÓN
// ═══════════════════════════════════════════

app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Correo inválido.' });
    }

    const emailNorm = email.toLowerCase().trim();
    const existe = await User.findOne({ email: emailNorm });
    if (existe) {
      return res.status(409).json({ error: 'Ese correo ya está registrado.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const user = await User.create({ name: name.trim(), email: emailNorm, password: hash });

    // Crear pool por defecto
    await Pool.create({ userId: user._id });

    const token = generarToken(user);
    res.status(201).json({ ok: true, name: user.name, email: user.email, token });
  } catch (err) {
    console.error('register:', err);
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Faltan campos.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    const token = generarToken(user);
    res.json({ ok: true, name: user.name, email: user.email, token });
  } catch (err) {
    console.error('login:', err);
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

app.get('/api/me', verificarToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json({ ok: true, id: user._id, name: user.name, email: user.email });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

// ═══════════════════════════════════════════
// RUTAS DE PISCINA
// ═══════════════════════════════════════════

app.get('/api/pool', verificarToken, async (req, res) => {
  try {
    let pool = await Pool.findOne({ userId: req.userId });
    if (!pool) pool = await Pool.create({ userId: req.userId });
    res.json({ ok: true, pool });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

app.put('/api/pool', verificarToken, async (req, res) => {
  try {
    const { largo, ancho, profundidad } = req.body;
    const l = Number(largo), a = Number(ancho), p = Number(profundidad);

    if ([l, a, p].some(v => !Number.isFinite(v) || v <= 0)) {
      return res.status(400).json({ error: 'Dimensiones inválidas.' });
    }

    const volumen = +(l * a * p).toFixed(2);
    const pool = await Pool.findOneAndUpdate(
      { userId: req.userId },
      { largo: l, ancho: a, profundidad: p, volumen },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true, pool });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

// ═══════════════════════════════════════════
// RUTAS DE MEDICIONES Y DOSIFICACIÓN
// ═══════════════════════════════════════════

app.get('/api/measurements/latest', verificarToken, async (req, res) => {
  try {
    const measurement = await Measurement.findOne({ userId: req.userId })
      .sort({ createdAt: -1 });
    res.json({ ok: true, measurement });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

app.get('/api/measurements', verificarToken, async (req, res) => {
  try {
    const horas = Math.min(Math.max(parseInt(req.query.horas) || 24, 1), 720); // 1h a 30d
    const desde = new Date(Date.now() - horas * 60 * 60 * 1000);
    const mediciones = await Measurement.find({
      userId: req.userId,
      createdAt: { $gte: desde },
    }).sort({ createdAt: -1 }).limit(1000);
    res.json({ ok: true, mediciones });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

app.get('/api/dosing', verificarToken, async (req, res) => {
  try {
    const eventos = await DosingEvent.find({ userId: req.userId })
      .sort({ createdAt: -1 }).limit(100);
    res.json({ ok: true, eventos });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

// ═══════════════════════════════════════════
// RUTAS DEL ESP32
// ═══════════════════════════════════════════

app.post('/api/esp32/medicion', deviceLimiter, verificarDispositivo, async (req, res) => {
  try {
    const { ph, temperatura } = req.body;

    if (typeof ph !== 'number' || typeof temperatura !== 'number') {
      return res.status(400).json({ error: 'Campos ph y temperatura requeridos (numéricos).' });
    }
    if (ph < 0 || ph > 14 || temperatura < -10 || temperatura > 60) {
      return res.status(400).json({ error: 'Valores fuera de rango.' });
    }

    const userId = process.env.DEVICE_OWNER_ID;
    const cloro = simularCloro(temperatura);

    const medicion = await Measurement.create({
      userId, ph, cloro, temperatura, origen: 'esp32',
    });

    const pool = await Pool.findOne({ userId });
    const accion = await evaluarYdosificar(userId, medicion, pool);

    res.json({ ok: true, medicionId: medicion._id, cloro, accion });
  } catch (err) {
    console.error('esp32/medicion:', err);
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

// El ESP32 confirma que ejecutó la dosificación
app.post('/api/esp32/dosing/:id/confirm', deviceLimiter, verificarDispositivo, async (req, res) => {
  try {
    const evento = await DosingEvent.findByIdAndUpdate(
      req.params.id,
      { ejecutado: true },
      { new: true }
    );
    if (!evento) return res.status(404).json({ error: 'Evento no encontrado.' });
    res.json({ ok: true, evento });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

// ═══════════════════════════════════════════
// HEALTHCHECK
// ═══════════════════════════════════════════

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    mongo: mongoose.connection.readyState === 1 ? 'conectado' : 'desconectado',
  });
});

// ═══════════════════════════════════════════
// FALLBACKS
// ═══════════════════════════════════════════

// 404 para /api/*
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado.' });
});

// SPA fallback (todas las rutas que no empiezan con /api)
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════
// ERROR HANDLER GLOBAL
// ═══════════════════════════════════════════

app.use((err, _req, res, _next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// ═══════════════════════════════════════════
// SERVER
// ═══════════════════════════════════════════

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));