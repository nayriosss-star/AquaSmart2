const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Verifica el JWT de un usuario web
function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado. Falta el token.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

// Verifica la API key del ESP32 con comparación timing-safe
function verificarDispositivo(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const expected = process.env.DEVICE_API_KEY;

  if (!apiKey || !expected) {
    return res.status(401).json({ error: 'Dispositivo no autorizado.' });
  }

  const a = Buffer.from(String(apiKey));
  const b = Buffer.from(String(expected));

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Dispositivo no autorizado.' });
  }
  next();
}

module.exports = { verificarToken, verificarDispositivo };