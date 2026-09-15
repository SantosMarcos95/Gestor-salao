CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED','CONFIRMED','ARRIVED','COMPLETED','NO_SHOW','CANCELLED');
CREATE TABLE appointments (
 id UUID PRIMARY KEY, salon_id UUID NOT NULL, professional_id UUID NOT NULL, client_id UUID NOT NULL, location_id UUID NOT NULL,
 starts_at TIMESTAMPTZ(3) NOT NULL, ends_at TIMESTAMPTZ(3) NOT NULL,
 status "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED', notes VARCHAR(2000), version INTEGER NOT NULL DEFAULT 1,
 request_key UUID NOT NULL, request_hash CHAR(64) NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT appointments_interval CHECK (starts_at < ends_at AND ends_at <= starts_at + INTERVAL '24 hours'),
 CONSTRAINT appointments_version CHECK (version > 0),
 FOREIGN KEY (salon_id, professional_id) REFERENCES professionals(salon_id,id) ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY (salon_id, client_id) REFERENCES clients(salon_id,id) ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY (salon_id, location_id) REFERENCES locations(salon_id,id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX appointments_salon_id_id_key ON appointments(salon_id,id);
CREATE UNIQUE INDEX appointments_salon_id_request_key_key ON appointments(salon_id,request_key);
CREATE INDEX appointments_salon_id_professional_id_starts_at_ends_at_idx ON appointments(salon_id,professional_id,starts_at,ends_at);
CREATE INDEX appointments_salon_id_client_id_idx ON appointments(salon_id,client_id);
CREATE TABLE appointment_services (
 id UUID PRIMARY KEY, salon_id UUID NOT NULL, appointment_id UUID NOT NULL, service_id UUID NOT NULL,
 position INTEGER NOT NULL CHECK (position >= 0), name VARCHAR(150) NOT NULL,
 duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440), price NUMERIC(14,2) NOT NULL CHECK (price >= 0),
 FOREIGN KEY (salon_id, appointment_id) REFERENCES appointments(salon_id,id) ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY (salon_id, service_id) REFERENCES services(salon_id,id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX appointment_services_appointment_id_position_key ON appointment_services(appointment_id,position);
