"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useGraph } from "@/lib/queries";
import { indexGraph, pathToRoot } from "./model";
import { useGraphUI } from "./store";

/** Reveal a node in the graph (expanding its ancestors), select it and open its details. */
export function useOpenInGraph() {
  const router = useRouter();
  const { data: graph } = useGraph();
  return useCallback(
    (id: string) => {
      const ui = useGraphUI.getState();
      if (graph) ui.expand(pathToRoot(id, graph.root_id, indexGraph(graph)));
      ui.select(id, true);
      ui.setFocus(id);
      router.push("/");
    },
    [graph, router],
  );
}
