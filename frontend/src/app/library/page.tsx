"use client";

import { ExternalLink, FileDown, Network, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Button, cn, Empty, ErrorState, Input, Spinner } from "@/components/ui/primitives";
import { NodeFormDialog } from "@/features/dialogs/NodeFormDialog";
import { useOpenInGraph } from "@/features/graph/useOpenInGraph";
import { NODE_TYPES, RESOURCE_KINDS, timeAgo } from "@/lib/meta";
import { useLibrary } from "@/lib/queries";
import type { KnowledgeItem, NodeType } from "@/lib/types";

const TABS: { label: string; types: NodeType[] | null }[] = [
  { label: "All", types: null },
  { label: "Papers", types: ["PAPER"] },
  { label: "Documents", types: ["DOCUMENTATION"] },
  { label: "Research", types: ["RESEARCH"] },
  { label: "Findings", types: ["FINDING"] },
  { label: "Repositories", types: ["CODE"] },
  { label: "Demos", types: ["DEMO"] },
];

const INITIATIVE_TYPES = new Set(["POC", "VERSION"]);

export default function LibraryPage() {
  const { data, isLoading, error, refetch } = useLibrary();
  const openInGraph = useOpenInGraph();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState(0);
  const [tag, setTag] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const tags = useMemo(() => {
    const c = new Map<string, number>();
    for (const i of data ?? []) for (const t of i.node.tags) c.set(t, (c.get(t) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16);
  }, [data]);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const types = TABS[tab].types;
    return (data ?? []).filter(
      (i) =>
        (!types || types.includes(i.node.type)) &&
        (!tag || i.node.tags.includes(tag)) &&
        (!s || i.node.title.toLowerCase().includes(s) || i.node.description.toLowerCase().includes(s) || i.node.tags.some((t) => t.includes(s))),
    );
  }, [data, q, tab, tag]);

  return (
    <PageBody>
      <PageHeader
        title="Research Library"
        description="One canonical record per paper, document, repository or finding, linked to every initiative and version that uses it."
        actions={<Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Register resource</Button>}
      />
      <div className="px-8 py-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input className="pl-9" placeholder="Search the library…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
            {TABS.map((t, i) => (
              <button key={t.label} onClick={() => setTab(i)} className={cn("rounded-lg px-2.5 py-1 text-xs font-medium transition-colors", tab === i ? "bg-surface-3 text-text" : "text-muted hover:text-text")}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {tags.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-1.5">
            {tags.map(([t, n]) => (
              <button key={t} onClick={() => setTag(tag === t ? null : t)} className={cn("rounded-md border px-2 py-0.5 text-[11px] transition-colors", tag === t ? "border-accent/50 bg-accent/10 text-[#c3cbff]" : "border-border text-muted hover:text-text")}>
                #{t} <span className="text-faint">{n}</span>
              </button>
            ))}
          </div>
        )}
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : items.length === 0 ? (
          <Empty title="Nothing here yet">Register a paper, document or repository by URL or upload.</Empty>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
            {items.map((i) => <LibraryCard key={i.node.id} item={i} onOpen={openInGraph} />)}
          </div>
        )}
      </div>
      <NodeFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        mode="create"
        defaultType="PAPER"
        allowedTypes={["PAPER", "DOCUMENTATION", "CODE", "DEMO", "RESEARCH", "FINDING"]}
      />
    </PageBody>
  );
}

function LibraryCard({ item, onOpen }: { item: KnowledgeItem; onOpen: (id: string) => void }) {
  const n = item.node;
  const t = NODE_TYPES[n.type];
  const Icon = t.icon;
  const linked = item.related.filter((r) => INITIATIVE_TYPES.has(r.type));
  const kind = RESOURCE_KINDS.find((k) => k.value === n.resource?.resource_type)?.label;
  return (
    <div className="group flex flex-col rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${t.hue} 12%, transparent)`, color: t.hue }}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] uppercase tracking-wider text-faint">{kind ?? t.label}</div>
          <div className="font-medium leading-5 text-text">{n.title}</div>
        </div>
      </div>
      <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted">{n.description}</p>
      {linked.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {linked.map((r) => (
            <button key={r.id + r.relationship} onClick={() => onOpen(r.id)} className="rounded-md border border-border bg-bg-elev px-1.5 py-0.5 text-[10.5px] text-muted hover:text-text">
              {r.title}
            </button>
          ))}
        </div>
      )}
      <div className="mt-auto flex items-center gap-2 pt-3 text-[11px] text-faint">
        <span>{n.owner}</span>
        <span>·</span>
        <span>{timeAgo(n.updated_at)}</span>
        <div className="ml-auto flex items-center gap-1">
          {n.resource?.uri && (
            <a href={n.resource.uri} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" title={n.resource.uri}>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {n.resource?.file_reference && (
            <a href={`/api/files/${n.resource.file_reference}`} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" title="Download attachment">
              <FileDown className="h-3.5 w-3.5" />
            </a>
          )}
          <button onClick={() => onOpen(n.id)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" title="Show in graph">
            <Network className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
