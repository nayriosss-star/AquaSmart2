const mongoose = require('mongoose');

const dosingEventSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  measurementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Measurement' },
  tipo:          { type: String, enum: ['acido', 'base'], required: true },
  cantidad:      { type: Number, required: true, min: 0 },
  unidad:        { type: String, enum: ['ml', 'g'], required: true },
  motivo:        { type: String, maxlength: 300 },
  ejecutado:     { type: Boolean, default: false },
}, { timestamps: true });

dosingEventSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('DosingEvent', dosingEventSchema);