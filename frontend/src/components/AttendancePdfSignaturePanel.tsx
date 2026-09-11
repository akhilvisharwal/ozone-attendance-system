import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Eraser, RotateCcw, Upload, BookmarkPlus, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { SecureImage } from "@/components/SecureImage";
import { extractErrorMessage } from "@/api/client";
import * as attendanceApi from "@/api/attendance";
import type { SignatureStroke } from "@/utils/attendancePdfSignature";
import {
  hasDrawnSignature,
  todayInputDate,
  undoSignatureStroke,
} from "@/utils/attendancePdfSignature";

export type AttendancePdfSignatureHandle = {
  hasImage: () => boolean;
  isUsingSaved: () => boolean;
  getFile: () => Promise<Blob | null>;
};

type ImageSource = "empty" | "drawn" | "uploaded" | "saved";

function canvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  };
}

function drawStrokes(canvas: HTMLCanvasElement, strokes: SignatureStroke[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 3.2;
  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i += 1) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  }
}

export const AttendancePdfSignaturePanel = forwardRef<
  AttendancePdfSignatureHandle,
  {
    signerName: string;
    designation: string;
    date: string;
    onFieldsChange: (patch: { name?: string; designation?: string; date?: string }) => void;
    onImageChange?: (hasImage: boolean) => void;
    required?: boolean;
  }
>(function AttendancePdfSignaturePanel(
  { signerName, designation, date, onFieldsChange, onImageChange, required },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [source, setSource] = useState<ImageSource>("empty");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hasImage =
    source === "uploaded" || source === "saved" || (source === "drawn" && hasDrawnSignature(strokes));

  useEffect(() => {
    onImageChange?.(hasImage);
  }, [hasImage, onImageChange]);

  useEffect(() => {
    void attendanceApi
      .getSavedAttendanceSignature()
      .then((result) => {
        setSavedPath(result.signaturePath);
        if (result.signaturePath) {
          setSource((current) => (current === "empty" ? "saved" : current));
        }
      })
      .catch(() => {
        setSavedPath(null);
      });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && source === "drawn") drawStrokes(canvas, strokes);
  }, [strokes, source]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setStrokes([]);
    setSource("empty");
    setError(null);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      hasImage: () => hasImage,
      isUsingSaved: () => source === "saved",
      getFile: async () => {
        if (source === "saved" || source === "empty") return null;
        if (source === "drawn" && !hasDrawnSignature(strokes)) return null;
        const canvas = canvasRef.current;
        if (!canvas) return null;
        return await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((blob) => resolve(blob), "image/png");
        });
      },
    }),
    [hasImage, source, strokes]
  );

  function startStroke(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    const point = canvasPoint(canvas, clientX, clientY);
    setSource("drawn");
    setStrokes((prev) => [...prev, { points: [point] }]);
  }

  function moveStroke(clientX: number, clientY: number) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = canvasPoint(canvas, clientX, clientY);
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice();
      const last = { ...next[next.length - 1], points: [...next[next.length - 1].points, point] };
      next[next.length - 1] = last;
      return next;
    });
  }

  function endStroke() {
    drawingRef.current = false;
  }

  async function handleUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Upload a PNG or JPG signature image.");
      return;
    }
    const bitmap = await createImageBitmap(file);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    setStrokes([]);
    setSource("uploaded");
    setError(null);
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || source === "empty") {
      setError("Draw or upload a signature before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not read the signature.");
      const result = await attendanceApi.saveAttendanceSignature(blob);
      setSavedPath(result.signaturePath);
      setMessage("Signature saved for reuse on future attendance PDFs.");
    } catch (err) {
      setError(extractErrorMessage(err, "Could not save the signature."));
    } finally {
      setSaving(false);
    }
  }

  async function handleUseSaved() {
    if (!savedPath) return;
    setStrokes([]);
    setSource("saved");
    setError(null);
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function handleDeleteSaved() {
    try {
      await attendanceApi.deleteAttendanceSignature();
      setSavedPath(null);
      if (source === "saved") clearCanvas();
      setMessage("Saved signature removed.");
    } catch (err) {
      setError(extractErrorMessage(err, "Could not remove the saved signature."));
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Authorized signature</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Draw with mouse or touch, or upload a PNG/JPG. This appears at the bottom of attendance PDFs.
          {required ? " A signature is required before PDF download." : ""}
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          label="Name"
          required={required}
          value={signerName}
          onChange={(e) => onFieldsChange({ name: e.target.value })}
        />
        <Input
          label="Designation"
          value={designation}
          onChange={(e) => onFieldsChange({ designation: e.target.value })}
        />
        <Input
          label="Date"
          type="date"
          required={required}
          value={date || todayInputDate()}
          onChange={(e) => onFieldsChange({ date: e.target.value })}
        />
      </div>

      <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {source === "saved" && savedPath ? (
          <div className="flex h-36 items-center justify-center bg-white p-3">
            <SecureImage path={savedPath} alt="Saved authorized signature" className="max-h-32 max-w-full object-contain" />
          </div>
        ) : null}
        <canvas
          ref={canvasRef}
          width={720}
          height={180}
          className={
            source === "saved"
              ? "pointer-events-none absolute h-0 w-0 opacity-0"
              : "h-36 w-full touch-none cursor-crosshair bg-white"
          }
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            startStroke(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => moveStroke(e.clientX, e.clientY)}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" icon={<Eraser className="h-4 w-4" />} onClick={clearCanvas}>
          Clear
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={<RotateCcw className="h-4 w-4" />}
          disabled={source !== "drawn" || !hasDrawnSignature(strokes)}
          onClick={() => {
            setStrokes((prev) => {
              const next = undoSignatureStroke(prev);
              if (!hasDrawnSignature(next)) setSource("empty");
              return next;
            });
          }}
        >
          Undo
        </Button>
        <Button type="button" variant="outline" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
          Upload PNG/JPG
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleUpload(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={<BookmarkPlus className="h-4 w-4" />}
          isLoading={saving}
          disabled={source === "empty" || source === "saved"}
          onClick={() => void handleSave()}
        >
          Save for reuse
        </Button>
        {savedPath && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<BookmarkCheck className="h-4 w-4" />}
              onClick={() => void handleUseSaved()}
            >
              Use saved signature
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void handleDeleteSaved()}>
              Remove saved
            </Button>
          </>
        )}
      </div>
    </div>
  );
});
