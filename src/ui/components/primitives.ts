export interface ButtonOptions {
  label: string;
  id?: string;
  className?: string;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
  title?: string;
  ariaPressed?: boolean;
  onClick?: (e: MouseEvent) => void;
}

export function createButton(opts: ButtonOptions): HTMLButtonElement {
  const btn = document.createElement("button");
  if (opts.id) btn.id = opts.id;
  btn.className = `control-btn ${opts.className ?? ""}`.trim();
  if (opts.variant === "primary") btn.classList.add("primary");
  if (opts.variant === "danger") btn.classList.add("danger");

  btn.textContent = opts.label; // Secure against HTML injection
  if (opts.disabled !== undefined) btn.disabled = opts.disabled;
  if (opts.title) btn.title = opts.title;
  if (opts.ariaPressed !== undefined) {
    btn.setAttribute("aria-pressed", String(opts.ariaPressed));
  }
  if (opts.onClick) {
    btn.addEventListener("click", opts.onClick);
  }
  return btn;
}

export interface StatusPillOptions {
  text: string;
  status?: "success" | "error" | "warning" | "idle";
}

export function createStatusPill(opts: StatusPillOptions): HTMLSpanElement {
  const pill = document.createElement("span");
  pill.className = `status-pill ${opts.status ?? "idle"}`;
  pill.textContent = opts.text; // Text node only
  return pill;
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export function createSegmentedControl<T extends string>(
  options: SegmentOption<T>[],
  activeValue: T,
  onChange: (value: T) => void,
): HTMLDivElement {
  const container = document.createElement("div");
  container.className = "segmented-control";
  container.setAttribute("role", "radiogroup");

  for (const opt of options) {
    const btn = document.createElement("button");
    btn.className = "seg-btn";
    btn.textContent = opt.label;
    btn.setAttribute("role", "radio");
    const isActive = opt.value === activeValue;
    btn.setAttribute("aria-checked", String(isActive));
    if (isActive) btn.classList.add("active");

    btn.addEventListener("click", () => {
      container.querySelectorAll(".seg-btn").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-checked", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-checked", "true");
      onChange(opt.value);
    });

    container.appendChild(btn);
  }

  return container;
}
