// Flexible typed property system for Skriuw note intros.
// A note's "intro" is the band between the H1 title and the body.
// It holds tag chips plus a list of typed properties (Notion-style).

export type PropertyType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "multi-select"
  | "person"
  | "url"
  | "checkbox"
  | "rating"
  | "location"
  | "email"
  | "phone"

// Subtle, low-chroma tag palette that reads well on a near-black canvas.
// Avoids purple/violet per design constraints.
export type TagColor =
  | "gray"
  | "stone"
  | "amber"
  | "green"
  | "blue"
  | "teal"
  | "rose"
  | "red"

export const TAG_COLORS: Record<TagColor, { bg: string; fg: string; dot: string }> = {
  gray: { bg: "oklch(0.32 0 0)", fg: "oklch(0.88 0 0)", dot: "oklch(0.7 0 0)" },
  stone: { bg: "oklch(0.34 0.015 70)", fg: "oklch(0.9 0.02 70)", dot: "oklch(0.74 0.04 70)" },
  amber: { bg: "oklch(0.36 0.06 75)", fg: "oklch(0.9 0.08 85)", dot: "oklch(0.8 0.12 80)" },
  green: { bg: "oklch(0.34 0.05 150)", fg: "oklch(0.9 0.07 150)", dot: "oklch(0.78 0.13 150)" },
  blue: { bg: "oklch(0.36 0.06 250)", fg: "oklch(0.9 0.06 250)", dot: "oklch(0.78 0.12 250)" },
  teal: { bg: "oklch(0.35 0.05 195)", fg: "oklch(0.9 0.06 195)", dot: "oklch(0.78 0.1 195)" },
  rose: { bg: "oklch(0.36 0.06 10)", fg: "oklch(0.9 0.06 10)", dot: "oklch(0.78 0.13 10)" },
  red: { bg: "oklch(0.36 0.08 25)", fg: "oklch(0.9 0.08 25)", dot: "oklch(0.78 0.16 25)" },
}

export const TAG_COLOR_KEYS = Object.keys(TAG_COLORS) as TagColor[]

export interface SelectOption {
  id: string
  label: string
  color: TagColor
}

export interface Person {
  id: string
  name: string
  color: TagColor
}

// The stored value depends on the property type.
// text/url/location/email/phone -> string
// number/rating -> number
// date -> ISO date string
// checkbox -> boolean
// select -> option id
// multi-select -> option id[]
// person -> person id[]
export type PropertyValue = string | number | boolean | string[] | null

export interface Property {
  id: string
  type: PropertyType
  name: string
  value: PropertyValue
  // For select / multi-select
  options?: SelectOption[]
}

export interface PropertyTypeMeta {
  type: PropertyType
  label: string
  description: string
}

export const PROPERTY_TYPES: PropertyTypeMeta[] = [
  { type: "text", label: "Text", description: "A short note or sentence" },
  { type: "number", label: "Number", description: "Counts, amounts, IDs" },
  { type: "date", label: "Date", description: "A day or deadline" },
  { type: "select", label: "Select", description: "One option from a list" },
  { type: "multi-select", label: "Multi-select", description: "Several options or labels" },
  { type: "person", label: "Person", description: "People, authors, attendees" },
  { type: "url", label: "URL", description: "A link to a source" },
  { type: "checkbox", label: "Checkbox", description: "A yes / no toggle" },
  { type: "rating", label: "Rating", description: "Stars out of five" },
  { type: "location", label: "Location", description: "A place or address" },
  { type: "email", label: "Email", description: "An email address" },
  { type: "phone", label: "Phone", description: "A phone number" },
]

let counter = 0
export function uid(prefix = "id"): string {
  counter += 1
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}_${Date.now().toString(36)}_${counter}`
}

export function emptyValueFor(type: PropertyType): PropertyValue {
  switch (type) {
    case "checkbox":
      return false
    case "number":
    case "rating":
      return null
    case "multi-select":
    case "person":
      return []
    default:
      return ""
  }
}

function opt(label: string, color: TagColor): SelectOption {
  return { id: uid("opt"), label, color }
}

// Shared person directory for the prototype.
export const DIRECTORY: Person[] = [
  { id: "p_anne", name: "Anne de Vries", color: "blue" },
  { id: "p_jan", name: "Jan Bakker", color: "green" },
  { id: "p_remco", name: "Remco", color: "amber" },
  { id: "p_daphne", name: "Daphne", color: "rose" },
  { id: "p_sam", name: "Sam", color: "teal" },
]

export interface Template {
  id: string
  name: string
  description: string
  tags: string[]
  build: () => Property[]
}

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Blank",
    description: "Just a title and body. Add properties as you go.",
    tags: [],
    build: () => [],
  },
  {
    id: "meeting",
    name: "Meeting",
    description: "Date, attendees and an outcome.",
    tags: ["meeting"],
    build: () => [
      { id: uid("prop"), type: "date", name: "Date", value: new Date().toISOString().slice(0, 10) },
      { id: uid("prop"), type: "person", name: "Attendees", value: ["p_anne", "p_jan"] },
      {
        id: uid("prop"),
        type: "select",
        name: "Status",
        value: null,
        options: [opt("Scheduled", "blue"), opt("In progress", "amber"), opt("Done", "green")],
      },
      { id: uid("prop"), type: "location", name: "Location", value: "" },
    ],
  },
  {
    id: "project",
    name: "Project",
    description: "Track status, owner and a deadline.",
    tags: ["project"],
    build: () => [
      {
        id: uid("prop"),
        type: "select",
        name: "Status",
        value: null,
        options: [
          opt("Backlog", "gray"),
          opt("Planned", "blue"),
          opt("Active", "amber"),
          opt("Shipped", "green"),
        ],
      },
      {
        id: uid("prop"),
        type: "select",
        name: "Priority",
        value: null,
        options: [opt("Low", "gray"), opt("Medium", "amber"), opt("High", "red")],
      },
      { id: uid("prop"), type: "person", name: "Owner", value: [] },
      { id: uid("prop"), type: "date", name: "Due", value: "" },
      {
        id: uid("prop"),
        type: "multi-select",
        name: "Tags",
        value: [],
        options: [opt("frontend", "teal"), opt("research", "blue"), opt("urgent", "red")],
      },
      { id: uid("prop"), type: "url", name: "Link", value: "" },
    ],
  },
  {
    id: "person",
    name: "Contact",
    description: "Keep a person's details in one place.",
    tags: ["contact"],
    build: () => [
      { id: uid("prop"), type: "email", name: "Email", value: "" },
      { id: uid("prop"), type: "phone", name: "Phone", value: "" },
      { id: uid("prop"), type: "text", name: "Company", value: "" },
      { id: uid("prop"), type: "location", name: "Location", value: "" },
    ],
  },
  {
    id: "journal",
    name: "Journal",
    description: "A dated entry with mood and energy.",
    tags: ["journal"],
    build: () => [
      { id: uid("prop"), type: "date", name: "Date", value: new Date().toISOString().slice(0, 10) },
      {
        id: uid("prop"),
        type: "select",
        name: "Mood",
        value: null,
        options: [
          opt("Great", "green"),
          opt("Good", "teal"),
          opt("Okay", "amber"),
          opt("Low", "rose"),
        ],
      },
      { id: uid("prop"), type: "rating", name: "Energy", value: null },
    ],
  },
  {
    id: "idea",
    name: "Idea",
    description: "Capture and triage a raw idea.",
    tags: ["draft", "idea"],
    build: () => [
      {
        id: uid("prop"),
        type: "select",
        name: "Status",
        value: null,
        options: [opt("Draft", "gray"), opt("Exploring", "blue"), opt("Shipped", "green")],
      },
      {
        id: uid("prop"),
        type: "select",
        name: "Category",
        value: null,
        options: [opt("Product", "teal"), opt("Writing", "amber"), opt("Personal", "rose")],
      },
      {
        id: uid("prop"),
        type: "select",
        name: "Priority",
        value: null,
        options: [opt("Low", "gray"), opt("Medium", "amber"), opt("High", "red")],
      },
      {
        id: uid("prop"),
        type: "multi-select",
        name: "Tags",
        value: [],
        options: [opt("quick-win", "green"), opt("moonshot", "blue")],
      },
    ],
  },
  {
    id: "reading",
    name: "Reading",
    description: "A source with author, link and rating.",
    tags: ["reading"],
    build: () => [
      { id: uid("prop"), type: "text", name: "Author", value: "" },
      { id: uid("prop"), type: "url", name: "Source", value: "" },
      { id: uid("prop"), type: "rating", name: "Rating", value: null },
      {
        id: uid("prop"),
        type: "select",
        name: "Status",
        value: null,
        options: [opt("To read", "gray"), opt("Reading", "amber"), opt("Read", "green")],
      },
    ],
  },
]
