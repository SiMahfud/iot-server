// ==========================================
// Component & Module Types Registry
// AgyGateway Universal IoT Server
// ==========================================

const COMPONENT_TYPES = {
  // --- Aktuator Output ---
  switch: {
    id: 'switch',
    category: 'actuator',
    name: 'Saklar / Relay (Digital Output)',
    icon: '💡',
    defaultAccess: 'rw',
    defaultUnit: '',
    actions: ['set_state', 'toggle', 'timer'],
    description: 'Kontrol hidup/mati beban biner atau timer hitung mundur'
  },
  dimmer: {
    id: 'dimmer',
    category: 'actuator',
    name: 'Dimmer / PWM (Lampu Redup / Speed Kipas 0-100%)',
    icon: '🔆',
    defaultAccess: 'rw',
    defaultUnit: '%',
    actions: ['set_value'],
    description: 'Pengaturan intensitas atau kecepatan motor 0 hingga 100%'
  },
  servo: {
    id: 'servo',
    category: 'actuator',
    name: 'Motor Servo (Sudut 0-180°)',
    icon: '🦾',
    defaultAccess: 'rw',
    defaultUnit: '°',
    actions: ['set_angle', 'sweep', 'preset'],
    description: 'Aktuator posisi sudut presisi untuk buka/tutup pintu, palang, atau katup'
  },
  rgb_led: {
    id: 'rgb_led',
    category: 'actuator',
    name: 'RGB LED / Strip NeoPixel WS2812',
    icon: '🎨',
    defaultAccess: 'rw',
    defaultUnit: '',
    actions: ['set_color', 'set_brightness', 'set_mode'],
    description: 'Pencahayaan warna spektrum HEX/RGB dan mode dinamis'
  },
  buzzer: {
    id: 'buzzer',
    category: 'actuator',
    name: 'Buzzer / Alarm Audio',
    icon: '🔔',
    defaultAccess: 'rw',
    defaultUnit: '',
    actions: ['beep', 'alarm', 'set_state'],
    description: 'Sinyal suara indikator peringatan atau nada pulsa'
  },

  // --- Sensor Digital & Analog ---
  digital_in: {
    id: 'digital_in',
    category: 'sensor',
    name: 'Sensor Gerak PIR / Saklar Magnet Pintu',
    icon: '🚶',
    defaultAccess: 'r',
    defaultUnit: '',
    actions: [],
    description: 'Mendeteksi status biner logika masukan (Trigger / Standby)'
  },
  analog: {
    id: 'analog',
    category: 'sensor',
    name: 'Sensor Analog ADC (LDR / Potensio / Kelembapan Tanah)',
    icon: '📊',
    defaultAccess: 'r',
    defaultUnit: '',
    actions: [],
    description: 'Membaca level tegangan analog (0 - 1023)'
  },
  dht11: {
    id: 'dht11',
    category: 'sensor',
    name: 'DHT11 (Sensor Suhu & Kelembapan 1-Wire)',
    icon: '🌡️',
    defaultAccess: 'r',
    defaultUnit: '°C',
    actions: [],
    description: 'Sensor iklim ruangan standar'
  },
  dht22: {
    id: 'dht22',
    category: 'sensor',
    name: 'DHT22 / AM2302 (Suhu Presisi Tinggi 1-Wire)',
    icon: '🌡️',
    defaultAccess: 'r',
    defaultUnit: '°C',
    actions: [],
    description: 'Sensor suhu dan kelembapan presisi'
  },
  ds18b20: {
    id: 'ds18b20',
    category: 'sensor',
    name: 'DS18B20 (Sensor Suhu Tahan Air 1-Wire)',
    icon: '🌡️',
    defaultAccess: 'r',
    defaultUnit: '°C',
    actions: [],
    description: 'Sensor probe temperatur tahan air untuk kolam/cairan'
  },

  // --- Sensor Bus I2C Native ---
  bmp280: {
    id: 'bmp280',
    category: 'sensor',
    name: 'BMP280 / BME280 (I2C Suhu & Tekanan Udara)',
    icon: '🌤️',
    defaultAccess: 'r',
    defaultUnit: 'hPa',
    actions: [],
    description: 'Sensor barometer atmosfer dan temperatur lingkungan'
  },
  bh1750: {
    id: 'bh1750',
    category: 'sensor',
    name: 'BH1750 (I2C Sensor Cahaya Lux)',
    icon: '☀️',
    defaultAccess: 'r',
    defaultUnit: 'Lux',
    actions: [],
    description: 'Sensor intensitas cahaya presisi lux'
  },
  sht30: {
    id: 'sht30',
    category: 'sensor',
    name: 'SHT30 / SHT31 (I2C Suhu & Kelembapan)',
    icon: '🌡️',
    defaultAccess: 'r',
    defaultUnit: '°C',
    actions: [],
    description: 'Sensor kelembapan dan temperatur industrial I2C'
  },
  aht10: {
    id: 'aht10',
    category: 'sensor',
    name: 'AHT10 / AHT20 (I2C Suhu & Kelembapan)',
    icon: '🌡️',
    defaultAccess: 'r',
    defaultUnit: '°C',
    actions: [],
    description: 'Sensor iklim kompak I2C generasi baru'
  },

  // --- Sensor Spasial / Vektor Komposit ---
  mpu6050: {
    id: 'mpu6050',
    category: 'composite',
    name: 'MPU6050 (6-Axis Gyroscope & Accelerometer 3D)',
    icon: '🧭',
    defaultAccess: 'r',
    defaultUnit: '°',
    actions: ['tare', 'calibrate'],
    description: 'Sensor orientasi spasial 3D (Roll, Pitch, Yaw), getaran akselerasi, dan temperatur'
  }
};

function getComponentMeta(driverOrType) {
  const key = (driverOrType || '').toLowerCase();
  return COMPONENT_TYPES[key] || {
    id: key || 'sensor',
    category: 'sensor',
    name: key || 'Sensor Kustom',
    icon: '📊',
    defaultAccess: 'r',
    defaultUnit: '',
    actions: []
  };
}

module.exports = {
  COMPONENT_TYPES,
  getComponentMeta
};
