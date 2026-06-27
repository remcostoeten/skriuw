ALTER TABLE "user" ADD COLUMN "username" TEXT;
ALTER TABLE "user" ADD COLUMN "display_username" TEXT;

CREATE UNIQUE INDEX "user_username_key" ON "user"("username");
