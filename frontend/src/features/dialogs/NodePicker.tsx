"use client";

import { Select } from "@/components/ui/primitives";
import { NODE_TYPES } from "@/lib/meta";
import type { GraphNode, NodeType } from "@/lib/types";

const GROUP_ORDER: NodeType[] = ["TEAM", "POC", "VERSION", "RESEARCH", "EXPERIMENT", "FINDING", "PAPER", "DOCUMENTATION", "CODE", "DEMO"];

export function NodePicker({
  nodes,
  value,
  onChange,
  exclude = [],
  types,
  placeholder = "Select a node…",
}: {
  nodes: GraphNode[];
  value: string;
  onChange: (id: string) => void;
  exclude?: string[];
  types?: NodeType[];
  placeholder?: string;
}) {
  const groups = GROUP_ORDER.filter((t) => !types || types.includes(t))
    .map((t) => ({ t, items: nodes.filter((n) => n.type === t && !exclude.includes(n.id)).sort((a, b) => a.title.localeCompare(b.title)) }))
    .filter((g) => g.items.length);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {groups.map((g) => (
        <optgroup key={g.t} label={NODE_TYPES[g.t].plural}>
          {g.items.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
