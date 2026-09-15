CREATE TABLE "professionals" (
  "id" UUID NOT NULL,
  "salon_id" UUID NOT NULL,
  "membership_id" UUID,
  "name" VARCHAR(150) NOT NULL,
  "phone" VARCHAR(30),
  "email" VARCHAR(254),
  "specialty" VARCHAR(150),
  "notes" VARCHAR(2000),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "professionals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "professionals_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "professionals_salon_id_membership_id_fkey" FOREIGN KEY ("salon_id", "membership_id") REFERENCES "salon_users"("salon_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "professionals_salon_id_id_key" ON "professionals"("salon_id", "id");
CREATE UNIQUE INDEX "professionals_salon_id_membership_id_key" ON "professionals"("salon_id", "membership_id");
CREATE INDEX "professionals_salon_id_active_name_idx" ON "professionals"("salon_id", "active", "name");

CREATE TABLE "services" (
  "id" UUID NOT NULL,
  "salon_id" UUID NOT NULL,
  "name" VARCHAR(150) NOT NULL,
  "description" VARCHAR(2000),
  "duration_minutes" INTEGER NOT NULL CHECK ("duration_minutes" BETWEEN 1 AND 1440),
  "price" DECIMAL(14,2) NOT NULL CHECK ("price" >= 0),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "services_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "services_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "services_salon_id_id_key" ON "services"("salon_id", "id");
CREATE INDEX "services_salon_id_active_name_idx" ON "services"("salon_id", "active", "name");
