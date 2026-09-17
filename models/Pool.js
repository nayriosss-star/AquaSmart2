const mongoose = require('mongoose');

const poolSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  largo:       { type: Number, default: 10, min: 0.1, max: 200 },
  ancho:       { type: Number, default: 5,  min: 0.1, max: 200 },
  profundidad: { type: Number, default: 1.5, min: 0.1, max: 10 },
  volumen:     { type: Number, default: 75 }, // m³
}, { timestamps: true });

module.exports = mongoose.model('Pool', poolSchema);