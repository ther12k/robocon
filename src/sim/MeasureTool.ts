import * as THREE from "three";

export class MeasureTool {
  private enabled = false;
  private firstPoint: THREE.Vector3 | null = null;
  private line: THREE.Line;
  private dotA: THREE.Mesh;
  private dotB: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private onReading?: (text: string | null) => void;

  constructor(scene: THREE.Scene, onReading?: (text: string | null) => void) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x38bdf8 }));
    this.line.visible = false;
    scene.add(this.line);

    const dotGeo = new THREE.SphereGeometry(0.03, 12, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    this.dotA = new THREE.Mesh(dotGeo, dotMat);
    this.dotB = new THREE.Mesh(dotGeo.clone(), dotMat.clone());
    this.dotA.visible = false;
    this.dotB.visible = false;
    scene.add(this.dotA);
    scene.add(this.dotB);

    this.onReading = onReading;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.clear();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  handleClick(ndc: THREE.Vector2, camera: THREE.Camera, floor: THREE.Object3D): void {
    if (!this.enabled) return;
    this.raycaster.setFromCamera(ndc, camera);
    const hits = this.raycaster.intersectObject(floor, true);
    if (hits.length === 0) return;
    const p = hits[0].point.clone();

    if (this.firstPoint === null) {
      this.firstPoint = p;
      this.dotA.position.copy(p);
      this.dotA.visible = true;
      this.line.visible = false;
      this.dotB.visible = false;
      this.onReading?.("Pick second point…");
      return;
    }

    const a = this.firstPoint;
    const dist = a.distanceTo(p);
    this.dotB.position.copy(p);
    this.dotB.visible = true;
    const posAttr = this.line.geometry.getAttribute("position") as THREE.BufferAttribute;
    posAttr.setXYZ(0, a.x, a.y + 0.01, a.z);
    posAttr.setXYZ(1, p.x, p.y + 0.01, p.z);
    posAttr.needsUpdate = true;
    this.line.visible = true;
    this.firstPoint = null;
    this.onReading?.(
      `Δ = ${dist.toFixed(3)} m   (${a.x.toFixed(2)}, ${a.z.toFixed(2)}) → (${p.x.toFixed(2)}, ${p.z.toFixed(2)})   — click to restart`,
    );
  }

  clear(): void {
    this.firstPoint = null;
    this.line.visible = false;
    this.dotA.visible = false;
    this.dotB.visible = false;
    this.onReading?.(null);
  }
}
