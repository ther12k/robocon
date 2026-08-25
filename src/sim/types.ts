export type Team = "red" | "blue";

export interface SourceProvenance {
  authority: string;
  documentTitle?: string;
  documentVersion?: string;
  publishedAt?: string;
  sha256?: string;
  verifiedAt?: string;
  status: "official" | "draft" | "inferred";
}

export interface ArenaMeta {
  name: string;
  rulebookVersion: string;
  tolerancePct: number;
  verifyNote?: string;
  schemaVersion?: number;
  source?: SourceProvenance;
}

export interface FieldDimensions {
  width: number;
  length: number;
  wallHeight?: number;
  wallThickness?: number;
}

export interface Pose2 {
  x: number;
  z: number;
  rotY?: number;
  rotX?: number;
  rotZ?: number;
}

export interface ZoneDef extends Pose2 {
  id: string;
  team?: Team;
  shape: "rect";
  w: number;
  l: number;
  label?: string;
}

export interface StaticPropDef {
  id: string;
  type: "box" | "ramp";
  pose: Pose2 & { y?: number };
  size: { w: number; h: number; d: number };
  material?: string;
  color?: string;
}

export type ShapeKind = "box" | "cylinder" | "sphere";

export interface ShapeSize {
  w: number;
  h: number;
  d: number;
}

export interface TriggerDef {
  id: string;
  shape: "rect";
  x: number;
  z: number;
  w: number;
  l: number;
  yMin?: number;
  yMax?: number;
  targets?: Array<"robots" | "objects">;
  label?: string;
}

export interface ObjectRenderDef {
  shape: "box" | "cylinder" | "sphere";
  size: { w: number; h: number; d: number };
  color?: string;
}

export interface ObjectSpawnDef {
  objectId: string;
  typeId: string;
  pose: { x: number; y: number; z: number };
  initialState: "idle" | "held" | "scored";
  massKg?: number;
  render?: ObjectRenderDef;
}

export interface TargetDef {
  id: string;
  accepts: string[];
  /** Optional explicit link: scoring rules with this triggerId are constrained by this target. */
  triggerId?: string;
  check: "snapPose";
  pose: { x: number; y: number; z: number };
  size: { w: number; d: number };
  scoreEvent: string;
}

export interface SurfaceConfig {
  defaultFriction: number;
}

export type DriveType = "differential" | "omni" | "mecanum";

export interface RobotChassisSpec {
  drive: DriveType;
  footprint: { w: number; l: number };
  height?: number;
  massKg?: number;
  maxSpeedMps?: number;
  maxAccelMps2?: number;
  maxTurnRps?: number;
}

export interface GripperModuleSpec {
  type: "gripper";
  mount: { x: number; y: number; z: number };
  gripRangeM?: number;
}

export type RobotModuleSpec = GripperModuleSpec;

export interface RobotSpec {
  schemaVersion?: number;
  name: string;
  role: string;
  team: Team;
  chassis: RobotChassisSpec;
  modules?: RobotModuleSpec[];
}

export interface DriveCommand {
  fwd: number;
  strafe: number;
  turn: number;
}

export interface RoleConstraints {
  maxFootprintMm: { w: number; l: number; h: number };
  extendedMm: { w: number; l: number; h: number };
}

export interface MatchConfig {
  setupSec: number;
  countdownSec?: number;
  playSec: number;
  retriesPerTeam: number;
}

export interface ObjectInTriggerRule {
  id: string;
  type: "objectInTrigger";
  triggerId: string;
  team: Team;
  points: number;
}

export type ScoringRule = ObjectInTriggerRule;

export interface AbsoluteWinRule {
  type: "scoreThreshold";
  points: number;
}

export type ViolationEffect = "retry" | "warning";

export interface ViolationRule {
  id: string;
  type: "outOfBounds";
  marginM: number;
  effect: ViolationEffect;
}

export interface CompetitionRuleset {
  schemaVersion?: number;
  match?: MatchConfig;
  robots: Record<string, RoleConstraints>;
  teamWeightBudgetKg: number;
  scoring?: ScoringRule[];
  absoluteWin?: AbsoluteWinRule;
  violations?: ViolationRule[];
}

export interface SimulationProfile {
  schemaVersion?: number;
  maxSpeedMps: number;
  maxAccelMps2: number;
  maxTurnRps: number;
  solverHz?: number;
}

export interface ValidationContext {
  roles: Record<string, RoleConstraints>;
  teamWeightBudgetKg: number;
  limits: Pick<SimulationProfile, "maxSpeedMps" | "maxAccelMps2" | "maxTurnRps">;
}

export interface ArenaConfig {
  meta: ArenaMeta;
  dimensions: FieldDimensions;
  zones: ZoneDef[];
  staticProps: StaticPropDef[];
  objectSpawns: ObjectSpawnDef[];
  targets: TargetDef[];
  triggers?: TriggerDef[];
  surfaces: SurfaceConfig;
}
