import * as THREE from "three";
import type { ArenaConfig, ObjectSpawnDef, StaticPropDef, TargetDef, TriggerDef, ZoneDef } from "../sim/types";
import { shapeToGeometry, poseToQuaternion } from "../sim/geometry";

const ZONE_OPACITY = 0.14;

function zoneColor(zone: ZoneDef): number {
  if (zone.team === "red") return 0xef4444;
  if (zone.team === "blue") return 0x3b82f6;
  return 0xfacc15;
}

function makeZoneMesh(zone: ZoneDef): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(zone.w, zone.l);
  const mat = new THREE.MeshBasicMaterial({
    color: zoneColor(zone),
    transparent: true,
    opacity: ZONE_OPACITY,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  const isThinLine = Math.min(zone.w, zone.l) <= 0.1;
  mesh.position.set(zone.x, isThinLine ? 0.012 : 0.006, zone.z);
  return mesh;
}

function makeZoneBorder(zone: ZoneDef): THREE.LineLoop {
  const hw = zone.w / 2;
  const hl = zone.l / 2;
  const pts = [
    new THREE.Vector3(-hw, 0, -hl),
    new THREE.Vector3(hw, 0, -hl),
    new THREE.Vector3(hw, 0, hl),
    new THREE.Vector3(-hw, 0, hl),
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: zoneColor(zone), transparent: true, opacity: 0.55 });
  const line = new THREE.LineLoop(geo, mat);
  line.position.set(zone.x, 0.01, zone.z);
  return line;
}

function makeZoneLabel(text: string, zone: ZoneDef): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 34px ui-sans-serif, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const teamColor = zone.team === "red" ? "#f87171" : zone.team === "blue" ? "#60a5fa" : "#facc15";
  ctx.fillStyle = teamColor;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.set(zone.x, 0.05, zone.z);
  return sprite;
}

function makeWall(dimensions: ArenaConfig["dimensions"]): THREE.Group {
  const group = new THREE.Group();
  const w = dimensions.width;
  const l = dimensions.length;
  const h = dimensions.wallHeight ?? 0.15;
  const t = dimensions.wallThickness ?? 0.1;
  const mat = new THREE.MeshStandardMaterial({ color: 0x2b3642, roughness: 0.9 });
  const segments: Array<[number, number, number, number]> = [
    [w + t * 2, t, 0, -(l / 2 + t / 2)],
    [w + t * 2, t, 0, l / 2 + t / 2],
    [t, l, -(w / 2 + t / 2), 0],
    [t, l, w / 2 + t / 2, 0],
  ];
  for (const [sw, sl, x, z] of segments) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sw, h, sl), mat);
    mesh.position.set(x, h / 2, z);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

function makeSpawnMesh(spawn: ObjectSpawnDef): THREE.Mesh {
  const r = spawn.render;
  const size = r?.size ?? { w: 0.15, h: 0.15, d: 0.15 };
  const kind = r?.shape ?? "box";
  const colorHex = new THREE.Color(r?.color ?? "#ffffff").getHex();
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.5,
    metalness: 0.05,
    emissive: colorHex,
    emissiveIntensity: 0.12,
  });
  const mesh = new THREE.Mesh(shapeToGeometry(kind, size), mat);
  mesh.name = `obj-${spawn.objectId}`;
  mesh.position.set(spawn.pose.x, spawn.pose.y, spawn.pose.z);
  mesh.castShadow = true;
  mesh.userData = { kind: "gameObject", id: spawn.objectId, typeId: spawn.typeId };
  return mesh;
}

function makeTargetMarker(target: TargetDef): THREE.Group {
  const group = new THREE.Group();
  const radius = Math.min(target.size.w, target.size.d) / 2;
  const geo = new THREE.RingGeometry(radius - 0.03, radius, 32);
  const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  const crossGeo = new THREE.PlaneGeometry(target.size.w * 0.28, target.size.w * 0.02);
  for (const rot of [0, Math.PI / 2]) {
    const bar = new THREE.Mesh(crossGeo, mat.clone());
    bar.rotation.x = -Math.PI / 2;
    bar.rotation.z = rot;
    group.add(bar);
  }
  group.position.set(target.pose.x, Math.max(target.pose.y, 0.008), target.pose.z);
  group.userData = { kind: "target", id: target.id };
  return group;
}

function makeStaticProp(prop: StaticPropDef): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(prop.color ?? "#8a6a45"),
    roughness: prop.material === "wood" ? 0.95 : 0.7,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(prop.size.w, prop.size.h, prop.size.d), mat);
  mesh.position.set(prop.pose.x, prop.pose.y ?? prop.size.h / 2, prop.pose.z);
  mesh.quaternion.copy(poseToQuaternion(prop.pose));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { kind: "staticProp", id: prop.id };
  return mesh;
}

function makeTriggerVolume(trigger: TriggerDef): THREE.Group {
  const group = new THREE.Group();
  const yMin = trigger.yMin ?? 0;
  const yMax = trigger.yMax ?? 1;
  const hw = trigger.w / 2;
  const hl = trigger.l / 2;
  const corners: Array<[number, number]> = [
    [-hw, -hl],
    [hw, -hl],
    [hw, hl],
    [-hw, hl],
  ];
  const mat = new THREE.LineBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.6 });
  for (const [x, z] of corners) {
    const edgeGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, yMin, z),
      new THREE.Vector3(x, yMax, z),
    ]);
    group.add(new THREE.Line(edgeGeo, mat));
  }
  for (const y of [yMin, yMax]) {
    const pts = corners.map(([x, z]) => new THREE.Vector3(x, y, z));
    pts.push(pts[0].clone());
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  group.position.set(trigger.x, 0, trigger.z);
  return group;
}

export function buildArena(config: ArenaConfig): THREE.Group {
  const root = new THREE.Group();
  root.name = "arena";

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x39424c, roughness: 0.92 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(config.dimensions.width, config.dimensions.length), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = "floor";
  root.add(floor);

  const grid = new THREE.GridHelper(
    Math.max(config.dimensions.width, config.dimensions.length),
    Math.max(config.dimensions.width, config.dimensions.length),
    0x54606d,
    0x454f5a,
  );
  grid.position.y = 0.002;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35;
  root.add(grid);

  root.add(makeWall(config.dimensions));

  for (const zone of config.zones) {
    root.add(makeZoneMesh(zone));
    root.add(makeZoneBorder(zone));
    if (zone.label) root.add(makeZoneLabel(zone.label, zone));
  }

  for (const prop of config.staticProps) root.add(makeStaticProp(prop));
  for (const spawn of config.objectSpawns) root.add(makeSpawnMesh(spawn));
  for (const target of config.targets) root.add(makeTargetMarker(target));
  for (const trigger of config.triggers ?? []) root.add(makeTriggerVolume(trigger));

  const midlineMat = new THREE.LineBasicMaterial({ color: 0xd7e0e8, transparent: true, opacity: 0.4 });
  const midGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-config.dimensions.width / 2, 0.013, 0),
    new THREE.Vector3(config.dimensions.width / 2, 0.013, 0),
  ]);
  root.add(new THREE.Line(midGeo, midlineMat));

  return root;
}
