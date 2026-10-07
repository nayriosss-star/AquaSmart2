const Alert = require('../models/Alert');
const Measurement = require('../models/Measurement');
const DosingEvent = require('../models/DosingEvent');
const Pool = require('../models/Pool');

// ═══════════════════════════════════════════
// UMBRALES
// ═══════════════════════════════════════════

const THRESHOLDS = {
  ph: {
    muyAlto: 8.0,
    alto: 7.6,
    bajo: 6.8,
    muyBajo: 6.0,
  },
  temp: {
    extremaAlta: 32,
    alta: 28,
    baja: 22,
    extremaBaja: 15,
  },
  esp32InactivoMin: 10,
  sinDosificacionDias: 3,
};

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

// Busca si ya existe una alerta activa del mismo tipo
async function alertaActivaExiste(userId, tipo) {
  return Alert.findOne({ userId, tipo, estado: 'activa' });
}

// Crea una alerta si no existe una activa del mismo tipo
async function crearAlertaSiNoExiste(userId, data) {
  const existe = await alertaActivaExiste(userId, data.tipo);
  if (existe) return null;

  const alerta = await Alert.create({
    userId,
    ...data,
    estado: 'activa',
  });

  console.log(`🔔 Nueva alerta [${data.severidad}]: ${data.titulo}`);
  return alerta;
}

// Resuelve todas las alertas activas de un tipo
async function resolverAlertas(userId, tipo, motivo = 'sistema') {
  const result = await Alert.updateMany(
    { userId, tipo, estado: 'activa' },
    {
      estado: 'resuelta',
      resueltaEn: new Date(),
      resueltaPor: motivo,
    }
  );
  if (result.modifiedCount > 0) {
    console.log(`✅ ${result.modifiedCount} alerta(s) resuelta(s): ${tipo}`);
  }
}

// ⚡ NUEVO: Calcula la dosis real según pH, volumen y tipo
async function calcularDosisPH(userId, ph, tipoDosificacion) {
  try {
    const pool = await Pool.findOne({ userId });
    const volumen = pool ? pool.volumen : 10; // m³ por defecto si no configuró

    if (tipoDosificacion === 'acido') {
      // Para bajar pH: fórmula similar a la del backend
      const cantidad = Math.round((ph - 7.2) * volumen * 8);
      return {
        tipo: 'ph_bajar',
        cantidad: Math.max(cantidad, 50), // mínimo 50ml
        unidad: 'ml',
      };
    } else {
      // Para subir pH
      const cantidad = Math.round((7.2 - ph) * volumen * 12);
      return {
        tipo: 'ph_subir',
        cantidad: Math.max(cantidad, 30), // mínimo 30g
        unidad: 'g',
      };
    }
  } catch (err) {
    console.error('Error en calcularDosisPH:', err.message);
    return {
      tipo: tipoDosificacion === 'acido' ? 'ph_bajar' : 'ph_subir',
      cantidad: 100,
      unidad: tipoDosificacion === 'acido' ? 'ml' : 'g',
    };
  }
}

// ⚡ NUEVO: Calcula la dosis de cloro según el volumen
async function calcularDosisCloro(userId) {
  try {
    const pool = await Pool.findOne({ userId });
    const volumen = pool ? pool.volumen : 10;
    // 1.5 g por m³
    const cantidad = Math.round(volumen * 1.5);
    return {
      tipo: 'cloro',
      cantidad,
      unidad: 'g',
    };
  } catch (err) {
    console.error('Error en calcularDosisCloro:', err.message);
    return { tipo: 'cloro', cantidad: 100, unidad: 'g' };
  }
}

// ═══════════════════════════════════════════
// REGLAS DE ALERTAS
// ═══════════════════════════════════════════

async function evaluarReglasPH(userId, ph) {
  // ── pH MUY ALTO (crítico) ──
  if (ph > THRESHOLDS.ph.muyAlto) {
    const dosis = await calcularDosisPH(userId, ph, 'acido');
    await crearAlertaSiNoExiste(userId, {
      tipo: 'ph_muy_alto',
      severidad: 'critica',
      titulo: `pH crítico: ${ph.toFixed(2)}`,
      mensaje: `El pH está en ${ph.toFixed(2)}, muy por encima del rango óptimo (6.8–7.6). Se recomienda dosificar ${dosis.cantidad} ${dosis.unidad} de ácido.`,
      contexto: { ph },
      accionSugerida: dosis,
    });
    await resolverAlertas(userId, 'ph_alto');
  }
  // ── pH ALTO (advertencia) ──
  else if (ph > THRESHOLDS.ph.alto) {
    const dosis = await calcularDosisPH(userId, ph, 'acido');
    await crearAlertaSiNoExiste(userId, {
      tipo: 'ph_alto',
      severidad: 'advertencia',
      titulo: `pH alto: ${ph.toFixed(2)}`,
      mensaje: `El pH está en ${ph.toFixed(2)}, fuera del rango óptimo. Se recomienda dosificar ${dosis.cantidad} ${dosis.unidad} de ácido.`,
      contexto: { ph },
      accionSugerida: dosis,
    });
    await resolverAlertas(userId, 'ph_muy_alto');
  }
  // ── pH MUY BAJO (crítico) ──
  else if (ph < THRESHOLDS.ph.muyBajo) {
    const dosis = await calcularDosisPH(userId, ph, 'base');
    await crearAlertaSiNoExiste(userId, {
      tipo: 'ph_muy_bajo',
      severidad: 'critica',
      titulo: `pH crítico: ${ph.toFixed(2)}`,
      mensaje: `El pH está en ${ph.toFixed(2)}, muy por debajo del rango óptimo (6.8–7.6). Se recomienda dosificar ${dosis.cantidad} ${dosis.unidad} de base.`,
      contexto: { ph },
      accionSugerida: dosis,
    });
    await resolverAlertas(userId, 'ph_bajo');
  }
  // ── pH BAJO (advertencia) ──
  else if (ph < THRESHOLDS.ph.bajo) {
    const dosis = await calcularDosisPH(userId, ph, 'base');
    await crearAlertaSiNoExiste(userId, {
      tipo: 'ph_bajo',
      severidad: 'advertencia',
      titulo: `pH bajo: ${ph.toFixed(2)}`,
      mensaje: `El pH está en ${ph.toFixed(2)}, fuera del rango óptimo. Se recomienda dosificar ${dosis.cantidad} ${dosis.unidad} de base.`,
      contexto: { ph },
      accionSugerida: dosis,
    });
    await resolverAlertas(userId, 'ph_muy_bajo');
  }
  // ── pH OK → resolver todas ──
  else {
    await resolverAlertas(userId, 'ph_muy_alto');
    await resolverAlertas(userId, 'ph_alto');
    await resolverAlertas(userId, 'ph_muy_bajo');
    await resolverAlertas(userId, 'ph_bajo');
  }
}

async function evaluarReglasTemperatura(userId, temperatura) {
  if (temperatura > THRESHOLDS.temp.extremaAlta) {
    await crearAlertaSiNoExiste(userId, {
      tipo: 'temp_extrema_alta',
      severidad: 'critica',
      titulo: `Temperatura extrema: ${temperatura.toFixed(1)}°C`,
      mensaje: `La temperatura del agua está en ${temperatura.toFixed(1)}°C. Puede ser peligroso para nadar y afecta la química del agua.`,
      contexto: { temperatura },
    });
    await resolverAlertas(userId, 'temp_alta');
  }
  else if (temperatura > THRESHOLDS.temp.alta) {
    await crearAlertaSiNoExiste(userId, {
      tipo: 'temp_alta',
      severidad: 'advertencia',
      titulo: `Temperatura alta: ${temperatura.toFixed(1)}°C`,
      mensaje: `El agua está a ${temperatura.toFixed(1)}°C, un poco caliente. El cloro se consume más rápido.`,
      contexto: { temperatura },
    });
    await resolverAlertas(userId, 'temp_extrema_alta');
  }
  else if (temperatura < THRESHOLDS.temp.extremaBaja) {
    await crearAlertaSiNoExiste(userId, {
      tipo: 'temp_extrema_baja',
      severidad: 'critica',
      titulo: `Temperatura extrema: ${temperatura.toFixed(1)}°C`,
      mensaje: `La temperatura del agua está en ${temperatura.toFixed(1)}°C. Muy fría para nadar.`,
      contexto: { temperatura },
    });
    await resolverAlertas(userId, 'temp_baja');
  }
  else if (temperatura < THRESHOLDS.temp.baja) {
    await crearAlertaSiNoExiste(userId, {
      tipo: 'temp_baja',
      severidad: 'advertencia',
      titulo: `Temperatura baja: ${temperatura.toFixed(1)}°C`,
      mensaje: `El agua está a ${temperatura.toFixed(1)}°C, un poco fría para nadar cómodamente.`,
      contexto: { temperatura },
    });
    await resolverAlertas(userId, 'temp_extrema_baja');
  }
  else {
    await resolverAlertas(userId, 'temp_extrema_alta');
    await resolverAlertas(userId, 'temp_alta');
    await resolverAlertas(userId, 'temp_extrema_baja');
    await resolverAlertas(userId, 'temp_baja');
  }
}

// ⚡ NUEVO: Reglas de cloro (recomendación, no crítica)
async function evaluarReglasCloro(userId) {
  try {
    const ultimaCloro = await DosingEvent.findOne({
      userId,
      tipo: 'cloro',
    }).sort({ createdAt: -1 });

    let horasSinCloro = ultimaCloro
      ? (Date.now() - new Date(ultimaCloro.createdAt).getTime()) / (60 * 60 * 1000)
      : 999;

    // Si pasaron más de 48hs sin dosificar cloro, crear alerta tipo recomendación
    if (horasSinCloro >= 48) {
      const dosis = await calcularDosisCloro(userId);
      const dias = Math.floor(horasSinCloro / 24);

      await crearAlertaSiNoExiste(userId, {
        tipo: 'cloro_recomendacion',
        severidad: 'recomendacion_ia',
        titulo: 'Recomendación de cloro',
        mensaje: horasSinCloro >= 999
          ? `No se registran dosificaciones de cloro. Te recomendamos dosificar ${dosis.cantidad} g.`
          : `Hace ${dias} día${dias > 1 ? 's' : ''} que no dosificás cloro. Te recomendamos dosificar ${dosis.cantidad} g.`,
        contexto: { horasSinCloro: Math.round(horasSinCloro) },
        accionSugerida: dosis,
      });
    } else {
      await resolverAlertas(userId, 'cloro_recomendacion');
    }
  } catch (err) {
    console.error('Error en evaluarReglasCloro:', err.message);
  }
}

// ═══════════════════════════════════════════
// EVALUACIÓN PRINCIPAL
// ═══════════════════════════════════════════

async function evaluarAlertas(userId, medicion) {
  if (!medicion || !userId) return;

  try {
    await evaluarReglasPH(userId, medicion.ph);
    await evaluarReglasTemperatura(userId, medicion.temperatura);
    await evaluarReglasCloro(userId);
  } catch (err) {
    console.error('Error en evaluarAlertas:', err.message);
  }
}

// Chequea si el ESP32 está inactivo
async function chequearESP32Inactivo(userId) {
  try {
    const ultima = await Measurement.findOne({ userId }).sort({ createdAt: -1 });
    if (!ultima) return;

    const minutos = (Date.now() - new Date(ultima.createdAt).getTime()) / 60000;

    if (minutos > THRESHOLDS.esp32InactivoMin) {
      await crearAlertaSiNoExiste(userId, {
        tipo: 'esp32_inactivo',
        severidad: 'advertencia',
        titulo: 'ESP32 sin conexión',
        mensaje: `El dispositivo no envía datos desde hace ${Math.round(minutos)} minutos. Revisá la conexión Wi-Fi o la alimentación.`,
        contexto: { minutosInactivo: Math.round(minutos) },
      });
    } else {
      await resolverAlertas(userId, 'esp32_inactivo');
    }
  } catch (err) {
    console.error('Error chequearESP32Inactivo:', err.message);
  }
}

module.exports = {
  evaluarAlertas,
  chequearESP32Inactivo,
  crearAlertaSiNoExiste,
  resolverAlertas,
  calcularDosisPH,
  calcularDosisCloro,
  THRESHOLDS,
};