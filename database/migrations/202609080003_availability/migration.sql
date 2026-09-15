CREATE TABLE work_periods (
 id UUID PRIMARY KEY, salon_id UUID NOT NULL, professional_id UUID NOT NULL,
 weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
 start_minute INTEGER NOT NULL, end_minute INTEGER NOT NULL,
 CONSTRAINT work_period_interval CHECK (start_minute >= 0 AND start_minute < end_minute AND end_minute <= 1440),
 FOREIGN KEY (salon_id, professional_id) REFERENCES professionals(salon_id, id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX work_periods_salon_id_professional_id_weekday_idx ON work_periods(salon_id, professional_id, weekday);
CREATE TABLE availability_blocks (
 id UUID PRIMARY KEY, salon_id UUID NOT NULL, professional_id UUID NOT NULL,
 starts_at TIMESTAMPTZ(3) NOT NULL, ends_at TIMESTAMPTZ(3) NOT NULL,
 description VARCHAR(200) NOT NULL, cancelled_at TIMESTAMPTZ(3), version INTEGER NOT NULL DEFAULT 1,
 CONSTRAINT availability_block_interval CHECK (starts_at < ends_at),
 FOREIGN KEY (salon_id, professional_id) REFERENCES professionals(salon_id, id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX availability_blocks_salon_id_professional_id_cancelled_at_s_idx ON availability_blocks(salon_id, professional_id, cancelled_at, starts_at);
CREATE TABLE professional_services (
 salon_id UUID NOT NULL, professional_id UUID NOT NULL, service_id UUID NOT NULL,
 PRIMARY KEY (professional_id, service_id),
 FOREIGN KEY (salon_id, professional_id) REFERENCES professionals(salon_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY (salon_id, service_id) REFERENCES services(salon_id, id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX professional_services_salon_id_service_id_idx ON professional_services(salon_id, service_id);
