import * as THREE from "three";
import type { RobotSpec } from "../types";

export function buildRobotMesh(spec: RobotSpec): THREE.Group {
  const group = new THREE.Group();
  const h = spec.chassis.height ?? 0.3;
  const w = spec.chassis.footprint.w;
  const l = spec.chassis.footprint.l;

  const teamColor = spec.team === "red" ? 0xdc2626 : 0x2563eb;
  const chassisMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.6, metalness: 0.15 });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x1f2731, roughness: 0.85 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x11151a, roughness: 0.95 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.7, l), chassisMat);
  chassis.position.y = -h * 0.15;
  chassis.castShadow = true;
  group.add(chassis);

  const plate = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, h * 0.18, l * 0.92), plateMat);
  plate.position.y = h * 0.28;
  plate.castShadow = true;
  group.add(plate);

  const wheelGeo = new THREE.CylinderGeometry(h * 0.28, h * 0.28, 0.04, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const positions: Array<[number, number]> = [
    [-(w / 2 + 0.005), -(l / 2 - h * 0.3)],
    [w / 2 + 0.005, -(l / 2 - h * 0.3)],
    [-(w / 2 + 0.005), l / 2 - h * 0.3],
    [w / 2 + 0.005, l / 2 - h * 0.3],
  ];
  for (const [wx, wz] of positions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, -h * 0.22, wz);
    wheel.castShadow = true;
    group.add(wheel);
  }

  const arrowGeo = new THREE.ConeGeometry(0.05, 0.14, 12);
  arrowGeo.rotateX(Math.PI / 2);
  const arrow = new THREE.Mesh(arrowGeo, new THREE.MeshStandardMaterial({ color: 0xfacc15 }));
  arrow.position.set(0, h * 0.15, l / 2 + 0.06);
  group.add(arrow);

  if (spec.chassis.drive === "mecanum") {
    const rollerMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.8 });
    for (const [wx, wz] of positions) {
      const roller = new THREE.Mesh(new THREE.BoxGeometry(0.045, h * 0.4, 0.045), rollerMat);
      roller.position.set(wx, -h * 0.22, wz);
      roller.rotation.y = wx < 0 ? Math.PI / 4 : -Math.PI / 4;
      group.add(roller);
    }
  }

  return group;
}
