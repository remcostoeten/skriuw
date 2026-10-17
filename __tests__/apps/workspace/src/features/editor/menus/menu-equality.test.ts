import assert from "node:assert/strict";
import { test } from "vitest";
import {
  annotationMenuStateEqual,
  closedAnnotationMenu,
  type AnnotationMenuState,
} from "@/features/editor/annotations/menu";
import {
  closedLinkMenu,
  linkMenuStateEqual,
  type LinkMenuState,
} from "@/features/editor/links/menu";

const openLink: LinkMenuState = {
  open: true,
  editing: false,
  source: "caret",
  href: "https://example.com",
  from: 4,
  to: 16,
  x: 240,
  y: 120,
  below: false,
};

const openAnnotation: AnnotationMenuState = {
  open: true,
  composing: false,
  focusComposer: false,
  source: "caret",
  threadId: "thread-1",
  from: 4,
  to: 16,
  x: 240,
  y: 120,
  below: false,
};

test("link menu states with the same fields are equal", () => {
  assert.equal(linkMenuStateEqual(openLink, { ...openLink }), true);
  assert.equal(linkMenuStateEqual(closedLinkMenu, { ...closedLinkMenu }), true);
});

test("a link menu state differing in any one field is not equal", () => {
  const changes: Partial<LinkMenuState>[] = [
    { open: false },
    { editing: true },
    { source: "hover" },
    { href: "https://example.org" },
    { from: 5 },
    { to: 17 },
    { x: 241 },
    { y: 121 },
    { below: true },
  ];
  for (const change of changes) {
    assert.equal(linkMenuStateEqual(openLink, { ...openLink, ...change }), false);
  }
});

test("annotation menu states with the same fields are equal", () => {
  assert.equal(annotationMenuStateEqual(openAnnotation, { ...openAnnotation }), true);
  assert.equal(annotationMenuStateEqual(closedAnnotationMenu, { ...closedAnnotationMenu }), true);
});

test("an annotation menu state differing in any one field is not equal", () => {
  const changes: Partial<AnnotationMenuState>[] = [
    { open: false },
    { composing: true },
    { focusComposer: true },
    { source: "hover" },
    { threadId: "thread-2" },
    { from: 5 },
    { to: 17 },
    { x: 241 },
    { y: 121 },
    { below: true },
  ];
  for (const change of changes) {
    assert.equal(annotationMenuStateEqual(openAnnotation, { ...openAnnotation, ...change }), false);
  }
});
