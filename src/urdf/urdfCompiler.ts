import {
  ColorRgbaTuple,
  CompilerDiagnostic,
  KinematicTreeNode,
  LinkWorldTransform,
  ParsedUrdfModel,
  UrdfCollision,
  UrdfGeometry,
  UrdfInertial,
  UrdfJoint,
  UrdfJointLimit,
  UrdfJointMimic,
  UrdfJointType,
  UrdfLink,
  UrdfMaterial,
  UrdfOrigin,
  UrdfVisual,
  Vector3Tuple,
} from './types';
import { parseXmlWithLines, XmlNode } from './xmlParser';
import { expandXacroAst } from './xacroProcessor';

const VALID_JOINT_TYPES = new Set<UrdfJointType>([
  'revolute',
  'continuous',
  'prismatic',
  'fixed',
  'floating',
  'planar',
]);

function parseVector3(
  raw: string | undefined,
  defaultVal: Vector3Tuple,
  line: number,
  attrLabel: string,
  diagnostics: CompilerDiagnostic[],
): Vector3Tuple {
  if (raw === undefined || raw.trim() === '') {
    return [...defaultVal] as Vector3Tuple;
  }
  const parts = raw.trim().split(/\s+/);
  if (parts.length !== 3) {
    diagnostics.push({
      id: `vec3-${line}-${attrLabel}-${diagnostics.length}`,
      severity: 'error',
      line,
      message: `Invalid ${attrLabel}="${raw}": expected 3 space-separated numbers (e.g. "0 0 0").`,
    });
    return [...defaultVal] as Vector3Tuple;
  }
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n) || !Number.isFinite(n))) {
    diagnostics.push({
      id: `vec3-nan-${line}-${attrLabel}-${diagnostics.length}`,
      severity: 'error',
      line,
      message: `Non-numeric value in ${attrLabel}="${raw}".`,
    });
    return [...defaultVal] as Vector3Tuple;
  }
  return [nums[0], nums[1], nums[2]];
}

function parseRgba(
  raw: string | undefined,
  defaultVal: ColorRgbaTuple,
  line: number,
  diagnostics: CompilerDiagnostic[],
): ColorRgbaTuple {
  if (raw === undefined || raw.trim() === '') {
    return [...defaultVal] as ColorRgbaTuple;
  }
  const parts = raw.trim().split(/\s+/);
  if (parts.length !== 4) {
    diagnostics.push({
      id: `rgba-${line}-${diagnostics.length}`,
      severity: 'error',
      line,
      message: `Invalid rgba="${raw}": expected 4 space-separated numbers in [0..1] range (r g b a).`,
    });
    return [...defaultVal] as ColorRgbaTuple;
  }
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n) || !Number.isFinite(n))) {
    diagnostics.push({
      id: `rgba-nan-${line}-${diagnostics.length}`,
      severity: 'error',
      line,
      message: `Non-numeric value in rgba="${raw}".`,
    });
    return [...defaultVal] as ColorRgbaTuple;
  }
  if (nums.some((n) => n < 0 || n > 1)) {
    diagnostics.push({
      id: `rgba-range-${line}-${diagnostics.length}`,
      severity: 'warning',
      line,
      message: `Color rgba="${raw}" has channel values outside [0.0, 1.0]; clamping to [0..1].`,
    });
  }
  return [
    Math.max(0, Math.min(1, nums[0])),
    Math.max(0, Math.min(1, nums[1])),
    Math.max(0, Math.min(1, nums[2])),
    Math.max(0, Math.min(1, nums[3])),
  ];
}

const ALLOWED_ROBOT_CHILDREN = new Set([
  'link',
  'joint',
  'material',
  'gazebo',
  'transmission',
  'ros2_control',
  'sensor',
]);
const ALLOWED_LINK_CHILDREN = new Set([
  'visual',
  'collision',
  'inertial',
  'gazebo',
  'sensor',
]);
const ALLOWED_VISUAL_CHILDREN = new Set(['origin', 'geometry', 'material']);
const ALLOWED_COLLISION_CHILDREN = new Set(['origin', 'geometry']);
const ALLOWED_GEOMETRY_CHILDREN = new Set([
  'box',
  'cylinder',
  'sphere',
  'mesh',
  'capsule',
]);
const ALLOWED_INERTIAL_CHILDREN = new Set(['origin', 'mass', 'inertia']);
const ALLOWED_JOINT_CHILDREN = new Set([
  'origin',
  'parent',
  'child',
  'axis',
  'limit',
  'dynamics',
  'calibration',
  'safety_controller',
  'mimic',
]);

function checkAllowedAttributes(
  node: XmlNode,
  allowed: Set<string>,
  diagnostics: CompilerDiagnostic[],
) {
  for (const attrKey of Object.keys(node.attributes)) {
    if (!allowed.has(attrKey)) {
      diagnostics.push({
        id: `invalid-attr-${node.line}-${node.tagName}-${attrKey}`,
        severity: 'error',
        line: node.line,
        message: `Invalid attribute "${attrKey}" on <${node.tagName}> at line ${node.line}. Allowed attributes: [${Array.from(allowed).join(', ')}].`,
      });
    }
  }
  if (node.text && node.text.trim().length > 0) {
    diagnostics.push({
      id: `unexpected-text-${node.line}-${node.tagName}`,
      severity: 'error',
      line: node.line,
      message: `Unexpected text content "${node.text.trim().slice(0, 32)}" inside <${node.tagName}> at line ${node.line}.`,
    });
  }
}

function parseOriginNode(
  parentNode: XmlNode,
  diagnostics: CompilerDiagnostic[],
): UrdfOrigin {
  const originNodes = parentNode.children.filter((c) => c.tagName === 'origin');
  if (originNodes.length === 0) {
    return {
      xyz: [0, 0, 0],
      rpy: [0, 0, 0],
    };
  }
  if (originNodes.length > 1) {
    diagnostics.push({
      id: `dup-origin-${originNodes[1].line}`,
      severity: 'warning',
      line: originNodes[1].line,
      message: `Multiple <origin> tags inside <${parentNode.tagName}>; only the first is used.`,
    });
  }
  const originNode = originNodes[0];
  checkAllowedAttributes(originNode, new Set(['xyz', 'rpy']), diagnostics);

  return {
    xyz: parseVector3(
      originNode.attributes.xyz,
      [0, 0, 0],
      originNode.line,
      'origin xyz',
      diagnostics,
    ),
    rpy: parseVector3(
      originNode.attributes.rpy,
      [0, 0, 0],
      originNode.line,
      'origin rpy',
      diagnostics,
    ),
  };
}

function parseGeometryNode(
  containerNode: XmlNode,
  contextLabel: string,
  diagnostics: CompilerDiagnostic[],
): UrdfGeometry | null {
  const geomNode = containerNode.children.find((c) => c.tagName === 'geometry');
  if (!geomNode) {
    diagnostics.push({
      id: `geom-missing-${containerNode.line}-${diagnostics.length}`,
      severity: 'error',
      line: containerNode.line,
      message: `Missing <geometry> element inside ${contextLabel}.`,
    });
    return null;
  }

  checkAllowedAttributes(geomNode, new Set(['name']), diagnostics);

  for (const child of geomNode.children) {
    if (!ALLOWED_GEOMETRY_CHILDREN.has(child.tagName)) {
      diagnostics.push({
        id: `geom-unknown-child-${child.line}-${child.tagName}`,
        severity: 'error',
        line: child.line,
        message: `Invalid geometry tag "<${child.tagName}>" inside <geometry> at line ${child.line}. Expected <box>, <cylinder>, <sphere>, or <mesh>.`,
      });
    }
  }

  const shapeNode = geomNode.children.find((c) =>
    ['box', 'cylinder', 'sphere', 'mesh', 'capsule'].includes(c.tagName),
  );

  if (!shapeNode) {
    diagnostics.push({
      id: `shape-missing-${geomNode.line}-${diagnostics.length}`,
      severity: 'error',
      line: geomNode.line,
      message: `<geometry> at line ${geomNode.line} must contain <box>, <cylinder>, <sphere>, or <mesh>.`,
    });
    return null;
  }

  if (shapeNode.tagName === 'box') {
    checkAllowedAttributes(shapeNode, new Set(['size']), diagnostics);
    const size = parseVector3(
      shapeNode.attributes.size,
      [0.1, 0.1, 0.1],
      shapeNode.line,
      'box size',
      diagnostics,
    );
    if (!shapeNode.attributes.size) {
      diagnostics.push({
        id: `box-size-missing-${shapeNode.line}-${diagnostics.length}`,
        severity: 'error',
        line: shapeNode.line,
        message: `<box> at line ${shapeNode.line} is missing required size="x y z" attribute.`,
      });
    } else if (size.some((v) => v <= 0)) {
      diagnostics.push({
        id: `box-size-nonpos-${shapeNode.line}`,
        severity: 'error',
        line: shapeNode.line,
        message: `<box size="${shapeNode.attributes.size}"> at line ${shapeNode.line} requires positive dimensions (> 0).`,
      });
    }
    return {
      type: 'box',
      size: size.map((v) => (v > 0 ? v : 0.1)) as Vector3Tuple,
      line: shapeNode.line,
    };
  }

  if (shapeNode.tagName === 'cylinder' || shapeNode.tagName === 'capsule') {
    checkAllowedAttributes(
      shapeNode,
      new Set(['radius', 'length']),
      diagnostics,
    );
    const radius = Number(shapeNode.attributes.radius ?? NaN);
    const length = Number(shapeNode.attributes.length ?? NaN);
    if (
      shapeNode.attributes.radius === undefined ||
      shapeNode.attributes.length === undefined ||
      Number.isNaN(radius) ||
      Number.isNaN(length) ||
      radius <= 0 ||
      length <= 0
    ) {
      diagnostics.push({
        id: `cyl-invalid-${shapeNode.line}-${diagnostics.length}`,
        severity: 'error',
        line: shapeNode.line,
        message: `<${shapeNode.tagName}> at line ${shapeNode.line} requires positive numeric radius and length attributes.`,
      });
    }
    return {
      type: 'cylinder',
      radius: Number.isFinite(radius) && radius > 0 ? radius : 0.05,
      length: Number.isFinite(length) && length > 0 ? length : 0.2,
      line: shapeNode.line,
    };
  }

  if (shapeNode.tagName === 'sphere') {
    checkAllowedAttributes(shapeNode, new Set(['radius']), diagnostics);
    const radius = Number(shapeNode.attributes.radius ?? NaN);
    if (
      shapeNode.attributes.radius === undefined ||
      Number.isNaN(radius) ||
      radius <= 0
    ) {
      diagnostics.push({
        id: `sphere-invalid-${shapeNode.line}-${diagnostics.length}`,
        severity: 'error',
        line: shapeNode.line,
        message: `<sphere> at line ${shapeNode.line} requires a positive numeric radius attribute.`,
      });
    }
    return {
      type: 'sphere',
      radius: Number.isFinite(radius) && radius > 0 ? radius : 0.05,
      line: shapeNode.line,
    };
  }

  // mesh
  checkAllowedAttributes(
    shapeNode,
    new Set(['filename', 'scale']),
    diagnostics,
  );
  const filename = shapeNode.attributes.filename?.trim() ?? '';
  if (!filename) {
    diagnostics.push({
      id: `mesh-no-file-${shapeNode.line}-${diagnostics.length}`,
      severity: 'error',
      line: shapeNode.line,
      message: `<mesh> at line ${shapeNode.line} is missing a filename="..." attribute.`,
    });
  }
  const scale = shapeNode.attributes.scale
    ? parseVector3(
        shapeNode.attributes.scale,
        [1, 1, 1],
        shapeNode.line,
        'mesh scale',
        diagnostics,
      )
    : ([1, 1, 1] as Vector3Tuple);

  return {
    type: 'mesh',
    filename,
    scale,
    line: shapeNode.line,
  };
}

function parseMaterialNode(
  matNode: XmlNode,
  globalMaterials: Record<string, UrdfMaterial>,
  diagnostics: CompilerDiagnostic[],
  isGlobal = false,
): UrdfMaterial {
  checkAllowedAttributes(matNode, new Set(['name']), diagnostics);
  const name = matNode.attributes.name?.trim() || '';
  if (!name) {
    diagnostics.push({
      id: `mat-noname-${matNode.line}`,
      severity: 'warning',
      line: matNode.line,
      message: `<material> at line ${matNode.line} is missing a name="..." attribute.`,
    });
  }
  for (const child of matNode.children) {
    if (child.tagName !== 'color' && child.tagName !== 'texture') {
      diagnostics.push({
        id: `mat-unknown-child-${child.line}-${child.tagName}`,
        severity: 'error',
        line: child.line,
        message: `Invalid tag "<${child.tagName}>" inside <material> at line ${child.line}. Expected <color rgba="..."/> or <texture filename="..."/>.`,
      });
    }
  }
  const colorNode = matNode.children.find((c) => c.tagName === 'color');
  const textureNode = matNode.children.find((c) => c.tagName === 'texture');

  if (colorNode) {
    checkAllowedAttributes(colorNode, new Set(['rgba']), diagnostics);
    if (!colorNode.attributes.rgba) {
      diagnostics.push({
        id: `color-no-rgba-${colorNode.line}`,
        severity: 'error',
        line: colorNode.line,
        message: `<color> at line ${colorNode.line} is missing required rgba="r g b a" attribute.`,
      });
    }
    const rgba = parseRgba(
      colorNode.attributes.rgba,
      [0.7, 0.75, 0.82, 1.0],
      colorNode.line,
      diagnostics,
    );
    return {
      name: name || `mat_${matNode.line}`,
      rgba,
      textureFilename: textureNode?.attributes.filename,
      line: matNode.line,
    };
  }

  if (!isGlobal && name && globalMaterials[name]) {
    return globalMaterials[name];
  }

  if (!isGlobal && name && !globalMaterials[name]) {
    diagnostics.push({
      id: `mat-undef-${matNode.line}-${diagnostics.length}`,
      severity: 'warning',
      line: matNode.line,
      message: `Material "${name}" referenced at line ${matNode.line} has no <color> child and is not defined globally. Using default steel material.`,
    });
  }

  return {
    name: name || `mat_${matNode.line}`,
    rgba: [0.64, 0.72, 0.82, 1.0],
    textureFilename: textureNode?.attributes.filename,
    line: matNode.line,
  };
}

function parseInertialNode(
  linkNode: XmlNode,
  linkName: string,
  diagnostics: CompilerDiagnostic[],
): UrdfInertial | undefined {
  const inertialNode = linkNode.children.find((c) => c.tagName === 'inertial');
  if (!inertialNode) return undefined;

  for (const child of inertialNode.children) {
    if (!ALLOWED_INERTIAL_CHILDREN.has(child.tagName)) {
      diagnostics.push({
        id: `inertial-unknown-child-${child.line}-${child.tagName}`,
        severity: 'error',
        line: child.line,
        message: `Invalid tag "<${child.tagName}>" inside <inertial> on link "${linkName}" at line ${child.line}. Expected <origin>, <mass>, or <inertia>.`,
      });
    }
  }

  const origin = parseOriginNode(inertialNode, diagnostics);
  const massNode = inertialNode.children.find((c) => c.tagName === 'mass');
  const inertiaNode = inertialNode.children.find((c) => c.tagName === 'inertia');

  let mass = 1.0;
  if (massNode) {
    checkAllowedAttributes(massNode, new Set(['value']), diagnostics);
    const parsedMass = Number(massNode.attributes.value);
    if (
      massNode.attributes.value === undefined ||
      massNode.attributes.value.trim() === '' ||
      Number.isNaN(parsedMass) ||
      parsedMass < 0
    ) {
      diagnostics.push({
        id: `mass-invalid-${massNode.line}-${diagnostics.length}`,
        severity: 'error',
        line: massNode.line,
        message: `Link "${linkName}" has invalid <mass value="${massNode.attributes.value ?? ''}"/> at line ${massNode.line}; expected non-negative number.`,
      });
    } else {
      mass = parsedMass;
    }
  } else {
    diagnostics.push({
      id: `mass-missing-${inertialNode.line}-${diagnostics.length}`,
      severity: 'warning',
      line: inertialNode.line,
      message: `<inertial> on link "${linkName}" has no <mass value="..."/> tag.`,
    });
  }

  const inertia = {
    ixx: 0.01,
    ixy: 0,
    ixz: 0,
    iyy: 0.01,
    iyz: 0,
    izz: 0.01,
  };

  if (inertiaNode) {
    const keys: (keyof typeof inertia)[] = [
      'ixx',
      'ixy',
      'ixz',
      'iyy',
      'iyz',
      'izz',
    ];
    checkAllowedAttributes(inertiaNode, new Set(keys), diagnostics);
    const missingKeys: string[] = [];
    for (const k of keys) {
      if (inertiaNode.attributes[k] !== undefined) {
        const val = Number(inertiaNode.attributes[k]);
        if (
          inertiaNode.attributes[k].trim() !== '' &&
          !Number.isNaN(val) &&
          Number.isFinite(val)
        ) {
          inertia[k] = val;
        } else {
          diagnostics.push({
            id: `inertia-nan-${inertiaNode.line}-${k}`,
            severity: 'error',
            line: inertiaNode.line,
            message: `Invalid numeric attribute ${k}="${inertiaNode.attributes[k]}" in <inertia> on link "${linkName}".`,
          });
        }
      } else {
        missingKeys.push(k);
      }
    }
    if (missingKeys.length > 0) {
      diagnostics.push({
        id: `inertia-missing-keys-${inertiaNode.line}`,
        severity: 'error',
        line: inertiaNode.line,
        message: `<inertia> on link "${linkName}" at line ${inertiaNode.line} is missing required attribute(s): ${missingKeys.join(', ')}.`,
      });
    }
  }

  return {
    origin,
    mass,
    inertia,
    line: inertialNode.line,
  };
}

/**
 * Compiles a raw URDF XML string into a validated ParsedUrdfModel with
 * line-accurate diagnostics and a hierarchical kinematic tree.
 */
export function compileUrdf(xml: string): ParsedUrdfModel {
  const diagnostics: CompilerDiagnostic[] = [];
  const materials: Record<string, UrdfMaterial> = {};
  const links: Record<string, UrdfLink> = {};
  const joints: Record<string, UrdfJoint> = {};

  const { root, errors: xmlErrors } = parseXmlWithLines(xml);

  for (const err of xmlErrors) {
    diagnostics.push({
      id: `xml-err-${err.line}-${err.column}-${diagnostics.length}`,
      severity: 'error',
      line: err.line,
      column: err.column,
      message: err.message,
    });
  }

  if (!root) {
    return {
      valid: false,
      robotName: 'invalid_robot',
      materials,
      links,
      joints,
      rootLink: null,
      tree: null,
      diagnostics,
      compiledAt: Date.now(),
    };
  }

  if (root.tagName !== 'robot') {
    diagnostics.push({
      id: `root-not-robot-${root.line}`,
      severity: 'error',
      line: root.line,
      message: `Root element must be <robot>, but found <${root.tagName}>.`,
    });
    return {
      valid: false,
      robotName: 'invalid_robot',
      materials,
      links,
      joints,
      rootLink: null,
      tree: null,
      diagnostics,
      compiledAt: Date.now(),
    };
  }

  // Preprocess ROS2 Xacro (<xacro:property>, <xacro:macro>, ${...} math expressions) before URDF passes
  const xacroExpansion = expandXacroAst(root, xml);
  diagnostics.push(...xacroExpansion.diagnostics);
  const expandedRoot = xacroExpansion.rootNode;

  // Validate <robot> attributes
  for (const attrKey of Object.keys(expandedRoot.attributes)) {
    if (
      attrKey !== 'name' &&
      attrKey !== 'version' &&
      !attrKey.startsWith('xmlns')
    ) {
      diagnostics.push({
        id: `robot-bad-attr-${expandedRoot.line}-${attrKey}`,
        severity: 'error',
        line: expandedRoot.line,
        message: `Invalid attribute "${attrKey}" on <robot> at line ${expandedRoot.line}. Allowed attributes: name, xmlns:xacro, version.`,
      });
    }
  }

  if (expandedRoot.text && expandedRoot.text.trim().length > 0) {
    diagnostics.push({
      id: `robot-unexpected-text-${expandedRoot.line}`,
      severity: 'error',
      line: expandedRoot.line,
      message: `Unexpected text content "${expandedRoot.text.trim().slice(0, 32)}" directly inside <robot> at line ${expandedRoot.line}.`,
    });
  }

  const robotName = expandedRoot.attributes.name?.trim() || '';
  if (!robotName) {
    diagnostics.push({
      id: `robot-name-missing-${expandedRoot.line}`,
      severity: 'error',
      line: expandedRoot.line,
      message: `<robot> tag at line ${expandedRoot.line} is missing required non-empty name="..." attribute.`,
    });
  }

  // Validate top-level children of <robot>
  for (const child of expandedRoot.children) {
    if (!ALLOWED_ROBOT_CHILDREN.has(child.tagName)) {
      diagnostics.push({
        id: `robot-unknown-child-${child.line}-${child.tagName}`,
        severity: 'error',
        line: child.line,
        message: `Invalid element "<${child.tagName}>" inside <robot> at line ${child.line}. Expected <link>, <joint>, or <material>.`,
      });
    }
  }

  // Pass 1: Global <material> elements directly under <robot>
  for (const child of expandedRoot.children) {
    if (child.tagName === 'material') {
      const mat = parseMaterialNode(child, materials, diagnostics, true);
      materials[mat.name] = mat;
    }
  }

  // Pass 2: <link> elements
  for (const child of expandedRoot.children) {
    if (child.tagName !== 'link') continue;
    checkAllowedAttributes(child, new Set(['name', 'type']), diagnostics);
    const linkName = child.attributes.name?.trim();
    if (!linkName) {
      diagnostics.push({
        id: `link-no-name-${child.line}-${diagnostics.length}`,
        severity: 'error',
        line: child.line,
        message: `<link> element at line ${child.line} is missing required name="..." attribute.`,
      });
      continue;
    }

    if (links[linkName]) {
      diagnostics.push({
        id: `link-dup-${child.line}-${linkName}`,
        severity: 'error',
        line: child.line,
        elementName: linkName,
        message: `Duplicate <link name="${linkName}"> at line ${child.line} (first defined at line ${links[linkName].line}).`,
      });
      continue;
    }

    const visuals: UrdfVisual[] = [];
    const collisions: UrdfCollision[] = [];

    for (const linkChild of child.children) {
      if (!ALLOWED_LINK_CHILDREN.has(linkChild.tagName)) {
        diagnostics.push({
          id: `link-unknown-child-${linkChild.line}-${linkChild.tagName}`,
          severity: 'error',
          line: linkChild.line,
          elementName: linkName,
          message: `Invalid element "<${linkChild.tagName}>" inside <link name="${linkName}"> at line ${linkChild.line}. Expected <visual>, <collision>, or <inertial>.`,
        });
        continue;
      }

      if (linkChild.tagName === 'visual') {
        checkAllowedAttributes(linkChild, new Set(['name']), diagnostics);
        for (const vc of linkChild.children) {
          if (!ALLOWED_VISUAL_CHILDREN.has(vc.tagName)) {
            diagnostics.push({
              id: `visual-unknown-child-${vc.line}-${vc.tagName}`,
              severity: 'error',
              line: vc.line,
              elementName: linkName,
              message: `Invalid element "<${vc.tagName}>" inside <visual> of link "${linkName}" at line ${vc.line}. Expected <origin>, <geometry>, or <material>.`,
            });
          }
        }
        const origin = parseOriginNode(linkChild, diagnostics);
        const geometry = parseGeometryNode(
          linkChild,
          `<visual> in link "${linkName}"`,
          diagnostics,
        );
        if (geometry) {
          const matNode = linkChild.children.find(
            (c) => c.tagName === 'material',
          );
          const material = matNode
            ? parseMaterialNode(matNode, materials, diagnostics, false)
            : undefined;
          visuals.push({
            name: linkChild.attributes.name,
            origin,
            geometry,
            material,
            line: linkChild.line,
          });
        }
      } else if (linkChild.tagName === 'collision') {
        checkAllowedAttributes(linkChild, new Set(['name']), diagnostics);
        for (const cc of linkChild.children) {
          if (!ALLOWED_COLLISION_CHILDREN.has(cc.tagName)) {
            diagnostics.push({
              id: `collision-unknown-child-${cc.line}-${cc.tagName}`,
              severity: 'error',
              line: cc.line,
              elementName: linkName,
              message: `Invalid element "<${cc.tagName}>" inside <collision> of link "${linkName}" at line ${cc.line}. Expected <origin> or <geometry>.`,
            });
          }
        }
        const origin = parseOriginNode(linkChild, diagnostics);
        const geometry = parseGeometryNode(
          linkChild,
          `<collision> in link "${linkName}"`,
          diagnostics,
        );
        if (geometry) {
          collisions.push({
            name: linkChild.attributes.name,
            origin,
            geometry,
            line: linkChild.line,
          });
        }
      }
    }

    const inertial = parseInertialNode(child, linkName, diagnostics);

    links[linkName] = {
      name: linkName,
      visuals,
      collisions,
      inertial,
      line: child.line,
      endLine: child.endLine,
    };
  }

  // Pass 3: <joint> elements
  for (const child of expandedRoot.children) {
    if (child.tagName !== 'joint') continue;
    checkAllowedAttributes(child, new Set(['name', 'type']), diagnostics);
    const jointName = child.attributes.name?.trim();
    const rawType = (child.attributes.type?.trim() || '') as UrdfJointType;

    if (!jointName) {
      diagnostics.push({
        id: `joint-no-name-${child.line}-${diagnostics.length}`,
        severity: 'error',
        line: child.line,
        message: `<joint> element at line ${child.line} is missing required name="..." attribute.`,
      });
      continue;
    }

    if (joints[jointName]) {
      diagnostics.push({
        id: `joint-dup-${child.line}-${jointName}`,
        severity: 'error',
        line: child.line,
        elementName: jointName,
        message: `Duplicate <joint name="${jointName}"> at line ${child.line} (first defined at line ${joints[jointName].line}).`,
      });
      continue;
    }

    if (!VALID_JOINT_TYPES.has(rawType)) {
      diagnostics.push({
        id: `joint-bad-type-${child.line}-${jointName}`,
        severity: 'error',
        line: child.line,
        elementName: jointName,
        message: `Joint "${jointName}" has invalid type="${rawType}". Expected one of: revolute, continuous, prismatic, fixed, floating, planar.`,
      });
    }
    const jointType: UrdfJointType = VALID_JOINT_TYPES.has(rawType)
      ? rawType
      : 'fixed';

    for (const jc of child.children) {
      if (!ALLOWED_JOINT_CHILDREN.has(jc.tagName)) {
        diagnostics.push({
          id: `joint-unknown-child-${jc.line}-${jc.tagName}`,
          severity: 'error',
          line: jc.line,
          elementName: jointName,
          message: `Invalid element "<${jc.tagName}>" inside <joint name="${jointName}"> at line ${jc.line}. Expected <parent>, <child>, <origin>, <axis>, <limit>, or <mimic>.`,
        });
      }
    }

    const parentNode = child.children.find((c) => c.tagName === 'parent');
    const childNode = child.children.find((c) => c.tagName === 'child');

    if (parentNode) {
      checkAllowedAttributes(parentNode, new Set(['link']), diagnostics);
    }
    if (childNode) {
      checkAllowedAttributes(childNode, new Set(['link']), diagnostics);
    }

    const parentLink = parentNode?.attributes.link?.trim() || '';
    const childLink = childNode?.attributes.link?.trim() || '';

    if (!parentLink) {
      diagnostics.push({
        id: `joint-no-parent-${child.line}-${jointName}`,
        severity: 'error',
        line: parentNode?.line ?? child.line,
        elementName: jointName,
        message: `Joint "${jointName}" is missing <parent link="..."/>.`,
      });
    }
    if (!childLink) {
      diagnostics.push({
        id: `joint-no-child-${child.line}-${jointName}`,
        severity: 'error',
        line: childNode?.line ?? child.line,
        elementName: jointName,
        message: `Joint "${jointName}" is missing <child link="..."/>.`,
      });
    }

    if (parentLink && childLink && parentLink === childLink) {
      diagnostics.push({
        id: `joint-self-loop-${child.line}-${jointName}`,
        severity: 'error',
        line: child.line,
        elementName: jointName,
        message: `Joint "${jointName}" connects link "${parentLink}" to itself (self-loop).`,
      });
    }

    const origin = parseOriginNode(child, diagnostics);
    const axisNode = child.children.find((c) => c.tagName === 'axis');
    let axis: Vector3Tuple = [1, 0, 0]; // URDF spec default axis is +X
    if (axisNode) {
      checkAllowedAttributes(axisNode, new Set(['xyz']), diagnostics);
      if (!axisNode.attributes.xyz) {
        diagnostics.push({
          id: `joint-axis-no-xyz-${axisNode.line}-${jointName}`,
          severity: 'error',
          line: axisNode.line,
          elementName: jointName,
          message: `<axis> on joint "${jointName}" at line ${axisNode.line} is missing required xyz="x y z" attribute.`,
        });
      }
      axis = parseVector3(
        axisNode.attributes.xyz,
        [1, 0, 0],
        axisNode.line,
        `joint "${jointName}" axis xyz`,
        diagnostics,
      );
      const len = Math.hypot(axis[0], axis[1], axis[2]);
      if (len < 1e-6) {
        diagnostics.push({
          id: `joint-zero-axis-${axisNode.line}-${jointName}`,
          severity: 'error',
          line: axisNode.line,
          elementName: jointName,
          message: `Joint "${jointName}" has a zero-length <axis xyz="${axisNode.attributes.xyz ?? ''}"/> vector.`,
        });
        axis = [1, 0, 0];
      } else {
        axis = [axis[0] / len, axis[1] / len, axis[2] / len];
      }
    }

    const limitNode = child.children.find((c) => c.tagName === 'limit');
    const limit: UrdfJointLimit = {
      lower: jointType === 'prismatic' ? -0.5 : -Math.PI,
      upper: jointType === 'prismatic' ? 0.5 : Math.PI,
      effort: 100,
      velocity: 2.0,
    };

    if (limitNode) {
      checkAllowedAttributes(
        limitNode,
        new Set(['lower', 'upper', 'effort', 'velocity']),
        diagnostics,
      );
      for (const attrKey of ['lower', 'upper', 'effort', 'velocity'] as const) {
        if (limitNode.attributes[attrKey] !== undefined) {
          const numVal = Number(limitNode.attributes[attrKey]);
          if (
            limitNode.attributes[attrKey].trim() === '' ||
            Number.isNaN(numVal) ||
            !Number.isFinite(numVal)
          ) {
            diagnostics.push({
              id: `joint-limit-nan-${limitNode.line}-${attrKey}`,
              severity: 'error',
              line: limitNode.line,
              elementName: jointName,
              message: `<limit> on joint "${jointName}" has non-numeric ${attrKey}="${limitNode.attributes[attrKey]}".`,
            });
          } else {
            limit[attrKey] = numVal;
          }
        }
      }

      if (
        (jointType === 'revolute' || jointType === 'prismatic') &&
        limit.lower > limit.upper
      ) {
        diagnostics.push({
          id: `joint-limit-inverted-${limitNode.line}-${jointName}`,
          severity: 'error',
          line: limitNode.line,
          elementName: jointName,
          message: `Joint "${jointName}" has lower limit (${limit.lower}) > upper limit (${limit.upper}).`,
        });
      }
    } else if (jointType === 'revolute' || jointType === 'prismatic') {
      diagnostics.push({
        id: `joint-limit-missing-${child.line}-${jointName}`,
        severity: 'warning',
        line: child.line,
        elementName: jointName,
        message: `Joint "${jointName}" (${jointType}) has no <limit lower="..." upper="..."/> tag; using default bounds [${limit.lower.toFixed(2)}, ${limit.upper.toFixed(2)}].`,
      });
    }

    // Parse optional <mimic joint="..." multiplier="..." offset="..."/>
    const mimicNode = child.children.find((c) => c.tagName === 'mimic');
    let mimic: UrdfJointMimic | undefined;
    if (mimicNode) {
      checkAllowedAttributes(
        mimicNode,
        new Set(['joint', 'multiplier', 'offset']),
        diagnostics,
      );
      const targetJoint = mimicNode.attributes.joint?.trim() || '';
      const rawMultiplier =
        mimicNode.attributes.multiplier !== undefined
          ? Number(mimicNode.attributes.multiplier)
          : 1.0;
      const rawOffset =
        mimicNode.attributes.offset !== undefined
          ? Number(mimicNode.attributes.offset)
          : 0.0;

      if (!targetJoint) {
        diagnostics.push({
          id: `joint-mimic-no-joint-${mimicNode.line}-${jointName}`,
          severity: 'error',
          line: mimicNode.line,
          elementName: jointName,
          message: `<mimic> inside joint "${jointName}" is missing required joint="..." attribute.`,
        });
      } else {
        if (Number.isNaN(rawMultiplier) || !Number.isFinite(rawMultiplier)) {
          diagnostics.push({
            id: `joint-mimic-bad-mult-${mimicNode.line}-${jointName}`,
            severity: 'error',
            line: mimicNode.line,
            elementName: jointName,
            message: `<mimic> on joint "${jointName}" has invalid multiplier="${mimicNode.attributes.multiplier}".`,
          });
        }
        if (Number.isNaN(rawOffset) || !Number.isFinite(rawOffset)) {
          diagnostics.push({
            id: `joint-mimic-bad-offset-${mimicNode.line}-${jointName}`,
            severity: 'error',
            line: mimicNode.line,
            elementName: jointName,
            message: `<mimic> on joint "${jointName}" has invalid offset="${mimicNode.attributes.offset}".`,
          });
        }
        mimic = {
          joint: targetJoint,
          multiplier: Number.isFinite(rawMultiplier) ? rawMultiplier : 1.0,
          offset: Number.isFinite(rawOffset) ? rawOffset : 0.0,
          line: mimicNode.line,
        };
      }
    }

    joints[jointName] = {
      name: jointName,
      type: jointType,
      parent: parentLink,
      child: childLink,
      origin,
      axis,
      limit,
      mimic,
      line: child.line,
      endLine: child.endLine,
    };
  }

  // Pass 4: Structural & Kinematic Tree Validation
  const linkNames = Object.keys(links);
  if (linkNames.length === 0) {
    diagnostics.push({
      id: `no-links-${root.line}`,
      severity: 'error',
      line: root.line,
      message: `No <link> elements found in <robot name="${robotName}">.`,
    });
  }

  const childToJointMap: Record<string, UrdfJoint> = {};
  const parentToJointsMap: Record<string, UrdfJoint[]> = {};

  for (const joint of Object.values(joints)) {
    if (joint.mimic) {
      if (joint.mimic.joint === joint.name) {
        diagnostics.push({
          id: `mimic-self-${joint.mimic.line}-${joint.name}`,
          severity: 'error',
          line: joint.mimic.line,
          elementName: joint.name,
          message: `Joint "${joint.name}" cannot <mimic> itself.`,
        });
      } else if (!joints[joint.mimic.joint]) {
        diagnostics.push({
          id: `mimic-missing-target-${joint.mimic.line}-${joint.name}`,
          severity: 'error',
          line: joint.mimic.line,
          elementName: joint.name,
          message: `Joint "${joint.name}" <mimic> references non-existent joint "${joint.mimic.joint}".`,
        });
      }
    }

    if (joint.parent && !links[joint.parent]) {
      diagnostics.push({
        id: `missing-parent-link-${joint.line}-${joint.name}`,
        severity: 'error',
        line: joint.line,
        elementName: joint.name,
        message: `Joint "${joint.name}" references non-existent parent link "${joint.parent}".`,
      });
    }
    if (joint.child && !links[joint.child]) {
      diagnostics.push({
        id: `missing-child-link-${joint.line}-${joint.name}`,
        severity: 'error',
        line: joint.line,
        elementName: joint.name,
        message: `Joint "${joint.name}" references non-existent child link "${joint.child}".`,
      });
    }

    if (joint.child && links[joint.child]) {
      if (childToJointMap[joint.child]) {
        diagnostics.push({
          id: `multi-parent-${joint.line}-${joint.child}`,
          severity: 'error',
          line: joint.line,
          elementName: joint.name,
          message: `Link "${joint.child}" has multiple parent joints ("${childToJointMap[joint.child].name}" and "${joint.name}"). URDF requires a strict tree topology.`,
        });
      } else {
        childToJointMap[joint.child] = joint;
      }
    }

    if (joint.parent && links[joint.parent] && joint.child && links[joint.child]) {
      if (!parentToJointsMap[joint.parent]) {
        parentToJointsMap[joint.parent] = [];
      }
      parentToJointsMap[joint.parent].push(joint);
    }
  }

  // Find root link (a link that is never a child of any joint)
  const candidateRoots = linkNames.filter((name) => !childToJointMap[name]);
  let rootLink: string | null = null;

  if (linkNames.length > 0) {
    if (candidateRoots.length === 0) {
      diagnostics.push({
        id: `kinematic-cycle-no-root-${root.line}`,
        severity: 'error',
        line: root.line,
        message:
          'Kinematic cycle detected: every link is a child of a joint, leaving no root link.',
      });
      rootLink = linkNames[0];
    } else if (candidateRoots.length > 1) {
      rootLink = candidateRoots[0];
      diagnostics.push({
        id: `multiple-roots-${root.line}`,
        severity: 'warning',
        line: links[candidateRoots[1]].line,
        elementName: candidateRoots[1],
        message: `Multiple root links detected (${candidateRoots.join(', ')}). Using "${rootLink}" as primary kinematic root.`,
      });
    } else {
      rootLink = candidateRoots[0];
    }
  }

  // Build KinematicTreeNode & detect cycles reachable from root
  const visitedLinks = new Set<string>();
  function buildTreeRecursive(
    linkName: string,
    connectingJoint: UrdfJoint | undefined,
    depth: number,
    ancestors: Set<string>,
  ): KinematicTreeNode {
    visitedLinks.add(linkName);
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(linkName);

    const outgoingJoints = parentToJointsMap[linkName] || [];
    const children: KinematicTreeNode[] = [];

    for (const j of outgoingJoints) {
      if (nextAncestors.has(j.child)) {
        diagnostics.push({
          id: `cycle-detected-${j.line}-${j.name}`,
          severity: 'error',
          line: j.line,
          elementName: j.name,
          message: `Kinematic loop detected at joint "${j.name}" connecting "${j.parent}" back to ancestor "${j.child}".`,
        });
        continue;
      }
      if (links[j.child]) {
        children.push(
          buildTreeRecursive(j.child, j, depth + 1, nextAncestors),
        );
      }
    }

    return {
      linkName,
      link: links[linkName],
      joint: connectingJoint,
      children,
      depth,
    };
  }

  let tree: KinematicTreeNode | null = null;
  if (rootLink && links[rootLink]) {
    tree = buildTreeRecursive(rootLink, undefined, 0, new Set());
    // Check if any links were unreachable due to isolated cycle
    for (const name of linkNames) {
      if (!visitedLinks.has(name) && !candidateRoots.includes(name)) {
        diagnostics.push({
          id: `unreachable-cycle-${links[name].line}-${name}`,
          severity: 'error',
          line: links[name].line,
          elementName: name,
          message: `Link "${name}" is part of a disconnected kinematic cycle and cannot be reached from root "${rootLink}".`,
        });
      }
    }
  }

  const hasErrors = diagnostics.some((d) => d.severity === 'error');

  return {
    valid: !hasErrors && rootLink !== null,
    robotName,
    materials,
    links,
    joints,
    rootLink,
    tree,
    diagnostics,
    compiledAt: Date.now(),
    isXacro: xacroExpansion.isXacro,
    expandedUrdfXml: xacroExpansion.expandedXml,
    xacroPropertyCount: xacroExpansion.propertyCount,
    xacroMacroCount: xacroExpansion.macroCount,
  };
}

/**
 * Converts URDF intrinsic ZYX (roll around X, pitch around Y, yaw around Z)
 * Euler angles in radians to a unit quaternion [x, y, z, w].
 * In ROS URDF: R = R_z(yaw) * R_y(pitch) * R_x(roll)
 */
export function rpyToQuaternion(
  rpy: Vector3Tuple,
): [number, number, number, number] {
  const [roll, pitch, yaw] = rpy;
  const cr = Math.cos(roll * 0.5);
  const sr = Math.sin(roll * 0.5);
  const cp = Math.cos(pitch * 0.5);
  const sp = Math.sin(pitch * 0.5);
  const cy = Math.cos(yaw * 0.5);
  const sy = Math.sin(yaw * 0.5);

  const w = cr * cp * cy + sr * sp * sy;
  const x = sr * cp * cy - cr * sp * sy;
  const y = cr * sp * cy + sr * cp * sy;
  const z = cr * cp * sy - sr * sp * cy;
  return [x, y, z, w];
}

/**
 * Converts a unit quaternion [x, y, z, w] back to URDF [roll, pitch, yaw] radians.
 */
export function quaternionToRpy(
  q: [number, number, number, number],
): Vector3Tuple {
  const [x, y, z, w] = q;
  const sinrCosp = 2 * (w * x + y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);

  const sinp = 2 * (w * y - z * x);
  const pitch =
    Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);

  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);

  return [roll, pitch, yaw];
}

function axisAngleToQuaternion(
  axis: Vector3Tuple,
  angle: number,
): [number, number, number, number] {
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const half = angle * 0.5;
  const s = Math.sin(half) / len;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

function multiplyQuaternions(
  a: [number, number, number, number],
  b: [number, number, number, number],
): [number, number, number, number] {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function rotateVectorByQuaternion(
  v: Vector3Tuple,
  q: [number, number, number, number],
): Vector3Tuple {
  const [vx, vy, vz] = v;
  const [qx, qy, qz, qw] = q;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  // v' = v + qw * t + cross(q.xyz, t)
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

function composeMatrix4(
  pos: Vector3Tuple,
  q: [number, number, number, number],
): number[] {
  const [x, y, z, w] = q;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  return [
    1 - (yy + zz),
    xy + wz,
    xz - wy,
    0,
    xy - wz,
    1 - (xx + zz),
    yz + wx,
    0,
    xz + wy,
    yz - wx,
    1 - (xx + yy),
    0,
    pos[0],
    pos[1],
    pos[2],
    1,
  ];
}

/**
 * Resolves all URDF <mimic> joint relationships and explicit parallel gripper
 * couplings (such as left_finger_joint -> right_finger_joint).
 * Formula per ROS URDF spec: value = multiplier * other_joint_value + offset
 */
export function resolveMimicJointValues(
  model: ParsedUrdfModel,
  jointValues: Record<string, number>,
): Record<string, number> {
  const resolved: Record<string, number> = { ...jointValues };
  const jointsList = Object.values(model.joints);

  // Direct fallback coupling for left_finger_joint -> right_finger_joint if right_finger_joint has no explicit <mimic> tag
  if (
    resolved.left_finger_joint !== undefined &&
    model.joints.right_finger_joint &&
    !model.joints.right_finger_joint.mimic
  ) {
    resolved.right_finger_joint = resolved.left_finger_joint;
  }

  // Multi-pass resolution (up to 4 hops for chained mimic joints)
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const j of jointsList) {
      if (!j.mimic) continue;
      const leaderName = j.mimic.joint;
      if (!model.joints[leaderName] && resolved[leaderName] === undefined) {
        continue;
      }
      const leaderVal = resolved[leaderName] ?? 0;
      const rawFollowerVal =
        leaderVal * j.mimic.multiplier + j.mimic.offset;
      const clampedVal =
        j.type === 'revolute' || j.type === 'prismatic'
          ? Math.max(j.limit.lower, Math.min(j.limit.upper, rawFollowerVal))
          : rawFollowerVal;

      if (resolved[j.name] !== clampedVal) {
        resolved[j.name] = clampedVal;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return resolved;
}

/**
 * Pure Forward Kinematics solver in ROS Z-Up coordinates.
 * Given a compiled URDF model and a map of joint values (radians or meters),
 * computes exact world-space position, RPY, and quaternion for every link.
 */
export function computeForwardKinematics(
  model: ParsedUrdfModel,
  jointValues: Record<string, number> = {},
): Record<string, LinkWorldTransform> {
  const result: Record<string, LinkWorldTransform> = {};
  if (!model.tree) return result;

  const effectiveJointValues = resolveMimicJointValues(model, jointValues);

  function traverse(
    node: KinematicTreeNode,
    parentPos: Vector3Tuple,
    parentQuat: [number, number, number, number],
  ) {
    let linkPos: Vector3Tuple = [...parentPos];
    let linkQuat: [number, number, number, number] = [...parentQuat];

    if (node.joint) {
      const j = node.joint;
      const rawVal = effectiveJointValues[j.name] ?? 0;
      const val =
        j.type === 'revolute' || j.type === 'prismatic'
          ? Math.max(j.limit.lower, Math.min(j.limit.upper, rawVal))
          : rawVal;

      // 1. Apply joint static origin transform relative to parent link
      const rotatedOriginOffset = rotateVectorByQuaternion(
        j.origin.xyz,
        parentQuat,
      );
      const jointFramePos: Vector3Tuple = [
        parentPos[0] + rotatedOriginOffset[0],
        parentPos[1] + rotatedOriginOffset[1],
        parentPos[2] + rotatedOriginOffset[2],
      ];
      const originQuat = rpyToQuaternion(j.origin.rpy);
      const jointFrameQuat = multiplyQuaternions(parentQuat, originQuat);

      // 2. Apply joint motion along/around j.axis in joint frame
      if (j.type === 'revolute' || j.type === 'continuous') {
        const motionQuat = axisAngleToQuaternion(j.axis, val);
        linkPos = jointFramePos;
        linkQuat = multiplyQuaternions(jointFrameQuat, motionQuat);
      } else if (j.type === 'prismatic') {
        const localTranslation: Vector3Tuple = [
          j.axis[0] * val,
          j.axis[1] * val,
          j.axis[2] * val,
        ];
        const worldTranslation = rotateVectorByQuaternion(
          localTranslation,
          jointFrameQuat,
        );
        linkPos = [
          jointFramePos[0] + worldTranslation[0],
          jointFramePos[1] + worldTranslation[1],
          jointFramePos[2] + worldTranslation[2],
        ];
        linkQuat = jointFrameQuat;
      } else {
        linkPos = jointFramePos;
        linkQuat = jointFrameQuat;
      }
    }

    result[node.linkName] = {
      linkName: node.linkName,
      position: linkPos,
      rpy: quaternionToRpy(linkQuat),
      quaternion: linkQuat,
      matrix: composeMatrix4(linkPos, linkQuat),
    };

    for (const child of node.children) {
      traverse(child, linkPos, linkQuat);
    }
  }

  traverse(model.tree, [0, 0, 0], [0, 0, 0, 1]);
  return result;
}
