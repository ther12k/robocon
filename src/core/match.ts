import type { CompetitionRuleset, TargetDef, Team } from "../sim/types";
import { SimulationCore } from "./SimulationCore";

export type MatchPhase = "idle" | "setup" | "countdown" | "playing" | "ended";

export interface ScoreLogEntry {
  tick: number;
  timeSec: number;
  kind: "score" | "violation" | "win" | "phase";
  team?: Team;
  points?: number;
  ruleId: string;
  message: string;
}

const DEFAULT_COUNTDOWN_SEC = 3;

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export class MatchController {
  private core: SimulationCore;
  private rules: CompetitionRuleset;
  private _phase: MatchPhase = "idle";
  private ticksLeftInPhase = 0;
  private scores: Record<Team, number> = { red: 0, blue: 0 };
  private retriesLeft: Record<Team, number> = { red: 0, blue: 0 };
  private maxRetries = 0;
  private winnerTeam: Team | null = null;
  private log: ScoreLogEntry[] = [];
  private scoredKeys = new Set<string>();
  private matchTick = 0;

  constructor(core: SimulationCore, rules: CompetitionRuleset) {
    this.core = core;
    this.rules = rules;
    core.addPostStepListener(() => this.onFixedTick());
    core.setMatchInfoProvider(() =>
      // Idle matches contribute nothing to authoritative hashes — this keeps
      // pristine-session clones symmetric with live sessions.
      this._phase === "idle"
        ? null
        : {
            phase: this._phase,
            timeRemainingSec: this.timeRemainingSec,
            scores: { ...this.scores },
            retriesLeft: { ...this.retriesLeft },
            winnerTeam: this.winnerTeam,
          },
    );
  }

  get phase(): MatchPhase {
    return this._phase;
  }

  get score(): Readonly<Record<Team, number>> {
    return this.scores;
  }

  get winner(): Team | null {
    return this.winnerTeam;
  }

  get entries(): readonly ScoreLogEntry[] {
    return this.log;
  }

  get timeRemainingSec(): number {
    return Math.max(0, this.ticksLeftInPhase * this.core.physics.fixedDt);
  }

  retriesFor(team: Team): number {
    return this.retriesLeft[team];
  }

  get maxRetriesPerTeam(): number {
    return this.maxRetries;
  }

  startMatch(): void {
    if (this._phase === "setup" || this._phase === "countdown" || this._phase === "playing") {
      return; // a match is already in flight — ignore restart spam
    }
    // Recording/playback own the world timeline — a match would reset the
    // tick counter and corrupt both. The UI guards this too, but enforce it
    // at the domain boundary so no caller can bypass it.
    if (this.core.bus.isRecording() || this.core.isReplayPlaybackActive()) {
      return;
    }
    const match = this.rules.match ?? { setupSec: 60, playSec: 180, retriesPerTeam: 3 };
    this.maxRetries = match.retriesPerTeam ?? 3;
    this._phase = "setup";
    this.scores = { red: 0, blue: 0 };
    this.retriesLeft = { red: match.retriesPerTeam, blue: match.retriesPerTeam };
    this.winnerTeam = null;
    this.log = [];
    this.scoredKeys.clear();
    this.matchTick = 0;
    this.core.resetForReplay();
    this.core.setInputLock("match-phase", true);
    this.setPhase("setup", match.setupSec, `Match started — setup ${match.setupSec}s`);
  }

  /** Returns the match to a clean idle state (scores cleared, gate open). */
  resetMatchToIdle(): void {
    this._phase = "idle";
    this.ticksLeftInPhase = 0;
    this.scores = { red: 0, blue: 0 };
    this.winnerTeam = null;
    this.log = [];
    this.scoredKeys.clear();
    this.matchTick = 0;
    this.core.setInputLock("match-phase", false);
  }

  private setPhase(phase: MatchPhase, durationSec: number, message: string): void {
    this._phase = phase;
    this.ticksLeftInPhase = Math.round(durationSec * this.tps);
    this.log.push({
      tick: this.matchTick,
      timeSec: round2(this.timeElapsedSec()),
      kind: "phase",
      ruleId: `phase.${phase}`,
      message,
    });
  }

  private get tps(): number {
    return 1 / this.core.physics.fixedDt;
  }

  timeElapsedSec(): number {
    return this.matchTick * this.core.physics.fixedDt;
  }

  advance(frameDt: number): void {
    this.core.advance(frameDt);
  }

  private onFixedTick(): void {
    if (this._phase === "idle" || this._phase === "ended") return;
    this.matchTick += 1;
    if (this._phase !== "playing") {
      this.ticksLeftInPhase -= 1;
      if (this.ticksLeftInPhase <= 0) this.transitionFromNonPlaying();
      return;
    }

    this.evaluateScoring();
    const phaseAfterScoring = this._phase as MatchPhase;
    if (phaseAfterScoring === "ended") return;
    this.evaluateViolations();

    this.ticksLeftInPhase -= 1;
    if (this.ticksLeftInPhase <= 0) {
      const { red, blue } = this.scores;
      if (red === blue) {
        this.endMatch(null, `Draw ${red}-${blue} — judges to decide`);
      } else {
        const winner = red > blue ? "red" : "blue";
        this.endMatch(winner, `win on points ${red}-${blue}`);
      }
    }
  }

  private transitionFromNonPlaying(): void {
    const match = this.rules.match ?? { setupSec: 60, playSec: 180, retriesPerTeam: 3 };
    if (this._phase === "setup") {
      const countdownSec = match.countdownSec ?? DEFAULT_COUNTDOWN_SEC;
      this.setPhase("countdown", countdownSec, `Countdown ${countdownSec}s`);
    } else if (this._phase === "countdown") {
      this.core.setInputLock("match-phase", false);
      this.setPhase("playing", match.playSec, "Play!");
    }
  }

  private endMatch(winner: Team | null, reason: string): void {
    this._phase = "ended";
    this.winnerTeam = winner;
    this.core.setInputLock("match-phase", true);
    this.log.push({
      tick: this.matchTick,
      timeSec: round2(this.timeElapsedSec()),
      kind: winner ? "win" : "phase",
      team: winner ?? undefined,
      ruleId: "match.end",
      message: winner ? `${winner.toUpperCase()} WINS — ${reason}` : `Match ended — ${reason}`,
    });
  }

  private evaluateScoring(): void {
    for (const rule of this.rules.scoring ?? []) {
      if (rule.type !== "objectInTrigger") continue;
      const targets = (this.core.arena.targets ?? []).filter((t) => t.triggerId === rule.triggerId);
      for (const candidate of this.core.worldObjectCandidates()) {
        if (this.core.objectState(candidate.id) === "scored") continue;
        const key = `${candidate.id}@${rule.triggerId}`;
        if (this.scoredKeys.has(key)) continue;
        const entityId = this.core.objectEntityId(candidate.id);
        if (!entityId || this.core.isHeld(entityId)) continue;
        const transform = this.core.physics.getEntityTransform(entityId);
        if (!transform) continue;
        if (!this.pointInTrigger(rule.triggerId, transform.position.x, transform.position.y, transform.position.z)) {
          continue;
        }
        const typeId = this.core.getObjectTypeId(candidate.id);
        let matchedTarget: TargetDef | undefined;
        if (targets.length > 0) {
          matchedTarget = targets.find((t) => t.accepts.includes(typeId ?? ""));
          if (!matchedTarget) continue; // wrong object type for every linked target
        }

        this.scoredKeys.add(key);
        if (matchedTarget && matchedTarget.check === "snapPose") {
          this.core.lockObjectToTarget(candidate.id, matchedTarget.pose);
        } else {
          this.core.markObjectState(candidate.id, "scored");
        }
        this.scores[rule.team] += rule.points;
        this.log.push({
          tick: this.matchTick,
          timeSec: round2(this.timeElapsedSec()),
          kind: "score",
          team: rule.team,
          points: rule.points,
          ruleId: rule.id,
          message: `${candidate.id} placed in ${rule.triggerId} → +${rule.points} ${rule.team}`,
        });
        this.checkAbsoluteWin();
        if (this._phase === "ended") return;
      }
    }
  }

  private checkAbsoluteWin(): void {
    const win = this.rules.absoluteWin;
    if (!win || win.type !== "scoreThreshold") return;
    for (const team of ["red", "blue"] as const) {
      if (this.scores[team] >= win.points) {
        this.endMatch(team, `reached ${win.points} pts`);
        return;
      }
    }
  }

  private pointInTrigger(triggerId: string, x: number, y: number, z: number): boolean {
    const def = this.core.arena.triggers?.find((t) => t.id === triggerId);
    if (!def) return false;
    const yMin = def.yMin ?? 0;
    const yMax = def.yMax ?? 2;
    return (
      Math.abs(x - def.x) <= def.w / 2 &&
      Math.abs(z - def.z) <= def.l / 2 &&
      y >= yMin &&
      y <= yMax
    );
  }

  private evaluateViolations(): void {
    for (const rule of this.rules.violations ?? []) {
      if (rule.type !== "outOfBounds") continue;
      const { halfW, halfL } = this.core.fieldBounds();
      const limitX = halfW + rule.marginM;
      const limitZ = halfL + rule.marginM;
      for (const team of ["red", "blue"] as const) {
        for (const slot of this.core.slotsByTeam(team)) {
          const body = this.core.getBody(slot);
          if (!body) continue;
          const p = body.translation();
          if (Math.abs(p.x) <= limitX && Math.abs(p.z) <= limitZ) continue;
          this.log.push({
            tick: this.matchTick,
            timeSec: round2(this.timeElapsedSec()),
            kind: "violation",
            team,
            ruleId: rule.id,
            message: `${team} robot out of bounds`,
          });
           if (rule.effect === "retry") {
             if (this.retriesLeft[team] > 0) {
               this.retriesLeft[team] -= 1;
               this.core.respawnRobots(team);
              this.log.push({
                tick: this.matchTick,
                timeSec: round2(this.timeElapsedSec()),
                kind: "violation",
                team,
                ruleId: `${rule.id}.retry`,
                message: `Retry used — ${this.retriesLeft[team]} left for ${team}`,
              });
            } else {
              this.endMatch(otherTeam(team), `${team} exhausted retries`);
              return;
            }
          } else if (rule.effect === "warning") {
            // violation entry above is the whole consequence — log only
          } else if (rule.effect === "disqualify") {
            this.endMatch(otherTeam(team), `${team} disqualified (${rule.id})`);
            return;
          }
        }
      }
    }
  }

  scoreboardFingerprint(): string {
    return fnv1a(
      JSON.stringify({
        phase: this._phase,
        s: this.scores,
        w: this.winnerTeam,
        t: round2(this.timeRemainingSec),
      }),
    );
  }
}

function otherTeam(team: Team): Team {
  return team === "red" ? "blue" : "red";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
