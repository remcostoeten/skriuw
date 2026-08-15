import { useCallback, useState } from "react";
import { entityFocusHash } from "@/app-route";
import { formatListDate } from "@/features/journal/dates";
import { openJournalDay } from "@/features/journal/navigation";
import { activateNote } from "@/store/actions/workspace";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@/store/types";
import { SectionToggle } from "@/shared/ui/section-header";
import { projectBacklinks, projectOutgoingNotes, type BacklinkEntry } from "./reference-panel-model";
import { projectCoVisitedNotes, projectRelatedJournalEntries, projectRelationshipGraph, projectSharedEntities, type RelationshipGraph, type RelationshipNote, type RelatedJournalEntry } from "./relationship-model";

const ROWS = 5;
const emptyGraph: RelationshipGraph = { nodes: [], edges: [], hiddenCount: 0 };

function sameEntries<T extends { noteId: string; title: string }>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((entry, index) => JSON.stringify(entry) === JSON.stringify(right[index]));
}

function RelationshipSection({ title, entries, render, empty }: { title: string; entries: readonly unknown[]; render: (index: number) => React.ReactNode; empty: string }) {
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);
  const visible = all ? entries.length : Math.min(ROWS, entries.length);
  return <section className="group relative border-b border-border/60">
    <SectionToggle id={`relationships-${title}`} title={`${title} (${entries.length})`} open={open} onToggle={() => setOpen((value) => !value)} />
    {open && <div className="px-4 pb-2.5 pt-2.5">
      {entries.length === 0 ? <p className="m-0 text-[13px] text-muted-foreground/70">{empty}</p> : <ul className="m-0 list-none space-y-0.5 p-0">{Array.from({ length: visible }, (_, index) => <li key={index}>{render(index)}</li>)}</ul>}
      {entries.length > ROWS && <button type="button" aria-expanded={all} onClick={() => setAll((value) => !value)} className="mt-2 cursor-pointer px-2 text-[12px] text-muted-foreground transition-colors hover:text-foreground">{all ? "Show less" : `Show all ${entries.length - ROWS} more`}</button>}
    </div>}
  </section>;
}

function NoteRow({ entry, onOpen, detail }: { entry: RelationshipNote | BacklinkEntry; onOpen: () => void; detail?: string }) {
  return <button type="button" onClick={onOpen} className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded px-2 py-1 text-left text-[13px] text-foreground/80 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="min-w-0 flex-1 truncate">{entry.title}</span>{detail && <span className="shrink-0 truncate text-[11px] text-muted-foreground">{detail}</span>}</button>;
}

function Graph({ store, graph }: { store: RendererStore; graph: RelationshipGraph }) {
  if (graph.nodes.length <= 1) return null;
  const center = 100; const radius = 72;
  const position = (index: number) => index === 0 ? [center, center] : [center + Math.cos((index - 1) / (graph.nodes.length - 1) * Math.PI * 2 - Math.PI / 2) * radius, center + Math.sin((index - 1) / (graph.nodes.length - 1) * Math.PI * 2 - Math.PI / 2) * radius] as const;
  const byId = new Map(graph.nodes.map((node, index) => [node.id, { node, index }]));
  return <section className="border-b border-border/60 px-4 py-3" aria-label="Local relationship graph"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Local graph</p><svg viewBox="0 0 200 200" className="block w-full max-w-[260px]" role="img" aria-label="Direct relationships around the current note">
    {graph.edges.map((edge) => { const from = byId.get(edge.from); const to = byId.get(edge.to); if (!from || !to) return null; const [x1, y1] = position(from.index); const [x2, y2] = position(to.index); return <line key={`${edge.from}-${edge.to}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" className="text-border" />; })}
    {graph.nodes.map((node, index) => { const [x, y] = position(index); const open = () => { if (node.kind === "note") activateNote(store, node.id); else if (node.kind !== "current") window.location.hash = entityFocusHash(node.kind, node.id.split(":")[1]!); }; return <g key={node.id} transform={`translate(${x} ${y})`}><circle r={node.kind === "current" ? 15 : 9} className={node.kind === "current" ? "fill-foreground" : "fill-background stroke-muted-foreground"} /><text x="0" y={node.kind === "current" ? 3 : 24} textAnchor="middle" className={node.kind === "current" ? "fill-background text-[6px]" : "fill-muted-foreground text-[6px]"}>{node.kind === "current" ? "Current" : node.label.slice(0, 16)}</text>{node.kind !== "current" && <circle r="12" fill="transparent" className="cursor-pointer" tabIndex={0} role="button" aria-label={`Open ${node.label}`} onClick={open} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } }} />}</g>; })}
  </svg>{graph.hiddenCount > 0 && <p className="m-0 text-[11px] text-muted-foreground">+{graph.hiddenCount} more relationships</p>}</section>;
}

export function RelationshipExplorer({ store, noteId }: { store: RendererStore; noteId: string }) {
  const select = <T,>(project: (state: RendererState) => T, equality?: (left: T, right: T) => boolean) => useRendererSelector(store, useCallback(project, [noteId]), equality);
  const backlinks = select((state) => projectBacklinks(state, noteId), sameEntries) as readonly BacklinkEntry[];
  const outgoing = select((state) => projectOutgoingNotes(state, noteId), sameEntries) as readonly BacklinkEntry[];
  const people = select((state) => projectSharedEntities(state, noteId, "person"), sameEntries) as readonly RelationshipNote[];
  const tags = select((state) => projectSharedEntities(state, noteId, "tag"), sameEntries) as readonly RelationshipNote[];
  const journal = select((state) => projectRelatedJournalEntries(state, noteId), sameEntries) as readonly RelatedJournalEntry[];
  const coVisited = select((state) => projectCoVisitedNotes(state, noteId), sameEntries) as readonly RelationshipNote[];
  const graph = select((state) => projectRelationshipGraph(state, noteId), (a, b) => JSON.stringify(a) === JSON.stringify(b));
  const total = new Set([...backlinks, ...outgoing, ...people, ...tags, ...journal, ...coVisited].map((entry) => entry.noteId)).size;
  if (total === 0) return <section className="border-b border-border/60 px-4 py-4"><p className="m-0 text-[11px] font-medium text-muted-foreground">Relationships</p><p className="mb-0 mt-2 text-[13px] text-muted-foreground/70">Nothing connected yet. Mention a note with @, add a #tag, or reference a $person.</p></section>;
  const entities = (ids: readonly string[], kind: "person" | "tag") => ids.map((id) => `${kind === "person" ? "$" : "#"}${kind === "person" ? store.getState().people.get(id)?.name : store.getState().tags.get(id)?.name}`).join(" · ");
  return <div><div className="px-4 py-2 text-[11px] font-medium text-muted-foreground">Relationships <span className="tabular-nums text-muted-foreground/50">({total})</span></div>
    <RelationshipSection title="Referenced by" entries={backlinks} empty="No notes link here." render={(index) => <NoteRow entry={backlinks[index]!} onOpen={() => activateNote(store, backlinks[index]!.noteId)} />} />
    <RelationshipSection title="Links to" entries={outgoing} empty="No linked notes." render={(index) => <NoteRow entry={outgoing[index]!} onOpen={() => activateNote(store, outgoing[index]!.noteId)} />} />
    <RelationshipSection title="Shared people" entries={people} empty="No shared people." render={(index) => <NoteRow entry={people[index]!} detail={entities(people[index]!.sharedEntityIds, "person")} onOpen={() => activateNote(store, people[index]!.noteId)} />} />
    <RelationshipSection title="Shared tags" entries={tags} empty="No shared tags." render={(index) => <NoteRow entry={tags[index]!} detail={entities(tags[index]!.sharedEntityIds, "tag")} onOpen={() => activateNote(store, tags[index]!.noteId)} />} />
    <RelationshipSection title="Journal" entries={journal} empty="No related journal entries." render={(index) => { const entry = journal[index]!; const detail = entry.directIncoming ? "Mentioned this note" : entry.directOutgoing ? "Linked from this note" : [entities(entry.sharedPersonIds, "person"), entities(entry.sharedTagIds, "tag")].filter(Boolean).join(" · "); return <NoteRow entry={{ ...entry, title: formatListDate(entry.dateKey) }} detail={detail} onOpen={() => openJournalDay(entry.dateKey as Parameters<typeof openJournalDay>[0])} />; }} />
    <RelationshipSection title="Viewed together" entries={coVisited} empty="Open another note from here to build this session list." render={(index) => <NoteRow entry={coVisited[index]!} onOpen={() => activateNote(store, coVisited[index]!.noteId)} />} />
    <Graph store={store} graph={graph ?? emptyGraph} />
  </div>;
}
