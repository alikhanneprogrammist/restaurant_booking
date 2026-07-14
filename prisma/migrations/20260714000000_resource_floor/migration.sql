-- Асату: столы группируются по этажам ресторана (3 этажа).
ALTER TABLE "Resource" ADD COLUMN "floor" INTEGER NOT NULL DEFAULT 1;
