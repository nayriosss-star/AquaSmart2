const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Tipo y severidad
  tipo:        { 
    type: String, 
    enum: [
      'ph_alto', 'ph_bajo', 'ph_muy_alto', 'ph_muy_bajo',
      'temp_alta', 'temp_baja', 'temp_extrema_alta', 'temp_extrema_baja',
      'cloro_recomendacion',
      'esp32_inactivo',
      'sin_dosificacion',
    ],
    required: true,
  },
  severidad:   { 
    type: String, 
    enum: ['critica', 'advertencia', 'recomendacion_ia'],
    required: true,
    index: true,
  },
  
  // Contenido
  titulo:      { type: String, required: true, maxlength: 120 },
  mensaje:     { type: String, required: true, maxlength: 500 },
  
  // Datos de contexto (ej: { ph: 8.2, temperatura: 25.3 })
  contexto:    { type: mongoose.Schema.Types.Mixed, default: {} },
  
  // Acción sugerida (opcional)
  accionSugerida: {
    tipo:      { type: String, enum: ['ph_subir', 'ph_bajar', 'cloro', null], default: null },
    cantidad:  { type: Number, default: 0 },
    unidad:    { type: String, enum: ['ml', 'g', null], default: null },
  },
  
  // Estado
  estado:      { type: String, enum: ['activa', 'resuelta'], default: 'activa', index: true },
  resueltaEn:  { type: Date, default: null },
  resueltaPor: { type: String, enum: ['sistema', 'usuario', null], default: null },
  
  // Si el usuario la vio en un popup
  vista:       { type: Boolean, default: false },
}, { timestamps: true });

alertSchema.index({ userId: 1, estado: 1, createdAt: -1 });
alertSchema.index({ userId: 1, tipo: 1, estado: 1 });

module.exports = mongoose.model('Alert', alertSchema);