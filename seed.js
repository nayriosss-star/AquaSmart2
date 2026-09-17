const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // Google DNS
// O podés usar: dns.setServers(['1.1.1.1', '1.0.0.1']); // Cloudflare
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Pool = require('./models/Pool');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    const email = 'demo@aquasmart.com';
    let user = await User.findOne({ email });

    if (!user) {
      const hash = await bcrypt.hash('aqua1234', 12);
      user = await User.create({ name: 'Simón Demo', email, password: hash });
      console.log('✅ Usuario demo creado:', email);
    } else {
      console.log('ℹ️  Usuario demo ya existe:', email);
    }

    const pool = await Pool.findOne({ userId: user._id });
    if (!pool) {
      await Pool.create({
        userId: user._id,
        largo: 10, ancho: 5, profundidad: 1.5, volumen: 75,
      });
      console.log('✅ Piscina por defecto creada');
    }

    console.log('\n📋 Copiá este ID en tu .env como DEVICE_OWNER_ID:');
    console.log(`   DEVICE_OWNER_ID=${user._id}\n`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error en seed:', err);
    process.exit(1);
  }
})();