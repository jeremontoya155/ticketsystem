-- =============================================
-- SCHEMA DEL SISTEMA DE TICKETS
-- =============================================

-- Sesiones de express
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Usuarios del sistema
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  rol VARCHAR(20) NOT NULL DEFAULT 'soporte' CHECK (rol IN ('admin', 'desarrollo', 'soporte', 'cliente')),
  cliente_id INTEGER,
  activo BOOLEAN DEFAULT TRUE,
  notif_email BOOLEAN DEFAULT TRUE,
  notif_pantalla BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cliente_id INTEGER;
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin', 'desarrollo', 'soporte', 'cliente'));

-- Clientes / empresas
CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  codigo_externo INTEGER UNIQUE,
  nombre VARCHAR(200) NOT NULL,
  tipo_cliente INTEGER,
  nombre_tipo VARCHAR(100),
  contacto_nombre VARCHAR(150),
  telefono VARCHAR(50),
  email VARCHAR(150),
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contacto_nombre VARCHAR(150);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS notas TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'usuarios_cliente_id_fkey' AND conrelid = 'usuarios'::regclass
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id);
  END IF;
END $$;

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  nro_ticket INTEGER UNIQUE NOT NULL,
  cliente_id INTEGER REFERENCES clientes(id),
  reclamo TEXT NOT NULL,
  observacion TEXT,
  asunto VARCHAR(255),
  estado VARCHAR(30) DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente','En Proceso','Resuelto','Cerrado')),
  prioridad VARCHAR(20) DEFAULT 'Media' CHECK (prioridad IN ('Baja','Media','Alta','Urgente')),
  tipo_ticket VARCHAR(50),
  tipo_cliente_nombre VARCHAR(100),
  canal_origen VARCHAR(30) DEFAULT 'web' CHECK (canal_origen IN ('web','mail','whatsapp','vfp')),
  origen_contacto VARCHAR(150),
  origen_email VARCHAR(150),
  origen_telefono VARCHAR(60),
  origen_mensaje_id VARCHAR(200),
  referencia_externa VARCHAR(150),
  proceso VARCHAR(60),
  receptor_id INTEGER REFERENCES usuarios(id),
  ejecutor_id INTEGER REFERENCES usuarios(id),
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_asignacion TIMESTAMP,
  fecha_resolucion TIMESTAMP,
  dias_transcurridos INTEGER DEFAULT 0,
  cant_archivos INTEGER DEFAULT 0,
  tc VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS asunto VARCHAR(255);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS canal_origen VARCHAR(30) DEFAULT 'web';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS origen_contacto VARCHAR(150);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS origen_email VARCHAR(150);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS origen_telefono VARCHAR(60);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS origen_mensaje_id VARCHAR(200);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS referencia_externa VARCHAR(150);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS proceso VARCHAR(60);
UPDATE tickets SET canal_origen = 'web' WHERE canal_origen IS NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_canal_origen ON tickets(canal_origen);
CREATE INDEX IF NOT EXISTS idx_tickets_origen_email ON tickets(LOWER(origen_email));
CREATE INDEX IF NOT EXISTS idx_tickets_referencia_externa ON tickets(referencia_externa);
CREATE INDEX IF NOT EXISTS idx_usuarios_cliente_id ON usuarios(cliente_id);

-- Auditoria de mensajes entrantes/salientes por canales externos
CREATE TABLE IF NOT EXISTS ticket_comunicaciones (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  canal VARCHAR(30) NOT NULL CHECK (canal IN ('web','mail','whatsapp','vfp')),
  direccion VARCHAR(20) NOT NULL CHECK (direccion IN ('entrada','salida')),
  proveedor VARCHAR(80),
  mensaje_id VARCHAR(200),
  remitente VARCHAR(200),
  destinatario VARCHAR(200),
  asunto VARCHAR(255),
  cuerpo TEXT,
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_comunicaciones_ticket ON ticket_comunicaciones(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comunicaciones_mensaje ON ticket_comunicaciones(mensaje_id);

-- Comentarios / historial
CREATE TABLE IF NOT EXISTS comentarios (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id),
  comentario TEXT NOT NULL,
  tipo VARCHAR(20) DEFAULT 'comentario' CHECK (tipo IN ('comentario','cambio_estado','asignacion')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Adjuntos de tickets y comentarios
CREATE TABLE IF NOT EXISTS ticket_adjuntos (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  comentario_id INTEGER REFERENCES comentarios(id) ON DELETE CASCADE,
  nombre_original VARCHAR(255) NOT NULL,
  nombre_archivo VARCHAR(255) NOT NULL,
  ruta VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  tamanio INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Notificaciones
CREATE TABLE IF NOT EXISTS notificaciones (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  mensaje TEXT NOT NULL,
  leida BOOLEAN DEFAULT FALSE,
  tipo VARCHAR(30) DEFAULT 'info' CHECK (tipo IN ('info','warning','success','danger')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Config de mail por usuario
CREATE TABLE IF NOT EXISTS config_mail (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER UNIQUE REFERENCES usuarios(id),
  email_notif VARCHAR(150),
  notif_nuevo_ticket BOOLEAN DEFAULT TRUE,
  notif_cambio_estado BOOLEAN DEFAULT TRUE,
  notif_nuevo_comentario BOOLEAN DEFAULT TRUE,
  notif_asignacion BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- DATOS INICIALES
-- =============================================

-- Usuarios iniciales (password: password)
INSERT INTO usuarios (nombre, email, password, rol) VALUES
('Administrador', 'admin@empresa.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin'),
('Jeremias Montoya', 'jeremias@empresa.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'desarrollo'),
('Soporte General', 'soporte@empresa.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'soporte')
ON CONFLICT (email) DO NOTHING;

INSERT INTO clientes (nombre, contacto_nombre, email, telefono, notas)
SELECT 'jeremontoya', 'jeremontoya', 'jeremontoya155@gmail.com', NULL, 'Cliente de prueba para ingreso de tickets por mail y WhatsApp'
WHERE NOT EXISTS (
  SELECT 1 FROM clientes WHERE LOWER(email) = LOWER('jeremontoya155@gmail.com')
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tickets_updated_at ON tickets;
CREATE TRIGGER tickets_updated_at
BEFORE UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
