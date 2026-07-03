"use client"

import { useState } from "react"
import {
  GroupLabel,
  Row,
  SectionHeader,
  SettingsButton,
  SettingsCard,
  SettingsInput,
  SettingsSelect,
  Toggle,
} from "../primitives"

export function AiSection() {
  const [enabled, setEnabled] = useState(true)
  const [provider, setProvider] = useState("gateway")
  const [apiKey, setApiKey] = useState("")
  const [saved, setSaved] = useState(false)
  const [inlineSuggestions, setInlineSuggestions] = useState(true)
  const [autoTags, setAutoTags] = useState(false)

  return (
    <div>
      <SectionHeader title="AI" description="Assistant provider, keys, and writing features." />

      <GroupLabel>Assistant</GroupLabel>
      <SettingsCard>
        <Row title="Enable AI assistant" description="Show the sparkles button in the toolbar and slash menu commands.">
          <Toggle checked={enabled} onChange={setEnabled} label="Enable AI assistant" />
        </Row>
        <Row title="Provider" description="Where completions are generated." disabled={!enabled}>
          <SettingsSelect
            value={provider}
            onChange={setProvider}
            ariaLabel="AI provider"
            className="w-40"
            options={[
              { value: "gateway", label: "Vercel AI Gateway" },
              { value: "openai", label: "OpenAI" },
              { value: "anthropic", label: "Anthropic" },
              { value: "local", label: "Local model" },
            ]}
          />
        </Row>
        <Row
          title="API key"
          description="Stored encrypted, only used server-side. Leave empty to use the workspace default."
          disabled={!enabled}
        >
          <div className="flex items-center gap-2">
            <SettingsInput
              type="password"
              value={apiKey}
              onChange={(v) => {
                setApiKey(v)
                setSaved(false)
              }}
              placeholder="sk-…"
              ariaLabel="API key"
              className="w-44"
            />
            <SettingsButton variant="primary" disabled={apiKey.length === 0 || saved} onClick={() => setSaved(true)}>
              {saved ? "Saved" : "Save"}
            </SettingsButton>
          </div>
        </Row>
      </SettingsCard>

      <GroupLabel>Writing features</GroupLabel>
      <SettingsCard>
        <Row
          title="Inline suggestions"
          description="Ghost-text completions while you type. Accept with Tab."
          disabled={!enabled}
        >
          <Toggle checked={inlineSuggestions} onChange={setInlineSuggestions} label="Inline suggestions" />
        </Row>
        <Row
          title="Suggest tags automatically"
          description="Propose tags for a note based on its content when you save."
          disabled={!enabled}
        >
          <Toggle checked={autoTags} onChange={setAutoTags} label="Suggest tags automatically" />
        </Row>
      </SettingsCard>
    </div>
  )
}
