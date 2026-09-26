-- AlterTable: snapshot author name on a share. NULL means the public page is anonymous.
ALTER TABLE "note_shares" ADD COLUMN "author_name" TEXT;
