import { useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { GuidedDimensionMark, GuidedRectangle } from "@/state/capture.store";

export type GuidedTool = "width" | "height" | "rectangle";

type GuidedAnnotationCanvasProps = {
  imageUrl: string | null;
  tool: GuidedTool;
  dimensions: GuidedDimensionMark[];
  rectangles: GuidedRectangle[];
  onDimensionsChange: (next: GuidedDimensionMark[]) => void;
  onRectanglesChange: (next: GuidedRectangle[]) => void;
};

type NormalizedPoint = { x: number; y: number };

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizePoint(event: PointerEvent<HTMLElement>, element: HTMLElement): NormalizedPoint {
  const rect = element.getBoundingClientRect();
  const x = clamp01((event.clientX - rect.left) / Math.max(1, rect.width));
  const y = clamp01((event.clientY - rect.top) / Math.max(1, rect.height));
  return { x, y };
}

function dimensionColor(axis: "width" | "height") {
  return axis === "width" ? "#A1866F" : "#D2B89E";
}

export function GuidedAnnotationCanvas({
  imageUrl,
  tool,
  dimensions,
  rectangles,
  onDimensionsChange,
  onRectanglesChange,
}: GuidedAnnotationCanvasProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [pendingPoint, setPendingPoint] = useState<NormalizedPoint | null>(null);
  const [dragStart, setDragStart] = useState<NormalizedPoint | null>(null);
  const [draftRectangle, setDraftRectangle] = useState<GuidedRectangle | null>(null);

  const viewDimensions = useMemo(
    () =>
      dimensions.map((mark) => ({
        ...mark,
        color: dimensionColor(mark.axis),
      })),
    [dimensions]
  );

  const viewRectangles = useMemo(() => {
    const current = draftRectangle ? [...rectangles, draftRectangle] : rectangles;
    return current.map((item, index) => ({ ...item, label: item.label || `Part ${index + 1}` }));
  }, [draftRectangle, rectangles]);

  const updateDimension = (axis: "width" | "height", start: NormalizedPoint, end: NormalizedPoint) => {
    const filtered = dimensions.filter((item) => item.axis !== axis);
    onDimensionsChange([...filtered, { axis, start, end }]);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!imageUrl || !surfaceRef.current) return;

    const nextPoint = normalizePoint(event, surfaceRef.current);
    if (tool === "rectangle") {
      setDragStart(nextPoint);
      setDraftRectangle({
        id: "draft",
        x: nextPoint.x,
        y: nextPoint.y,
        width: 0,
        height: 0,
        label: "",
      });
      return;
    }

    if (!pendingPoint) {
      setPendingPoint(nextPoint);
      return;
    }

    updateDimension(tool, pendingPoint, nextPoint);
    setPendingPoint(null);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!imageUrl || tool !== "rectangle" || !surfaceRef.current || !dragStart) return;
    const point = normalizePoint(event, surfaceRef.current);
    const x = Math.min(dragStart.x, point.x);
    const y = Math.min(dragStart.y, point.y);
    const width = Math.abs(point.x - dragStart.x);
    const height = Math.abs(point.y - dragStart.y);
    setDraftRectangle({
      id: "draft",
      x,
      y,
      width,
      height,
      label: "",
    });
  };

  const onPointerUp = () => {
    if (!imageUrl || tool !== "rectangle" || !draftRectangle) return;
    if (draftRectangle.width < 0.015 || draftRectangle.height < 0.015) {
      setDraftRectangle(null);
      setDragStart(null);
      return;
    }

    const nextId = `rect_${Date.now()}_${rectangles.length + 1}`;
    const next = [
      ...rectangles,
      {
        ...draftRectangle,
        id: nextId,
        label: `Part ${rectangles.length + 1}`,
      },
    ];
    onRectanglesChange(next);
    setDraftRectangle(null);
    setDragStart(null);
  };

  return (
    <div
      ref={surfaceRef}
      className={`guidedCanvas ${imageUrl ? "" : "is-empty"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {imageUrl ? <img src={imageUrl} alt="Guided annotation source" /> : <span>Select an image slot to annotate.</span>}
      {imageUrl ? (
        <svg className="guidedOverlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {viewDimensions.map((mark) => (
            <g key={mark.axis}>
              <line
                x1={mark.start.x * 100}
                y1={mark.start.y * 100}
                x2={mark.end.x * 100}
                y2={mark.end.y * 100}
                stroke={mark.color}
                strokeWidth="0.7"
              />
              <circle cx={mark.start.x * 100} cy={mark.start.y * 100} r="0.9" fill={mark.color} />
              <circle cx={mark.end.x * 100} cy={mark.end.y * 100} r="0.9" fill={mark.color} />
            </g>
          ))}

          {viewRectangles.map((rectangle) => (
            <g key={rectangle.id}>
              <rect
                x={rectangle.x * 100}
                y={rectangle.y * 100}
                width={rectangle.width * 100}
                height={rectangle.height * 100}
                fill="rgba(161, 134, 111, 0.15)"
                stroke="rgba(161, 134, 111, 0.85)"
                strokeWidth="0.7"
              />
              {rectangle.label ? (
                <text x={rectangle.x * 100 + 1.2} y={rectangle.y * 100 + 2.5} fill="#EFEAE3" fontSize="2.3">
                  {rectangle.label}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      ) : null}
    </div>
  );
}
