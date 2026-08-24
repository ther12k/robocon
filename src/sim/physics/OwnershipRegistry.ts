export class OwnershipRegistry {
  private owners = new Map<number, string>();

  acquire(handle: number, owner: string): boolean {
    if (this.owners.has(handle)) return false;
    this.owners.set(handle, owner);
    return true;
  }

  release(handle: number, owner?: string): boolean {
    const current = this.owners.get(handle);
    if (current === undefined) return false;
    if (owner !== undefined && current !== owner) return false;
    this.owners.delete(handle);
    return true;
  }

  ownerOf(handle: number): string | undefined {
    return this.owners.get(handle);
  }

  isHeld(handle: number): boolean {
    return this.owners.has(handle);
  }

  forgetBody(handle: number): void {
    this.owners.delete(handle);
  }
}
