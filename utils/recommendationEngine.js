const Measurement = require('../models/Measurement');
const DosingEvent = require('../models/DosingEvent');
const Pool = require('../models/Pool');

// ═══════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════

const RANGOS = {
  ph: { min: 6.8, max: 7.6, ideal: 7.2 },
  temp: { min: 22, max: 28 },
  cloro: { min: 1.0, max: 3.0, ideal: 1.5 }, // ppm
};

// Dosis de cloro por m³ (ajustable según tu producto)
const CLORO_GR_POR_M3 = 1.5;

// Horas mínimas sin dosificar cloro para recomendar
const HORAS_SIN_CLORO = 48;

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

// Calcula la tendencia lineal de un conjunto de valores
// Devuelve { pendiente, intercepto, r2 }
function calcularTendencia(valores) {
  const n = valores.length;
  if (n < 3) return { pendiente: 0, intercepto: 0, r2: 0 };

  const xs = valores.map((_, i) => i);
  const ys = valores;

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumX2 = xs.reduce((a, x) => a + x * x, 0);
  const sumY2 = ys.reduce((a, y) => a + y * y, 0);

  const pendiente = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercepto = (sumY - pendiente * sumX) / n;

  // R² (coeficiente de determinación)
  const yMedia = sumY / n;
  const ssTotal = ys.reduce((a, y) => a + Math.pow(y - yMedia, 2), 0);
  const ssRes = ys.reduce((a, y, i) => a + Math.pow(y - (pendiente * xs[i] + intercepto), 2), 0);
  const r2 = ssTotal === 0 ? 0 : 1 - ssRes / ssTotal;

  return { pendiente, intercepto, r2 };
}

// ═══════════════════════════════════════════
// ANÁLISIS B: Predicción de pH
// ═══════════════════════════════════════════

async function predecirPH(userId) {
  try {
    // Últimas 6 horas de mediciones
    const desde = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const mediciones = await Measurement.find({
      userId,
      createdAt: { $gte: desde },
    }).sort({ createdAt: 1 });

    if (mediciones.length < 5) return null;

    const phs = mediciones.map(m => m.ph);
    const { pendiente, r2 } = calcularTendencia(phs);

    // Necesitamos una tendencia clara (R² > 0.6)
    if (r2 < 0.6) return null;

    // pH por hora
    // Asumimos que las mediciones están distribuidas uniformemente
    const intervaloHoras = 6 / mediciones.length;
    const phPorHora = pendiente / intervaloHoras;

    const phActual = phs[phs.length - 1];

    // ¿Va a salir del rango?
    let horasHastaSalir = null;
    let direccion = null;
    let valorObjetivo = null;

    if (phPorHora > 0 && phActual < RANGOS.ph.max) {
      // Subiendo → cuándo llega a 7.6
      horasHastaSalir = (RANGOS.ph.max - phActual) / phPorHora;
      direccion = 'subir';
      valorObjetivo = RANGOS.ph.max;
    } else if (phPorHora < 0 && phActual > RANGOS.ph.min) {
      // Bajando → cuándo llega a 6.8
      horasHastaSalir = (RANGOS.ph.min - phActual) / phPorHora;
      direccion = 'bajar';
      valorObjetivo = RANGOS.ph.min;
    }

    if (!horasHastaSalir || horasHastaSalir > 24 || horasHastaSalir <= 0) return null;

    // Solo alertar si sale del rango en menos de 8 horas
    if (horasHastaSalir > 8) return null;

    const pool = await Pool.findOne({ userId });
    const volumen = pool ? pool.volumen : 10;

    // Calcular cantidad a dosificar para corregir
    let tipo = null, cantidad = 0, unidad = null;
    if (direccion === 'subir') {
      // Va a subir mucho → prevenir con ácido
      tipo = 'ph_bajar';
      cantidad = Math.round(0.3 * volumen * 8); // dosis preventiva moderada
      unidad = 'ml';
    } else {
      tipo = 'ph_subir';
      cantidad = Math.round(0.3 * volumen * 12);
      unidad = 'g';
    }

    return {
      tipo: 'prediccion_ph',
      titulo: `Predicción: pH ${direccion === 'subir' ? 'en ascenso' : 'en descenso'}`,
      mensaje: `El pH viene ${direccion === 'subir' ? 'subiendo' : 'bajando'} a ${Math.abs(phPorHora).toFixed(2)} por hora. Al ritmo actual, saldrá del rango óptimo en ${horasHastaSalir.toFixed(1)} horas.`,
      confianza: Math.round(r2 * 100),
      accionSugerida: {
        tipo,
        cantidad,
        unidad,
        motivo: `Dosificación preventiva para evitar que el pH salga de rango`,
      },
      contexto: {
        phActual,
        phPorHora,
        horasHastaSalir,
        valorObjetivo,
      },
    };
  } catch (err) {
    console.error('Error en predecirPH:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════
// ANÁLISIS C: Patrón horario
// ═══════════════════════════════════════════

async function detectarPatronHorario(userId) {
  try {
    // Últimos 5 días
    const desde = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const mediciones = await Measurement.find({
      userId,
      createdAt: { $gte: desde },
    }).sort({ createdAt: 1 });

    if (mediciones.length < 20) return null;

    // Agrupar por hora del día
    const porHora = {};
    mediciones.forEach(m => {
      const hora = new Date(m.createdAt).getHours();
      if (!porHora[hora]) porHora[hora] = [];
      porHora[hora].push(m.ph);
    });

    // Calcular promedio por hora
    const promedios = Object.entries(porHora).map(([hora, phs]) => ({
      hora: parseInt(hora),
      phPromedio: phs.reduce((a, b) => a + b, 0) / phs.length,
      cantidad: phs.length,
    }));

    // Filtrar horas con al menos 3 mediciones
    const conDatos = promedios.filter(p => p.cantidad >= 3);
    if (conDatos.length < 3) return null;

    // Calcular el promedio global
    const promedioGlobal = conDatos.reduce((a, p) => a + p.phPromedio, 0) / conDatos.length;

    // Buscar la hora donde el pH se desvía más del promedio
    let horaMax = null, desvioMax = 0;
    conDatos.forEach(p => {
      const desvio = p.phPromedio - promedioGlobal;
      if (Math.abs(desvio) > Math.abs(desvioMax)) {
        desvioMax = desvio;
        horaMax = p;
      }
    });

    // Solo alertar si el desvío es significativo (> 0.3)
    if (!horaMax || Math.abs(desvioMax) < 0.3) return null;

    const direccion = desvioMax > 0 ? 'sube' : 'baja';

    return {
      tipo: 'patron_horario',
      titulo: `Patrón detectado a las ${horaMax.hora}:00 hs`,
      mensaje: `Los últimos 5 días, alrededor de las ${horaMax.hora}:00 hs, el pH tiende a ${direccion} (promedio ${horaMax.phPromedio.toFixed(2)} vs ${promedioGlobal.toFixed(2)} general).`,
      confianza: Math.min(95, Math.round(horaMax.cantidad * 10)),
      accionSugerida: null, // Es informativo, no ejecutable
      contexto: {
        hora: horaMax.hora,
        phPromedioHora: horaMax.phPromedio,
        phPromedioGlobal: promedioGlobal,
        direccion,
      },
    };
  } catch (err) {
    console.error('Error en detectarPatronHorario:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════
// ANÁLISIS F: Eficiencia de dosificación
// ═══════════════════════════════════════════

async function analizarEficienciaDosificacion(userId) {
  try {
    // Últimas dosificaciones
    const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const eventos = await DosingEvent.find({
      userId,
      createdAt: { $gte: desde },
      ejecutado: true,
    }).sort({ createdAt: -1 }).limit(10);

    if (eventos.length < 3) return null;

    const analisis = [];

    for (const evento of eventos) {
      // Buscar el pH antes y después de la dosificación
      const antes = await Measurement.findOne({
        userId,
        createdAt: { $lt: evento.createdAt },
      }).sort({ createdAt: -1 });

      const despues = await Measurement.findOne({
        userId,
        createdAt: { $gt: evento.createdAt },
      }).sort({ createdAt: 1 });

      if (!antes || !despues) continue;

      // Solo considerar los que efectivamente cambiaron el pH
      const cambioPH = despues.ph - antes.ph;

      // Para ácido esperamos pH baje (cambioPH < 0)
      // Para base esperamos pH suba (cambioPH > 0)
      const cambioEsperado = evento.tipo === 'acido' ? 'bajar' : 'subir';
      const cambioReal = cambioPH < -0.05 ? 'bajar' : cambioPH > 0.05 ? 'subir' : 'sin_cambio';

      analisis.push({
        tipo: evento.tipo,
        cantidad: evento.cantidad,
        unidad: evento.unidad,
        cambioPH: Math.abs(cambioPH),
        cambioEsperado,
        cambioReal,
        eficiente: cambioEsperado === cambioReal,
      });
    }

    if (analisis.length < 2) return null;

    // Contar cuántas fueron eficientes
    const eficientes = analisis.filter(a => a.eficiente).length;
    const tasaEficiencia = eficientes / analisis.length;

    // Si menos del 60% fueron eficientes, recomendar ajuste
    if (tasaEficiencia >= 0.6) return null;

    // Agrupar por tipo
    const porTipo = {};
    analisis.forEach(a => {
      if (!porTipo[a.tipo]) porTipo[a.tipo] = [];
      porTipo[a.tipo].push(a);
    });

    // Buscar el tipo con menor eficiencia
    let peorTipo = null, peorTasa = 1;
    Object.entries(porTipo).forEach(([tipo, arr]) => {
      const tasa = arr.filter(a => a.eficiente).length / arr.length;
      if (tasa < peorTasa) {
        peorTasa = tasa;
        peorTipo = tipo;
      }
    });

    if (!peorTipo) return null;

    const arr = porTipo[peorTipo];
    const cambioPromedio = arr.reduce((a, x) => a + x.cambioPH, 0) / arr.length;

    return {
      tipo: 'eficiencia_dosificacion',
      titulo: `Dosificación de ${peorTipo} poco efectiva`,
      mensaje: `Las últimas ${arr.length} dosificaciones de ${peorTipo} cambiaron el pH en promedio solo ${cambioPromedio.toFixed(2)} unidades. Podrías necesitar aumentar la cantidad.`,
      confianza: Math.round((1 - peorTasa) * 100),
      accionSugerida: null, // Es informativo
      contexto: {
        tipo: peorTipo,
        dosificaciones: arr.length,
        cambioPromedio,
        tasaEficiencia: Math.round(peorTasa * 100),
      },
    };
  } catch (err) {
    console.error('Error en analizarEficienciaDosificacion:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════
// ANÁLISIS G: Recomendación de cloro
// ═══════════════════════════════════════════

async function recomendarCloro(userId) {
  try {
    const pool = await Pool.findOne({ userId });
    if (!pool) return null;

    // Buscar la última dosificación de cloro
    const ultimaCloro = await DosingEvent.findOne({
      userId,
      tipo: 'cloro',
    }).sort({ createdAt: -1 });

    let horasSinCloro = null;
    if (ultimaCloro) {
      horasSinCloro = (Date.now() - new Date(ultimaCloro.createdAt).getTime()) / (60 * 60 * 1000);
    } else {
      horasSinCloro = 999; // Nunca se dosificó
    }

    // Si nunca se dosificó o pasaron más de 48hs
    if (horasSinCloro < HORAS_SIN_CLORO) return null;

    // Calcular dosis según volumen
    const cantidad = Math.round(pool.volumen * CLORO_GR_POR_M3);

    const dias = Math.floor(horasSinCloro / 24);

    return {
      tipo: 'recomendacion_cloro',
      titulo: 'Recomendación de dosificación de cloro',
      mensaje: horasSinCloro >= 999
        ? `No se registran dosificaciones de cloro. Para tu piscina de ${pool.volumen} m³, te recomiendo dosificar ${cantidad} g de cloro.`
        : `Hace ${dias} día${dias > 1 ? 's' : ''} que no dosificás cloro. Para tu piscina de ${pool.volumen} m³, te recomiendo dosificar ${cantidad} g de cloro.`,
      confianza: 90,
      accionSugerida: {
        tipo: 'cloro',
        cantidad,
        unidad: 'g',
        motivo: `Dosificación de cloro según volumen de piscina (${pool.volumen} m³)`,
      },
      contexto: {
        volumen: pool.volumen,
        horasSinCloro: Math.round(horasSinCloro),
        cantidad,
      },
    };
  } catch (err) {
    console.error('Error en recomendarCloro:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════
// MOTOR PRINCIPAL
// ═══════════════════════════════════════════

async function generarRecomendaciones(userId) {
  const recomendaciones = [];

  try {
    // Ejecutar todos los análisis en paralelo
    const [prediccion, patron, eficiencia, cloro] = await Promise.all([
      predecirPH(userId),
      detectarPatronHorario(userId),
      analizarEficienciaDosificacion(userId),
      recomendarCloro(userId),
    ]);

    if (prediccion) recomendaciones.push(prediccion);
    if (patron) recomendaciones.push(patron);
    if (eficiencia) recomendaciones.push(eficiencia);
    if (cloro) recomendaciones.push(cloro);

    console.log(`🤖 Generadas ${recomendaciones.length} recomendación(es) IA`);
  } catch (err) {
    console.error('Error en generarRecomendaciones:', err.message);
  }

  return recomendaciones;
}

module.exports = {
  generarRecomendaciones,
  calcularTendencia,
  RANGOS,
};