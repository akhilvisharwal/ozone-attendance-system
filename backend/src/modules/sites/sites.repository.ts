import { pool } from "../../config/db";
import { Site } from "../../types";

export async function createSite(input: {
  name: string;
  type: "office" | "project";
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number | null;
  createdBy: string;
}): Promise<Site> {
  const result = await pool.query<Site>(
    `INSERT INTO sites (name, type, address, latitude, longitude, radius_meters, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.name,
      input.type,
      input.address ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.radiusMeters ?? 200,
      input.createdBy,
    ]
  );
  return result.rows[0];
}

export async function listSites(includeInactive: boolean): Promise<Site[]> {
  const result = await pool.query<Site>(
    includeInactive
      ? "SELECT * FROM sites WHERE deleted_at IS NULL ORDER BY name ASC"
      : "SELECT * FROM sites WHERE deleted_at IS NULL AND is_active = true ORDER BY name ASC"
  );
  return result.rows;
}

export async function findSiteById(id: string): Promise<Site | null> {
  const result = await pool.query<Site>(
    "SELECT * FROM sites WHERE id = $1 AND deleted_at IS NULL",
    [id]
  );
  return result.rows[0] ?? null;
}

export async function updateSiteImage(id: string, imagePath: string | null): Promise<Site | null> {
  const result = await pool.query<Site>(
    `UPDATE sites SET image_path = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
    [imagePath, id]
  );
  return result.rows[0] ?? null;
}

/** Soft-deletes a site: hidden from lists but the row stays for FK integrity. */
export async function softDeleteSite(id: string): Promise<Site | null> {
  const result = await pool.query<Site>(
    `UPDATE sites SET deleted_at = now(), is_active = false
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  return result.rows[0] ?? null;
}

/** Number of attendance records that reference this site. */
export async function countSiteAttendance(id: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    "SELECT COUNT(*) FROM attendance WHERE site_id = $1",
    [id]
  );
  return parseInt(result.rows[0].count, 10);
}

export async function updateSite(
  id: string,
  input: Partial<{
    name: string;
    type: "office" | "project";
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    radiusMeters: number | null;
    isActive: boolean;
  }>
): Promise<Site | null> {
  const result = await pool.query<Site>(
    `UPDATE sites SET
       name = COALESCE($1, name),
       type = COALESCE($2, type),
       address = COALESCE($3, address),
       latitude = COALESCE($4, latitude),
       longitude = COALESCE($5, longitude),
       radius_meters = COALESCE($6, radius_meters),
       is_active = COALESCE($7, is_active)
     WHERE id = $8
     RETURNING *`,
    [
      input.name ?? null,
      input.type ?? null,
      input.address ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.radiusMeters ?? null,
      input.isActive ?? null,
      id,
    ]
  );
  return result.rows[0] ?? null;
}
