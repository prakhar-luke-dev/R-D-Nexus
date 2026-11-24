"use client";

import { useState, useSyncExternalStore } from "react";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Button, Card, Field, Input, SectionTitle } from "@/components/ui/primitives";
import { getActor, setActor } from "@/lib/api";
import { STATES } from "@/lib/meta";
import { toast } from "@/lib/toast";

const CODE = [
  ["Environment and setup", 10],
  ["Core implementation", 35],
  ["Integration", 20],
  ["Error handling and testing", 20],
  ["Reproducible runnable demo", 15],
] as const;
const VALIDATION = [
  ["Problem statement and hypothesis", 10],
  ["Research and feasibility analysis", 15],
  ["Experiment design and execution", 25],
  ["Benchmarking and evaluation", 25],
  ["Demonstration and findings", 15],
  ["Technical conclusion", 10],
] as const;

export default function SettingsPage() {
  // localStorage is only readable on the client; the server snapshot is the default actor.
  const stored = useSyncExternalStore(
    () => () => undefined,
    getActor,
    () => "demo-user",
  );
  const [draft, setName] = useState<string | null>(null);
  const name = draft ?? stored;

  return (
    <PageBody>
      <PageHeader title="Settings" description="Workspace preferences and the progress model used by the backend." />
      <div className="grid max-w-5xl gap-5 px-8 py-5 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>Your name</SectionTitle>
          <p className="mb-3 text-xs text-muted">
            Authentication isn’t enabled yet. This name is sent with every change and recorded in the activity log.
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field label="Display name">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
            <Button
              variant="primary"
              disabled={!name.trim()}
              onClick={() => {
                setActor(name.trim());
                toast.success("Saved. New changes will be attributed to " + name.trim());
              }}
            >
              Save
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>Progress model</SectionTitle>
          <ul className="space-y-1.5 text-xs text-muted">
            <li><span className="text-text">Overall</span> = 50% code + 50% validation (backend setting).</li>
            <li><span className="text-text">Category</span> = Σ(weight × score) ÷ Σ(applicable weights). N/A deliverables are excluded and the rest are re-normalized.</li>
            <li><span className="text-text">Team</span> = importance-weighted average of each active initiative’s <em>active</em> version, per category.</li>
            <li><span className="text-text">Blocked</span> is a status. It never lowers the score.</li>
            <li><span className="text-text">Verified</span> requires evidence or an explicit, logged exception.</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {STATES.map((s) => (
              <span key={s.value} className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted">
                {s.label} <span className="tabular-nums text-text">{s.score}</span>
              </span>
            ))}
          </div>
        </Card>

        {[{ title: "Default code deliverables", rows: CODE, color: "var(--code)" }, { title: "Default validation deliverables", rows: VALIDATION, color: "var(--validation)" }].map((t) => (
          <Card key={t.title} className="p-5">
            <SectionTitle>{t.title}</SectionTitle>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {t.rows.map(([label, w]) => (
                  <tr key={label}>
                    <td className="py-1.5 text-muted">{label}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums" style={{ color: t.color }}>{w}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-faint">Applied to every new version, which always starts from Not started.</p>
          </Card>
        ))}
      </div>
    </PageBody>
  );
}
