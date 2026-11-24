"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { Minimize2 } from "lucide-react";
import { useEffect } from "react";
import { RingLegend } from "@/components/progress";
import { Button, ErrorState, Spinner } from "@/components/ui/primitives";
import { useGraph } from "@/lib/queries";
import { DetailsPanel } from "../panel/DetailsPanel";
import { GraphCanvas } from "./GraphCanvas";
import { GraphLegend } from "./GraphLegend";
import { GraphToolbar, ZoomControls } from "./GraphToolbar";
import { useGraphUI } from "./store";
import { TeamHud } from "./TeamHud";

export function GraphWorkspace() {
  const { data: graph, isLoading, error, refetch } = useGraph();
  const { presentation, setPresentation, closePanel, requestFit, panelOpen } = useGraphUI();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (presentation) {
        setPresentation(false);
        requestFit();
      } else if (panelOpen) closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presentation, panelOpen, setPresentation, closePanel, requestFit]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
        <Spinner /> Loading the R&D graph…
      </div>
    );
  }
  if (error || !graph) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="w-full max-w-md">
          <ErrorState error={error ?? new Error("No graph")} onRetry={() => refetch()} />
          <p className="mt-3 text-xs text-faint">
            Is the API running? <code className="text-muted">cd backend && uv run uvicorn app.main:app</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="relative h-full w-full overflow-hidden">
        <GraphCanvas graph={graph} />
        {!presentation && <GraphToolbar graph={graph} />}
        <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-end gap-2">
          <div className="pointer-events-auto">{!presentation && <ZoomControls />}</div>
          <div className="pointer-events-auto">{!presentation && <GraphLegend />}</div>
        </div>
        <div className={`pointer-events-auto absolute z-20 ${presentation ? "left-6 top-6" : "left-3 top-16"}`}>
          <TeamHud graph={graph} />
        </div>
        {presentation && (
          <>
            <div className="absolute right-6 top-6 z-20 flex items-center gap-3">
              <RingLegend className="rounded-lg border border-border bg-surface/90 px-3 py-2 backdrop-blur" />
              <Button variant="outline" className="bg-surface/90" onClick={() => { setPresentation(false); requestFit(); }}>
                <Minimize2 className="h-4 w-4" /> Exit presentation
              </Button>
            </div>
          </>
        )}
        <DetailsPanel />
      </div>
    </ReactFlowProvider>
  );
}
