import type { ValidationContext, RobotSpec } from "../sim/types";
import { validateSpec, type ValidationResult, type ValidationIssue } from "../sim/specValidator";

export interface BuilderPanelOptions {
  root: HTMLElement;
  validationCtx: ValidationContext;
  slotCount: number;
  slotLabel: (index: number) => string;
  getSpecText: (index: number) => string;
  onApply: (index: number, spec: RobotSpec) => void;
  postApplyIssues?: (index: number) => ValidationIssue[];
}

export class RobotBuilderPanel {
  private container: HTMLDivElement;
  private tabsEl: HTMLDivElement;
  private textarea: HTMLTextAreaElement;
  private issuesEl: HTMLDivElement;
  private activeSlot = 0;

  constructor(private opts: BuilderPanelOptions) {
    this.container = document.createElement("div");
    this.container.id = "builder-panel";
    this.container.hidden = true;
    opts.root.appendChild(this.container);

    const header = document.createElement("div");
    header.className = "builder-header";
    header.innerHTML = `<h3>Robot Builder</h3>`;
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.className = "builder-close";
    closeBtn.addEventListener("click", () => this.close());
    header.appendChild(closeBtn);
    this.container.appendChild(header);

    this.tabsEl = document.createElement("div");
    this.tabsEl.className = "builder-tabs";
    this.container.appendChild(this.tabsEl);

    this.textarea = document.createElement("textarea");
    this.textarea.spellcheck = false;
    this.textarea.className = "builder-json";
    this.container.appendChild(this.textarea);

    const actions = document.createElement("div");
    actions.className = "builder-actions";
    const mkBtn = (label: string, fn: () => void, cls = "") => {
      const b = document.createElement("button");
      b.textContent = label;
      if (cls) b.classList.add(cls);
      b.addEventListener("click", fn);
      actions.appendChild(b);
      return b;
    };
    mkBtn("Validate", () => this.runValidation());
    mkBtn("Apply ▶", () => this.apply(), "primary");
    mkBtn("Download", () => this.download());
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.hidden = true;
    fileInput.addEventListener("change", () => this.loadFile(fileInput));
    this.container.appendChild(fileInput);
    mkBtn("Load File", () => fileInput.click());
    this.container.appendChild(actions);

    this.issuesEl = document.createElement("div");
    this.issuesEl.className = "builder-issues";
    this.container.appendChild(this.issuesEl);

    this.renderTabs();
  }

  private renderTabs(): void {
    this.tabsEl.innerHTML = "";
    for (let i = 0; i < this.opts.slotCount; i++) {
      const tab = document.createElement("button");
      tab.textContent = this.opts.slotLabel(i);
      tab.classList.toggle("active", i === this.activeSlot);
      tab.addEventListener("click", () => this.selectSlot(i));
      this.tabsEl.appendChild(tab);
    }
  }

  selectSlot(index: number): void {
    this.activeSlot = index;
    this.textarea.value = this.opts.getSpecText(index);
    this.issuesEl.innerHTML = '<span class="muted">Edit JSON, then Validate or Apply.</span>';
    this.renderTabs();
  }

  open(index?: number): void {
    if (index !== undefined && index !== this.activeSlot) this.selectSlot(index);
    else if (this.container.hidden && this.textarea.value === "") this.selectSlot(this.activeSlot);
    this.container.hidden = false;
  }

  close(): void {
    this.container.hidden = true;
  }

  toggle(index?: number): void {
    if (this.container.hidden) this.open(index);
    else this.close();
  }

  isOpen(): boolean {
    return !this.container.hidden;
  }

  private runValidation(): ValidationResult | null {
    let raw: unknown;
    try {
      raw = JSON.parse(this.textarea.value);
    } catch (e) {
      this.showIssues([{ level: "error", field: "JSON", message: `Parse error: ${(e as Error).message}` }]);
      return null;
    }
    const result = validateSpec(raw, this.opts.validationCtx);
    this.showIssues(
      result.issues.length > 0
        ? result.issues
        : [{ level: "warning", field: "", message: result.spec ? "Valid ✔ — ready to Apply" : "" }],
    );
    return result;
  }

  private apply(): void {
    const result = this.runValidation();
    if (!result?.spec) return;
    this.opts.onApply(this.activeSlot, result.spec);
    const extra = this.opts.postApplyIssues?.(this.activeSlot) ?? [];
    this.showIssues(
      extra.length > 0
        ? [{ level: "warning", field: "", message: "Applied & respawned ✔" }, ...extra]
        : [],
    );
    if (extra.length === 0) {
      this.issuesEl.innerHTML = '<span class="ok">Applied & respawned ✔</span>';
    }
  }

  showIssues(issues: ValidationIssue[]): void {
    this.issuesEl.innerHTML = "";
    for (const issue of issues) {
      const div = document.createElement("div");
      div.className = issue.level === "error" ? "err" : "warn";
      div.textContent = `${issue.level === "error" ? "✖" : "⚠"} [${issue.field}] ${issue.message}`;
      this.issuesEl.appendChild(div);
    }
    if (issues.length === 0) {
      this.issuesEl.innerHTML = '<span class="ok">Valid ✔ — ready to Apply</span>';
    }
  }

  private download(): void {
    const blob = new Blob([this.textarea.value], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    let name = "robot";
    try {
      name = String(JSON.parse(this.textarea.value)?.name ?? name).replace(/\s+/g, "-").toLowerCase();
    } catch {
      void 0;
    }
    a.href = url;
    a.download = `${name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private loadFile(input: HTMLInputElement): void {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.textarea.value = String(reader.result ?? "");
      this.runValidation();
    };
    reader.readAsText(file);
    input.value = "";
  }
}
