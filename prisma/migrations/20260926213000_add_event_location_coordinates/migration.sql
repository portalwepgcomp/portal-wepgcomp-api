ALTER TABLE "event_edition"
  ADD COLUMN "location_latitude" DOUBLE PRECISION,
  ADD COLUMN "location_longitude" DOUBLE PRECISION,
  ADD COLUMN "location_approximate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "location_geocoded_address" TEXT;
