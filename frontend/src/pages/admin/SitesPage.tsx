import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  Building2, Plus, Pencil, Image as ImageIcon, Trash2, Power, Upload, ShieldAlert,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Spinner, EmptyState } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";
import { OverflowMenu } from "@/components/ui/OverflowMenu";
import { ResponsiveTable, type Column } from "@/components/ui/ResponsiveTable";
import { CrossfadeSwitch } from "@/components/ui/CrossfadeSwitch";
import { SecureImage } from "@/components/SecureImage";
import * as sitesApi from "@/api/sites";
import type { Site, SiteType } from "@/types";
import { extractErrorMessage } from "@/api/client";

export function SitesPage() {
  const [sites, setSites]     = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen]     = useState(false);
  const [editTarget, setEditTarget]     = useState<Site | null>(null);
  const [imageTarget, setImageTarget]   = useState<Site | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);

  function load() {
    setLoading(true);
    sitesApi
      .listSites(true)
      .then(setSites)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function upsertLocal(updated: Site) {
    setSites((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  async function toggleActive(site: Site) {
    const updated = await sitesApi.updateSite(site.id, { isActive: !site.is_active });
    upsertLocal(updated);
  }

  function buildMenu(site: Site) {
    return [
      {
        label: "Edit Site Details",
        icon: <Pencil className="h-4 w-4" />,
        onClick: () => setEditTarget(site),
      },
      {
        label: "Change Site Image",
        icon: <ImageIcon className="h-4 w-4" />,
        onClick: () => setImageTarget(site),
      },
      {
        label: "Delete Site Image",
        icon: <Trash2 className="h-4 w-4" />,
        disabled: !site.image_path,
        disabledReason: !site.image_path ? "No image" : undefined,
        onClick: () => setImageTarget(site),
      },
      {
        label: site.is_active ? "Deactivate Site" : "Activate Site",
        icon: <Power className="h-4 w-4" />,
        danger: site.is_active,
        divider: true,
        onClick: () => toggleActive(site),
      },
      {
        label: "Delete Site",
        icon: <Trash2 className="h-4 w-4" />,
        danger: true,
        onClick: () => setDeleteTarget(site),
      },
    ];
  }

  const columns: Column<Site>[] = [
    {
      header: "Site",
      primary: true,
      cell: (s) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-500">
            {s.image_path ? (
              <SecureImage path={s.image_path} alt={s.name} className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{s.name}</p>
            <p className="truncate text-xs text-slate-400">{s.address ?? "No address specified"}</p>
          </div>
        </div>
      ),
    },
    {
      header: "Type",
      cell: (s) => (
        <Badge tone={s.type === "office" ? "blue" : "slate"}>
          {s.type === "office" ? "Office" : "Project"}
        </Badge>
      ),
    },
    {
      header: "Status",
      cell: (s) => <Badge tone={s.is_active ? "green" : "red"}>{s.is_active ? "Active" : "Inactive"}</Badge>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Office & Project Sites"
        subtitle="Manage locations employees can select at check-out"
        action={
          <Button onClick={() => setCreateOpen(true)} icon={<Plus className="h-4 w-4" />}>
            Add Site
          </Button>
        }
      />

      <Card>
        <CrossfadeSwitch state={loading ? "loading" : "content"}>
        {loading ? (
          <Spinner />
        ) : sites.length === 0 ? (
          <EmptyState title="No sites configured yet" description="Add your first office or project site" />
        ) : (
          <ResponsiveTable
            columns={columns}
            data={sites}
            rowKey={(s) => s.id}
            actions={(site) => <OverflowMenu items={buildMenu(site)} align="right" />}
          />
        )}
        </CrossfadeSwitch>
      </Card>

      <CreateSiteModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); load(); }}
      />

      {editTarget && (
        <EditSiteModal
          site={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => { upsertLocal(updated); setEditTarget(null); }}
        />
      )}

      {imageTarget && (
        <ManageSiteImageModal
          site={imageTarget}
          onClose={() => setImageTarget(null)}
          onSaved={(updated) => { upsertLocal(updated); setImageTarget(updated); }}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteSiteModal
          site={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={(id) => {
            setSites((prev) => prev.filter((s) => s.id !== id));
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Create site ────────────────────────────────────────────────────────────

function CreateSiteModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName]       = useState("");
  const [type, setType]       = useState<SiteType>("project");
  const [address, setAddress] = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await sitesApi.createSite({ name, type, address: address || null });
      setName("");
      setAddress("");
      onCreated();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not create site"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Office / Project Site">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        <Input label="Site Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Select label="Type" value={type} onChange={(e) => setType(e.target.value as SiteType)}>
          <option value="office">Office</option>
          <option value="project">Project Site</option>
        </Select>
        <Input label="Address" hint="Optional" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Button type="submit" isLoading={submitting} className="mt-2">
          Create Site
        </Button>
      </form>
    </Modal>
  );
}

// ─── Edit site ────────────────────────────────────────────────────────────────

function EditSiteModal({
  site,
  onClose,
  onSaved,
}: {
  site: Site;
  onClose: () => void;
  onSaved: (updated: Site) => void;
}) {
  const [name, setName]       = useState(site.name);
  const [type, setType]       = useState<SiteType>(site.type);
  const [address, setAddress] = useState(site.address ?? "");
  const [error, setError]     = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated = await sitesApi.updateSite(site.id, { name, type, address });
      onSaved(updated);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not update site"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit — ${site.name}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        <Input label="Site Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Select label="Type" value={type} onChange={(e) => setType(e.target.value as SiteType)}>
          <option value="office">Office</option>
          <option value="project">Project Site</option>
        </Select>
        <Input label="Address" hint="Optional" value={address} onChange={(e) => setAddress(e.target.value)} />
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={saving}>Save Changes</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Manage site image ──────────────────────────────────────────────────────

function ManageSiteImageModal({
  site,
  onClose,
  onSaved,
}: {
  site: Site;
  onClose: () => void;
  onSaved: (updated: Site) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile]       = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
  const [removing, setRemoving] = useState(false);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
  }

  async function handleUpload() {
    if (!file) return;
    setError(null);
    setSaving(true);
    try {
      const updated = await sitesApi.setSiteImage(site.id, file);
      if (preview) URL.revokeObjectURL(preview);
      setFile(null);
      setPreview(null);
      onSaved(updated);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not update the site image"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setRemoving(true);
    try {
      const updated = await sitesApi.deleteSiteImage(site.id);
      onSaved(updated);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not remove the site image"));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Site Image — ${site.name}`}>
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="flex items-center gap-4">
          <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">
            {preview ? (
              <img src={preview} alt="New image preview" className="h-full w-full object-cover" />
            ) : site.image_path ? (
              <SecureImage path={site.image_path} alt={site.name} className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-9 w-9" />
            )}
          </div>
          <div className="min-w-0 text-sm text-slate-500">
            <p className="font-medium text-slate-900">{site.name}</p>
            <p className="mt-1 text-xs">
              {preview ? "New image selected — click Upload to save." : site.image_path ? "Current site image." : "No site image set."}
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onPick}
        />

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={<ImageIcon className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()}>
            Choose Image
          </Button>
          {file && (
            <Button icon={<Upload className="h-4 w-4" />} isLoading={saving} onClick={handleUpload}>
              Upload
            </Button>
          )}
          {site.image_path && !preview && (
            <Button
              variant="ghost"
              icon={<Trash2 className="h-4 w-4" />}
              isLoading={removing}
              onClick={handleRemove}
              className="text-red-600 hover:bg-red-50"
            >
              Delete Image
            </Button>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Delete site ──────────────────────────────────────────────────────────────

function ConfirmDeleteSiteModal({
  site,
  onClose,
  onDeleted,
}: {
  site: Site;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [attendance, setAttendance] = useState<number | null>(null);
  const [checking, setChecking]     = useState(true);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    sitesApi.getSiteDependencies(site.id)
      .then((d) => setAttendance(d.attendance))
      .catch(() => setAttendance(null))
      .finally(() => setChecking(false));
  }, [site.id]);

  const blocked = (attendance ?? 0) > 0;

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      await sitesApi.deleteSite(site.id);
      onDeleted(site.id);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not delete site"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Delete Site">
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <p><span className="font-medium">Site:</span> {site.name}</p>
          <p><span className="font-medium">Type:</span> {site.type === "office" ? "Office" : "Project"}</p>
        </div>

        {checking ? (
          <div className="flex justify-center py-2"><Spinner /></div>
        ) : blocked ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-medium">This site cannot be deleted</p>
              <p className="mt-0.5">
                It is linked to <strong>{attendance}</strong> attendance record{attendance === 1 ? "" : "s"}.
                Deactivate it instead — that hides it from future check-outs while keeping historical reports intact.
              </p>
            </div>
          </div>
        ) : (
          <Alert variant="error">
            Are you sure you want to delete <strong>{site.name}</strong>? This cannot be undone.
          </Alert>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            isLoading={loading}
            disabled={checking || blocked}
            onClick={handleConfirm}
            className="bg-red-600 hover:bg-red-700 text-white"
            icon={<Trash2 className="h-4 w-4" />}
          >
            Delete Site
          </Button>
        </div>
      </div>
    </Modal>
  );
}
