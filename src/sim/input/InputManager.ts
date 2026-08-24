export type InputContext = "simulation" | "ui";

const EDITABLE = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function targetIsEditable(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return EDITABLE.has(t.tagName) || t.isContentEditable === true;
}

export class InputManager {
  private keys = new Set<string>();
  private contextValue: InputContext = "simulation";
  private tabPressed = false;

  constructor() {
    window.addEventListener("keydown", (e) => this.onKey(e, true));
    window.addEventListener("keyup", (e) => this.onKey(e, false));
    window.addEventListener("blur", () => this.keys.clear());
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (targetIsEditable(e)) {
      if (down) this.keys.delete(e.code);
      return;
    }
    if (this.contextValue !== "simulation") {
      if (down) this.keys.delete(e.code);
      return;
    }
    if (e.code === "Tab") {
      e.preventDefault();
      if (down && !e.repeat) this.tabPressed = true;
      return;
    }
    if (down) {
      if (!e.repeat) this.keys.add(e.code);
    } else {
      this.keys.delete(e.code);
    }
  }

  get context(): InputContext {
    return this.contextValue;
  }

  setContext(ctx: InputContext): void {
    if (this.contextValue === ctx) return;
    this.contextValue = ctx;
    this.keys.clear();
  }

  isDown(code: string): boolean {
    return this.contextValue === "simulation" && this.keys.has(code);
  }

  consumeTabPress(): boolean {
    const pressed = this.tabPressed;
    this.tabPressed = false;
    return pressed;
  }

  readCommand(): { fwd: number; strafe: number; turn: number } {
    if (this.contextValue !== "simulation") return { fwd: 0, strafe: 0, turn: 0 };
    const fwd =
      (this.isDown("KeyW") || this.isDown("ArrowUp") ? 1 : 0) -
      (this.isDown("KeyS") || this.isDown("ArrowDown") ? 1 : 0);
    const strafe = (this.isDown("KeyD") ? 1 : 0) - (this.isDown("KeyA") ? 1 : 0);
    const turn =
      (this.isDown("KeyE") || this.isDown("ArrowRight") ? 1 : 0) -
      (this.isDown("KeyQ") || this.isDown("ArrowLeft") ? 1 : 0);
    return { fwd, strafe, turn };
  }
}
