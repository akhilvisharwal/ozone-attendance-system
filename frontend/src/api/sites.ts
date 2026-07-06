import { apiClient } from "./client";
import type { Site, SiteType } from "@/types";

export interface SiteInput {
  name: string;
  type: SiteType;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number | null;
}

export async function listSites(includeInactive = false) {
  const res = await apiClient.get<{ items: Site[] }>("/sites", { params: { includeInactive } });
  return res.data.items;
}

export async function createSite(input: SiteInput) {
  const res = await apiClient.post<{ site: Site }>("/sites", input);
  return res.data.site;
}

export async function updateSite(id: string, input: Partial<SiteInput> & { isActive?: boolean }) {
  const res = await apiClient.patch<{ site: Site }>(`/sites/${id}`, input);
  return res.data.site;
}

export async function setSiteImage(id: string, file: Blob): Promise<Site> {
  const form = new FormData();
  form.append("image", file, "site.jpg");
  const res = await apiClient.patch<{ site: Site }>(`/sites/${id}/image`, form);
  return res.data.site;
}

export async function deleteSiteImage(id: string): Promise<Site> {
  const res = await apiClient.delete<{ site: Site }>(`/sites/${id}/image`);
  return res.data.site;
}

export async function getSiteDependencies(id: string): Promise<{ attendance: number }> {
  const res = await apiClient.get<{ dependencies: { attendance: number } }>(`/sites/${id}/dependencies`);
  return res.data.dependencies;
}

export async function deleteSite(id: string): Promise<Site> {
  const res = await apiClient.delete<{ site: Site }>(`/sites/${id}`);
  return res.data.site;
}
