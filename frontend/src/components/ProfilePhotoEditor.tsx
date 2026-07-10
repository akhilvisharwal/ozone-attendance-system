import { useRef, useState } from "react";
import { Camera, Trash2, Upload } from "lucide-react";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { ProfilePhotoCropModal } from "@/components/ProfilePhotoCropModal";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { extractErrorMessage } from "@/api/client";
import * as employeesApi from "@/api/employees";
import { useAuth } from "@/auth/AuthContext";
import { PROFILE_PHOTO_ACCEPT, validateProfilePhotoFile } from "@/utils/profilePhoto";
import type { Employee } from "@/types";

export function ProfilePhotoEditor({
  employee,
  onUpdated,
  allowRemove = true,
  size = "2xl",
}: {
  employee: Employee;
  onUpdated?: (employee: Employee) => void;
  allowRemove?: boolean;
  size?: "xl" | "2xl";
}) {
  const { setEmployee, refreshMe } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function openPicker() {
    setError(null);
    setMessage(null);
    inputRef.current?.click();
  }

  function onFileSelected(file: File | null) {
    if (!file) return;
    const validation = validateProfilePhotoFile(file);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setCropFile(file);
  }

  async function applyUpdated(updated: Employee, successMessage: string) {
    setEmployee(updated);
    onUpdated?.(updated);
    setCropFile(null);
    setMessage(successMessage);
    // Refresh in background so session token/employee stay in sync without blocking UI.
    void refreshMe().catch(() => {
      /* keep optimistic employee from upload response */
    });
  }

  async function handleCropped(blob: Blob) {
    setSaving(true);
    setError(null);
    try {
      const updated = await employeesApi.updateMyAvatar(blob);
      await applyUpdated(updated, "Profile picture updated.");
    } catch (err) {
      setError(extractErrorMessage(err, "Could not upload profile picture."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!employee.profile_photo_path) return;
    if (!window.confirm("Remove your profile picture?")) return;
    setRemoving(true);
    setError(null);
    try {
      const updated = await employeesApi.deleteMyAvatar();
      await applyUpdated(updated, "Profile picture removed.");
    } catch (err) {
      setError(extractErrorMessage(err, "Could not remove profile picture."));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <EmployeeAvatar
          name={employee.name}
          photoPath={employee.profile_photo_path}
          size={size}
          editable
          onEditClick={openPicker}
        />

        <div className="flex flex-1 flex-col items-center gap-2 sm:items-start">
          <p className="text-sm font-medium text-slate-900">{employee.name}</p>
          <p className="text-xs text-slate-500">{employee.employee_code}</p>
          <p className="max-w-sm text-center text-xs text-slate-500 sm:text-left">
            JPG, PNG, or WebP · max 2 MB. Images are cropped square and saved as WebP.
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Button type="button" size="sm" icon={<Upload className="h-4 w-4" />} onClick={openPicker}>
              {employee.profile_photo_path ? "Replace photo" : "Upload photo"}
            </Button>
            {allowRemove && employee.profile_photo_path && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={<Trash2 className="h-4 w-4" />}
                isLoading={removing}
                onClick={() => void handleRemove()}
              >
                Remove
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              icon={<Camera className="h-4 w-4" />}
              onClick={openPicker}
              className="sm:hidden"
            >
              Change
            </Button>
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={PROFILE_PHOTO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          onFileSelected(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      <ProfilePhotoCropModal
        open={Boolean(cropFile)}
        file={cropFile}
        saving={saving}
        onClose={() => {
          if (!saving) setCropFile(null);
        }}
        onConfirm={handleCropped}
      />
    </div>
  );
}
