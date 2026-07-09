import { useCallback, useRef, type PointerEvent } from "react";
import clsx from "clsx";

export type ClockMode = "hour" | "minute";

const SIZE = 280;
const CX = SIZE / 2;
const CY = SIZE / 2;
const NUMBER_RADIUS = 98;
const HAND_LENGTH: Record<ClockMode, number> = { hour: 68, minute: 92 };

function polarToXY(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: CX + radius * Math.cos(rad),
    y: CY + radius * Math.sin(rad),
  };
}

function angleFromPoint(clientX: number, clientY: number, rect: DOMRect): number {
  const x = clientX - rect.left - CX;
  const y = clientY - rect.top - CY;
  let angle = (Math.atan2(y, x) * 180) / Math.PI + 90;
  if (angle < 0) angle += 360;
  return angle;
}

function hourFromAngle(angle: number): number {
  const hour = Math.round(angle / 30) % 12;
  return hour === 0 ? 12 : hour;
}

function minuteFromAngle(angle: number): number {
  return Math.round(angle / 6) % 60;
}

function handAngle(mode: ClockMode, hour12: number, minute: number): number {
  if (mode === "hour") return (hour12 % 12) * 30;
  return minute * 6;
}

export function AnalogClockFace({
  mode,
  hour12,
  minute,
  onHourChange,
  onMinuteChange,
  onInteractionEnd,
}: {
  mode: ClockMode;
  hour12: number;
  minute: number;
  onHourChange: (hour: number) => void;
  onMinuteChange: (minute: number) => void;
  onInteractionEnd?: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);

  const applyPointer = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const angle = angleFromPoint(clientX, clientY, rect);
      if (mode === "hour") onHourChange(hourFromAngle(angle));
      else onMinuteChange(minuteFromAngle(angle));
    },
    [mode, onHourChange, onMinuteChange]
  );

  const handlePointerDown = (e: PointerEvent<SVGSVGElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    applyPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    applyPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    onInteractionEnd?.();
  };

  const labels =
    mode === "hour"
      ? Array.from({ length: 12 }, (_, index) => {
          const value = index === 0 ? 12 : index;
          return { value, angle: value * 30 };
        })
      : Array.from({ length: 12 }, (_, index) => {
          const value = index * 5;
          return { value, angle: value * 6 };
        });

  const tip = polarToXY(handAngle(mode, hour12, minute), HAND_LENGTH[mode]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="mx-auto block w-full max-w-[280px] touch-none select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="presentation"
    >
      <circle cx={CX} cy={CY} r={NUMBER_RADIUS + 18} className="fill-slate-100/90" />
      <circle cx={CX} cy={CY} r={NUMBER_RADIUS + 8} className="fill-white shadow-inner" />

      {labels.map(({ value, angle }) => {
        const { x, y } = polarToXY(angle, NUMBER_RADIUS);
        const isSelected =
          mode === "hour"
            ? value === hour12
            : value === Math.round(minute / 5) * 5 % 60;

        return (
          <g key={`${mode}-${value}`}>
            {isSelected && (
              <circle
                cx={x}
                cy={y}
                r={mode === "hour" ? 18 : 16}
                className="fill-brand-600 transition-all duration-200 ease-out"
              />
            )}
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              className={clsx(
                "cursor-pointer text-[13px] font-medium transition-colors duration-150",
                isSelected ? "fill-white" : "fill-slate-600"
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (mode === "hour") onHourChange(value);
                else onMinuteChange(value);
                onInteractionEnd?.();
              }}
            >
              {mode === "hour" ? value : String(value).padStart(2, "0")}
            </text>
          </g>
        );
      })}

      <line
        x1={CX}
        y1={CY}
        x2={tip.x}
        y2={tip.y}
        className="stroke-brand-600 transition-all duration-200 ease-out"
        strokeWidth={mode === "hour" ? 3 : 2}
        strokeLinecap="round"
      />
      <circle cx={CX} cy={CY} r={6} className="fill-brand-600" />
      <circle
        cx={tip.x}
        cy={tip.y}
        r={mode === "hour" ? 8 : 6}
        className="fill-brand-600 transition-all duration-200 ease-out"
      />
    </svg>
  );
}
