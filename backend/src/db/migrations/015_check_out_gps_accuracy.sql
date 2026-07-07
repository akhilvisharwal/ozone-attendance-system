ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS check_out_gps_accuracy DOUBLE PRECISION;
