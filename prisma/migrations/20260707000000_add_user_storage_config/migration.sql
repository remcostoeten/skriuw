-- CreateTable
CREATE TABLE "user_storage_configs" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encrypted_config" TEXT NOT NULL,
    "config_preview" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'untested',
    "last_tested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_storage_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_storage_configs_user_id_key" ON "user_storage_configs"("user_id");

-- AddForeignKey
ALTER TABLE "user_storage_configs" ADD CONSTRAINT "user_storage_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
