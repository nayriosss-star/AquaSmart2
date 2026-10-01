const mongoose = require('mongoose');

const measurementSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ph:          { type: Number, required: true, min: 0, max: 14 },
  cloro:       { type: Number, min: 0 },
  temperatura: { type: Number },
  origen:      { type: String, enum: ['esp32_mqtt', 'esp32_http', 'manual', 'demo'], default: 'esp32_mqtt' },
  esp32Id:     { type: String, index: true, sparse: true }, // ID único del ESP32 para deduplicar
}, { timestamps: true });

measurementSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Measurement', measurementSchema);