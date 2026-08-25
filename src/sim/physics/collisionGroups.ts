export const CG_OBJECT = 0b000001;
/** Bit 9: robot membership bits occupy bits 1..8 (MAX_ROBOTS=8); object is bit 0. */
export const CG_STATIC = 0b1000000000;

export const MAX_ROBOTS = 8;

export function robotGroupBit(index: number): number {
  return 1 << (1 + Math.min(Math.max(index, 0), MAX_ROBOTS - 1));
}

export const ALL_ROBOT_BITS = (() => {
  let mask = 0;
  for (let i = 0; i < MAX_ROBOTS; i++) mask |= robotGroupBit(i);
  return mask;
})();

export function collisionGroup(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

export function staticGroups(): { membership: number; filter: number } {
  return { membership: CG_STATIC, filter: CG_OBJECT | ALL_ROBOT_BITS | CG_STATIC };
}

export function robotGroups(index: number): { membership: number; filter: number } {
  return { membership: robotGroupBit(index), filter: CG_OBJECT | ALL_ROBOT_BITS | CG_STATIC };
}

export function objectIdleGroups(): { membership: number; filter: number } {
  return { membership: CG_OBJECT, filter: CG_OBJECT | ALL_ROBOT_BITS | CG_STATIC };
}

export function objectHeldByGroups(holderRobotIndex: number): { membership: number; filter: number } {
  const robotsExceptHolder = ALL_ROBOT_BITS & ~robotGroupBit(holderRobotIndex);
  return { membership: CG_OBJECT, filter: CG_OBJECT | robotsExceptHolder | CG_STATIC };
}
