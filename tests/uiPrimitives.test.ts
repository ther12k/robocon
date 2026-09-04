import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createButton, createStatusPill, createSegmentedControl } from "../src/ui/components/primitives";

class MockElement {
  tagName: string;
  id = "";
  className = "";
  textContent = "";
  disabled = false;
  title = "";
  attributes = new Map<string, string>();
  listeners = new Map<string, Array<(e?: unknown) => void>>();
  children: MockElement[] = [];

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get innerHTML(): string {
    return this.textContent
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  get classList() {
    return {
      add: (...classes: string[]) => {
        const set = new Set(this.className.split(" ").filter(Boolean));
        classes.forEach((c) => set.add(c));
        this.className = [...set].join(" ");
      },
      remove: (...classes: string[]) => {
        const set = new Set(this.className.split(" ").filter(Boolean));
        classes.forEach((c) => set.delete(c));
        this.className = [...set].join(" ");
      },
      contains: (c: string) => this.className.split(" ").includes(c),
      toggle: (c: string, force?: boolean) => {
        const has = this.classList.contains(c);
        const shouldHave = force !== undefined ? force : !has;
        if (shouldHave) this.classList.add(c);
        else this.classList.remove(c);
      },
    };
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(event: string, fn: (e?: unknown) => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push(fn);
    this.listeners.set(event, list);
  }

  appendChild(child: MockElement): void {
    this.children.push(child);
  }

  click(): void {
    const list = this.listeners.get("click") ?? [];
    for (const fn of list) fn({ target: this });
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const match = (el: MockElement) => {
      if (selector === "button" && el.tagName === "BUTTON") results.push(el);
      else if (selector.startsWith(".") && el.classList.contains(selector.slice(1))) results.push(el);
      for (const child of el.children) match(child);
    };
    match(this);
    return results;
  }
}

describe("UI Primitives (RUI-009)", () => {
  beforeAll(() => {
    (globalThis as unknown as { document: unknown }).document = {
      createElement: (tag: string) => new MockElement(tag),
    };
  });

  afterAll(() => {
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  it("creates accessible button with safe textContent and attributes", () => {
    const malicious = '<img src=x onerror="alert(1)">';
    const btn = createButton({
      label: malicious,
      id: "test-btn",
      ariaPressed: true,
      disabled: false,
    });

    expect(btn.id).toBe("test-btn");
    expect(btn.textContent).toBe(malicious);
    expect(btn.innerHTML).not.toContain("<img");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.disabled).toBe(false);
  });

  it("creates status pill with text rendering and status class", () => {
    const pill = createStatusPill({
      text: "Running",
      status: "success",
    });

    expect(pill.textContent).toBe("Running");
    expect(pill.classList.contains("success")).toBe(true);
    expect(pill.classList.contains("status-pill")).toBe(true);
  });

  it("creates segmented control and updates aria-checked on selection", () => {
    let selected = "3D";
    const seg = createSegmentedControl(
      [
        { value: "3D", label: "3D View" },
        { value: "top", label: "Top View" },
      ],
      "3D",
      (val) => (selected = val),
    );

    const buttons = seg.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    expect(buttons[0].getAttribute("aria-checked")).toBe("true");
    expect(buttons[1].getAttribute("aria-checked")).toBe("false");

    buttons[1].click();
    expect(selected).toBe("top");
    expect(buttons[0].getAttribute("aria-checked")).toBe("false");
    expect(buttons[1].getAttribute("aria-checked")).toBe("true");
  });
});
