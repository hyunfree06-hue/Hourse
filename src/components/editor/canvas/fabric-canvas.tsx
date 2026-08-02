"use client";

import { useEffect, useRef } from "react";
import {
  Canvas,
  Rect,
  Circle,
  Line,
  IText,
  FabricObject,
  ActiveSelection,
} from "fabric";
import { editorConfig } from "@/config/editor";
import {
  FABRIC_CUSTOM_KEYS,
  createObjectId,
  withCustomDefaults,
} from "@/lib/canvas/custom-properties";
import { useEditorStore, type EditorTool } from "@/stores/editor-store";
import { createHistoryController } from "@/lib/canvas/history";
import {
  applyAiRegionSize,
  finalizeAiRegionAfterDrag,
  getVisualSize,
  isAiRegionFabricObject,
  normalizeFabricObjectScale,
} from "@/lib/design-scene/region";
import {
  clampZoom,
  fitAllObjectsInView,
  fitArtboardInView,
  fitDesignFocusInView,
  fitGenerationInView,
  fitSelectionInView,
  getEditorFitPadding,
  getViewportTransform,
  panCanvasBy,
  resetViewport,
  revealObjectsInView,
  wheelPanDelta,
  zoomCanvasAtCenter,
  zoomCanvasToPoint,
} from "@/lib/canvas/viewport";
import {
  loadStoredViewport,
  saveStoredViewport,
} from "@/lib/canvas/viewport-storage";

FabricObject.customProperties = [...FABRIC_CUSTOM_KEYS];

type Props = {
  projectId: string;
  initialJson: unknown;
  width: number;
  height: number;
  backgroundColor: string;
  onCanvasReady?: (canvas: Canvas) => void;
};

export function FabricCanvas({
  projectId,
  initialJson,
  width,
  height,
  backgroundColor,
  onCanvasReady,
}: Props) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const historyRef = useRef(createHistoryController());
  const drawingRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    object: FabricObject | null;
  }>({ active: false, startX: 0, startY: 0, object: null });
  const spacePanRef = useRef(false);
  const panningRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const clipboardRef = useRef<FabricObject | null>(null);
  const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const artboardRef = useRef({
    width,
    height,
    backgroundColor,
  });

  const tool = useEditorStore((s) => s.tool);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setSelected = useEditorStore((s) => s.setSelected);
  const setAiRegion = useEditorStore((s) => s.setAiRegion);
  const setAiPanelOpen = useEditorStore((s) => s.setAiPanelOpen);
  const setTool = useEditorStore((s) => s.setTool);
  const setBackgroundColor = useEditorStore((s) => s.setBackgroundColor);
  const toolRef = useRef<EditorTool>(tool);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    artboardRef.current = { width, height, backgroundColor };
  }, [width, height, backgroundColor]);

  useEffect(() => {
    if (!canvasElRef.current || !containerRef.current || canvasRef.current) return;
    let disposed = false;

    const container = containerRef.current;
    const viewW = Math.max(1, container.clientWidth || width);
    const viewH = Math.max(1, container.clientHeight || height);

    const canvas = new Canvas(canvasElRef.current, {
      width: viewW,
      height: viewH,
      backgroundColor: editorConfig.workspaceBackground,
      preserveObjectStacking: true,
      selection: true,
      stopContextMenu: true,
      fireRightClick: true,
      fireMiddleClick: true,
    });
    canvasRef.current = canvas;
    historyRef.current.attach(canvas);

    const syncZoom = () => {
      setZoom(clampZoom(canvas.getZoom()));
    };

    const persistViewport = () => {
      if (viewportSaveTimerRef.current) {
        clearTimeout(viewportSaveTimerRef.current);
      }
      viewportSaveTimerRef.current = setTimeout(() => {
        saveStoredViewport(projectId, {
          zoom: clampZoom(canvas.getZoom()),
          viewportTransform: getViewportTransform(canvas),
        });
      }, 200);
    };

    const applyZoomAndPersist = (zoom: number) => {
      setZoom(zoom);
      persistViewport();
      return zoom;
    };

    const fitPad = () =>
      getEditorFitPadding({
        aiPanelOpen: useEditorStore.getState().aiPanelOpen,
      });

    const endPanGesture = () => {
      const wasPanning = panningRef.current;
      panningRef.current = false;
      canvas.selection = toolRef.current === "select" && !spacePanRef.current;
      canvas.skipTargetFind =
        spacePanRef.current ||
        (toolRef.current !== "select" && toolRef.current !== "hand");
      canvas.setCursor(
        spacePanRef.current || toolRef.current === "hand"
          ? "grab"
          : toolRef.current === "select"
            ? "default"
            : "crosshair",
      );
      if (wasPanning) persistViewport();
    };

    const clearSpacePan = () => {
      spacePanRef.current = false;
      endPanGesture();
    };

    const ensureArtboard = () => {
      const existing = canvas.getObjects().find((obj) => {
        const role = (obj as FabricObject & { objectRole?: string }).objectRole;
        return role === "artboard";
      }) as Rect | undefined;

      const board =
        existing ??
        new Rect(
          withCustomDefaults({
            left: 0,
            top: 0,
            width: artboardRef.current.width,
            height: artboardRef.current.height,
            fill: artboardRef.current.backgroundColor,
            stroke: "rgba(17,17,19,0.10)",
            strokeWidth: 1,
            selectable: false,
            evented: false,
            hoverCursor: "default",
            objectRole: "artboard",
            name: "Artboard",
            excludeFromExport: true,
            isTemporary: true,
          }),
        );

      board.set({
        left: 0,
        top: 0,
        scaleX: 1,
        scaleY: 1,
        width: artboardRef.current.width,
        height: artboardRef.current.height,
        fill: artboardRef.current.backgroundColor,
        stroke: "rgba(17,17,19,0.10)",
        strokeWidth: 1,
        selectable: false,
        evented: false,
        objectRole: "artboard",
        name: "Artboard",
        excludeFromExport: true,
        isTemporary: true,
      });
      board.setCoords();

      if (!existing) {
        canvas.add(board);
      }
      canvas.sendObjectToBack(board);
    };

    const resizeToContainer = () => {
      if (!containerRef.current) return;
      const nextW = Math.max(1, containerRef.current.clientWidth);
      const nextH = Math.max(1, containerRef.current.clientHeight);
      if (nextW === canvas.getWidth() && nextH === canvas.getHeight()) return;
      canvas.setDimensions({ width: nextW, height: nextH });
      canvas.requestRenderAll();
      syncZoom();
    };

    const syncSelection = () => {
      const active = canvas.getActiveObject();
      if (!active) {
        setSelected(null);
        return;
      }
      const anyObj = active as FabricObject & {
        objectId?: string;
        objectRole?: string;
        rx?: number;
        fontSize?: number;
        fontWeight?: string | number;
        textAlign?: string;
        text?: string;
        fontFamily?: string;
        lineHeight?: number;
        charSpacing?: number;
        strokeLineCap?: string;
        strokeLineJoin?: string;
      };
      const visual = getVisualSize(active);
      setSelected({
        objectId: anyObj.objectId,
        type: active.type,
        objectRole: anyObj.objectRole,
        left: active.left,
        top: active.top,
        width: visual.width,
        height: visual.height,
        angle: active.angle,
        fill: typeof active.fill === "string" ? active.fill : undefined,
        stroke: typeof active.stroke === "string" ? active.stroke : undefined,
        strokeWidth: active.strokeWidth,
        opacity: active.opacity,
        rx: anyObj.rx,
        fontSize: anyObj.fontSize,
        fontWeight: anyObj.fontWeight,
        textAlign: anyObj.textAlign,
        text: anyObj.text,
        fontFamily: anyObj.fontFamily,
        lineHeight: anyObj.lineHeight,
        charSpacing: anyObj.charSpacing,
        strokeLineCap: anyObj.strokeLineCap,
        strokeLineJoin: anyObj.strokeLineJoin,
      });

      if (isAiRegionFabricObject(active)) {
        setAiRegion({
          left: active.left ?? 0,
          top: active.top ?? 0,
          width: visual.width,
          height: visual.height,
        });
        setAiPanelOpen(true);
      }
    };

    const onScaling = (opt: { target?: FabricObject }) => {
      const target = opt.target;
      if (!target || !isAiRegionFabricObject(target)) return;
      const visual = getVisualSize(target);
      setAiRegion({
        left: target.left ?? 0,
        top: target.top ?? 0,
        width: visual.width,
        height: visual.height,
      });
      const current = useEditorStore.getState().selected;
      if (current) {
        setSelected({
          ...current,
          left: target.left,
          top: target.top,
          width: visual.width,
          height: visual.height,
        });
      }
    };

    const onModified = (opt?: { target?: FabricObject }) => {
      const target = opt?.target ?? canvas.getActiveObject() ?? undefined;
      if (target && isAiRegionFabricObject(target)) {
        normalizeFabricObjectScale(target);
        const visual = getVisualSize(target);
        setAiRegion({
          left: target.left ?? 0,
          top: target.top ?? 0,
          width: visual.width,
          height: visual.height,
        });
      }
      historyRef.current.save();
      syncSelection();
      window.dispatchEvent(new CustomEvent("hourse:dirty"));
    };

    canvas.on("selection:created", syncSelection);
    canvas.on("selection:updated", syncSelection);
    canvas.on("selection:cleared", () => setSelected(null));
    canvas.on("object:modified", onModified);
    canvas.on("object:scaling", onScaling);
    canvas.on("object:added", () => {
      window.dispatchEvent(new CustomEvent("hourse:dirty"));
    });
    canvas.on("object:removed", (opt: { target?: FabricObject }) => {
      const target = opt?.target as { objectId?: string } | undefined;
      if (target?.objectId) {
        void import("@/lib/canvas/object-url-registry").then((m) =>
          m.revokeObjectUrlForObject(target.objectId),
        );
      }
      window.dispatchEvent(new CustomEvent("hourse:dirty"));
    });

    const getPointer = (e: MouseEvent | TouchEvent | { clientX?: number; clientY?: number }) => {
      // fabric v7 scene point
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return canvas.getScenePoint(e as any);
    };

    const onMouseDown = (opt: { e: Event; target?: FabricObject | null }) => {
      const currentTool = toolRef.current;
      const e = opt.e as MouseEvent;
      const isMiddle = e.button === 1;
      if (isMiddle || spacePanRef.current || currentTool === "hand") {
        panningRef.current = true;
        canvas.selection = false;
        canvas.skipTargetFind = true;
        canvas.setCursor("grabbing");
        lastPosRef.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
      }

      if (
        currentTool === "select" ||
        currentTool === "image" ||
        opt.target
      ) {
        return;
      }

      const pointer = getPointer(opt.e as MouseEvent);
      drawingRef.current = {
        active: true,
        startX: pointer.x,
        startY: pointer.y,
        object: null,
      };

      if (currentTool === "rect" || currentTool === "frame") {
        const rect = new Rect(
          withCustomDefaults({
            left: pointer.x,
            top: pointer.y,
            width: 1,
            height: 1,
            fill: currentTool === "frame" ? "transparent" : "#c7d2fe",
            stroke: currentTool === "frame" ? "#a3a3a3" : "#4338ca",
            strokeWidth: currentTool === "frame" ? 1 : 0,
            objectRole: "design",
            name: currentTool === "frame" ? "Frame" : "Rectangle",
          }),
        );
        canvas.add(rect);
        drawingRef.current.object = rect;
      } else if (currentTool === "ellipse") {
        const circle = new Circle(
          withCustomDefaults({
            left: pointer.x,
            top: pointer.y,
            radius: 1,
            fill: "#ddd6fe",
            stroke: "#6d28d9",
            strokeWidth: 0,
            objectRole: "design",
            name: "Ellipse",
          }),
        );
        canvas.add(circle);
        drawingRef.current.object = circle;
      } else if (currentTool === "line") {
        const line = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
          ...withCustomDefaults({
            stroke: "#171717",
            strokeWidth: 2,
            objectRole: "design",
            name: "Line",
          }),
        });
        canvas.add(line);
        drawingRef.current.object = line;
      } else if (currentTool === "text") {
        const text = new IText("Text", {
          ...withCustomDefaults({
            left: pointer.x,
            top: pointer.y,
            fill: "#171717",
            fontSize: 28,
            fontFamily: "Inter, sans-serif",
            objectRole: "design",
            name: "Text",
          }),
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        drawingRef.current.active = false;
        historyRef.current.save();
        setTool("select");
        window.dispatchEvent(new CustomEvent("hourse:dirty"));
      } else if (currentTool === "ai-region") {
        // Placeholder — finalized on mouseup to 320×240 (click) or drag size.
        const region = new Rect(
          withCustomDefaults({
            left: pointer.x,
            top: pointer.y,
            width: 1,
            height: 1,
            scaleX: 1,
            scaleY: 1,
            fill: "rgba(99,102,241,0.08)",
            stroke: "#6366f1",
            strokeDashArray: [6, 4],
            strokeWidth: 1.5,
            objectRole: "ai-region",
            name: "AI region",
            excludeFromExport: true,
            isTemporary: true,
          }),
        );
        canvas.add(region);
        drawingRef.current.object = region;
      }
    };

    const onMouseMove = (opt: { e: Event }) => {
      if (panningRef.current) {
        const e = opt.e as MouseEvent;
        const dx = e.clientX - lastPosRef.current.x;
        const dy = e.clientY - lastPosRef.current.y;
        panCanvasBy(canvas, dx, dy);
        lastPosRef.current = { x: e.clientX, y: e.clientY };
        // Viewport-only — never mark project dirty.
        return;
      }

      const draw = drawingRef.current;
      if (!draw.active || !draw.object) return;
      const pointer = getPointer(opt.e as MouseEvent);
      const w = Math.abs(pointer.x - draw.startX);
      const h = Math.abs(pointer.y - draw.startY);
      const left = Math.min(pointer.x, draw.startX);
      const top = Math.min(pointer.y, draw.startY);

      if (draw.object instanceof Line) {
        draw.object.set({ x2: pointer.x, y2: pointer.y });
      } else if (draw.object instanceof Circle) {
        const r = Math.max(w, h) / 2;
        draw.object.set({ left, top, radius: Math.max(1, r) });
      } else if (isAiRegionFabricObject(draw.object)) {
        // Live drag preview — may be temporarily below minimum until mouseup.
        applyAiRegionSize(draw.object, {
          left,
          top,
          width: Math.max(1, w),
          height: Math.max(1, h),
        });
        setAiRegion({ left, top, width: Math.max(1, w), height: Math.max(1, h) });
      } else {
        draw.object.set({
          left,
          top,
          width: Math.max(1, w),
          height: Math.max(1, h),
          scaleX: 1,
          scaleY: 1,
        });
      }
      canvas.requestRenderAll();
    };

    const onMouseUp = (opt?: { e?: Event }) => {
      if (panningRef.current) {
        endPanGesture();
        return;
      }
      const draw = drawingRef.current;
      if (draw.active && draw.object) {
        if (isAiRegionFabricObject(draw.object)) {
          const pointer = opt?.e
            ? getPointer(opt.e as MouseEvent)
            : { x: draw.startX, y: draw.startY };
          const finalized = finalizeAiRegionAfterDrag({
            startX: draw.startX,
            startY: draw.startY,
            endX: pointer.x,
            endY: pointer.y,
            canvasWidth: artboardRef.current.width,
            canvasHeight: artboardRef.current.height,
          });
          applyAiRegionSize(draw.object, finalized);
          setAiRegion(finalized);
          setAiPanelOpen(true);
          canvas.setActiveObject(draw.object);
          setTool("select");
          syncSelection();
        }
        historyRef.current.save();
        window.dispatchEvent(new CustomEvent("hourse:dirty"));
      }
      drawingRef.current = {
        active: false,
        startX: 0,
        startY: 0,
        object: null,
      };
    };

    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);

    const onWheel = (opt: { e: Event }) => {
      const e = opt.e as WheelEvent;
      e.preventDefault();
      e.stopPropagation();

      if (e.ctrlKey || e.metaKey) {
        const factor = Math.pow(
          0.999,
          Math.max(-160, Math.min(160, e.deltaY)),
        );
        const next = clampZoom(canvas.getZoom() * factor);
        zoomCanvasToPoint(
          canvas,
          { x: e.offsetX, y: e.offsetY },
          next,
        );
        syncZoom();
        persistViewport();
        return;
      }

      const { dx, dy } = wheelPanDelta(e);
      panCanvasBy(canvas, dx, dy);
      persistViewport();
    };
    canvas.on("mouse:wheel", onWheel);

    const onDomMiddleDown = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
      }
    };
    canvas.getElement().addEventListener("mousedown", onDomMiddleDown);
    canvas.getElement().addEventListener("auxclick", onDomMiddleDown);

    const load = async () => {
      try {
        if (initialJson) {
          await canvas.loadFromJSON(initialJson);
          // Drop any persisted artboard overlays — we recreate a live one.
          for (const obj of [...canvas.getObjects()]) {
            const role = (obj as FabricObject & { objectRole?: string })
              .objectRole;
            const name = (obj as FabricObject & { name?: string }).name;
            if (role === "artboard" || name === "Artboard") {
              canvas.remove(obj);
            }
          }
          const { rehydrateAssetImages } = await import(
            "@/lib/canvas/load-fabric-image"
          );
          await rehydrateAssetImages(canvas);
          const { migrateClippedGeneratedImages } = await import(
            "@/lib/canvas/place-generated-image"
          );
          await migrateClippedGeneratedImages(
            canvas as unknown as {
              getObjects: () => unknown[];
              add: (...o: unknown[]) => unknown;
              remove: (...o: unknown[]) => unknown;
              requestRenderAll: () => void;
            },
          );
        }
        canvas.backgroundColor = editorConfig.workspaceBackground;
        ensureArtboard();
        resizeToContainer();
        const stored = loadStoredViewport(projectId);
        if (stored) {
          canvas.setViewportTransform(stored.viewportTransform);
          setZoom(clampZoom(stored.zoom));
        } else {
          const z = fitArtboardInView(canvas, artboardRef.current, fitPad());
          setZoom(z);
        }
        canvas.requestRenderAll();
        historyRef.current.reset(JSON.stringify(canvas.toJSON()));
        onCanvasReady?.(canvas);
      } catch (error) {
        console.error("canvas load failed", error);
        window.dispatchEvent(
          new CustomEvent("hourse:load-error", {
            detail: "Failed to load canvas.",
          }),
        );
      }
    };
    void load();

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const meta = e.metaKey || e.ctrlKey;
      if (e.code === "Space") {
        if (!spacePanRef.current) {
          spacePanRef.current = true;
          canvas.selection = false;
          canvas.skipTargetFind = true;
          canvas.setCursor(panningRef.current ? "grabbing" : "grab");
        }
        e.preventDefault();
      }
      if (e.key === "Escape") {
        setTool("select");
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const active = canvas.getActiveObjects().filter((obj) => {
          const role = (obj as FabricObject & { objectRole?: string })
            .objectRole;
          return role !== "artboard";
        });
        active.forEach((obj) => canvas.remove(obj));
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        historyRef.current.save();
        window.dispatchEvent(new CustomEvent("hourse:dirty"));
      }
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        void historyRef.current.undo();
      }
      if (meta && e.key.toLowerCase() === "z" && e.shiftKey) {
        e.preventDefault();
        void historyRef.current.redo();
      }
      if (meta && e.key.toLowerCase() === "c") {
        const active = canvas.getActiveObject();
        if (active) {
          const role = (active as FabricObject & { objectRole?: string })
            .objectRole;
          if (role === "artboard") return;
          void active.clone().then((cloned) => {
            clipboardRef.current = cloned;
          });
        }
      }
      if (meta && e.key.toLowerCase() === "v") {
        if (!clipboardRef.current) return;
        void clipboardRef.current.clone().then((cloned) => {
          cloned.set({
            left: (cloned.left ?? 0) + 20,
            top: (cloned.top ?? 0) + 20,
            objectId: createObjectId(),
          });
          if (cloned instanceof ActiveSelection) {
            cloned.canvas = canvas;
            cloned.forEachObject((obj) => canvas.add(obj));
            cloned.setCoords();
          } else {
            canvas.add(cloned);
          }
          canvas.setActiveObject(cloned);
          canvas.requestRenderAll();
          historyRef.current.save();
          window.dispatchEvent(new CustomEvent("hourse:dirty"));
        });
      }
      if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        const active = canvas.getActiveObject();
        if (!active) return;
        const role = (active as FabricObject & { objectRole?: string })
          .objectRole;
        if (role === "artboard") return;
        void active.clone().then((cloned) => {
          cloned.set({
            left: (cloned.left ?? 0) + 20,
            top: (cloned.top ?? 0) + 20,
            objectId: createObjectId(),
          });
          canvas.add(cloned);
          canvas.setActiveObject(cloned);
          canvas.requestRenderAll();
          historyRef.current.save();
          window.dispatchEvent(new CustomEvent("hourse:dirty"));
        });
      }
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("hourse:force-save"));
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        applyZoomAndPersist(
          zoomCanvasAtCenter(
            canvas,
            canvas.getZoom() + editorConfig.zoomStep,
          ),
        );
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        applyZoomAndPersist(
          zoomCanvasAtCenter(
            canvas,
            canvas.getZoom() - editorConfig.zoomStep,
          ),
        );
      }
      if (e.key === "0" && !meta) {
        e.preventDefault();
        applyZoomAndPersist(zoomCanvasAtCenter(canvas, 1));
      }
      if (e.key === "1" && !meta) {
        e.preventDefault();
        applyZoomAndPersist(fitAllObjectsInView(canvas, fitPad()));
      }
      if (e.key === "2" && !meta) {
        e.preventDefault();
        applyZoomAndPersist(fitSelectionInView(canvas, fitPad()));
      }
      if ((e.key === "f" || e.key === "F") && !meta) {
        e.preventDefault();
        applyZoomAndPersist(fitDesignFocusInView(canvas, fitPad()));
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        clearSpacePan();
      }
    };

    const onWindowBlur = () => {
      clearSpacePan();
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        clearSpacePan();
      }
    };

    const onWindowPointerUp = () => {
      if (panningRef.current) {
        endPanGesture();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("mouseup", onWindowPointerUp);

    const resizeObserver = new ResizeObserver(() => {
      resizeToContainer();
    });
    resizeObserver.observe(container);

    const hourseApi = {
      canvas,
      history: historyRef.current,
      projectId,
      artboard: artboardRef.current,
      getArtboard: () => ({ ...artboardRef.current }),
      syncZoom,
      fitAll: () =>
        applyZoomAndPersist(fitAllObjectsInView(canvas, fitPad())),
      fitSelection: () =>
        applyZoomAndPersist(fitSelectionInView(canvas, fitPad())),
      fitDesign: () =>
        applyZoomAndPersist(fitDesignFocusInView(canvas, fitPad())),
      fitArtboard: () =>
        applyZoomAndPersist(
          fitArtboardInView(canvas, artboardRef.current, fitPad()),
        ),
      resetViewport: () => applyZoomAndPersist(resetViewport(canvas)),
      zoomTo: (next: number, point?: { x: number; y: number }) => {
        const zoom = point
          ? zoomCanvasToPoint(canvas, point, next)
          : zoomCanvasAtCenter(canvas, next);
        return applyZoomAndPersist(zoom);
      },
      revealObjects: (objects: FabricObject[]) =>
        applyZoomAndPersist(revealObjectsInView(canvas, objects, fitPad())),
      fitGeneration: (generationId: string) =>
        applyZoomAndPersist(
          fitGenerationInView(canvas, generationId, fitPad()),
        ),
    };
    (window as unknown as { __hourse?: typeof hourseApi }).__hourse = hourseApi;

    return () => {
      disposed = true;
      if (viewportSaveTimerRef.current) {
        clearTimeout(viewportSaveTimerRef.current);
      }
      clearSpacePan();
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("mouseup", onWindowPointerUp);
      canvas.getElement().removeEventListener("mousedown", onDomMiddleDown);
      canvas.getElement().removeEventListener("auxclick", onDomMiddleDown);
      canvas.off("selection:created", syncSelection);
      canvas.off("selection:updated", syncSelection);
      canvas.off("object:modified", onModified);
      canvas.off("object:scaling", onScaling);
      canvas.off("mouse:down", onMouseDown);
      canvas.off("mouse:move", onMouseMove);
      canvas.off("mouse:up", onMouseUp);
      canvas.off("mouse:wheel", onWheel);
      void import("@/lib/canvas/object-url-registry").then((m) =>
        m.revokeAllObjectUrls(),
      );
      canvas.dispose();
      canvasRef.current = null;
      delete (window as unknown as { __hourse?: unknown }).__hourse;
      void disposed;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.isDrawingMode = false;
    canvas.selection = tool === "select";
    canvas.defaultCursor =
      tool === "hand" ? "grab" : tool === "select" ? "default" : "crosshair";
    canvas.skipTargetFind = tool !== "select" && tool !== "hand";
  }, [tool]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.backgroundColor = editorConfig.workspaceBackground;
    artboardRef.current.backgroundColor = backgroundColor;
    const board = canvas.getObjects().find((obj) => {
      const role = (obj as FabricObject & { objectRole?: string }).objectRole;
      return role === "artboard";
    });
    if (board) {
      board.set({ fill: backgroundColor });
      board.setCoords();
    }
    setBackgroundColor(backgroundColor);
    canvas.requestRenderAll();
  }, [backgroundColor, setBackgroundColor]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[#E8E8EC]"
      style={{ touchAction: "none" }}
    >
      <canvas ref={canvasElRef} className="block h-full w-full" />
    </div>
  );
}

export async function addImageToCanvas(
  canvas: Canvas,
  url: string,
  options?: { left?: number; top?: number; assetId?: string },
) {
  const { loadFabricImageForAsset } = await import(
    "@/lib/canvas/load-fabric-image"
  );
  const loaded = options?.assetId
    ? await loadFabricImageForAsset({
        assetId: options.assetId,
        preferSameOrigin: true,
        signedUrl: url.startsWith("http") ? url : null,
      })
    : await loadFabricImageForAsset({
        signedUrl: url,
        preferSameOrigin: false,
      });
  const img = loaded.image;
  img.set(
    withCustomDefaults({
      objectId: loaded.objectId,
      left: options?.left ?? 100,
      top: options?.top ?? 100,
      originX: "left",
      originY: "top",
      objectRole: "design",
      assetId: options?.assetId,
      name: "Image",
    }),
  );
  canvas.add(img);
  canvas.setActiveObject(img);
  canvas.requestRenderAll();
  // Do not revoke object URL here — registry keeps it until remove/dispose.
  window.dispatchEvent(new CustomEvent("hourse:dirty"));
}
