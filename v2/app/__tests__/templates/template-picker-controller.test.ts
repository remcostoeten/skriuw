import assert from "node:assert/strict";
import test from "node:test";
import {
  registerTemplatePicker,
  requestTemplatePicker,
  type TemplatePickerRequest,
} from "../../src/templates/template-picker-controller";

test("delivers requests to the registered listener", () => {
  const received: TemplatePickerRequest[] = [];
  const unregister = registerTemplatePicker((request) => received.push(request));

  requestTemplatePicker("folder-1");
  requestTemplatePicker(null);

  assert.deepEqual(received, [{ parentId: "folder-1" }, { parentId: null }]);
  unregister();
});

test("queues a request made before the host mounts and replays it once", () => {
  requestTemplatePicker("folder-2");

  const received: TemplatePickerRequest[] = [];
  const unregister = registerTemplatePicker((request) => received.push(request));
  assert.deepEqual(received, [{ parentId: "folder-2" }]);

  unregister();
  const late: TemplatePickerRequest[] = [];
  const unregisterLate = registerTemplatePicker((request) => late.push(request));
  assert.deepEqual(late, [], "a delivered request is not replayed twice");
  unregisterLate();
});

test("unregistering stops delivery and later requests queue again", () => {
  const received: TemplatePickerRequest[] = [];
  const unregister = registerTemplatePicker((request) => received.push(request));
  unregister();

  requestTemplatePicker(null);
  assert.deepEqual(received, []);

  const next: TemplatePickerRequest[] = [];
  const unregisterNext = registerTemplatePicker((request) => next.push(request));
  assert.deepEqual(next, [{ parentId: null }]);
  unregisterNext();
});

test("a stale unregister does not detach a newer listener", () => {
  const first: TemplatePickerRequest[] = [];
  const unregisterFirst = registerTemplatePicker((request) => first.push(request));

  const second: TemplatePickerRequest[] = [];
  const unregisterSecond = registerTemplatePicker((request) => second.push(request));

  unregisterFirst();
  requestTemplatePicker("folder-3");

  assert.deepEqual(first, []);
  assert.deepEqual(second, [{ parentId: "folder-3" }]);
  unregisterSecond();
});
