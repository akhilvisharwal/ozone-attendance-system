import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ExternalLink, MapPin } from "lucide-react";
import {
  googleMapsSearchUrl,
  loadGoogleMaps,
} from "@/utils/googleMaps";
import { useGoogleMapsApiKey } from "@/hooks/useGoogleMapsApiKey";

const outlineLinkClass =
  "inline-flex min-h-[36px] w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:w-auto";

export interface GoogleMapPreviewProps {
  latitude: number;
  longitude: number;
  /** Accessible label for the map region. */
  label?: string;
  className?: string;
  mapClassName?: string;
  showOpenButton?: boolean;
  compact?: boolean;
}

export function GoogleMapPreview({
  latitude,
  longitude,
  label = "Location map",
  className,
  mapClassName,
  showOpenButton = true,
  compact = false,
}: GoogleMapPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { apiKey, waitingForServer } = useGoogleMapsApiKey();

  useEffect(() => {
    if (!apiKey) {
      if (waitingForServer) {
        setStatus("loading");
        setErrorMessage(null);
        return;
      }
      setStatus("error");
      setErrorMessage(
        "Google Maps API key is not configured. Set VITE_GOOGLE_MAPS_API_KEY on Vercel or GOOGLE_MAPS_API_KEY on Render."
      );
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);

    void loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;

        const center = { lat: latitude, lng: longitude };

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new google.maps.Map(containerRef.current, {
            center,
            zoom: compact ? 15 : 16,
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            gestureHandling: "cooperative",
          });
          markerRef.current = new google.maps.Marker({
            position: center,
            map: mapInstanceRef.current,
          });
        } else {
          mapInstanceRef.current.setCenter(center);
          mapInstanceRef.current.setZoom(compact ? 15 : 16);
          markerRef.current?.setPosition(center);
        }

        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[GoogleMapPreview] failed to load map:", err);
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to load Google Maps."
        );
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, compact, latitude, longitude, waitingForServer]);

  const mapHeight = compact ? "h-36" : "h-48";
  const openUrl = googleMapsSearchUrl(latitude, longitude);

  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <div
        className={clsx(
          "relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50",
          mapHeight,
          mapClassName
        )}
      >
        <div ref={containerRef} className="h-full w-full" aria-label={label} role="img" />

        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50/90 text-sm text-slate-500">
            <MapPin className="h-5 w-5 animate-pulse text-slate-400" />
            <span>Loading map…</span>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50 px-4 text-center text-sm text-slate-500">
            <MapPin className="h-5 w-5 text-slate-400" />
            <span>{errorMessage ?? "Map unavailable."}</span>
            {showOpenButton && (
              <a
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Open in Google Maps
              </a>
            )}
          </div>
        )}
      </div>

      {showOpenButton && status === "ready" && (
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={outlineLinkClass}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open in Google Maps
        </a>
      )}
    </div>
  );
}
