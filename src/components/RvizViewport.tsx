import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import {
  Compass,
  Ruler,
  RotateCcw,
  Maximize2,
  Eye,
  Crosshair,
  Box,
} from 'lucide-react';
import {
  CustomMeshAsset,
  KinematicTreeNode,
  LinkWorldTransform,
  ParsedUrdfModel,
  RvizTreeDisplaySettings,
  UrdfGeometry,
  ViewportLayers,
  Vector3Tuple,
} from '../urdf/types';
import {
  resolveMimicJointValues,
  rpyToQuaternion,
} from '../urdf/urdfCompiler';

export type CameraPreset = 'iso' | 'top' | 'front' | 'side' | 'reset';

interface RvizViewportProps {
  model: ParsedUrdfModel;
  jointValues: Record<string, number>;
  layers: ViewportLayers;
  treeSettings: RvizTreeDisplaySettings;
  meshAssets: Record<string, CustomMeshAsset>;
  selectedNode: { type: 'link' | 'joint'; name: string } | null;
  onSelectNode: (node: { type: 'link' | 'joint'; name: string } | null) => void;
  worldTransforms: Record<string, LinkWorldTransform>;
  children?: React.ReactNode; // For BottomRvizDock
}

interface JointPivotEntry {
  jointGroup: THREE.Group;
  axis: THREE.Vector3;
  type: string;
  lower: number;
  upper: number;
}

const _tempVec3 = new THREE.Vector3();
const _tempQuat = new THREE.Quaternion();

function createRgbAxesGroup(size: number): THREE.Group {
  const group = new THREE.Group();
  const radius = Math.max(0.0025, size * 0.032);
  const coneRadius = radius * 2.2;
  const coneHeight = size * 0.22;
  const shaftLen = size - coneHeight;

  const axes: {
    dir: [number, number, number];
    rot: [number, number, number];
    color: number;
  }[] = [
    // +X Red
    {
      dir: [shaftLen / 2, 0, 0],
      rot: [0, 0, -Math.PI / 2],
      color: 0xef4444,
    },
    // +Y Green
    {
      dir: [0, shaftLen / 2, 0],
      rot: [0, 0, 0],
      color: 0x22c55e,
    },
    // +Z Blue
    {
      dir: [0, 0, shaftLen / 2],
      rot: [Math.PI / 2, 0, 0],
      color: 0x3b82f6,
    },
  ];

  const cylGeo = new THREE.CylinderGeometry(radius, radius, shaftLen, 10);
  const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 12);

  for (const ax of axes) {
    const mat = new THREE.MeshStandardMaterial({
      color: ax.color,
      roughness: 0.35,
      metalness: 0.2,
    });
    const shaft = new THREE.Mesh(cylGeo, mat);
    shaft.position.set(ax.dir[0], ax.dir[1], ax.dir[2]);
    shaft.rotation.set(ax.rot[0], ax.rot[1], ax.rot[2]);

    const cone = new THREE.Mesh(coneGeo, mat);
    const tipFactor = (shaftLen + coneHeight * 0.5) / (shaftLen / 2 || 1);
    cone.position.set(
      ax.dir[0] * tipFactor,
      ax.dir[1] * tipFactor,
      ax.dir[2] * tipFactor,
    );
    cone.rotation.set(ax.rot[0], ax.rot[1], ax.rot[2]);

    group.add(shaft, cone);
  }

  return group;
}

function createJointAxisIndicator(
  axisTuple: Vector3Tuple,
  jointType: string,
): THREE.Group {
  const group = new THREE.Group();
  const dir = new THREE.Vector3(
    axisTuple[0],
    axisTuple[1],
    axisTuple[2],
  ).normalize();

  const color = jointType === 'prismatic' ? 0x38bdf8 : 0xfacc15;
  const arrowLen = 0.14;
  const shaftGeo = new THREE.CylinderGeometry(0.004, 0.004, arrowLen, 10);
  const coneGeo = new THREE.ConeGeometry(0.011, 0.032, 12);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.25,
    roughness: 0.3,
  });

  const subGroup = new THREE.Group();
  const shaft = new THREE.Mesh(shaftGeo, mat);
  shaft.position.y = arrowLen * 0.5;
  const cone = new THREE.Mesh(coneGeo, mat);
  cone.position.y = arrowLen + 0.015;
  subGroup.add(shaft, cone);

  if (jointType === 'revolute' || jointType === 'continuous') {
    const ringGeo = new THREE.TorusGeometry(0.036, 0.003, 8, 24, Math.PI * 1.65);
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = arrowLen * 0.35;
    subGroup.add(ring);
  }

  // Align +Y of subGroup with dir
  const defaultUp = new THREE.Vector3(0, 1, 0);
  const alignQuat = new THREE.Quaternion().setFromUnitVectors(defaultUp, dir);
  subGroup.quaternion.copy(alignQuat);

  group.add(subGroup);
  return group;
}

function createTfNameLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(6, 8, canvas.width - 12, canvas.height - 16, 12);
    ctx.fill();
    ctx.stroke();

    ctx.font = '600 26px "Fira Code", "JetBrains Mono", monospace';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1, canvas.width - 28);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(0.05, 0.05, 0.09);
  sprite.scale.set(0.24, 0.054, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function createZUpRvizGrid(): THREE.Group {
  const gridGroup = new THREE.Group();

  // GridHelper in Three.js lies on XZ plane by default; rotate 90deg on X so it lies on ROS XY plane (Z = 0)
  const majorGrid = new THREE.GridHelper(6, 6, 0x64748b, 0x475569);
  majorGrid.rotation.x = Math.PI / 2;
  majorGrid.position.z = -0.001;
  gridGroup.add(majorGrid);

  const fineGrid = new THREE.GridHelper(3, 15, 0x334155, 0x1e293b);
  fineGrid.rotation.x = Math.PI / 2;
  fineGrid.position.z = -0.002;
  gridGroup.add(fineGrid);

  // World ROS Origin Axes (+X Red 1m, +Y Green 1m, +Z Blue 0.5m)
  const xPoints = [new THREE.Vector3(0, 0, 0.001), new THREE.Vector3(1.0, 0, 0.001)];
  const yPoints = [new THREE.Vector3(0, 0, 0.001), new THREE.Vector3(0, 1.0, 0.001)];
  const zPoints = [new THREE.Vector3(0, 0, 0.001), new THREE.Vector3(0, 0, 0.5)];

  gridGroup.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(xPoints),
      new THREE.LineBasicMaterial({ color: 0xef4444 }),
    ),
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(yPoints),
      new THREE.LineBasicMaterial({ color: 0x22c55e }),
    ),
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(zPoints),
      new THREE.LineBasicMaterial({ color: 0x3b82f6 }),
    ),
  );

  return gridGroup;
}

export const RvizViewport: React.FC<RvizViewportProps> = ({
  model,
  jointValues,
  layers,
  treeSettings,
  meshAssets,
  selectedNode,
  onSelectNode,
  worldTransforms,
  children,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const requestRenderRef = useRef<() => void>(() => {});
  const cameraPresetTargetRef = useRef<{
    pos: THREE.Vector3;
    lookAt: THREE.Vector3;
  } | null>(null);

  const robotRootGroupRef = useRef<THREE.Group | null>(null);
  const gridGroupRef = useRef<THREE.Group | null>(null);
  const measureGroupRef = useRef<THREE.Group | null>(null);
  const jointPivotsRef = useRef<Record<string, JointPivotEntry>>({});
  const linkGroupsRef = useRef<Record<string, THREE.Group>>({});
  const interactableMeshesRef = useRef<THREE.Object3D[]>([]);

  const visualMeshesRef = useRef<THREE.Mesh[]>([]);
  const collisionObjectsRef = useRef<THREE.Object3D[]>([]);
  const tfFrameObjectsRef = useRef<THREE.Object3D[]>([]);
  const tfLabelSpritesRef = useRef<THREE.Sprite[]>([]);
  const jointAxisObjectsRef = useRef<THREE.Object3D[]>([]);
  const comObjectsRef = useRef<THREE.Object3D[]>([]);
  const inertiaObjectsRef = useRef<THREE.Object3D[]>([]);

  const [hoverCoords, setHoverCoords] = useState<Vector3Tuple | null>(null);
  const [hoveredLinkName, setHoveredLinkName] = useState<string | null>(null);
  const [measureActive, setMeasureActive] = useState(false);
  const [measurePointA, setMeasurePointA] = useState<Vector3Tuple | null>(null);
  const [measurePointB, setMeasurePointB] = useState<Vector3Tuple | null>(null);
  const [activeCameraPreset, setActiveCameraPreset] =
    useState<CameraPreset>('iso');

  const measureStateRef = useRef({
    active: false,
    pointA: null as Vector3Tuple | null,
    pointB: null as Vector3Tuple | null,
  });
  measureStateRef.current = {
    active: measureActive,
    pointA: measurePointA,
    pointB: measurePointB,
  };

  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;

  // Initialize Three.js WebGLRenderer and Scene once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = Math.max(1, Math.floor(container.clientWidth || 800));
    const height = Math.max(1, Math.floor(container.clientHeight || 600));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.FogExp2(0x0f172a, 0.035);

    // Strict ROS2 Right-Handed Z-Up Coordinate Convention
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 50);
    camera.up.set(0, 0, 1);
    camera.position.set(1.45, -1.55, 1.12);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Studio Environment Map (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04,
    ).texture;
    pmremGenerator.dispose();

    // Balanced 3-Point Studio Lighting Rig (Z-up)
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.9);
    hemiLight.position.set(0, 0, 4);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.8);
    keyLight.position.set(2.5, -2.2, 3.8);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 0.2;
      keyLight.shadow.camera.far = 12;
      const d = 1.8;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.75);
    rimLight.position.set(-2.5, 2.4, 2.0);
    scene.add(rimLight);

    // Soft radial contact shadow plane at Z = -0.003
    const shadowPlaneGeo = new THREE.CircleGeometry(0.85, 32);
    const shadowPlaneMat = new THREE.MeshBasicMaterial({
      color: 0x020617,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    const contactShadowDisc = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    contactShadowDisc.position.set(0, 0, -0.003);
    scene.add(contactShadowDisc);

    // RViz Z-Up Grid
    const gridGroup = createZUpRvizGrid();
    gridGroupRef.current = gridGroup;
    scene.add(gridGroup);

    // Robot Root Container
    const robotRoot = new THREE.Group();
    robotRootGroupRef.current = robotRoot;
    scene.add(robotRoot);

    // Measure Tool Visualization Container
    const measureGroup = new THREE.Group();
    measureGroupRef.current = measureGroup;
    scene.add(measureGroup);

    // OrbitControls with Z-up
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0.35);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.15;
    controls.maxDistance = 18;
    controls.update();

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();
    let currentW = width;
    let currentH = height;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender(immediate = false) {
      if (immediate) {
        const targetPreset = cameraPresetTargetRef.current;
        if (targetPreset) {
          if (isSoftwareGl) {
            camera.position.copy(targetPreset.pos);
            controls.target.copy(targetPreset.lookAt);
            cameraPresetTargetRef.current = null;
          } else {
            requestRender(false);
            return;
          }
        }
        controls.update();
        renderer.render(scene, camera);
        return;
      }
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        renderDirty = false;
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;

        // Smooth camera preset transition if active
        const targetPreset = cameraPresetTargetRef.current;
        if (targetPreset) {
          const factor = isSoftwareGl ? 1 : 1 - Math.exp(-10 * dt);
          camera.position.lerp(targetPreset.pos, factor);
          controls.target.lerp(targetPreset.lookAt, factor);
          if (
            camera.position.distanceToSquared(targetPreset.pos) < 0.0004 &&
            controls.target.distanceToSquared(targetPreset.lookAt) < 0.0004
          ) {
            camera.position.copy(targetPreset.pos);
            controls.target.copy(targetPreset.lookAt);
            cameraPresetTargetRef.current = null;
          } else {
            renderDirty = true;
          }
        }

        controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    requestRenderRef.current = () => requestRender(true);

    controls.addEventListener('start', () => {
      cameraPresetTargetRef.current = null;
    });
    controls.addEventListener('change', () => {
      requestRender();
    });

    // Raycasting for link selection, hover coordinate readout, and 3D measurement
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    let lastHoverTime = 0;

    const handlePointerMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - lastHoverTime < 65) return;
      lastHoverTime = now;

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(
        interactableMeshesRef.current,
        false,
      );

      if (hits.length > 0) {
        const p = hits[0].point;
        setHoverCoords([
          Number(p.x.toFixed(3)),
          Number(p.y.toFixed(3)),
          Number(p.z.toFixed(3)),
        ]);
        const linkName = hits[0].object.userData?.linkName || null;
        setHoveredLinkName(linkName);
      } else {
        const planeHit = raycaster.ray.intersectPlane(groundPlane, _tempVec3);
        if (planeHit && _tempVec3.length() <= 6) {
          setHoverCoords([
            Number(_tempVec3.x.toFixed(3)),
            Number(_tempVec3.y.toFixed(3)),
            0,
          ]);
        } else {
          setHoverCoords(null);
        }
        setHoveredLinkName(null);
      }
    };

    let pointerDownPos = { x: 0, y: 0 };
    const handlePointerDown = (e: MouseEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: MouseEvent) => {
      if (
        Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) >
        5
      ) {
        return; // Ignore orbit drags
      }

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(
        interactableMeshesRef.current,
        false,
      );

      let clickedPoint: Vector3Tuple | null = null;
      let clickedLink: string | null = null;

      if (hits.length > 0) {
        const p = hits[0].point;
        clickedPoint = [p.x, p.y, p.z];
        clickedLink = hits[0].object.userData?.linkName || null;
      } else {
        const planeHit = raycaster.ray.intersectPlane(groundPlane, _tempVec3);
        if (planeHit && _tempVec3.length() <= 6) {
          clickedPoint = [_tempVec3.x, _tempVec3.y, 0];
        }
      }

      if (measureStateRef.current.active && clickedPoint) {
        if (
          !measureStateRef.current.pointA ||
          (measureStateRef.current.pointA && measureStateRef.current.pointB)
        ) {
          setMeasurePointA(clickedPoint);
          setMeasurePointB(null);
        } else {
          setMeasurePointB(clickedPoint);
        }
        return;
      }

      if (clickedLink) {
        onSelectNodeRef.current({ type: 'link', name: clickedLink });
      }
    };

    renderer.domElement.addEventListener('mousemove', handlePointerMove);
    renderer.domElement.addEventListener('mousedown', handlePointerDown);
    renderer.domElement.addEventListener('mouseup', handlePointerUp);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        const h = Math.floor(entry.contentRect.height);
        if (w > 0 && h > 0 && (w !== currentW || h !== currentH)) {
          currentW = w;
          currentH = h;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
          requestRender(true);
        }
      }
    });
    resizeObserver.observe(container);

    requestRender(true);

    return () => {
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('mousemove', handlePointerMove);
      renderer.domElement.removeEventListener('mousedown', handlePointerDown);
      renderer.domElement.removeEventListener('mouseup', handlePointerUp);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Rebuild Robot 3D Hierarchy when compiled URDF model or meshAssets change
  useEffect(() => {
    const robotRoot = robotRootGroupRef.current;
    if (!robotRoot) return;

    // Dispose old meshes
    robotRoot.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        } else {
          m.material?.dispose();
        }
      }
    });
    robotRoot.clear();

    jointPivotsRef.current = {};
    linkGroupsRef.current = {};
    interactableMeshesRef.current = [];
    visualMeshesRef.current = [];
    collisionObjectsRef.current = [];
    tfFrameObjectsRef.current = [];
    tfLabelSpritesRef.current = [];
    jointAxisObjectsRef.current = [];
    comObjectsRef.current = [];
    inertiaObjectsRef.current = [];

    if (!model.tree) {
      requestRenderRef.current();
      return;
    }

    const stlLoader = new STLLoader();
    const objLoader = new OBJLoader();

    function createGeometryInstance(geom: UrdfGeometry): {
      geometry: THREE.BufferGeometry;
      isZAlignedCylinder?: boolean;
    } {
      if (geom.type === 'box') {
        const [sx, sy, sz] = geom.size ?? [0.1, 0.1, 0.1];
        return { geometry: new THREE.BoxGeometry(sx, sy, sz) };
      }
      if (geom.type === 'cylinder') {
        const r = geom.radius ?? 0.05;
        const len = geom.length ?? 0.2;
        const cyl = new THREE.CylinderGeometry(r, r, len, 24);
        // Three.js CylinderGeometry is aligned along Y; URDF cylinders are aligned along Z!
        cyl.rotateX(Math.PI / 2);
        return { geometry: cyl };
      }
      if (geom.type === 'sphere') {
        const r = geom.radius ?? 0.05;
        return { geometry: new THREE.SphereGeometry(r, 24, 24) };
      }

      // Mesh geometry: lookup by filename basename in meshAssets
      const rawPath = geom.filename ?? '';
      const basename = rawPath.split('/').pop()?.trim() || rawPath;
      const asset =
        meshAssets[basename] ||
        meshAssets[rawPath] ||
        Object.values(meshAssets).find(
          (a) => a.name.toLowerCase() === basename.toLowerCase(),
        );

      if (asset) {
        try {
          if (asset.format === 'stl') {
            const buffer =
              typeof asset.content === 'string'
                ? new TextEncoder().encode(asset.content).buffer
                : asset.content;
            const parsedGeo = stlLoader.parse(buffer);
            parsedGeo.computeVertexNormals();
            if (geom.scale) {
              parsedGeo.scale(geom.scale[0], geom.scale[1], geom.scale[2]);
            }
            return { geometry: parsedGeo };
          } else if (asset.format === 'obj') {
            const text =
              typeof asset.content === 'string'
                ? asset.content
                : new TextDecoder().decode(asset.content);
            const objGroup = objLoader.parse(text);
            let foundGeo: THREE.BufferGeometry | null = null;
            objGroup.traverse((child) => {
              if ((child as THREE.Mesh).isMesh && !foundGeo) {
                foundGeo = (child as THREE.Mesh).geometry.clone();
              }
            });
            if (foundGeo) {
              (foundGeo as THREE.BufferGeometry).computeVertexNormals();
              if (geom.scale) {
                (foundGeo as THREE.BufferGeometry).scale(
                  geom.scale[0],
                  geom.scale[1],
                  geom.scale[2],
                );
              }
              return { geometry: foundGeo };
            }
          }
        } catch {
          // Fall through to placeholder box
        }
      }

      // Fallback placeholder box when external mesh isn't uploaded yet
      const fallback = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      if (geom.scale) {
        fallback.scale(geom.scale[0], geom.scale[1], geom.scale[2]);
      }
      return { geometry: fallback };
    }

    function applyOriginTransform(
      obj: THREE.Object3D,
      xyz: Vector3Tuple,
      rpy: Vector3Tuple,
    ) {
      obj.position.set(xyz[0], xyz[1], xyz[2]);
      const [qx, qy, qz, qw] = rpyToQuaternion(rpy);
      obj.quaternion.set(qx, qy, qz, qw);
    }

    function buildNodeRecursive(
      node: KinematicTreeNode,
      parentThreeGroup: THREE.Object3D,
    ) {
      const linkGroup = new THREE.Group();
      linkGroup.name = `link:${node.linkName}`;
      linkGroupsRef.current[node.linkName] = linkGroup;

      if (node.joint) {
        const j = node.joint;
        // Static joint origin frame relative to parent link
        const jointOriginGroup = new THREE.Group();
        jointOriginGroup.name = `joint_origin:${j.name}`;
        applyOriginTransform(jointOriginGroup, j.origin.xyz, j.origin.rpy);
        parentThreeGroup.add(jointOriginGroup);

        // Joint Axis Indicator attached to static joint origin
        if (j.type !== 'fixed') {
          const axisIndicator = createJointAxisIndicator(j.axis, j.type);
          axisIndicator.userData = {
            jointName: j.name,
            linkName: node.linkName,
          };
          jointOriginGroup.add(axisIndicator);
          jointAxisObjectsRef.current.push(axisIndicator);
        }

        // Dynamic joint motion group
        const jointMotionGroup = new THREE.Group();
        jointMotionGroup.name = `joint_motion:${j.name}`;
        jointOriginGroup.add(jointMotionGroup);

        jointPivotsRef.current[j.name] = {
          jointGroup: jointMotionGroup,
          axis: new THREE.Vector3(
            j.axis[0],
            j.axis[1],
            j.axis[2],
          ).normalize(),
          type: j.type,
          lower: j.limit.lower,
          upper: j.limit.upper,
        };

        jointMotionGroup.add(linkGroup);
      } else {
        parentThreeGroup.add(linkGroup);
      }

      // 1. Visual Geometries
      for (const vis of node.link.visuals) {
        const { geometry } = createGeometryInstance(vis.geometry);
        const rgba = vis.material?.rgba ?? [0.65, 0.72, 0.82, 1.0];
        const color = new THREE.Color(rgba[0], rgba[1], rgba[2]);

        const mat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.35,
          metalness: 0.45,
          transparent: rgba[3] < 1.0,
          opacity: rgba[3],
          wireframe: layers.wireframeVisual,
        });

        const mesh = new THREE.Mesh(geometry, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = {
          linkName: node.linkName,
          baseColorHex: color.getHex(),
        };
        applyOriginTransform(mesh, vis.origin.xyz, vis.origin.rpy);

        linkGroup.add(mesh);
        visualMeshesRef.current.push(mesh);
        interactableMeshesRef.current.push(mesh);
      }

      // 2. Collision Geometries (Wireframe + translucent amber hull)
      for (const col of node.link.collisions) {
        const { geometry } = createGeometryInstance(col.geometry);
        const colGroup = new THREE.Group();
        colGroup.userData = { linkName: node.linkName };
        applyOriginTransform(colGroup, col.origin.xyz, col.origin.rpy);

        const hullMat = new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        });
        const hullMesh = new THREE.Mesh(geometry, hullMat);

        const edgesGeo = new THREE.EdgesGeometry(geometry, 15);
        const edgesMat = new THREE.LineBasicMaterial({ color: 0xfbbf24 });
        const edgesLine = new THREE.LineSegments(edgesGeo, edgesMat);

        colGroup.add(hullMesh, edgesLine);
        linkGroup.add(colGroup);
        collisionObjectsRef.current.push(colGroup);
      }

      // 3. TF Frame RGB Axes & 3D Frame Name Sprite
      const tfAxes = createRgbAxesGroup(0.11);
      tfAxes.userData = { linkName: node.linkName };
      linkGroup.add(tfAxes);
      tfFrameObjectsRef.current.push(tfAxes);

      const tfLabelSprite = createTfNameLabelSprite(node.linkName);
      tfLabelSprite.userData = { linkName: node.linkName };
      linkGroup.add(tfLabelSprite);
      tfLabelSpritesRef.current.push(tfLabelSprite);

      // 4. Inertial: Center of Mass Sphere & Principal Inertia Tensor Box
      if (node.link.inertial) {
        const inert = node.link.inertial;
        const comGroup = new THREE.Group();
        comGroup.userData = { linkName: node.linkName };
        applyOriginTransform(comGroup, inert.origin.xyz, inert.origin.rpy);

        const comRadius = Math.max(
          0.016,
          Math.min(0.045, 0.015 * Math.cbrt(Math.max(0.1, inert.mass))),
        );
        const comGeo = new THREE.SphereGeometry(comRadius, 16, 16);
        const comMat = new THREE.MeshStandardMaterial({
          color: 0xec4899,
          emissive: 0xbe185d,
          emissiveIntensity: 0.35,
          roughness: 0.25,
        });
        const comMesh = new THREE.Mesh(comGeo, comMat);
        comGroup.add(comMesh);
        linkGroup.add(comGroup);
        comObjectsRef.current.push(comGroup);

        // Equivalent uniform-density box dimensions from principal moments of inertia
        const m = Math.max(0.05, inert.mass);
        const { ixx, iyy, izz } = inert.inertia;
        const bx = Math.sqrt(Math.max(0.0004, (6 / m) * Math.max(0.0001, iyy + izz - ixx)));
        const by = Math.sqrt(Math.max(0.0004, (6 / m) * Math.max(0.0001, ixx + izz - iyy)));
        const bz = Math.sqrt(Math.max(0.0004, (6 / m) * Math.max(0.0001, ixx + iyy - izz)));

        const clampedBx = Math.max(0.03, Math.min(0.6, bx));
        const clampedBy = Math.max(0.03, Math.min(0.6, by));
        const clampedBz = Math.max(0.03, Math.min(0.6, bz));

        const inertiaBoxGeo = new THREE.BoxGeometry(
          clampedBx,
          clampedBy,
          clampedBz,
        );
        const inertiaEdges = new THREE.EdgesGeometry(inertiaBoxGeo);
        const inertiaLine = new THREE.LineSegments(
          inertiaEdges,
          new THREE.LineBasicMaterial({ color: 0xa855f7 }),
        );
        const inertiaGroup = new THREE.Group();
        inertiaGroup.userData = { linkName: node.linkName };
        applyOriginTransform(inertiaGroup, inert.origin.xyz, inert.origin.rpy);
        inertiaGroup.add(inertiaLine);
        linkGroup.add(inertiaGroup);
        inertiaObjectsRef.current.push(inertiaGroup);
      }

      for (const childNode of node.children) {
        buildNodeRecursive(childNode, linkGroup);
      }
    }

    buildNodeRecursive(model.tree, robotRoot);
    requestRenderRef.current();
  }, [model, meshAssets]);

  // Apply Joint Articulation Values in real time without rebuilding geometry
  useEffect(() => {
    const effectiveJointValues = resolveMimicJointValues(model, jointValues);
    for (const [jointName, entry] of Object.entries(jointPivotsRef.current)) {
      const rawVal = effectiveJointValues[jointName] ?? 0;
      const val =
        entry.type === 'revolute' || entry.type === 'prismatic'
          ? Math.max(entry.lower, Math.min(entry.upper, rawVal))
          : rawVal;

      if (entry.type === 'revolute' || entry.type === 'continuous') {
        _tempQuat.setFromAxisAngle(entry.axis, val);
        entry.jointGroup.quaternion.copy(_tempQuat);
        entry.jointGroup.position.set(0, 0, 0);
      } else if (entry.type === 'prismatic') {
        entry.jointGroup.quaternion.identity();
        entry.jointGroup.position
          .copy(entry.axis)
          .multiplyScalar(val);
      }
    }
    requestRenderRef.current();
  }, [jointValues, model]);

  // Apply RViz Layer Visibilities, Tree Checkboxes & Selection Highlights
  useEffect(() => {
    const markerScale = Math.max(
      0.2,
      Math.min(3.0, treeSettings.tfMarkerScale || 1.0),
    );
    const selectedJointChildLink =
      selectedNode?.type === 'joint'
        ? model.joints[selectedNode.name]?.child
        : undefined;

    for (const mesh of visualMeshesRef.current) {
      const linkName = mesh.userData?.linkName as string | undefined;
      const linkEnabled = linkName ? !treeSettings.disabledLinks[linkName] : true;
      mesh.visible = layers.visual && linkEnabled;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.wireframe = layers.wireframeVisual;

      const isSelectedLink =
        selectedNode?.type === 'link' && linkName === selectedNode.name;
      const isSelectedJointChild =
        Boolean(selectedJointChildLink) && linkName === selectedJointChildLink;

      if (isSelectedLink) {
        mat.emissive.setHex(0x0284c7);
        mat.emissiveIntensity = 0.45;
      } else if (isSelectedJointChild) {
        mat.emissive.setHex(0xd97706);
        mat.emissiveIntensity = 0.4;
      } else {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    }

    for (const obj of collisionObjectsRef.current) {
      const linkName = obj.userData?.linkName as string | undefined;
      const linkEnabled = linkName ? !treeSettings.disabledLinks[linkName] : true;
      obj.visible = layers.collision && linkEnabled;
    }

    for (const obj of tfFrameObjectsRef.current) {
      const linkName = obj.userData?.linkName as string | undefined;
      const linkEnabled = linkName ? !treeSettings.disabledLinks[linkName] : true;
      const tfEnabled = linkName ? !treeSettings.disabledTfFrames[linkName] : true;
      obj.visible = layers.tfFrames && linkEnabled && tfEnabled;
      obj.scale.setScalar(markerScale);
    }

    for (const sprite of tfLabelSpritesRef.current) {
      const linkName = sprite.userData?.linkName as string | undefined;
      const linkEnabled = linkName ? !treeSettings.disabledLinks[linkName] : true;
      const tfEnabled = linkName ? !treeSettings.disabledTfFrames[linkName] : true;
      sprite.visible = layers.tfLabels && linkEnabled && tfEnabled;
      sprite.scale.set(0.24 * markerScale, 0.054 * markerScale, 1);
    }

    for (const obj of jointAxisObjectsRef.current) {
      const jointName = obj.userData?.jointName as string | undefined;
      const linkName = obj.userData?.linkName as string | undefined;
      const jointEnabled = jointName
        ? !treeSettings.disabledJoints[jointName]
        : true;
      const linkEnabled = linkName ? !treeSettings.disabledLinks[linkName] : true;
      const isSelectedJoint =
        selectedNode?.type === 'joint' && selectedNode.name === jointName;
      obj.visible =
        (layers.jointAxes || isSelectedJoint) && jointEnabled && linkEnabled;
      obj.scale.setScalar(markerScale);
    }

    for (const obj of comObjectsRef.current) {
      const linkName = obj.userData?.linkName as string | undefined;
      const linkEnabled = linkName ? !treeSettings.disabledLinks[linkName] : true;
      obj.visible = layers.centerOfMass && linkEnabled;
    }

    for (const obj of inertiaObjectsRef.current) {
      const linkName = obj.userData?.linkName as string | undefined;
      const linkEnabled = linkName ? !treeSettings.disabledLinks[linkName] : true;
      obj.visible = layers.inertiaBoxes && linkEnabled;
    }

    if (gridGroupRef.current) {
      gridGroupRef.current.visible = layers.grid;
    }

    requestRenderRef.current();
  }, [layers, treeSettings, selectedNode, model]);

  // Update 3D Distance Measurement Markers & Line
  useEffect(() => {
    const measureGroup = measureGroupRef.current;
    if (!measureGroup) return;
    measureGroup.clear();

    if (!measurePointA) {
      requestRenderRef.current();
      return;
    }

    const markerGeo = new THREE.SphereGeometry(0.014, 16, 16);
    const matA = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const meshA = new THREE.Mesh(markerGeo, matA);
    meshA.position.set(measurePointA[0], measurePointA[1], measurePointA[2]);
    measureGroup.add(meshA);

    if (measurePointB) {
      const matB = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
      const meshB = new THREE.Mesh(markerGeo, matB);
      meshB.position.set(measurePointB[0], measurePointB[1], measurePointB[2]);
      measureGroup.add(meshB);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...measurePointA),
        new THREE.Vector3(...measurePointB),
      ]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8 });
      measureGroup.add(new THREE.Line(lineGeo, lineMat));
    }

    requestRenderRef.current();
  }, [measurePointA, measurePointB]);

  const handleCameraPreset = (preset: CameraPreset) => {
    setActiveCameraPreset(preset);
    const lookAt = new THREE.Vector3(0, 0, 0.42);
    if (preset === 'iso' || preset === 'reset') {
      cameraPresetTargetRef.current = {
        pos: new THREE.Vector3(1.45, -1.55, 1.12),
        lookAt,
      };
    } else if (preset === 'top') {
      cameraPresetTargetRef.current = {
        pos: new THREE.Vector3(0.01, -0.01, 2.4),
        lookAt: new THREE.Vector3(0, 0, 0),
      };
    } else if (preset === 'front') {
      // +X is Forward in ROS
      cameraPresetTargetRef.current = {
        pos: new THREE.Vector3(2.1, 0, 0.45),
        lookAt,
      };
    } else if (preset === 'side') {
      // +Y is Left in ROS
      cameraPresetTargetRef.current = {
        pos: new THREE.Vector3(0, -2.1, 0.45),
        lookAt,
      };
    }
    requestRenderRef.current();
  };

  const measureDistance =
    measurePointA && measurePointB
      ? Math.hypot(
          measurePointB[0] - measurePointA[0],
          measurePointB[1] - measurePointA[1],
          measurePointB[2] - measurePointA[2],
        )
      : null;

  const selectedTransform =
    selectedNode?.type === 'link'
      ? worldTransforms[selectedNode.name]
      : undefined;

  return (
    <div className="relative w-full h-full bg-[#0f172a] overflow-hidden select-none">
      {/* Dedicated WebGL Mount Container (Isolated from React HUD children) */}
      <div
        ref={canvasMountRef}
        data-testid="rviz-webgl-canvas"
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Top Viewport Camera & Inspection Bar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
        {/* Left: ROS2 Z-Up Frame Badge & Camera Presets */}
        <div className="flex items-center gap-1 bg-[#111827] border border-[#26334d] rounded-lg p-1 pointer-events-auto shadow-md">
          <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-300 border-r border-[#26334d] whitespace-nowrap shrink-0">
            <Compass className="w-3.5 h-3.5 text-sky-400" />
            <span className="font-mono text-sky-400">
              {model.rootLink || 'base_link'}
            </span>
          </div>

          {(
            [
              { id: 'iso', label: 'Iso' },
              { id: 'top', label: 'Top' },
              { id: 'front', label: 'Front' },
              { id: 'side', label: 'Side' },
            ] as { id: CameraPreset; label: string }[]
          ).map((cam) => (
            <button
              key={cam.id}
              type="button"
              onClick={() => handleCameraPreset(cam.id)}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                activeCameraPreset === cam.id
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {cam.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => handleCameraPreset('reset')}
            title="Reset Camera Orbit"
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>

        {/* Right: 3D Measure Tool & Live Z-Up Coordinate Readout */}
        <div className="flex items-center gap-1.5 bg-[#111827] border border-[#26334d] rounded-lg p-1 pointer-events-auto shadow-md">
          <button
            type="button"
            onClick={() => {
              setMeasureActive((prev) => !prev);
              if (measureActive) {
                setMeasurePointA(null);
                setMeasurePointB(null);
              }
            }}
            className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              measureActive
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>{measureActive ? 'Exit Measure' : 'Measure 3D'}</span>
          </button>

          <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono tabular-nums text-slate-300 border-l border-[#26334d] whitespace-nowrap shrink-0">
            <Crosshair className="w-3.5 h-3.5 text-slate-400" />
            {hoverCoords ? (
              <span>
                <span className="text-red-400">X:{hoverCoords[0].toFixed(2)}</span>{' '}
                <span className="text-emerald-400">Y:{hoverCoords[1].toFixed(2)}</span>{' '}
                <span className="text-blue-400">Z:{hoverCoords[2].toFixed(2)}</span>m
                {hoveredLinkName ? (
                  <span className="text-slate-400"> · {hoveredLinkName}</span>
                ) : null}
              </span>
            ) : (
              <span className="text-slate-400">
                Z-Up · +X:Red +Y:Grn +Z:Blu
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Active 3D Distance Measurement Readout Banner (Top Center when active) */}
      {measureActive && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-3.5 py-1.5 bg-[#111827] border border-sky-500/40 rounded-lg text-xs font-mono tabular-nums text-slate-200 shadow-lg">
          <span>
            {!measurePointA
              ? 'Click Point A on robot or grid'
              : !measurePointB
                ? `Point A: (${measurePointA.map((v) => v.toFixed(3)).join(', ')})m — Click Point B`
                : `Distance: ${measureDistance?.toFixed(4)} m · ΔX:${(
                    measurePointB[0] - measurePointA[0]
                  ).toFixed(3)}m ΔY:${(
                    measurePointB[1] - measurePointA[1]
                  ).toFixed(3)}m ΔZ:${(
                    measurePointB[2] - measurePointA[2]
                  ).toFixed(3)}m`}
          </span>
          {(measurePointA || measurePointB) && (
            <button
              type="button"
              onClick={() => {
                setMeasurePointA(null);
                setMeasurePointB(null);
              }}
              className="px-2 py-0.5 text-xs font-sans font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
            >
              Clear Points
            </button>
          )}
        </div>
      )}

      {/* Selected Link World Transform Readout (Top-Left Sub-bar when a link is selected) */}
      {selectedNode && selectedTransform && !measureActive && (
        <div className="absolute top-14 left-3 z-10 flex items-center gap-3 px-3 py-1.5 bg-[#111827] border border-[#26334d] rounded-lg text-xs font-mono tabular-nums text-slate-300 shadow-md">
          <Box className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="font-sans font-semibold text-white">
            {selectedNode.name}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Pos: [{selectedTransform.position.map((v) => v.toFixed(3)).join(', ')}]m
          </span>
          <span aria-hidden="true">·</span>
          <span>
            RPY: [{selectedTransform.rpy.map((v) => v.toFixed(2)).join(', ')}]rad
          </span>
          <button
            type="button"
            onClick={() => onSelectNode(null)}
            className="ml-1 text-slate-400 hover:text-white font-sans"
          >
            Clear
          </button>
        </div>
      )}

      {/* Bottom Collapsible RViz Display Layers & Joint State Publisher Dock */}
      {children}
    </div>
  );
};
