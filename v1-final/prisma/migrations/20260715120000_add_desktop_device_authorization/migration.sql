CREATE TABLE "device_codes" (
    "id" TEXT NOT NULL,
    "device_code" TEXT NOT NULL,
    "user_code" TEXT NOT NULL,
    "user_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "last_polled_at" TIMESTAMP(3),
    "polling_interval" INTEGER,
    "client_id" TEXT,
    "scope" TEXT,

    CONSTRAINT "device_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_codes_device_code_key" ON "device_codes"("device_code");
CREATE UNIQUE INDEX "device_codes_user_code_key" ON "device_codes"("user_code");
CREATE INDEX "device_codes_user_id_idx" ON "device_codes"("user_id");
