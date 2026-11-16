export type Vector3Tuple = [number, number, number];
export type ColorRgbaTuple = [number, number, number, number];

export interface UrdfOrigin {
  xyz: Vector3Tuple;
  rpy: Vector3Tuple; // roll (X), pitch (Y), yaw (Z) in radians
}

export type UrdfGeometryType = 'box' | 'cylinder' | 'sphere' | 'mesh';

export interface UrdfGeometry {
  type: UrdfGeometryType;
  size?: Vector3Tuple; // for box: [x, y, z]
  radius?: number; // for cylinder & sphere
  length?: number; // for cylinder (along Z axis in URDF!)
  filename?: string; // for mesh (e.g. package://... or relative path)
  scale?: Vector3Tuple; // for mesh: default [1, 1, 1]
  line: number;
}

export interface UrdfMaterial {
  name: string;
  rgba: ColorRgbaTuple;
  textureFilename?: string;
  line: number;
}

export interface UrdfVisual {
  name?: string;
  origin: UrdfOrigin;
  geometry: UrdfGeometry;
  material?: UrdfMaterial;
  line: number;
}

export interface UrdfCollision {
  name?: string;
  origin: UrdfOrigin;
  geometry: UrdfGeometry;
  line: number;
}

export interface UrdfInertiaTensor {
  ixx: number;
  ixy: number;
  ixz: number;
  iyy: number;
  iyz: number;
  izz: number;
}

export interface UrdfInertial {
  origin: UrdfOrigin;
  mass: number;
  inertia: UrdfInertiaTensor;
  line: number;
}

export interface UrdfLink {
  name: string;
  visuals: UrdfVisual[];
  collisions: UrdfCollision[];
  inertial?: UrdfInertial;
  line: number;
  endLine: number;
}

export type UrdfJointType =
  | 'revolute'
  | 'continuous'
  | 'prismatic'
  | 'fixed'
  | 'floating'
  | 'planar';

export interface UrdfJointLimit {
  lower: number;
  upper: number;
  effort: number;
  velocity: number;
}

export interface UrdfJointMimic {
  joint: string;
  multiplier: number;
  offset: number;
  line: number;
}

export interface UrdfJoint {
  name: string;
  type: UrdfJointType;
  parent: string;
  child: string;
  origin: UrdfOrigin;
  axis: Vector3Tuple; // default [1, 0, 0] per ROS URDF spec
  limit: UrdfJointLimit;
  mimic?: UrdfJointMimic;
  line: number;
  endLine: number;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface CompilerDiagnostic {
  id: string;
  severity: DiagnosticSeverity;
  line: number;
  column?: number;
  message: string;
  elementName?: string;
}

export interface KinematicTreeNode {
  linkName: string;
  link: UrdfLink;
  joint?: UrdfJoint; // joint connecting parent to this link (undefined for rootLink)
  children: KinematicTreeNode[];
  depth: number;
}

export interface LinkWorldTransform {
  linkName: string;
  position: Vector3Tuple;
  rpy: Vector3Tuple;
  quaternion: [number, number, number, number]; // [x, y, z, w]
  matrix: number[]; // 16-element column-major 4x4 matrix
}

export interface ParsedUrdfModel {
  valid: boolean;
  robotName: string;
  materials: Record<string, UrdfMaterial>;
  links: Record<string, UrdfLink>;
  joints: Record<string, UrdfJoint>;
  rootLink: string | null;
  tree: KinematicTreeNode | null;
  diagnostics: CompilerDiagnostic[];
  compiledAt: number;
  isXacro?: boolean;
  expandedUrdfXml?: string;
  xacroPropertyCount?: number;
  xacroMacroCount?: number;
}

export interface ViewportLayers {
  visual: boolean;
  collision: boolean;
  tfFrames: boolean;
  tfLabels: boolean;
  jointAxes: boolean;
  centerOfMass: boolean;
  inertiaBoxes: boolean;
  grid: boolean;
  wireframeVisual: boolean;
}

export interface CustomMeshAsset {
  name: string; // normalized filename e.g. 'lidar_head.stl'
  originalPath: string;
  format: 'stl' | 'obj';
  sizeBytes: number;
  content: ArrayBuffer | string;
  vertexCount: number;
  isBuiltIn?: boolean;
}

export interface StarterTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  dofCount: number;
  urdfXml: string;
  isXacro?: boolean;
}

export interface RvizTreeDisplaySettings {
  treeStyle: 'hierarchy' | 'alphabetic';
  expandDetails: boolean;
  disabledLinks: Record<string, boolean>;
  disabledTfFrames: Record<string, boolean>;
  disabledJoints: Record<string, boolean>;
  tfMarkerScale: number;
}

