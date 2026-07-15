# Skriuw: Living Information

> Internal product vision, July 2026  
> Product horizon: 2026–2031  
> Scope: web and desktop first; a shared product language that can later travel to mobile

# Vision

Skriuw should make a document capable of understanding itself.

Today, prose and structured information live in different worlds. We write the meaning of a project in one place, track its state in another, calculate its health in a third, and assemble a dashboard in a fourth. Each translation loses context. The budget forgets why a decision was made. The task board forgets the argument that created the task. The dashboard shows a number but not the human story behind it.

Skriuw can remove that divide.

In Skriuw, people continue to write ordinary documents. When a sentence contains something that matters—a cost, a date, a commitment, a person, a quantity, a status—the user can give that fragment meaning without moving it elsewhere. Meaningful fragments can be gathered, compared, calculated, and shown in new forms. The source remains where it was written. Every summary leads back to its evidence. Every calculation remains attached to its explanation.

The result is neither a spreadsheet embedded in a note nor a database wearing a document skin. It is a new category: **living information**. Writing is the source; structure is a quality of the writing; visualizations are alternate readings of it.

The defining experience is simple:

1. Write naturally.
2. Mark what matters.
3. Ask the document to gather or understand it.
4. Shape the answer visually.
5. Change either the source or its appearance and watch the document remain coherent.

This direction grows from what Skriuw already is: a calm block editor, journal, knowledge graph, typed note properties, inline links to notes, tags, and people, and optional privacy-conscious AI. It does not require Skriuw to abandon documents. It makes documents more powerful precisely by respecting them.

Web and desktop are the first-class canvases because this work benefits from space, precision, keyboard flow, and side-by-side context. Mobile is not part of the initial product delivery. The product language must nevertheless remain portable: the meaning of a marked value, a connection, or a calculation cannot depend on a desktop-only layout. Mobile can later become an excellent surface for capture, review, and small changes without becoming a miniature desktop editor.

# Product Philosophy

## The document is the home

Information should not be extracted into a management system before it becomes useful. The paragraph where a fact was written is its home. Everything else is a perspective on that source.

## Structure should be discovered, not administered

People understand “this is the trip budget” and “these are the places we may stay.” They should not first design a schema. Skriuw should let structure emerge through use, then offer to make repeated meaning consistent.

## Calculation is a sentence with a result

Most people do not want formulas. They want answers: “What remains after fixed costs?”, “How many active clients have not heard from us this month?”, “Are we on pace?” The expression should read like an intention, not a program.

## Every answer retains provenance

A total without its inputs is fragile. A chart without its sources is decoration. A generated summary without evidence is untrustworthy. Any derived result in Skriuw must reveal what contributed to it and let the user move to the source.

## AI proposes meaning; people own meaning

AI can notice patterns, suggest marks, interpret questions, and explain changes. It must never silently restructure a workspace or become required for deterministic behavior. Accepted meaning becomes explicit, inspectable product state—not a prompt that must be reinterpreted later.

## Calmness is capability with restraint

Power should appear at the moment of intent. An untouched note must remain a beautiful note. Structure should not cover prose in badges, controls, and metadata. Complexity belongs in focus states and temporary workspaces, not in the resting document.

## Privacy changes the product, not merely the policy

Living information may include finances, relationships, health, research, and private plans. Core marking, gathering, calculation, and visualization must work without sending content to an AI provider. AI-assisted interpretation is optional, clearly scoped, and compatible with local models on desktop.

# Design Principles

1. **Write first.** A new document begins as an empty page, not a configuration dialog.
2. **Meaning stays in context.** Structured fragments remain visible inside the sentence or block that gives them meaning.
3. **One source, many readings.** A piece of information may appear in prose, a plan, a comparison, and a summary without becoming four copies.
4. **Reveal structure gradually.** Resting state is quiet; hover shows affordance; focus shows controls; a dedicated shaping mode appears only for complex work.
5. **Direct manipulation before configuration.** Drag a date to move it. Group cards by placing them together. Resize a visual to change emphasis. Use menus only for actions that cannot be expressed spatially.
6. **Natural language, visible semantics.** Users may ask in ordinary language, but Skriuw shows its interpretation in plain, editable terms before relying on it.
7. **Deterministic core, assisted edges.** Accepted calculations and relationships produce stable results. AI helps create them but does not sit invisibly in the critical path.
8. **Provenance everywhere.** Derived information always has a path back to its sources.
9. **Absence is not zero.** Unknown, empty, not applicable, and zero are distinct. Skriuw never fabricates certainty.
10. **Time is native.** Plans, journals, subscriptions, habits, and projects all change. Past states and future commitments deserve first-class treatment.
11. **Local ownership remains credible.** Desktop documents remain usable offline and intelligible outside Skriuw. Rich meaning may have a portable companion representation, but user writing is never held hostage.
12. **Accessibility is structural.** Every visual form has a readable alternative, every drag action has a keyboard equivalent, and color never carries meaning alone.
13. **Desktop and web share behavior.** Network-only features may differ by capability, but the core mental model and editing language do not.
14. **Mobile receives meaning, not layouts.** Shared concepts must survive a smaller surface even when advanced composition waits.
15. **No accidental operating system.** Skriuw serves thought and authored work. It does not become a low-code application builder.

# User Problems

## Information fractures when work becomes serious

A plan begins in prose. As it grows, dates move to a calendar, costs move to a sheet, tasks move to a board, and progress moves to a dashboard. The original thought loses authority because the “real” state now lives elsewhere.

## Structure demands premature decisions

Existing tools ask users to name fields, choose types, and select views before they understand the work. Early uncertainty is punished with setup. People either abandon structure or create brittle systems they must maintain.

## Calculation excludes ordinary writers

Formula syntax encodes location and machinery rather than intent. Even competent users fear breaking it. The person who understands the budget may still depend on somebody who understands the sheet.

## Context disappears in management views

A status, amount, or deadline has a reason. Rows and cards reduce it to a field. Users must open many records or remember undocumented history to understand what a number means.

## Dashboards become stale artifacts

Dashboards require deliberate assembly and separate upkeep. They tend to show what was easy to count, not what matters. Their polished certainty can conceal missing or outdated inputs.

## Relationships are laborious to maintain

The same client, project, book, hotel, or expense appears in many documents. Existing tools force a choice between duplication and formal relation management. Both interrupt writing.

## AI gives answers without durable understanding

Chat can extract a total or suggest a plan once, but the answer is often a dead message. It does not become a stable, inspectable part of the document. Users must ask again after every change and cannot reliably audit the result.

## Private information is pushed toward cloud workflows

The more useful a structured workspace becomes, the more sensitive it becomes. Personal finances, journals, client records, and research should not require an opaque hosted service or mandatory model processing.

## Existing “flexibility” becomes maintenance work

Highly configurable tools turn users into system administrators. Naming fields, repairing relations, designing automations, and policing templates consume the attention the tool was meant to protect.

# Mental Models

The user should not think in tables, records, schemas, or queries. Skriuw uses five ordinary ideas.

## Marks: “This matters”

A **Mark** is a meaningful fragment of a document. It can be a phrase, number, date, state, person, place, duration, choice, or entire block. “€1,250,” “launch on 18 September,” and “waiting for Maya” can each be marked. A Mark preserves its visible text and gains a quiet semantic identity.

Marks are not fields. They do not need to occupy the same location in every document. They can begin as one-off meaning and become consistent only when reuse proves valuable.

## Threads: “These belong together”

A **Thread** connects Marks across a document or workspace. A thread may represent a project, trip, client, budget, habit, reading list, or any other recurring context. Users create one by naming a gathering in natural language or by connecting existing Marks.

A Thread is not a container that owns information. It is a path through information that remains in place. The same Mark can participate in several Threads without duplication.

## Readings: “Show this another way”

A **Reading** is an alternate presentation of a Thread: a flowing stack of cards, a timeline, a calendar, a balance, a progression, a map, a comparison, or a compact summary. It is placed directly in a document like any other block.

A Reading is not a separate app or permanent view type. It is a visual sentence: a way this document chooses to speak about its sources. Users can reshape it directly while the source remains authoritative.

## Derivations: “Tell me what follows”

A **Derivation** is a plain-language relationship that produces a value or state: “remaining is budget minus committed costs,” “progress is completed commitments out of all commitments,” or “show subscriptions renewing in the next 30 days.” Its interpretation is visible as labeled parts, not hidden behind formula syntax.

A Derivation is saved, deterministic, and inspectable. AI may translate the first request, but Skriuw stores the accepted meaning.

## Echoes: “Keep this truth present”

An **Echo** is a live appearance of a Mark, Thread, Reading, or Derivation somewhere else. It remains connected to its source and clearly identifies where it came from. An Echo can be expanded for context or edited in place when permissions allow.

Together these create one coherent loop: write, Mark, connect by Thread, shape a Reading, derive an answer, Echo it where needed.

## How people describe the system

Users should naturally say:

- “Mark these as costs.”
- “Gather the places from my Japan notes.”
- “Thread this decision into the launch plan.”
- “Read this as a timeline.”
- “Show what remains after committed costs.”
- “Echo the latest project pulse here.”

If users begin discussing column types, rollups, query languages, or record templates, the product has failed to protect its mental model.

# Primitive Building Blocks

## 1. Mark

The atomic unit of living information. A Mark pairs visible authored content with meaning. Initial kinds are deliberately human: Amount, Count, Moment, Duration, State, Person, Place, Measure, Choice, and Reference. Kinds describe behavior, not storage.

A Mark can be created by selecting text and choosing “Mark as…”, accepting a subtle suggestion, or writing through a lightweight pattern. Marked text remains readable Markdown-compatible prose when exported; its added meaning is portable workspace metadata.

## 2. Mark Family

When several Marks clearly represent the same idea—“Cost,” “Price,” and “Amount paid”—Skriuw may suggest a **Family**. A Family gives them shared meaning without forcing identical labels. The user can merge, split, or ignore the suggestion. Families are learned vocabulary, not a schema designed upfront.

## 3. Thread

A named relationship among Marks, passages, and documents. Threads can be explicit (“Japan 2027”) or contextual (“all commitments related to launch”). They are visible in the graph but primarily experienced in prose through quiet threadlines, backlinks, and gathered Readings.

## 4. Reading

A live block that presents a Thread or selection of Marks. Readings use semantic forms rather than generic charts:

- **Flow** for ordered cards and narrative sequences
- **Path** for time and milestones
- **Balance** for amounts entering, leaving, reserved, and remaining
- **Pulse** for progress and change
- **Compare** for alternatives and trade-offs
- **Rhythm** for recurrence and habits
- **Map** for place
- **Constellation** for relationships
- **Brief** for live narrative summary

Users choose by intent (“plan over time,” “compare options”), not chart taxonomy.

## 5. Derivation

A visible, sentence-like rule connecting named meaning. Each Derivation has a question, an interpretation, a result, provenance, and an explanation of missing inputs. It can produce an amount, count, ratio, duration, status, list, date, or short text.

## 6. Echo

A transcluded appearance that remains live. Echoes have three densities: token, card, and passage. They never masquerade as copied content. Hover, focus, or tap reveals origin and freshness.

## 7. Moment

Time attached to any Mark or block. A Moment may be exact, approximate, recurring, bounded, or dependent on another Moment. “Two weeks after approval” is as legitimate as “14 October.” This supports planning without forcing every plan into a calendar.

## 8. State

A human condition with optional progression. States are authored as words—Considering, Booked, Waiting, Paid—not selected from a global status bureaucracy. When patterns repeat, Skriuw offers a reusable progression. A progression may branch or regress; it is not assumed to be a linear pipeline.

## 9. Pulse

A small, automatically composed expression of change: “3 of 8 commitments complete,” “€420 more committed this week,” or “No journal entry for four days.” Pulses prioritize movement, freshness, and exceptions over static totals.

## 10. Frame

A temporary focus space for shaping a complex Reading. It opens around, not instead of, the document. The source remains visible at the edge or in a split view. Closing the Frame returns the finished Reading to its exact place in the document.

These are not ten independent products. They are supporting parts of the Mark–Thread–Reading loop. Marks, Threads, Readings, Derivations, and Echoes are the public foundation. Families, Moments, States, Pulses, and Frames deepen them only when needed.

# Concept Exploration

The concepts below were explored as possible foundations. Most are intentionally rejected. A strategy becomes clear by deciding what not to make foundational.

## Concept 1: Semantic Marks

- **What it is:** Selected text or blocks gain durable meaning while retaining their authored form.
- **Why it exists:** The smallest useful act of structure should happen where thought is expressed.
- **Problem solved:** Removes the forced move from prose into fields or cells.
- **Native to a block editor:** Selection, inline formatting, and block handles already provide natural entry points.
- **Better than spreadsheets:** Meaning is attached to language rather than coordinates.
- **Better than Notion:** Structure can live anywhere in prose instead of only in page properties or database records.
- **Risks:** Too many visible Marks could make writing noisy; ambiguous language could create inconsistent kinds.
- **Long-term potential:** Becomes a universal semantic layer across notes, journals, tasks, and imported documents.
- **Verdict:** **Keep as foundation.** It is the essential invention. Everything else should prove that Marks become more useful without damaging writing.

## Concept 2: Threadlines

- **What it is:** Named connections weave related Marks and passages through many documents.
- **Why it exists:** Information belongs to several contexts without needing copies or rigid parentage.
- **Problem solved:** Replaces manual relation fields and duplicated project pages.
- **Native to a block editor:** Connections begin with linking phrases, people, tags, notes, and blocks already present in writing.
- **Better than spreadsheets:** Relationships are contextual and many-to-many without lookup mechanics.
- **Better than Notion:** A connection can target a meaningful passage, not merely another record or page.
- **Risks:** Invisible connections may feel magical; visible lines could become graph-like clutter.
- **Long-term potential:** Extends Skriuw’s current backlinks into an authored semantic network.
- **Verdict:** **Keep, rename Thread in product.** Strong only when connection remains quiet and provenance is obvious.

## Concept 3: Living Readings

- **What it is:** Embedded alternate presentations of source material, shaped by intent rather than view configuration.
- **Why it exists:** People need to see a plan, balance, comparison, or rhythm without leaving the document.
- **Problem solved:** Ends the split between source notes and reporting surfaces.
- **Native to a block editor:** A Reading is a block placed between explanation and conclusion.
- **Better than spreadsheets:** It begins with meaning and chooses an appropriate form; no grid is required.
- **Better than Notion:** It is part of a narrative and can combine fragments from within pages, not just page-level properties.
- **Risks:** Too many forms become a charting suite; direct manipulation may hide important rules.
- **Long-term potential:** Defines a new visual grammar for authored information.
- **Verdict:** **Keep as foundation.** Limit initial forms severely. Each must express a human question better than a generic chart.

## Concept 4: Conversational Calculations

- **What it is:** Users ask a question in natural language and receive a live, saved result.
- **Why it exists:** Calculation intent is easier to express than formula syntax.
- **Problem solved:** Makes budgets, pace, totals, intervals, and comparisons accessible.
- **Native to a block editor:** The question and result read as part of the document.
- **Better than spreadsheets:** References meaning such as “committed trip costs,” not cell ranges.
- **Better than Notion:** Supports contextual fragments and explains which sources contributed.
- **Risks:** Language is ambiguous; model interpretation can change; confident wrong answers are dangerous.
- **Long-term potential:** Calculation becomes a literacy available to anyone who can state a question clearly.
- **Verdict:** **Keep only as visible Derivations.** Reject ephemeral AI answers. Accepted interpretation must become deterministic, inspectable, and editable.

## Concept 5: Automatic Dashboards

- **What it is:** AI scans a workspace and generates a dashboard without setup.
- **Why it exists:** Dashboard creation is expensive and users often do not know what to measure.
- **Problem solved:** Shortens time from scattered information to overview.
- **Native to a block editor:** A generated overview could be inserted into a note.
- **Better than spreadsheets:** No manual chart ranges or layout work.
- **Better than Notion:** Can infer from prose, not only configured properties.
- **Risks:** Generic metrics, false confidence, surveillance feeling, high visual noise, weak ownership.
- **Long-term potential:** Useful as a suggestion mechanism after enough explicit meaning exists.
- **Verdict:** **Reject as a product foundation.** “Automatic dashboard” repeats old assumptions. Preserve the useful fragment as suggested Pulses inside authored Briefs.

## Concept 6: Card Rivers

- **What it is:** Related items flow as variable-size cards along a vertical or horizontal stream.
- **Why it exists:** Rows impose false uniformity on information of different richness.
- **Problem solved:** Lets projects, contacts, research, and options retain previews and context.
- **Native to a block editor:** Cards are expanded block excerpts and can sit naturally between prose.
- **Better than spreadsheets:** Content determines size; narrative order and grouping are visible.
- **Better than Notion:** Cards can represent passages and Marks, not only pages with covers.
- **Risks:** Large cards reduce scan density; rivers can become prettier kanban boards.
- **Long-term potential:** Strong general Reading for triage, collections, and ordered thinking.
- **Verdict:** **Keep as Flow Reading, not a primitive.** Avoid status columns and board mimicry.

## Concept 7: Spatial Constellations

- **What it is:** Users arrange related information freely on an infinite canvas.
- **Why it exists:** Some relationships are spatial and exploratory rather than sequential.
- **Problem solved:** Supports synthesis, clustering, and systems thinking.
- **Native to a block editor:** Blocks can be pulled into a temporary spatial Frame.
- **Better than spreadsheets:** Proximity and shape express meaning without coordinates.
- **Better than Notion:** Richer than a database view and closer to thought mapping.
- **Risks:** Infinite canvases become messy, inaccessible, difficult on mobile, and detached from authored flow.
- **Long-term potential:** Valuable focused mode for research and relationship discovery.
- **Verdict:** **Reject as core; retain a constrained Constellation Reading.** It must return to the document and provide a linear accessible reading.

## Concept 8: Meaningful Dragging

- **What it is:** Moving an object changes its meaning: dragging a commitment later changes its Moment; placing options together groups them.
- **Why it exists:** Direct manipulation can replace configuration panels.
- **Problem solved:** Makes structural changes tangible and reversible.
- **Native to a block editor:** Users already reorder blocks; semantics can build on familiar movement.
- **Better than spreadsheets:** Movement expresses intent instead of copying cells or editing coordinates.
- **Better than Notion:** Dragging need not be limited to status columns or page order.
- **Risks:** Hidden side effects; accidental changes; poor keyboard and screen-reader parity.
- **Long-term potential:** Creates signature interactions when previews explain consequences before drop.
- **Verdict:** **Keep as interaction principle.** Never make drag the sole path. Show “Move to 18 Sep” or “Group as Maybe” before committing.

## Concept 9: Block Gravity

- **What it is:** Related blocks subtly attract and cluster based on semantic similarity.
- **Why it exists:** Organization could emerge without manual filing.
- **Problem solved:** Reduces sorting and folder maintenance.
- **Native to a block editor:** Blocks are movable units with content that can be compared.
- **Better than spreadsheets:** Organization follows meaning rather than a sort key.
- **Better than Notion:** Does not require a property to group by.
- **Risks:** Unpredictable movement violates document authorship and creates anxiety.
- **Long-term potential:** Similarity can power suggestions and search without moving content.
- **Verdict:** **Reject.** Documents must not rearrange themselves. Convert the insight into optional “related here” suggestions.

## Concept 10: Time Paths

- **What it is:** A flexible path of Moments, ranges, dependencies, and narrative milestones.
- **Why it exists:** Human plans contain uncertainty and relative timing, not only fixed dates.
- **Problem solved:** Unifies project planning, trips, subscriptions, research, and life events.
- **Native to a block editor:** Each milestone retains its explanatory block and can expand inline.
- **Better than spreadsheets:** Time is spatial and semantic, not a date column.
- **Better than Notion:** Relative and approximate moments do not require formula properties or a rigid timeline database.
- **Risks:** Dependency editing can drift toward project-management complexity.
- **Long-term potential:** A universal temporal Reading across notes and journal history.
- **Verdict:** **Keep as Path Reading.** No critical-path machinery, resource planning, or Gantt vocabulary.

## Concept 11: Balances

- **What it is:** A visual field showing amounts as incoming, outgoing, reserved, uncertain, and remaining.
- **Why it exists:** Financial understanding is about relationships among amounts, not cell arithmetic.
- **Problem solved:** Budgets, runway, subscriptions, trip costs, and capacity become legible.
- **Native to a block editor:** Each amount expands to its sentence, receipt note, or decision.
- **Better than spreadsheets:** Provenance and uncertainty remain attached to every value.
- **Better than Notion:** Calculations span inline Marks without rollup configuration.
- **Risks:** Could turn Skriuw into personal-finance software; currency, tax, and accounting expectations grow rapidly.
- **Long-term potential:** Demonstrates that one generic semantic system can handle finance elegantly.
- **Verdict:** **Keep as flagship Reading, not product identity.** No bank sync, ledgers, reconciliation, or tax workflows.

## Concept 12: State Landscapes

- **What it is:** Items occupy named regions such as Exploring, Waiting, Committed, and Complete, with soft boundaries rather than columns.
- **Why it exists:** Real work rarely follows a universal linear pipeline.
- **Problem solved:** Gives projects, sales, reading, and decisions a visual state without a kanban clone.
- **Native to a block editor:** State words arise in writing and cards retain their source excerpts.
- **Better than spreadsheets:** State is spatially understood rather than filtered in a column.
- **Better than Notion:** Regions can branch, overlap, and carry narrative context.
- **Risks:** Soft regions may be imprecise; free arrangement can become a decorative board.
- **Long-term potential:** Could make workflow feel human rather than industrial.
- **Verdict:** **Defer.** Strong idea, insufficiently distinct in first release. Use State Marks and Flow grouping before inventing a new spatial grammar.

## Concept 13: Reusable Live Passages

- **What it is:** A passage can appear live in multiple documents while retaining one source.
- **Why it exists:** Policies, project pulses, bios, assumptions, and plans are often repeated.
- **Problem solved:** Prevents copy drift and keeps context reachable.
- **Native to a block editor:** A passage is already an authored unit and can render inline.
- **Better than spreadsheets:** Reuse includes rich explanation, not merely a referenced value.
- **Better than Notion:** Transclusion is granular and writing-native rather than page-centric.
- **Risks:** Editing an appearance may unexpectedly change distant documents; circular references are confusing.
- **Long-term potential:** Makes documents composable without turning them into templates.
- **Verdict:** **Keep as Echo.** Every appearance must show origin; edits need clear scope; cycles must be prevented or plainly represented.

## Concept 14: Ambient Structure Recognition

- **What it is:** Skriuw quietly notices dates, amounts, commitments, people, and repeated patterns while users write.
- **Why it exists:** Manual marking should not become metadata labor.
- **Problem solved:** Reduces the cost of creating useful structure.
- **Native to a block editor:** Suggestions appear beside newly written content and can be accepted without leaving the cursor.
- **Better than spreadsheets:** The system understands language before requiring structure.
- **Better than Notion:** No property setup precedes recognition.
- **Risks:** Constant highlights feel invasive; AI processing threatens privacy; false positives erode trust.
- **Long-term potential:** Makes living information feel effortless when tuned to restraint.
- **Verdict:** **Keep as optional assistance.** Local deterministic recognition first; AI recognition opt-in; no silent acceptance.

## Concept 15: Document Weather

- **What it is:** A calm ambient signal describes document health: stale decisions, approaching Moments, unresolved commitments, or unusual change.
- **Why it exists:** Users need attention guidance without building dashboards.
- **Problem solved:** Surfaces what changed or needs care.
- **Native to a block editor:** Appears as a compact header pulse or opening sentence.
- **Better than spreadsheets:** Synthesizes temporal and narrative context.
- **Better than Notion:** Does not require manually configured views and filters.
- **Risks:** Anthropomorphic vagueness, notification fatigue, AI overreach.
- **Long-term potential:** Could make opening a workspace feel immediately orienting.
- **Verdict:** **Reject the metaphor; keep Pulses.** Weather is charming but imprecise. State concrete changes and exceptions.

## Concept 16: Question Blocks

- **What it is:** A written question remains in the document and continuously answers from marked information.
- **Why it exists:** Questions are a natural interface for analysis.
- **Problem solved:** Replaces query builders and one-off AI chat.
- **Native to a block editor:** A question belongs beside the reasoning it supports.
- **Better than spreadsheets:** Intent is readable and sources are semantic.
- **Better than Notion:** Questions can range over passage-level meaning and explain exclusions.
- **Risks:** Open-ended questions tempt nondeterministic generated answers; ambiguous scope creates errors.
- **Long-term potential:** Could become the most approachable analytical interface available.
- **Verdict:** **Keep only when compiled into a Derivation or Brief.** Clearly distinguish deterministic answers from generated interpretation.

## Concept 17: Narrative Briefs

- **What it is:** A live prose summary composed from selected Threads, Pulses, and Derivations.
- **Why it exists:** Many users want an intelligible update, not a dashboard.
- **Problem solved:** Turns changing structured information into a readable status, travel brief, financial note, or research digest.
- **Native to a block editor:** The output is prose embedded in prose, with expandable evidence.
- **Better than spreadsheets:** Communicates meaning and exceptions rather than presenting raw totals.
- **Better than Notion:** Draws from document fragments and can remain in the narrative flow.
- **Risks:** Generated prose may overstate certainty or conceal omissions.
- **Long-term potential:** A trustworthy, evidence-linked living memo could replace many dashboards.
- **Verdict:** **Keep for later.** Every claim needs source links; deterministic facts and generated language must be visually distinct.

## Concept 18: Gestural Formulas

- **What it is:** Users combine values by dragging them together, stacking, splitting, or drawing a relation.
- **Why it exists:** Calculation could be visual instead of textual or coded.
- **Problem solved:** Removes formula syntax for simple arithmetic and grouping.
- **Native to a block editor:** Mark tokens can be manipulated directly in a temporary Frame.
- **Better than spreadsheets:** Inputs are named concepts, not locations.
- **Better than Notion:** No formula editor or property indirection.
- **Risks:** Gestures are hard to discover, inaccessible, and inadequate for complex intent.
- **Long-term potential:** Useful as a delightful shortcut for basic relationships.
- **Verdict:** **Reject as primary interaction.** Plain-language Derivations are clearer. Retain drag-to-combine only as an optional shortcut with a textual result.

## Concept 19: Personal Vocabulary

- **What it is:** Skriuw learns that “spend,” “cost,” and “paid” may belong to one Family in this workspace.
- **Why it exists:** Human language varies; forcing universal field names creates setup work.
- **Problem solved:** Makes structure consistent without demanding taxonomy design.
- **Native to a block editor:** Vocabulary emerges from repeated authored language.
- **Better than spreadsheets:** Consistency is semantic, not dependent on identical headers.
- **Better than Notion:** Users do not retrofit every page to one property definition.
- **Risks:** Incorrect merging corrupts calculations; learned meaning can become opaque.
- **Long-term potential:** A private semantic layer makes each workspace more useful over time.
- **Verdict:** **Keep as Mark Families with explicit consent.** Suggestions must show examples and impact before merging.

## Concept 20: Source Trails

- **What it is:** Every derived value or summary exposes an explorable trail to contributing Marks and passages.
- **Why it exists:** Trust requires more than a plausible answer.
- **Problem solved:** Makes calculations, visualizations, and AI assistance auditable.
- **Native to a block editor:** Sources open as highlighted passages in their original documents.
- **Better than spreadsheets:** The trail carries prose context, not only precedent cells.
- **Better than Notion:** It reaches inside pages to exact evidence.
- **Risks:** Trails may overwhelm simple interactions; source changes can invalidate past interpretations.
- **Long-term potential:** Provenance can become Skriuw’s strongest trust advantage.
- **Verdict:** **Keep as non-negotiable behavior.** Not a standalone feature; required infrastructure for every Reading and Derivation.

## Concept 21: Living Templates

- **What it is:** A reusable document pattern evolves when repeated Marks and relationships emerge.
- **Why it exists:** Repeated work benefits from guidance without requiring a database schema.
- **Problem solved:** Makes meeting notes, trip plans, client briefs, and reviews consistent.
- **Native to a block editor:** Templates remain authored documents with suggested, not mandatory, meaning.
- **Better than spreadsheets:** They preserve narrative and adapt per instance.
- **Better than Notion:** They do not create a parallel template administration system or force every instance into identical properties.
- **Risks:** Template ecosystems encourage generic productivity theater and complexity.
- **Long-term potential:** Teams can share product language and useful Readings without sharing private content.
- **Verdict:** **Defer and constrain.** Let users save a strong document as a pattern; never launch a marketplace of pseudo-apps.

## Concept 22: Universal Capture Inbox

- **What it is:** Every unclassified thought, receipt, link, and task enters one AI-organized stream.
- **Why it exists:** Capture is easier when destination decisions disappear.
- **Problem solved:** Reduces filing friction across devices.
- **Native to a block editor:** Captures can become blocks or notes.
- **Better than spreadsheets:** Accepts messy information.
- **Better than Notion:** Requires no destination database.
- **Risks:** Skriuw already has notes and journal; another inbox fragments the product and invites automatic reorganization.
- **Long-term potential:** Mobile capture could later feed existing documents and Threads.
- **Verdict:** **Reject as a new surface.** Improve capture into notes and journal; let users Thread content later.

## Concept 23: Live Assumptions

- **What it is:** Users Mark uncertain values and state confidence, range, or source quality.
- **Why it exists:** Plans and budgets are built from estimates, yet tools display them like facts.
- **Problem solved:** Prevents false precision and shows which inputs deserve attention.
- **Native to a block editor:** “About €800,” “likely in May,” and “unconfirmed” remain natural writing.
- **Better than spreadsheets:** Uncertainty is meaning, not a comment hidden on a cell.
- **Better than Notion:** A value can retain nuance without extra confidence properties everywhere.
- **Risks:** Too much uncertainty metadata burdens casual use; calculations over ranges need careful explanation.
- **Long-term potential:** Gives Skriuw unusually honest forecasting and decision support.
- **Verdict:** **Keep as a later quality of Marks.** Important for finance, planning, and research after the basic loop is trusted.

## Concept 24: Actionable Sentences

- **What it is:** A sentence such as “Maya will send the draft by Friday” can become a commitment without being rewritten as a task row.
- **Why it exists:** Actions are born inside context and should remain there.
- **Problem solved:** Prevents action lists from losing rationale and ownership.
- **Native to a block editor:** The sentence itself is the action; State, Person, and Moment become Marks within it.
- **Better than spreadsheets:** Responsibility and context remain readable.
- **Better than Notion:** No separate task database is required to track a commitment.
- **Risks:** Long sentences scan poorly in aggregate; changing wording may alter semantics.
- **Long-term potential:** Connects Skriuw’s existing source-linked tasks to the full living-information model.
- **Verdict:** **Keep as a flagship example, not a separate primitive.** It validates Marks, Threads, Moments, and Readings together.

# Competitive Analysis

## Why existing products ended up where they are

### Excel and Google Sheets

The spreadsheet inherited paper ledgers and accounting grids. Rows and columns were a breakthrough because they made values addressable and arithmetic repeatable on limited hardware. Formula syntax exposed that machinery directly. Over decades, universality accumulated around the grid: finance, planning, analysis, scripting, forms, and dashboards.

They got recalculation, transparency of raw inputs, fill operations, portability, density, and an enormous learned vocabulary right. For experts, the blank grid remains one of software’s most generative canvases.

They got human meaning wrong because it was never their job. Coordinates are not concepts. Context lives in headers, comments, neighboring cells, and the operator’s memory. Documents become attachments to the “real” model. Collaboration improves access but not comprehension. A blank sheet is freedom purchased with a steep representational burden.

Skriuw should not compete on grid density, advanced modeling, or accounting rigor. It should serve the far larger space where people have a meaningful question, a body of writing, and moderate structured needs—but no desire to become spreadsheet designers.

### Apple Numbers

Numbers correctly challenged the infinite-sheet assumption with a canvas of smaller tables and charts. It made common work more visual and approachable.

Its limit is conceptual: the table remains the atom. The canvas arranges spreadsheet objects; it does not dissolve the separation between explanation and calculation. Skriuw’s opportunity is not a more beautiful table. It is meaning embedded in language.

### Airtable

Airtable recognized that many “spreadsheets” are really collections of things. Rich field types, attachments, linked records, forms, and multiple views made structured work approachable.

It got consistent entities, flexible visualizations, and approachable relationships right. It also made every use case conform to a base, table, record, and field. Narrative is subordinate. Complexity moves into schema design, automations, and interfaces. The product becomes an application platform.

Skriuw should not build bases or promise that users can recreate any business system. It can win when the story and evidence matter as much as the collection.

### Notion

Notion unified documents, blocks, databases, and collaboration in one spatial language. It proved that people want structured views near their writing. Its composability and approachable page model are major achievements.

Its architecture still contains a seam: prose blocks live inside pages; database properties describe pages from outside their prose. To calculate or visualize, users turn ideas into records, configure properties, create relations, and choose views. The page becomes both document and record, often awkwardly. Flexibility encourages elaborate personal operating systems and template-driven maintenance.

Skriuw’s opportunity is to remove the seam rather than polish it. A meaningful phrase inside a paragraph should participate directly in a plan or calculation. Users should not have to promote every useful fragment into a page-shaped record.

### Obsidian

Obsidian made local files, links, extensibility, and user ownership credible. It got longevity, privacy, offline access, and personal knowledge networks right. Its plugin ecosystem lets experts assemble nearly any workflow.

That extensibility also produces fragmented interaction models and fragile stacks of metadata conventions, queries, scripts, and themes. Structured behavior often lives in YAML, special syntax, or plugin-specific views. The burden falls on users to build and maintain the system.

Skriuw shares the commitment to ownership but can provide a coherent, designed semantic experience by default—especially on desktop—without turning users into plugin integrators.

### Craft

Craft treats documents as designed objects. It gets typography, block manipulation, presentation, and the emotional quality of writing software right. Cards and pages give content a tangible sense of place.

Its structured-information capabilities remain secondary. Visual polish alone does not bridge writing, calculation, and live analysis. Skriuw should learn from Craft’s restraint and tactility, not copy its card hierarchy.

### Coda

Coda asked documents to behave like applications. It got formulas with named concepts, interactive controls, and cross-document automation right.

The cost is conceptual and visual weight. Tables, buttons, packs, formulas, and automations turn documents into programmable systems. Authors become makers of internal software. Skriuw should pursue living documents without pursuing document-as-app.

### Arc Browser and Linear as interaction references

Arc showed that a familiar category could be rethought through a strong new mental model rather than feature accumulation. Linear showed that speed, keyboard fluency, coherent motion, and strict product opinion can make complex work feel calm.

Neither is a direct competitor. Their lesson is strategic: a new primitive must shape the whole experience. Skriuw cannot bolt visual data blocks onto its editor and claim a new category. Marks and their provenance must influence writing, search, graph, journal, AI, and navigation coherently.

## Skriuw’s opportunity

Skriuw already has the right center of gravity: documents first; inline links, people, and tags; a knowledge graph; typed note properties; journaling; optional AI; and a credible private desktop mode. The opportunity is to turn these pieces inward toward the writing itself.

Current note properties are useful evidence, but they should not become the foundation for database views. They can evolve into visible Marks and Families. Current backlinks and graph edges can evolve into Threads. Existing custom blocks prove that richer authored objects can live inside the editor. Existing source-linked tasks demonstrate that a block can remain the origin of an actionable object. The shared backend contract and domain separation support one product language across web and desktop while leaving mobile delivery for later.

The strategic opening is narrow and valuable: **make modest-to-rich structured work feel native to writing, with privacy and provenance as product qualities.** Skriuw should deliberately leave extreme calculation, enterprise workflow, accounting, and application building to tools designed for them.

# Final Direction

## Build Living Information around the Mark–Thread–Reading loop

One direction should define Skriuw for the next decade:

> Any meaningful fragment of writing can become a Mark. Marks connect through Threads. Threads can be read in forms suited to human intent. Every result remains attached to its source.

This is not a bundle of twenty concepts. It is one transformation of the document from passive container to semantic source.

### The signature interaction

A user writes a trip plan:

> We can stay at Kumo House for **€840** from **12–18 April**. It is near **Ueno**, but the rooms look small. The alternative is **Mori Hotel**, **€1,120**, near **Shibuya**.

Skriuw subtly recognizes possible amounts, dates, places, and options. The user selects both paragraphs and chooses **Compare these options**. A Reading unfolds directly below the prose: two calm, unequal cards preserve each option’s words, price, place, and dates. The user drags “quiet neighborhood” from a later note onto Kumo House; Skriuw previews “Connect as consideration” before accepting it.

The user writes:

> Keep accommodation under **€1,000**.

They ask, “Which option fits the budget?” Skriuw shows its interpretation: compare each accommodation Amount with the marked budget limit. Kumo House is shown as fitting, with €160 remaining. Mori Hotel is shown as €120 over. Each result expands to the exact source sentences. No table was created. No schema was designed. No formula was written. The document still reads beautifully.

The same loop supports other work:

- A project brief Marks commitments, owners, Moments, and States; a Path Reading shows the plan.
- A journal Marks mood, sleep, and meaningful events; a Rhythm Reading reveals patterns with careful language.
- Client notes Mark people, promises, and last contact; a Flow Reading gathers relationships needing attention.
- Startup notes Mark revenue, costs, customers, and goals; Balances and Pulses show runway and movement.
- Research notes Mark claims, sources, confidence, and contradictions; Compare and Constellation Readings support synthesis.

### Why this can define Skriuw

It compounds with use. Every accepted Mark improves future gathering. Every Thread creates navigable context. Every Reading is useful immediately and remains useful as its sources change. The system becomes more capable without asking the user to maintain a parallel model.

It also respects Skriuw’s identity. The empty page stays empty. Markdown remains valuable. Privacy remains credible. AI stays optional. The product becomes more powerful without becoming louder.

### What must be true

1. Marking must feel as light as formatting.
2. Unmarked writing must remain first-class.
3. A Reading must never obscure where its information came from.
4. Natural-language interpretation must become visible, stable meaning.
5. The first Readings must solve real work better than tables would.
6. Web and desktop must share the same semantics and essential interactions.
7. Desktop must support the deterministic core offline.
8. Mobile must later be able to render, capture, and make small edits to the same concepts without inheriting desktop composition UI.

### Measures of product success

Success is not the number of views created or properties configured. Product milestones should be judged by behavior:

- Time from ordinary prose to first useful live answer
- Percentage of Readings created without opening a setup panel
- Percentage of derived results whose source trail users inspect and understand
- Continued writing volume after users adopt Marks—proof that structure did not displace writing
- Reuse of the same Mark across more than one document context without copying
- Trust: users correctly predict what will update when a source changes
- Portability: exported writing remains useful and understandable outside Skriuw

# Product Roadmap

## Phase 1 — Meaning in the Page

**Milestone:** Prove that adding meaning to writing is lighter than creating fields.

- Introduce Marks for Amount, Count, Moment, State, Person, Place, and Reference.
- Make Mark creation work through selection, keyboard, and restrained recognition suggestions.
- Give every Mark a quiet focus state, plain-language meaning, and source identity.
- Unify existing inline people, note links, tags, tasks, and note properties with the new mental model where appropriate; avoid two competing metadata systems.
- Introduce Threads as named, navigable connections among Marks and passages.
- Extend search and backlinks to find meaning, not only text and documents.
- Establish portable export behavior and clear privacy boundaries.
- Ship on web and desktop with parity for core deterministic behavior; no mobile feature launch.

**Exit criterion:** A new user can turn a written project or trip note into connected, reusable information in under two minutes without encountering schema language.

## Phase 2 — Read the Document Differently

**Milestone:** Prove that a document can replace common structured side tools without becoming one.

- Launch three exceptional Readings: Flow, Path, and Balance.
- Allow Readings to gather Marks from the current document, selected notes, or a Thread.
- Support direct shaping: ordering, grouping, emphasis, time movement, and inclusion/exclusion with explicit previews.
- Make Source Trails available from every item and aggregate.
- Introduce Echoes at token and card density.
- Add compact Pulses for progress, change, freshness, and exceptions.
- Ensure every visual Reading has a linear, keyboard-operable, screen-reader-readable form.

**Exit criterion:** Users prefer a Reading over a spreadsheet or Notion database for at least three validated use cases, while still describing their work as “a document.”

## Phase 3 — Ask What Follows

**Milestone:** Make calculation and live questions trustworthy for non-programmers.

- Introduce Derivations for arithmetic, counting, comparison, time intervals, filtering, and progress.
- Let users begin with a natural-language question, then show the accepted interpretation as editable labeled parts.
- Distinguish deterministic results, uncertain inputs, and AI-generated explanation.
- Add Compare, Rhythm, and Brief Readings only where validated user questions demand them.
- Introduce Mark Families and explicit vocabulary suggestions.
- Add uncertainty and confidence to Marks for planning and research.
- Let local desktop AI assist interpretation while keeping all core results available offline without AI.

**Exit criterion:** People who do not use spreadsheet formulas can create, verify, and safely modify a multi-source Derivation without help.

## Phase 4 — A Living Workspace

**Milestone:** Make the whole body of writing feel coherent without making it autonomous.

- Offer evidence-linked Briefs across selected Threads.
- Surface restrained workspace Pulses: what changed, what is approaching, what lacks evidence, and what appears inconsistent.
- Deepen Echoes into live passages with explicit editing scope.
- Add constrained Constellation and Map Readings where they materially improve research and place-based planning.
- Allow authored patterns to be reused privately without creating an app/template marketplace.
- Bring compatible experiences to mobile: capture Marks, review Readings, follow Source Trails, and perform small semantic edits. Advanced Reading composition remains a large-screen task until a genuinely native touch model exists.
- Mature shared vocabularies for teams while keeping personal and local-first work first-class.

**Exit criterion:** A user can understand a changing area of life or work by opening its primary document, with no manually maintained dashboard elsewhere.

# UX Principles

## Interaction states

Every living element has four levels:

1. **Rest:** Nearly indistinguishable from beautiful writing. Meaning appears through a restrained underline, tint, or typographic nuance.
2. **Notice:** Hover, caret proximity, or keyboard focus reveals kind and connection without moving layout.
3. **Act:** Selection opens a compact action surface with the most likely transformations.
4. **Shape:** Complex manipulation enters a temporary Frame with more room and explicit consequences.

The interface must never display Shape-level controls in Rest.

## Editing

Source text remains editable as text. If an edit changes a Mark’s meaning, Skriuw previews the semantic change: “€840” becoming “about €900” updates the amount and adds uncertainty; deleting the fragment removes or detaches the Mark after a reversible confirmation.

Editing a Reading does not silently rewrite prose. Changes fall into clear categories:

- **Presentation changes** affect only this Reading: order, density, emphasis, visual form.
- **Meaning changes** affect the source: date, amount, state, relationship.
- **Scope changes** affect what the Reading gathers.

The UI names the category before applying consequential changes.

## Layout

The document column remains the visual anchor. Readings may widen beyond prose on desktop and web, but their left edge remains aligned with the document rhythm. Wide Readings should feel like opening a map on a writing desk, not navigating to an analytics application.

A Reading begins compact. It earns height through content. Empty states teach with one concrete action, never a gallery of templates.

Side panels are for source inspection, vocabulary, and focus—not permanent property administration. The inspector should answer “What does this mean?”, “Where else is it used?”, and “What will change?”

## Motion

Motion explains continuity and causality.

- Creating a Mark gently settles meaning onto the selected text; it does not celebrate.
- Opening a Source Trail visually connects result to source before moving focus.
- Changing a Moment moves an item along its Path with a short, interruptible transition.
- Updating a Derivation crossfades the changed value and briefly identifies the input responsible.
- Entering a Frame expands from the Reading’s position; closing returns to that position.

Use fast, ease-out motion for direct manipulation and slower, subtle transitions for layout changes. Respect reduced-motion preferences. Never animate routine typing, autosave, or background recalculation.

## Navigation and hierarchy

Documents remain primary in navigation. Threads are discovered through search, backlinks, the graph, and document context before they become an optional navigable layer. Readings do not create a new top-level “databases” area.

The command palette understands intent:

- “Mark as amount”
- “Gather launch commitments”
- “Read as timeline”
- “Show sources”
- “Ask what remains”

Search can progressively narrow by meaning using plain phrases: “amounts in Japan notes,” “commitments waiting on Maya,” “things due next month.” Visible tokens show Skriuw’s interpretation and can be removed individually.

## Discoverability

Power appears through three paths:

- Selection actions for first use
- Slash commands for deliberate insertion
- Command palette for keyboard fluency

Recognition suggestions are sparse, local to the sentence, and disappear after repeated dismissal. Skriuw may say “2 dates and 3 amounts found” at the edge of a block; it should not underline every recognizable entity like a grammar checker.

Readings begin from questions, not a view gallery. “What are you trying to see?” offers a small set of intents: sequence over time, compare choices, understand a balance, follow progress, see relationships. The resulting form is always changeable.

## Keyboard interactions

- Selection followed by a configurable shortcut opens Mark actions.
- Typing familiar symbols such as `@`, `#`, and `$` continues to support Skriuw’s current inline linking vocabulary; new semantics should extend rather than break muscle memory.
- Slash commands insert Readings and Derivations.
- `Tab` moves through semantic parts inside a focused Reading; normal document tab behavior resumes at its boundary.
- Arrow keys move spatially only when a Reading is explicitly focused. `Escape` returns to document flow.
- Every drag operation has “Move,” “Group,” “Connect,” and “Reorder” command equivalents.
- Source Trails open in a reversible peek first; a second action navigates fully.
- Undo treats a semantic action as one understandable step, including any affected live appearances.

Keyboard behavior must integrate with Skriuw’s existing configurable shortcut registry rather than form a separate subsystem.

## Mouse and trackpad interactions

- Hover reveals, never rearranges.
- Drag begins only from an explicit handle or sustained movement, not text selection.
- Drop targets state the semantic consequence in words before release.
- Clicking an aggregate opens its composition, not a settings dialog.
- Trackpad pinch may adjust temporal density in a Path or relationship distance in a Constellation, with visible controls providing parity.
- Context menus remain short and ranked by local intent.

## Touch interactions

Touch principles are defined now even though mobile implementation is deferred.

- Tap focuses; a second tap reveals meaning; long press opens actions.
- Marks have generous invisible hit areas without visually enlarging prose.
- Readings default to a linear card or list form on narrow screens.
- Horizontal gestures never compete with system navigation or text selection.
- Complex spatial shaping is not compressed onto a phone. Mobile prioritizes capture, review, state changes, date changes, and following Source Trails.
- Tablets may eventually support Frame-level composition once keyboard, pointer, and touch coexist gracefully.

Shared semantics must never encode pixel position as meaning. A grouping created spatially on desktop must have a named, ordered representation that mobile can render and edit.

## AI interactions

AI never arrives as a permanent chat sidebar. It appears at points of intent:

- “Mark what looks important”
- “What could these belong to?”
- “Turn my question into a live answer”
- “Explain why this changed”
- “Draft a brief from these sources”

Before accepting an AI-created structure, users see affected sources and the proposed interpretation. Bulk proposals support accept, adjust, and dismiss by group. Content sent to a remote provider is clearly disclosed; desktop offers local processing where available. Disabling AI leaves the Mark–Thread–Reading system complete.

## Error, uncertainty, and freshness

Living information must fail visibly and calmly.

- Missing inputs show “Waiting for 2 amounts,” not zero.
- Conflicting Marks show both sources and ask which meaning should lead.
- Stale generated prose identifies the sources changed since generation.
- Broken Echoes preserve the last known appearance with a clear detached state.
- Approximate values remain approximate in totals and comparisons.
- Recalculation never steals focus or shifts the page unexpectedly.

# Things We Will Never Build

- An infinite spreadsheet grid
- Cell addresses, fill handles, or formula syntax modeled on spreadsheets
- A “database” product area with tables, rows, columns, and records
- Notion-style page databases disguised with different terminology
- A generic kanban board with status columns as the default model of work
- A Gantt chart with enterprise resource planning and critical-path machinery
- An accounting ledger, bank-sync product, tax tool, or financial institution
- A general-purpose BI dashboard builder
- A low-code application builder with buttons, forms, scripts, and arbitrary automations
- A plugin runtime that delegates core product coherence to third parties
- A marketplace of elaborate templates pretending to be finished systems
- Mandatory AI for marking, calculation, gathering, or visualization
- Silent AI classification or workspace reorganization
- Generated answers without visible sources and uncertainty
- A universal inbox that competes with notes and journal
- A canvas that lets authored documents dissolve into spatial clutter
- A graph visualization treated as the product rather than a navigation aid
- A social feed, engagement loop, or gamified productivity score
- A notification center that manufactures urgency
- Cloud-only core semantics that weaken desktop’s local-first promise
- Desktop and web product languages that diverge by storage backend
- A miniature desktop composer forced onto mobile before a native touch model exists
- Proprietary export that makes user writing unintelligible elsewhere
- Configuration as a prerequisite for writing
- Structure for its own sake

# Five Year Vision

By 2031, people should no longer accept that writing and structured information require separate tools.

A founder opens the company narrative and sees current runway, open commitments, customer signals, and the assumptions behind them—not because somebody maintained a dashboard, but because the documents where the company thinks are alive. A family plans a move in one document where neighborhoods, costs, dates, uncertainties, and decisions remain connected. A researcher traces a conclusion through claims to exact source passages. A person understands five years of journal patterns without surrendering those entries to a cloud service.

The cultural change is larger than convenience. Structured work becomes authorable by more people. A budget is no longer a mysterious file owned by its formula expert. A project plan no longer strips decisions from their reasons. A metric no longer appears without evidence. People can challenge an answer because they can follow its trail.

Skriuw becomes known for one idea: **information should not have to leave language to become useful.**

The product remains recognizably a writing application. Open it and there is still a quiet page, a cursor, and room to think. But beneath that calm surface, words can carry durable meaning. Meaning can travel without copying. Questions can remain live. Visuals can emerge from the story and return to it. Calculation can become invisible without becoming unaccountable.

Desktop is the private, durable home for people who want full ownership and offline intelligence. Web is the accessible, connected home for work across devices and collaborators. Mobile becomes the intimate edge for capture and review. All three speak the same semantic language because Marks, Threads, Readings, Derivations, and Echoes belong to the domain—not to a screen size or storage system.

Skriuw should not win by containing every tool. It should win by making many tools unnecessary for the ordinary structured work that surrounds human thought.

That is the decade-long direction: not documents with databases attached, but documents that understand what they contain—and remain, above all, humane places to write.
