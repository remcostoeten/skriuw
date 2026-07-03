"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { AnimatedList } from "../animated-list"
import {
  GroupLabel,
  Row,
  SectionHeader,
  SettingsButton,
  SettingsCard,
  SettingsInput,
  Toggle,
} from "../primitives"

type WorkspaceTag = { id: string; name: string; count: number }

const INITIAL_TAGS: WorkspaceTag[] = [
  { id: "t1", name: "getting-started", count: 2 },
  { id: "t2", name: "tag", count: 3 },
  { id: "t3", name: "planning", count: 1 },
  { id: "t4", name: "journal", count: 4 },
]

export function TagsSection() {
  const [tags, setTags] = useState(INITIAL_TAGS)
  const [newTag, setNewTag] = useState("")
  const [nestedTags, setNestedTags] = useState(true)
  const [showCounts, setShowCounts] = useState(true)

  function addTag() {
    const name = newTag.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-")
    if (!name || tags.some((t) => t.name === name)) return
    setTags((t) => [...t, { id: `t${Date.now()}`, name, count: 0 }])
    setNewTag("")
  }

  return (
    <div>
      <SectionHeader title="Tags" description="Manage the tags used across your workspace." />

      <GroupLabel>Behavior</GroupLabel>
      <SettingsCard>
        <Row title="Nested tags" description="Treat #project/skriuw as a child of #project in the tag browser.">
          <Toggle checked={nestedTags} onChange={setNestedTags} label="Nested tags" />
        </Row>
        <Row title="Show note counts" description="Display how many notes use each tag in the inspector.">
          <Toggle checked={showCounts} onChange={setShowCounts} label="Show note counts" />
        </Row>
      </SettingsCard>

      <GroupLabel>Workspace tags</GroupLabel>
      <SettingsCard>
        <Row title="Create tag" description="Tags are lowercase; spaces become dashes.">
          <div className="flex items-center gap-2">
            <SettingsInput
              value={newTag}
              onChange={setNewTag}
              placeholder="new-tag"
              ariaLabel="New tag name"
              className="w-36"
              onKeyDown={(e) => {
                if (e.key === "Enter") addTag()
              }}
            />
            <SettingsButton icon={<Plus className="h-3.5 w-3.5" />} onClick={addTag} disabled={newTag.trim().length === 0}>
              Add
            </SettingsButton>
          </div>
        </Row>
        <AnimatedList
          items={tags}
          className="divide-y divide-[var(--border)]/50"
          renderItem={(tag) => (
            <Row
              title={`#${tag.name}`}
              description={showCounts ? `${tag.count} note${tag.count === 1 ? "" : "s"}` : undefined}
            >
              <SettingsButton
                variant="destructive"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => setTags((t) => t.filter((x) => x.id !== tag.id))}
              >
                Delete
              </SettingsButton>
            </Row>
          )}
        />
      </SettingsCard>
    </div>
  )
}
