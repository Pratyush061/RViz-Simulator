import { CompilerDiagnostic, ViewportLayers } from './types';
import { parseXmlWithLines } from './xmlParser';
import { compileUrdf } from './urdfCompiler';

export type WorkspaceFileLanguage =
  | 'urdf'
  | 'xacro'
  | 'launch_xml'
  | 'launch_py'
  | 'cmake'
  | 'package_xml'
  | 'rviz_yaml'
  | 'json';

export interface WorkspaceFileEntry {
  path: string;
  name: string;
  folder: string;
  language: WorkspaceFileLanguage;
  content: string;
  description: string;
}

export interface LaunchExecutionSummary {
  launchFile: string;
  targetUrdfPath: string;
  targetRvizConfigPath: string;
  usesXacroCommand: boolean;
  nodesStarted: string[];
  diagnostics: CompilerDiagnostic[];
  success: boolean;
  rvizLayersOverride?: Partial<ViewportLayers>;
}

export const DEFAULT_DISPLAY_LAUNCH_XML = `<launch>
  <let name="urdf_path"
       value="$(find-pkg-share my_robot_description)/urdf/my_robot.urdf.xacro" />
  <let name="rviz_config_path"
       value="$(find-pkg-share my_robot_description)/rviz/urdf_config.rviz" />

  <node pkg="robot_state_publisher" exec="robot_state_publisher">
    <param name="robot_description"
            value="$(command 'xacro $(var urdf_path)')" />
  </node>

  <node pkg="joint_state_publisher_gui" exec="joint_state_publisher_gui" />

  <node pkg="rviz2" exec="rviz2" output="screen"
        args="-d $(var rviz_config_path)" />
</launch>
`;

export const DEFAULT_DISPLAY_LAUNCH_PY = `from launch import LaunchDescription
from launch_ros.parameter_descriptions import ParameterValue
from launch.substitutions import Command
from launch_ros.actions import Node
import os
from ament_index_python.packages import get_package_share_path


def generate_launch_description():
    urdf_path = os.path.join(
        get_package_share_path('my_robot_description'),
        'urdf',
        'my_robot.urdf.xacro'
    )
    rviz_config_path = os.path.join(
        get_package_share_path('my_robot_description'),
        'rviz',
        'urdf_config.rviz'
    )

    robot_description = ParameterValue(
        Command(['xacro ', urdf_path]),
        value_type=str
    )

    robot_state_publisher_node = Node(
        package="robot_state_publisher",
        executable="robot_state_publisher",
        parameters=[{'robot_description': robot_description}]
    )

    joint_state_publisher_gui_node = Node(
        package="joint_state_publisher_gui",
        executable="joint_state_publisher_gui"
    )

    rviz2_node = Node(
        package="rviz2",
        executable="rviz2",
        output="screen",
        arguments=['-d', rviz_config_path]
    )

    return LaunchDescription([
        robot_state_publisher_node,
        joint_state_publisher_gui_node,
        rviz2_node
    ])
`;

export const DEFAULT_CMAKE_LISTS_TXT = `cmake_minimum_required(VERSION 3.8)
project(my_robot_description)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

find_package(ament_cmake REQUIRED)

install(
  DIRECTORY urdf launch rviz
  DESTINATION share/\${PROJECT_NAME}/
)

ament_package()
`;

export const DEFAULT_PACKAGE_XML = `<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd" schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <name>my_robot_description</name>
  <version>0.1.0</version>
  <description>ROS 2 robot_description package with URDF/Xacro models, launch files, and RViz2 config</description>
  <maintainer email="ros2_dev@todo.todo">ros2_dev</maintainer>
  <license>Apache-2.0</license>

  <buildtool_depend>ament_cmake</buildtool_depend>

  <exec_depend>robot_state_publisher</exec_depend>
  <exec_depend>joint_state_publisher_gui</exec_depend>
  <exec_depend>rviz2</exec_depend>
  <exec_depend>xacro</exec_depend>
  <exec_depend>ros2launch</exec_depend>

  <test_depend>ament_lint_auto</test_depend>
  <test_depend>ament_lint_common</test_depend>

  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>
`;

export const DEFAULT_URDF_CONFIG_RVIZ = `Panels:
  - Class: rviz_common/Displays
    Name: Displays
  - Class: rviz_common/Views
    Name: Views
Visualization Manager:
  Class: ""
  Displays:
    - Alpha: 0.5
      Cell Size: 1
      Class: rviz_default_plugins/Grid
      Enabled: true
      Name: Grid
    - Alpha: 1
      Class: rviz_default_plugins/RobotModel
      Description Source: Topic
      Description Topic:
        Value: /robot_description
      Enabled: true
      Name: RobotModel
    - Class: rviz_default_plugins/TF
      Enabled: true
      Marker Scale: 1
      Name: TF
      Show Arrows: false
      Show Axes: true
      Show Names: false
  Global Options:
    Background Color: 11; 15; 23
    Fixed Frame: base_link
    Frame Rate: 30
`;

export const DEFAULT_VSCODE_SETTINGS_JSON = `{
  "files.associations": {
    "*.urdf": "xml",
    "*.xacro": "xml",
    "*.launch.xml": "xml",
    "*.rviz": "yaml"
  },
  "xml.validation.enabled": true,
  "ros.distro": "humble"
}
`;

export function createInitialWorkspaceFiles(
  initialUrdfXacro: string,
  initialPlainUrdf: string,
): Record<string, WorkspaceFileEntry> {
  return {
    '.vscode/settings.json': {
      path: '.vscode/settings.json',
      name: 'settings.json',
      folder: '.vscode',
      language: 'json',
      content: DEFAULT_VSCODE_SETTINGS_JSON,
      description: 'VS Code workspace settings for ROS 2 URDF, Xacro, and Launch files',
    },
    'my_robot_description/launch/display.launch.py': {
      path: 'my_robot_description/launch/display.launch.py',
      name: 'display.launch.py',
      folder: 'my_robot_description/launch',
      language: 'launch_py',
      content: DEFAULT_DISPLAY_LAUNCH_PY,
      description: 'ROS 2 Python launch file starting robot_state_publisher, joint_state_publisher_gui, and rviz2',
    },
    'my_robot_description/launch/display.launch.xml': {
      path: 'my_robot_description/launch/display.launch.xml',
      name: 'display.launch.xml',
      folder: 'my_robot_description/launch',
      language: 'launch_xml',
      content: DEFAULT_DISPLAY_LAUNCH_XML,
      description: 'ROS 2 XML launch file starting robot_state_publisher, joint_state_publisher_gui, and rviz2',
    },
    'my_robot_description/rviz/urdf_config.rviz': {
      path: 'my_robot_description/rviz/urdf_config.rviz',
      name: 'urdf_config.rviz',
      folder: 'my_robot_description/rviz',
      language: 'rviz_yaml',
      content: DEFAULT_URDF_CONFIG_RVIZ,
      description: 'RViz2 configuration file loaded via -d $(var rviz_config_path)',
    },
    'my_robot_description/urdf/my_robot.urdf.xacro': {
      path: 'my_robot_description/urdf/my_robot.urdf.xacro',
      name: 'my_robot.urdf.xacro',
      folder: 'my_robot_description/urdf',
      language: 'xacro',
      content: initialUrdfXacro,
      description: 'Primary ROS 2 Xacro robot model description (.urdf.xacro)',
    },
    'my_robot_description/urdf/my_robot.urdf': {
      path: 'my_robot_description/urdf/my_robot.urdf',
      name: 'my_robot.urdf',
      folder: 'my_robot_description/urdf',
      language: 'urdf',
      content: initialPlainUrdf,
      description: 'Standard ROS 2 URDF XML robot model description (.urdf)',
    },
    'my_robot_description/CMakeLists.txt': {
      path: 'my_robot_description/CMakeLists.txt',
      name: 'CMakeLists.txt',
      folder: 'my_robot_description',
      language: 'cmake',
      content: DEFAULT_CMAKE_LISTS_TXT,
      description: 'ament_cmake build configuration installing urdf, launch, and rviz directories',
    },
    'my_robot_description/package.xml': {
      path: 'my_robot_description/package.xml',
      name: 'package.xml',
      folder: 'my_robot_description',
      language: 'package_xml',
      content: DEFAULT_PACKAGE_XML,
      description: 'ROS 2 package manifest (format 3) declaring dependencies',
    },
  };
}

/**
 * Parses RViz YAML config (urdf_config.rviz) to extract display layer toggles if present.
 */
export function parseRvizConfigLayers(
  rvizYaml: string,
): Partial<ViewportLayers> {
  const result: Partial<ViewportLayers> = {};
  if (/Name:\s*Grid[\s\S]*?Enabled:\s*(true|false)/i.test(rvizYaml)) {
    const m = rvizYaml.match(/Class:\s*rviz_default_plugins\/Grid[\s\S]*?Enabled:\s*(true|false)/i);
    if (m) result.grid = m[1].toLowerCase() === 'true';
  }
  if (/Class:\s*rviz_default_plugins\/RobotModel[\s\S]*?Enabled:\s*(true|false)/i.test(rvizYaml)) {
    const m = rvizYaml.match(/Class:\s*rviz_default_plugins\/RobotModel[\s\S]*?Enabled:\s*(true|false)/i);
    if (m) result.visual = m[1].toLowerCase() === 'true';
  }
  if (/Class:\s*rviz_default_plugins\/TF/i.test(rvizYaml)) {
    const showAxes = rvizYaml.match(/Show Axes:\s*(true|false)/i);
    const showNames = rvizYaml.match(/Show Names:\s*(true|false)/i);
    const showArrows = rvizYaml.match(/Show Arrows:\s*(true|false)/i);
    if (showAxes) result.tfFrames = showAxes[1].toLowerCase() === 'true';
    if (showNames) result.tfLabels = showNames[1].toLowerCase() === 'true';
    if (showArrows) result.jointAxes = showArrows[1].toLowerCase() === 'true';
  }
  return result;
}

const ALLOWED_LAUNCH_XML_CHILDREN = new Set([
  'let',
  'arg',
  'node',
  'include',
  'group',
  'executable',
  'set_env',
  'unset_env',
  'push_ros_namespace',
]);

const ALLOWED_LAUNCH_NODE_ATTRS = new Set([
  'pkg',
  'exec',
  'name',
  'namespace',
  'output',
  'args',
  'respawn',
  'respawn_delay',
  'if',
  'unless',
  'launch-prefix',
  'emulate_tty',
]);

const ALLOWED_LAUNCH_PARAM_ATTRS = new Set([
  'name',
  'value',
  'from',
  'type',
  'value-sep',
]);

const KNOWN_ROS2_PACKAGES = new Set([
  'robot_state_publisher',
  'joint_state_publisher',
  'joint_state_publisher_gui',
  'rviz2',
  'xacro',
  'tf2_ros',
  'my_robot_description',
]);

const KNOWN_ROS2_PACKAGE_EXECUTABLES: Record<string, string[]> = {
  robot_state_publisher: ['robot_state_publisher'],
  joint_state_publisher_gui: ['joint_state_publisher_gui'],
  joint_state_publisher: ['joint_state_publisher'],
  rviz2: ['rviz2'],
  tf2_ros: ['static_transform_publisher'],
};

const VALID_NODE_OUTPUT_VALUES = new Set(['screen', 'log', 'both']);

/**
 * Recursively validates all ROS 2 XML launch `$(...)` substitutions from
 * innermost to outermost, catching typos like `$(comm 'xacro $(var urdf_path)')`,
 * `$(command 'xacr $(var urdf_path)')`, undeclared `$(var ...)`, and invalid packages.
 */
function validateLaunchXmlSubstitutions(
  rawAttr: string,
  line: number,
  declaredVars: Record<string, string>,
  workspaceFiles: Record<string, WorkspaceFileEntry>,
  diagnostics: CompilerDiagnostic[],
): string {
  if (!rawAttr.includes('$')) return rawAttr;

  if (rawAttr.includes('${')) {
    diagnostics.push({
      id: `launch-xml-curly-sub-${line}-${diagnostics.length}`,
      severity: 'error',
      line,
      message: `[ros2 launch] Invalid "\${...}" syntax in "${rawAttr}" at line ${line}; ROS 2 XML launch substitutions use parentheses "$(var ...)" or "$(find-pkg-share ...)".`,
    });
  }

  // Check for bare '$' not followed by '(' or '{'
  for (let i = 0; i < rawAttr.length; i++) {
    if (rawAttr[i] === '$') {
      const next = rawAttr[i + 1];
      if (next !== '(' && next !== '{') {
        diagnostics.push({
          id: `launch-xml-bare-dollar-${line}-${i}`,
          severity: 'error',
          line,
          message: `[ros2 launch] Malformed "$" in "${rawAttr}" at line ${line}; expected "$(...)".`,
        });
      }
    }
  }

  // Check for balanced $( and )
  let depth = 0;
  for (let i = 0; i < rawAttr.length; i++) {
    if (rawAttr[i] === '$' && rawAttr[i + 1] === '(') {
      depth++;
      i++;
    } else if (rawAttr[i] === '(' && depth > 0) {
      depth++;
    } else if (rawAttr[i] === ')') {
      if (depth > 0) {
        depth--;
      } else {
        diagnostics.push({
          id: `launch-xml-extra-close-paren-${line}-${i}`,
          severity: 'error',
          line,
          message: `[ros2 launch] Unexpected closing ")" in "${rawAttr}" at line ${line}.`,
        });
        return rawAttr;
      }
    }
  }
  if (depth > 0) {
    diagnostics.push({
      id: `launch-xml-unclosed-sub-${line}-${diagnostics.length}`,
      severity: 'error',
      line,
      message: `[ros2 launch] Unclosed "$(...)" substitution in "${rawAttr}" at line ${line}.`,
    });
    return rawAttr;
  }

  // Iteratively evaluate and validate innermost $(...) substitutions
  let working = rawAttr;
  const innermostRegex = /\$\(([^()$]*)\)/;
  let guard = 0;

  while (innermostRegex.test(working) && guard < 20) {
    guard++;
    working = working.replace(innermostRegex, (fullMatch, rawInner: string) => {
      const inner = rawInner.trim();
      if (!inner) {
        diagnostics.push({
          id: `launch-xml-empty-sub-${line}-${diagnostics.length}`,
          severity: 'error',
          line,
          message: `[ros2 launch] Empty "$()" substitution at line ${line}.`,
        });
        return '';
      }

      const parts = inner.split(/\s+/);
      const op = parts[0];
      const arg = inner.slice(op.length).trim();

      if (op === 'find-pkg-share' || op === 'find-pkg-prefix') {
        if (!arg) {
          diagnostics.push({
            id: `launch-xml-find-noarg-${line}-${diagnostics.length}`,
            severity: 'error',
            line,
            message: `[ros2 launch] "$(${op})" at line ${line} is missing a package name.`,
          });
          return '';
        }
        if (arg !== 'my_robot_description' && !KNOWN_ROS2_PACKAGES.has(arg)) {
          diagnostics.push({
            id: `launch-xml-pkg-not-found-${line}-${arg}`,
            severity: 'error',
            line,
            message: `[ros2 launch] PackageNotFoundError: package "${arg}" not found in workspace at line ${line}; expected "my_robot_description".`,
          });
          return arg;
        }
        return arg;
      }

      if (op === 'var') {
        if (!arg) {
          diagnostics.push({
            id: `launch-xml-var-noarg-${line}-${diagnostics.length}`,
            severity: 'error',
            line,
            message: `[ros2 launch] "$(var)" at line ${line} is missing a variable name.`,
          });
          return '';
        }
        if (!Object.prototype.hasOwnProperty.call(declaredVars, arg)) {
          diagnostics.push({
            id: `launch-xml-undef-var-${line}-${arg}`,
            severity: 'error',
            line,
            message: `[ros2 launch] Launch configuration variable "${arg}" at line ${line} is not defined (declare it first with <let name="${arg}" value="..."/> or <arg name="${arg}" .../>).`,
          });
          return '';
        }
        return declaredVars[arg];
      }

      if (op === 'command') {
        if (!arg) {
          diagnostics.push({
            id: `launch-xml-cmd-empty-${line}-${diagnostics.length}`,
            severity: 'error',
            line,
            message: `[ros2 launch] "$(command)" at line ${line} is missing a command string (expected "$(command 'xacro $(var urdf_path)')").`,
          });
          return '';
        }
        // Check quote balance if quoted
        if (
          (arg.startsWith("'") && !arg.endsWith("'")) ||
          (arg.startsWith('"') && !arg.endsWith('"')) ||
          (!arg.startsWith("'") && arg.endsWith("'")) ||
          (!arg.startsWith('"') && arg.endsWith('"'))
        ) {
          diagnostics.push({
            id: `launch-xml-cmd-quote-${line}-${diagnostics.length}`,
            severity: 'error',
            line,
            message: `[ros2 launch] Unbalanced quotes inside "${fullMatch}" at line ${line}.`,
          });
        }

        const cleanedCmd = arg.replace(/^['"]|['"]$/g, '').trim();
        if (!cleanedCmd) {
          diagnostics.push({
            id: `launch-xml-cmd-blank-${line}-${diagnostics.length}`,
            severity: 'error',
            line,
            message: `[ros2 launch] "$(command ...)" at line ${line} has an empty command string.`,
          });
          return '';
        }

        const cmdTokens = cleanedCmd.split(/\s+/);
        const cmdExec = cmdTokens[0];
        const cmdFileArg = cmdTokens.slice(1).join(' ').trim();

        if (cmdExec !== 'xacro') {
          diagnostics.push({
            id: `launch-xml-cmd-bad-exec-${line}-${cmdExec}`,
            severity: 'error',
            line,
            message: `[ros2 launch] Unknown command executable "${cmdExec}" in "$(command ...)" at line ${line}; expected "xacro $(var urdf_path)".`,
          });
          return '';
        }

        if (!cmdFileArg) {
          diagnostics.push({
            id: `launch-xml-cmd-no-target-${line}`,
            severity: 'error',
            line,
            message: `[ros2 launch] "$(command 'xacro ...')" at line ${line} is missing the target URDF/Xacro file path argument.`,
          });
          return '';
        }

        const normalizedPath = cmdFileArg.replace(/^\/+/, '');
        if (
          normalizedPath &&
          !workspaceFiles[normalizedPath] &&
          !normalizedPath.startsWith('<')
        ) {
          diagnostics.push({
            id: `launch-xml-cmd-missing-file-${line}-${normalizedPath}`,
            severity: 'error',
            line,
            message: `[ros2 launch] Xacro command target "${normalizedPath}" at line ${line} does not exist in workspace.`,
          });
        }

        return `<xacro_expanded:${normalizedPath}>`;
      }

      if (
        op === 'env' ||
        op === 'optenv' ||
        op === 'eval' ||
        op === 'anon' ||
        op === 'dirname'
      ) {
        if (op !== 'dirname' && !arg) {
          diagnostics.push({
            id: `launch-xml-sub-noarg-${line}-${op}`,
            severity: 'error',
            line,
            message: `[ros2 launch] "$(${op})" at line ${line} requires an argument.`,
          });
        }
        return arg;
      }

      diagnostics.push({
        id: `launch-xml-unknown-sub-${line}-${op}-${diagnostics.length}`,
        severity: 'error',
        line,
        message: `[ros2 launch] Unknown launch substitution "$(${op} ...)" at line ${line}. Allowed substitutions: $(var ...), $(find-pkg-share ...), $(command ...), $(env ...), $(eval ...).`,
      });
      return '';
    });
  }

  return working;
}

function validateLaunchXmlFile(
  entry: WorkspaceFileEntry,
  workspaceFiles: Record<string, WorkspaceFileEntry>,
): {
  diagnostics: CompilerDiagnostic[];
  nodesStarted: string[];
  targetUrdfPath: string | null;
  targetRvizConfigPath: string | null;
  usesXacroCommand: boolean;
} {
  const diagnostics: CompilerDiagnostic[] = [];
  const nodesStarted: string[] = [];
  let targetUrdfPath: string | null = null;
  let targetRvizConfigPath: string | null = null;
  let usesXacroCommand = false;

  const content = entry.content;
  if (!content.trim()) {
    diagnostics.push({
      id: `launch-xml-empty-1`,
      severity: 'error',
      line: 1,
      column: 1,
      message: `[ros2 launch] "${entry.name}" is empty. A ROS 2 XML launch file must have a root <launch>...</launch> element.`,
    });
    return {
      diagnostics,
      nodesStarted,
      targetUrdfPath,
      targetRvizConfigPath,
      usesXacroCommand,
    };
  }

  const { root, errors } = parseXmlWithLines(content);
  for (const err of errors) {
    diagnostics.push({
      id: `launch-xml-parse-${err.line}-${err.column}-${diagnostics.length}`,
      severity: 'error',
      line: err.line,
      column: err.column,
      message: `[ros2 launch] ${err.message}`,
    });
  }

  if (!root) {
    return {
      diagnostics,
      nodesStarted,
      targetUrdfPath,
      targetRvizConfigPath,
      usesXacroCommand,
    };
  }

  if (root.tagName !== 'launch') {
    diagnostics.push({
      id: `launch-xml-root-tag-${root.line}`,
      severity: 'error',
      line: root.line,
      message: `[ros2 launch] Root element of ${entry.name} must be <launch>, but found <${root.tagName}>.`,
    });
    return {
      diagnostics,
      nodesStarted,
      targetUrdfPath,
      targetRvizConfigPath,
      usesXacroCommand,
    };
  }

  for (const attrKey of Object.keys(root.attributes)) {
    if (attrKey !== 'version') {
      diagnostics.push({
        id: `launch-xml-root-attr-${root.line}-${attrKey}`,
        severity: 'error',
        line: root.line,
        message: `[ros2 launch] Invalid attribute "${attrKey}" on <launch> at line ${root.line}.`,
      });
    }
  }

  if (root.text && root.text.trim().length > 0) {
    diagnostics.push({
      id: `launch-xml-root-text-${root.line}`,
      severity: 'error',
      line: root.line,
      message: `[ros2 launch] Unexpected text "${root.text.trim().slice(0, 32)}" inside <launch>.`,
    });
  }

  const declaredVars: Record<string, string> = {};
  const varDeclLine: Record<string, number> = {};
  let hasRobotStatePublisher = false;
  let hasRobotDescriptionParam = false;

  for (const child of root.children) {
    if (!ALLOWED_LAUNCH_XML_CHILDREN.has(child.tagName)) {
      diagnostics.push({
        id: `launch-xml-unknown-tag-${child.line}-${child.tagName}`,
        severity: 'error',
        line: child.line,
        message: `[ros2 launch] Unknown element "<${child.tagName}>" inside <launch> at line ${child.line}. Allowed elements: <let>, <arg>, <node>, <include>, <group>, <executable>.`,
      });
      continue;
    }

    if (child.text && child.text.trim().length > 0) {
      diagnostics.push({
        id: `launch-xml-child-text-${child.line}`,
        severity: 'error',
        line: child.line,
        message: `[ros2 launch] Unexpected text "${child.text.trim().slice(0, 32)}" inside <${child.tagName}> at line ${child.line}.`,
      });
    }

    const resolvedAttrs: Record<string, string> = {};
    for (const [attrK, val] of Object.entries(child.attributes)) {
      resolvedAttrs[attrK] = validateLaunchXmlSubstitutions(
        val,
        child.line,
        declaredVars,
        workspaceFiles,
        diagnostics,
      );
    }

    if (child.tagName === 'let') {
      for (const k of Object.keys(child.attributes)) {
        if (k !== 'name' && k !== 'value' && k !== 'if' && k !== 'unless') {
          diagnostics.push({
            id: `launch-xml-let-attr-${child.line}-${k}`,
            severity: 'error',
            line: child.line,
            message: `[ros2 launch] Invalid attribute "${k}" on <let> at line ${child.line}; expected name="..." and value="...".`,
          });
        }
      }
      const vName = child.attributes.name?.trim();
      const vVal = child.attributes.value;
      if (!vName || vVal === undefined || vVal.trim() === '') {
        diagnostics.push({
          id: `launch-xml-let-missing-${child.line}`,
          severity: 'error',
          line: child.line,
          message: `[ros2 launch] <let> at line ${child.line} requires non-empty name="..." and value="..." attributes.`,
        });
      } else {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(vName)) {
          diagnostics.push({
            id: `launch-xml-let-badname-${child.line}-${vName}`,
            severity: 'error',
            line: child.line,
            message: `[ros2 launch] Invalid variable name "${vName}" on <let> at line ${child.line}.`,
          });
        }
        declaredVars[vName] = resolvedAttrs.value ?? vVal;
        varDeclLine[vName] = child.line;
      }
    } else if (child.tagName === 'arg') {
      for (const k of Object.keys(child.attributes)) {
        if (
          k !== 'name' &&
          k !== 'default' &&
          k !== 'description' &&
          k !== 'choice'
        ) {
          diagnostics.push({
            id: `launch-xml-arg-attr-${child.line}-${k}`,
            severity: 'error',
            line: child.line,
            message: `[ros2 launch] Invalid attribute "${k}" on <arg> at line ${child.line}.`,
          });
        }
      }
      const aName = child.attributes.name?.trim();
      if (!aName) {
        diagnostics.push({
          id: `launch-xml-arg-noname-${child.line}`,
          severity: 'error',
          line: child.line,
          message: `[ros2 launch] <arg> at line ${child.line} is missing required name="..." attribute.`,
        });
      } else {
        declaredVars[aName] = resolvedAttrs.default ?? child.attributes.default ?? '';
        varDeclLine[aName] = child.line;
      }
    } else if (child.tagName === 'node') {
      for (const k of Object.keys(child.attributes)) {
        if (k === 'type') {
          diagnostics.push({
            id: `launch-xml-node-ros1-type-${child.line}`,
            severity: 'error',
            line: child.line,
            message: `[ros2 launch] Attribute "type" on <node> at line ${child.line} is ROS 1 syntax; ROS 2 requires exec="...".`,
          });
        } else if (!ALLOWED_LAUNCH_NODE_ATTRS.has(k)) {
          diagnostics.push({
            id: `launch-xml-node-attr-${child.line}-${k}`,
            severity: 'error',
            line: child.line,
            message: `[ros2 launch] Invalid attribute "${k}" on <node> at line ${child.line}. Allowed attributes: pkg, exec, name, namespace, output, args.`,
          });
        }
      }

      if (
        child.attributes.output !== undefined &&
        !VALID_NODE_OUTPUT_VALUES.has(child.attributes.output.trim())
      ) {
        diagnostics.push({
          id: `launch-xml-node-bad-output-${child.line}`,
          severity: 'error',
          line: child.line,
          message: `[ros2 launch] Invalid output="${child.attributes.output}" on <node> at line ${child.line}; expected "screen", "log", or "both".`,
        });
      }

      const pkg = child.attributes.pkg?.trim();
      const exec = child.attributes.exec?.trim();
      if (!pkg || !exec) {
        diagnostics.push({
          id: `launch-xml-node-missing-pkg-exec-${child.line}`,
          severity: 'error',
          line: child.line,
          message: `[ros2 launch] <node> at line ${child.line} requires both pkg="..." and exec="..." attributes.`,
        });
      } else {
        if (!KNOWN_ROS2_PACKAGES.has(pkg)) {
          diagnostics.push({
            id: `launch-xml-node-unknown-pkg-${child.line}-${pkg}`,
            severity: 'error',
            line: child.line,
            message: `[ros2 launch] Package "${pkg}" on <node> at line ${child.line} is not installed or recognized.`,
          });
        } else {
          const validExecs = KNOWN_ROS2_PACKAGE_EXECUTABLES[pkg];
          if (validExecs && !validExecs.includes(exec)) {
            diagnostics.push({
              id: `launch-xml-node-bad-exec-${child.line}-${exec}`,
              severity: 'error',
              line: child.line,
              message: `[ros2 launch] Executable "${exec}" not found in package "${pkg}" at line ${child.line}; expected exec="${validExecs[0]}".`,
            });
          }
        }
        nodesStarted.push(exec);
        if (pkg === 'robot_state_publisher') {
          hasRobotStatePublisher = true;
        }
      }

      for (const nc of child.children) {
        if (nc.tagName !== 'param' && nc.tagName !== 'remap' && nc.tagName !== 'env') {
          diagnostics.push({
            id: `launch-xml-node-child-${nc.line}-${nc.tagName}`,
            severity: 'error',
            line: nc.line,
            message: `[ros2 launch] Invalid child "<${nc.tagName}>" inside <node> at line ${nc.line}. Expected <param>, <remap>, or <env>.`,
          });
          continue;
        }
        const resolvedParamAttrs: Record<string, string> = {};
        for (const [pk, val] of Object.entries(nc.attributes)) {
          resolvedParamAttrs[pk] = validateLaunchXmlSubstitutions(
            val,
            nc.line,
            declaredVars,
            workspaceFiles,
            diagnostics,
          );
        }
        if (nc.tagName === 'param') {
          for (const pk of Object.keys(nc.attributes)) {
            if (!ALLOWED_LAUNCH_PARAM_ATTRS.has(pk)) {
              diagnostics.push({
                id: `launch-xml-param-bad-attr-${nc.line}-${pk}`,
                severity: 'error',
                line: nc.line,
                message: `[ros2 launch] Invalid attribute "${pk}" on <param> at line ${nc.line}; expected name="..." and value="...".`,
              });
            }
          }
          const pName = nc.attributes.name?.trim();
          const pVal = nc.attributes.value ?? nc.attributes.from;
          if (!pName || pVal === undefined || pVal.trim() === '') {
            diagnostics.push({
              id: `launch-xml-param-missing-${nc.line}`,
              severity: 'error',
              line: nc.line,
              message: `[ros2 launch] <param> at line ${nc.line} requires non-empty name="..." and value="..." (or from="...").`,
            });
          } else if (pkg === 'robot_state_publisher') {
            if (
              pName !== 'robot_description' &&
              pName !== 'use_sim_time' &&
              pName !== 'publish_frequency' &&
              pName !== 'frame_prefix'
            ) {
              diagnostics.push({
                id: `launch-xml-param-bad-rsp-name-${nc.line}-${pName}`,
                severity: 'error',
                line: nc.line,
                message: `[ros2 launch] Unknown parameter name="${pName}" on robot_state_publisher at line ${nc.line}; expected name="robot_description".`,
              });
            }
            if (pName === 'robot_description') {
              hasRobotDescriptionParam = true;
              const resolvedDesc = resolvedParamAttrs.value ?? '';
              if (!resolvedDesc.startsWith('<xacro_expanded:') && !pVal.includes('$(')) {
                diagnostics.push({
                  id: `launch-xml-param-bad-desc-val-${nc.line}`,
                  severity: 'error',
                  line: nc.line,
                  message: `[ros2 launch] <param name="robot_description"> at line ${nc.line} must evaluate URDF via "$(command 'xacro $(var urdf_path)')".`,
                });
              }
              if (pVal.includes('xacro')) {
                usesXacroCommand = true;
              }
            }
          }
        }
      }
    }
  }

  if (declaredVars.urdf_path !== undefined) {
    const resolved = declaredVars.urdf_path.replace(/^\/+/, '').trim();
    targetUrdfPath = resolved;
    if (!workspaceFiles[resolved]) {
      diagnostics.push({
        id: `launch-xml-urdf-missing-${varDeclLine.urdf_path ?? 1}`,
        severity: 'error',
        line: varDeclLine.urdf_path ?? 1,
        message: `[ros2 launch] URDF file "${resolved}" referenced by "urdf_path" does not exist in workspace. Available files: my_robot_description/urdf/my_robot.urdf.xacro, my_robot_description/urdf/my_robot.urdf.`,
      });
    }
  }

  if (declaredVars.rviz_config_path !== undefined) {
    const resolvedRviz = declaredVars.rviz_config_path.replace(/^\/+/, '').trim();
    targetRvizConfigPath = resolvedRviz;
    if (!workspaceFiles[resolvedRviz]) {
      diagnostics.push({
        id: `launch-xml-rviz-missing-${varDeclLine.rviz_config_path ?? 1}`,
        severity: 'error',
        line: varDeclLine.rviz_config_path ?? 1,
        message: `[ros2 launch] RViz config file "${resolvedRviz}" referenced by "rviz_config_path" does not exist in workspace.`,
      });
    }
  }

  if (!hasRobotStatePublisher) {
    diagnostics.push({
      id: `launch-xml-no-rsp-${root.line}`,
      severity: 'error',
      line: root.line,
      message: `[ros2 launch] Missing <node pkg="robot_state_publisher" exec="robot_state_publisher"> in ${entry.name}.`,
    });
  } else if (!hasRobotDescriptionParam) {
    diagnostics.push({
      id: `launch-xml-no-robot-desc-${root.line}`,
      severity: 'error',
      line: root.line,
      message: `[ros2 launch] <node pkg="robot_state_publisher"> is missing <param name="robot_description" value="$(command 'xacro $(var urdf_path)')"/>.`,
    });
  }

  return {
    diagnostics,
    nodesStarted,
    targetUrdfPath,
    targetRvizConfigPath,
    usesXacroCommand,
  };
}

/**
 * Official ROS 2 Launch Python module exports table for strict import and symbol resolution.
 */
const PYTHON_ROS2_MODULES: Record<string, string[]> = {
  launch: ['LaunchDescription', 'LaunchContext', 'LaunchService'],
  'launch.actions': [
    'DeclareLaunchArgument',
    'ExecuteProcess',
    'GroupAction',
    'IncludeLaunchDescription',
    'LogInfo',
    'OpaqueFunction',
    'RegisterEventHandler',
    'SetEnvironmentVariable',
    'SetLaunchConfiguration',
    'TimerAction',
  ],
  'launch.substitutions': [
    'AnonName',
    'Command',
    'EnvironmentVariable',
    'FindExecutable',
    'LaunchConfiguration',
    'LocalSubstitution',
    'PathJoinSubstitution',
    'PythonExpression',
    'TextSubstitution',
    'ThisLaunchFile',
    'ThisLaunchFileDir',
  ],
  'launch.conditions': [
    'IfCondition',
    'UnlessCondition',
    'LaunchConfigurationEquals',
  ],
  'launch_ros.actions': [
    'Node',
    'LifecycleNode',
    'PushRosNamespace',
    'ComposableNodeContainer',
    'LoadComposableNodes',
    'SetParameter',
    'SetRemap',
  ],
  'launch_ros.parameter_descriptions': ['ParameterValue', 'ParameterFile'],
  'launch_ros.substitutions': [
    'FindPackageShare',
    'FindPackagePrefix',
    'ExecutableInPackage',
  ],
  'ament_index_python.packages': [
    'get_package_share_path',
    'get_package_share_directory',
    'get_package_prefix',
  ],
  os: ['path', 'environ', 'sep', 'getcwd', 'listdir'],
  'os.path': [
    'join',
    'exists',
    'dirname',
    'abspath',
    'basename',
    'expanduser',
    'split',
  ],
  pathlib: ['Path'],
  sys: ['argv', 'path', 'exit'],
};

const PYTHON_BUILTINS = new Set([
  'str',
  'int',
  'float',
  'bool',
  'list',
  'dict',
  'tuple',
  'set',
  'True',
  'False',
  'None',
  'len',
  'range',
  'print',
]);

const PYTHON_KEYWORDS = new Set([
  'and',
  'as',
  'assert',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
]);

const ALLOWED_PY_NODE_KWARGS = new Set([
  'package',
  'executable',
  'name',
  'namespace',
  'parameters',
  'remappings',
  'arguments',
  'output',
  'respawn',
  'respawn_delay',
  'prefix',
  'emulate_tty',
  'condition',
  'additional_env',
]);

interface PySymbolInfo {
  name: string;
  kind: 'module' | 'imported' | 'variable' | 'function';
  moduleName?: string;
  line: number;
}

interface PyLogicalStatement {
  startLine: number;
  endLine: number;
  indent: number;
  lines: { lineNum: number; text: string }[];
  joinedText: string;
}

/**
 * Replaces string literals on a single line with `__STR_N__` placeholders so
 * identifier/operator/comma checks never false-trigger inside strings.
 */
function maskPythonLineStrings(
  rawLine: string,
  stringStore: string[],
): string {
  let out = '';
  let inQuote: "'" | '"' | null = null;
  let currentLiteral = '';

  for (let i = 0; i < rawLine.length; i++) {
    const ch = rawLine[i];
    if (inQuote) {
      if (ch === '\\') {
        currentLiteral += ch + (rawLine[i + 1] ?? '');
        i++;
        continue;
      }
      if (ch === inQuote) {
        const idx = stringStore.length;
        stringStore.push(currentLiteral);
        out += `__STR_${idx}__`;
        inQuote = null;
        currentLiteral = '';
      } else {
        currentLiteral += ch;
      }
    } else {
      if (ch === '#') {
        break;
      }
      if (ch === "'" || ch === '"') {
        inQuote = ch;
        currentLiteral = '';
      } else {
        out += ch;
      }
    }
  }
  return out;
}

function validatePythonExpressionLines(
  exprLines: { lineNum: number; text: string }[],
  definedSymbols: Record<string, PySymbolInfo>,
  diagnostics: CompilerDiagnostic[],
) {
  const stringStore: string[] = [];
  const maskedLines = exprLines.map((l) => ({
    lineNum: l.lineNum,
    masked: maskPythonLineStrings(l.text, stringStore),
    raw: l.text.replace(/#.*$/, ''),
  }));

  for (const { lineNum, masked } of maskedLines) {
    const trimmed = masked.trim();
    if (!trimmed) continue;

    // 1. Check for malformed dots: "..", trailing "." at end of line, or ". "
    if (
      /\.\./.test(trimmed) ||
      /\.\s+/.test(trimmed) ||
      /\.$/.test(trimmed) ||
      /^\./.test(trimmed) ||
      /\.\s*[)\],:]/.test(trimmed)
    ) {
      diagnostics.push({
        id: `launch-py-bad-dot-${lineNum}-${diagnostics.length}`,
        severity: 'error',
        line: lineNum,
        message: `[SyntaxError] Invalid "." attribute access syntax at line ${lineNum}.`,
      });
    }

    // 2. Check for missing comma between adjacent tokens (e.g. "__STR_0__ urdf_path" or "a b")
    const adjTokenRegex =
      /\b([a-zA-Z_][a-zA-Z0-9_.]*)\s+([a-zA-Z_][a-zA-Z0-9_.]*)\b/g;
    let adjMatch: RegExpExecArray | null;
    while ((adjMatch = adjTokenRegex.exec(trimmed)) !== null) {
      const leftTok = adjMatch[1];
      const rightTok = adjMatch[2];
      if (
        !PYTHON_KEYWORDS.has(leftTok) &&
        !PYTHON_KEYWORDS.has(rightTok)
      ) {
        diagnostics.push({
          id: `launch-py-missing-comma-${lineNum}-${leftTok}-${rightTok}`,
          severity: 'error',
          line: lineNum,
          message: `[SyntaxError] Invalid syntax "${leftTok} ${rightTok}" at line ${lineNum} (did you forget a comma ","?).`,
        });
      }
    }

    // 3. Validate all identifier and dotted attribute chains on this line
    const chainRegex = /[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*/g;
    let cm: RegExpExecArray | null;
    while ((cm = chainRegex.exec(masked)) !== null) {
      const chain = cm[0];
      if (/^__STR_\d+__$/.test(chain)) continue;
      if (PYTHON_KEYWORDS.has(chain)) continue;

      const afterChain = masked.slice(cm.index + chain.length);
      const beforeChain = masked.slice(0, cm.index);

      // Check if this is a keyword argument name `kw=` inside a function call
      const isKwargName =
        !chain.includes('.') &&
        /^\s*=(?!=)/.test(afterChain) &&
        !/=\s*$/.test(beforeChain);
      if (isKwargName) continue;

      const parts = chain.split('.');
      const root = parts[0];

      if (PYTHON_BUILTINS.has(root)) {
        if (parts.length > 1) {
          diagnostics.push({
            id: `launch-py-builtin-attr-${lineNum}-${chain}`,
            severity: 'error',
            line: lineNum,
            message: `[AttributeError] Built-in '${root}' has no attribute '${parts[1]}' at line ${lineNum}.`,
          });
        }
        continue;
      }

      const sym = definedSymbols[root];
      if (!sym) {
        const hint =
          root === 's' || root === 'o' || root === 'oss'
            ? " (did you mean 'os'?)"
            : '';
        diagnostics.push({
          id: `launch-py-undef-name-${lineNum}-${root}-${cm.index}`,
          severity: 'error',
          line: lineNum,
          message: `[NameError] name '${root}' is not defined at line ${lineNum}${hint}.`,
        });
        continue;
      }

      // Validate dotted attributes (e.g. os.path.join)
      if (parts.length > 1) {
        if (sym.kind === 'module' && sym.moduleName) {
          let currentMod = sym.moduleName;
          for (let pIdx = 1; pIdx < parts.length; pIdx++) {
            const attr = parts[pIdx];
            const exportsList = PYTHON_ROS2_MODULES[currentMod];
            if (!exportsList || !exportsList.includes(attr)) {
              diagnostics.push({
                id: `launch-py-attr-err-${lineNum}-${currentMod}-${attr}`,
                severity: 'error',
                line: lineNum,
                message: `[AttributeError] module '${currentMod}' has no attribute '${attr}' at line ${lineNum}.`,
              });
              break;
            }
            currentMod = `${currentMod}.${attr}`;
          }
        } else if (sym.kind === 'imported' && sym.name === 'Path') {
          // pathlib.Path methods allowed
        } else {
          diagnostics.push({
            id: `launch-py-invalid-attr-${lineNum}-${chain}`,
            severity: 'error',
            line: lineNum,
            message: `[AttributeError] '${root}' has no attribute '${parts.slice(1).join('.')}' at line ${lineNum}.`,
          });
        }
      }
    }
  }
}

function validateLaunchPyFile(
  entry: WorkspaceFileEntry,
  workspaceFiles: Record<string, WorkspaceFileEntry>,
): {
  diagnostics: CompilerDiagnostic[];
  nodesStarted: string[];
  targetUrdfPath: string | null;
  targetRvizConfigPath: string | null;
  usesXacroCommand: boolean;
} {
  const diagnostics: CompilerDiagnostic[] = [];
  const nodesStarted: string[] = [];
  let targetUrdfPath: string | null = null;
  let targetRvizConfigPath: string | null = null;
  let usesXacroCommand = false;

  const content = entry.content;
  if (!content.trim()) {
    diagnostics.push({
      id: 'launch-py-empty-1',
      severity: 'error',
      line: 1,
      column: 1,
      message: `[ros2 launch] "${entry.name}" is empty. Expected a ROS 2 Python launch file defining generate_launch_description().`,
    });
    return {
      diagnostics,
      nodesStarted,
      targetUrdfPath,
      targetRvizConfigPath,
      usesXacroCommand,
    };
  }

  const lines = content.split('\n');
  const bracketStack: { char: string; expected: string; line: number }[] = [];
  const statements: PyLogicalStatement[] = [];
  let pendingStmt: PyLogicalStatement | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const rawLine = lines[i];
    const stripped = rawLine.replace(/#.*$/, '');
    const trimmed = stripped.trim();

    const startBracketDepth = bracketStack.length;
    let inQuote: "'" | '"' | null = null;

    for (let c = 0; c < rawLine.length; c++) {
      const ch = rawLine[c];
      if (inQuote) {
        if (ch === '\\') {
          c++;
          continue;
        }
        if (ch === inQuote) {
          inQuote = null;
        }
      } else {
        if (ch === '#') break;
        if (ch === "'" || ch === '"') {
          inQuote = ch;
        } else if (ch === '(') {
          bracketStack.push({ char: '(', expected: ')', line: lineNum });
        } else if (ch === '[') {
          bracketStack.push({ char: '[', expected: ']', line: lineNum });
        } else if (ch === '{') {
          bracketStack.push({ char: '{', expected: '}', line: lineNum });
        } else if (ch === ')' || ch === ']' || ch === '}') {
          const top = bracketStack.pop();
          if (!top) {
            diagnostics.push({
              id: `launch-py-unmatched-close-${lineNum}-${c}`,
              severity: 'error',
              line: lineNum,
              column: c + 1,
              message: `[SyntaxError] Unexpected closing "${ch}" at line ${lineNum} with no matching opening bracket.`,
            });
          } else if (top.expected !== ch) {
            diagnostics.push({
              id: `launch-py-mismatched-bracket-${lineNum}-${c}`,
              severity: 'error',
              line: lineNum,
              column: c + 1,
              message: `[SyntaxError] Mismatched closing "${ch}" at line ${lineNum}; expected "${top.expected}" to close "${top.char}" opened at line ${top.line}.`,
            });
          }
        }
      }
    }

    if (inQuote) {
      diagnostics.push({
        id: `launch-py-unclosed-str-${lineNum}`,
        severity: 'error',
        line: lineNum,
        message: `[SyntaxError] Unterminated string literal (missing closing ${inQuote}) at line ${lineNum}.`,
      });
    }

    if (!trimmed) continue;

    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    if (!pendingStmt || startBracketDepth === 0) {
      if (pendingStmt) {
        statements.push(pendingStmt);
      }
      pendingStmt = {
        startLine: lineNum,
        endLine: lineNum,
        indent,
        lines: [{ lineNum, text: stripped }],
        joinedText: trimmed,
      };
    } else {
      pendingStmt.endLine = lineNum;
      pendingStmt.lines.push({ lineNum, text: stripped });
      pendingStmt.joinedText += ' ' + trimmed;
    }

    if (bracketStack.length === 0 && pendingStmt) {
      statements.push(pendingStmt);
      pendingStmt = null;
    }
  }

  if (pendingStmt) {
    statements.push(pendingStmt);
  }

  for (const unclosed of bracketStack) {
    diagnostics.push({
      id: `launch-py-unclosed-bracket-${unclosed.line}`,
      severity: 'error',
      line: unclosed.line,
      message: `[SyntaxError] Unclosed "${unclosed.char}" opened at line ${unclosed.line} (expected "${unclosed.expected}").`,
    });
  }

  // Symbol table for imports, variables, and function definitions
  const definedSymbols: Record<string, PySymbolInfo> = {};
  let hasGenerateLaunchDescFn = false;
  let hasReturnLaunchDesc = false;

  for (const stmt of statements) {
    const text = stmt.joinedText.trim();
    const line = stmt.startLine;

    // 1. "import <module> [as <alias>]"
    if (text.startsWith('import ') || text === 'import') {
      const m = text.match(
        /^import\s+([a-zA-Z_][a-zA-Z0-9_.]*)(?:\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*))?$/,
      );
      if (!m) {
        diagnostics.push({
          id: `launch-py-bad-import-${line}`,
          severity: 'error',
          line,
          message: `[SyntaxError] Invalid import statement "${text}" at line ${line}.`,
        });
        continue;
      }
      const modName = m[1];
      const alias = m[2] || modName;
      if (!PYTHON_ROS2_MODULES[modName]) {
        diagnostics.push({
          id: `launch-py-mod-not-found-${line}-${modName}`,
          severity: 'error',
          line,
          message: `[ModuleNotFoundError] No module named '${modName}' at line ${line}.`,
        });
      } else {
        definedSymbols[alias] = {
          name: alias,
          kind: 'module',
          moduleName: modName,
          line,
        };
      }
      continue;
    }

    // 2. "from <module> import <names>"
    if (text.startsWith('from ') || text === 'from') {
      const m = text.match(/^from\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s+import\s+(.+)$/);
      if (!m) {
        diagnostics.push({
          id: `launch-py-bad-from-import-${line}`,
          severity: 'error',
          line,
          message: `[SyntaxError] Invalid "from ... import ..." statement "${text}" at line ${line}.`,
        });
        continue;
      }
      const modName = m[1];
      const importsRaw = m[2].replace(/^\(|\)$/g, '');
      const allowedExports = PYTHON_ROS2_MODULES[modName];
      if (!allowedExports) {
        diagnostics.push({
          id: `launch-py-from-mod-not-found-${line}-${modName}`,
          severity: 'error',
          line,
          message: `[ModuleNotFoundError] No module named '${modName}' at line ${line}.`,
        });
        continue;
      }

      const items = importsRaw.split(',').map((s) => s.trim()).filter(Boolean);
      for (const item of items) {
        const itemMatch = item.match(
          /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*))?$/,
        );
        if (!itemMatch) {
          diagnostics.push({
            id: `launch-py-bad-import-item-${line}-${item}`,
            severity: 'error',
            line,
            message: `[SyntaxError] Invalid import name "${item}" at line ${line}.`,
          });
          continue;
        }
        const impName = itemMatch[1];
        const impAlias = itemMatch[2] || impName;
        if (!allowedExports.includes(impName)) {
          diagnostics.push({
            id: `launch-py-import-err-${line}-${impName}`,
            severity: 'error',
            line,
            message: `[ImportError] cannot import name '${impName}' from '${modName}' at line ${line}. Available exports: [${allowedExports.join(', ')}].`,
          });
        } else {
          definedSymbols[impAlias] = {
            name: impAlias,
            kind: 'imported',
            moduleName: modName,
            line,
          };
        }
      }
      continue;
    }

    // 3. "def generate_launch_description():"
    if (text.startsWith('def ') || text === 'def') {
      const m = text.match(/^def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(:?)$/);
      if (!m) {
        diagnostics.push({
          id: `launch-py-bad-def-${line}`,
          severity: 'error',
          line,
          message: `[SyntaxError] Invalid function definition "${text}" at line ${line}.`,
        });
        continue;
      }
      const fnName = m[1];
      const colon = m[3];
      if (colon !== ':') {
        diagnostics.push({
          id: `launch-py-def-missing-colon-${line}`,
          severity: 'error',
          line,
          message: `[SyntaxError] Function definition "def ${fnName}()" at line ${line} is missing a trailing ":".`,
        });
      }
      if (fnName !== 'generate_launch_description') {
        diagnostics.push({
          id: `launch-py-wrong-fn-name-${line}-${fnName}`,
          severity: 'error',
          line,
          message: `[ros2 launch] Invalid function name "${fnName}" at line ${line}; ROS 2 launch requires "def generate_launch_description():".`,
        });
      } else {
        hasGenerateLaunchDescFn = true;
      }
      definedSymbols[fnName] = {
        name: fnName,
        kind: 'function',
        line,
      };
      continue;
    }

    // 4. "return LaunchDescription([...])"
    if (text.startsWith('return ') || text === 'return') {
      if (!hasGenerateLaunchDescFn || stmt.indent === 0) {
        diagnostics.push({
          id: `launch-py-return-outside-${line}`,
          severity: 'error',
          line,
          message: `[SyntaxError] "return" at line ${line} is outside generate_launch_description().`,
        });
      }
      const rhsLines = stmt.lines.map((l, idx) => ({
        lineNum: l.lineNum,
        text: idx === 0 ? l.text.replace(/^\s*return\b/, '') : l.text,
      }));
      validatePythonExpressionLines(rhsLines, definedSymbols, diagnostics);
      if (/^return\s+LaunchDescription\s*\(\s*\[[\s\S]*\]\s*\)$/.test(text)) {
        hasReturnLaunchDesc = true;
      } else {
        diagnostics.push({
          id: `launch-py-bad-return-expr-${line}`,
          severity: 'error',
          line,
          message: `[ros2 launch] "return" at line ${line} must return LaunchDescription([...]).`,
        });
      }
      continue;
    }

    // 5. Assignment "<lhs> = <rhs>"
    const eqIdx = text.indexOf('=');
    if (
      eqIdx !== -1 &&
      text[eqIdx - 1] !== '!' &&
      text[eqIdx - 1] !== '<' &&
      text[eqIdx - 1] !== '>' &&
      text[eqIdx - 1] !== '=' &&
      text[eqIdx + 1] !== '='
    ) {
      const lhs = text.slice(0, eqIdx).trim();
      const rhs = text.slice(eqIdx + 1).trim();

      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(lhs)) {
        diagnostics.push({
          id: `launch-py-bad-lhs-${line}`,
          severity: 'error',
          line,
          message: `[SyntaxError] Invalid assignment target "${lhs}" at line ${line}.`,
        });
        continue;
      }

      if (!rhs) {
        diagnostics.push({
          id: `launch-py-empty-rhs-${line}`,
          severity: 'error',
          line,
          message: `[SyntaxError] Incomplete assignment "${lhs} =" at line ${line}.`,
        });
        continue;
      }

      const rhsLines = stmt.lines.map((l, idx) => ({
        lineNum: l.lineNum,
        text: idx === 0 ? l.text.slice(l.text.indexOf('=') + 1) : l.text,
      }));

      validatePythonExpressionLines(rhsLines, definedSymbols, diagnostics);

      // Specific semantic checks on RHS calls (Command, ParameterValue, Node, get_package_share_path)
      if (/\bCommand\s*\(/.test(rhs)) {
        const cmdMatch = rhs.match(
          /\bCommand\s*\(\s*\[\s*(['"])([^'"]*)\1\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\]\s*\)/,
        );
        if (!cmdMatch) {
          diagnostics.push({
            id: `launch-py-bad-command-call-${line}`,
            severity: 'error',
            line,
            message: `[ros2 launch] Invalid Command() syntax at line ${line}; expected Command(['xacro ', urdf_path]).`,
          });
        } else {
          const xacroLit = cmdMatch[2].trim();
          if (xacroLit !== 'xacro') {
            diagnostics.push({
              id: `launch-py-bad-xacro-cmd-${line}-${xacroLit}`,
              severity: 'error',
              line,
              message: `[ros2 launch] Invalid command executable '${xacroLit}' in Command() at line ${line}; expected 'xacro '.`,
            });
          } else {
            usesXacroCommand = true;
          }
        }
      }

      if (/^ParameterValue\s*\(/.test(rhs)) {
        const kwMatches = Array.from(
          rhs.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*=(?!=)/g),
        );
        for (const km of kwMatches) {
          const kw = km[1];
          if (kw !== 'value_type') {
            diagnostics.push({
              id: `launch-py-pv-bad-kw-${line}-${kw}`,
              severity: 'error',
              line,
              message: `[TypeError] ParameterValue() got an unexpected keyword argument '${kw}' at line ${line}; expected value_type=str.`,
            });
          }
        }
      }

      if (/^Node\s*\(/.test(rhs)) {
        for (const l of rhsLines) {
          const maskedLine = maskPythonLineStrings(l.text, []);
          const kwMatches = Array.from(
            maskedLine.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*=(?!=)/g),
          );
          for (const km of kwMatches) {
            const kw = km[1];
            if (!ALLOWED_PY_NODE_KWARGS.has(kw)) {
              diagnostics.push({
                id: `launch-py-node-bad-kw-${l.lineNum}-${kw}`,
                severity: 'error',
                line: l.lineNum,
                message: `[TypeError] Node() got an unexpected keyword argument '${kw}' at line ${l.lineNum}. Allowed arguments: package, executable, name, namespace, parameters, arguments, output.`,
              });
            }
          }
        }

        const pkgMatch = rhs.match(/\bpackage\s*=\s*(['"])([^'"]*)\1/);
        const execMatch = rhs.match(/\bexecutable\s*=\s*(['"])([^'"]*)\1/);
        if (!pkgMatch || !execMatch) {
          diagnostics.push({
            id: `launch-py-node-missing-pkg-exec-${line}`,
            severity: 'error',
            line,
            message: `[ros2 launch] Node() at line ${line} requires both package="..." and executable="..." string arguments.`,
          });
        } else {
          const pkg = pkgMatch[2];
          const exec = execMatch[2];
          if (!KNOWN_ROS2_PACKAGES.has(pkg)) {
            diagnostics.push({
              id: `launch-py-node-unknown-pkg-${line}-${pkg}`,
              severity: 'error',
              line,
              message: `[ros2 launch] Unknown ROS 2 package "${pkg}" in Node() at line ${line}.`,
            });
          } else {
            const validExecs = KNOWN_ROS2_PACKAGE_EXECUTABLES[pkg];
            if (validExecs && !validExecs.includes(exec)) {
              diagnostics.push({
                id: `launch-py-node-bad-exec-${line}-${exec}`,
                severity: 'error',
                line,
                message: `[ros2 launch] Executable "${exec}" not found in package "${pkg}" at line ${line}; expected executable="${validExecs[0]}".`,
              });
            }
          }
          nodesStarted.push(exec);

          if (
            pkg === 'robot_state_publisher' &&
            !rhs.includes("'robot_description'") &&
            !rhs.includes('"robot_description"')
          ) {
            diagnostics.push({
              id: `launch-py-rsp-missing-param-${line}`,
              severity: 'error',
              line,
              message: `[ros2 launch] robot_state_publisher Node at line ${line} requires parameters=[{'robot_description': robot_description}].`,
            });
          }
        }

        const outMatch = rhs.match(/\boutput\s*=\s*(['"])([^'"]*)\1/);
        if (outMatch && !VALID_NODE_OUTPUT_VALUES.has(outMatch[2])) {
          diagnostics.push({
            id: `launch-py-node-bad-output-${line}`,
            severity: 'error',
            line,
            message: `[ros2 launch] Invalid output="${outMatch[2]}" in Node() at line ${line}; expected "screen", "log", or "both".`,
          });
        }
      }

      definedSymbols[lhs] = {
        name: lhs,
        kind: 'variable',
        line,
      };
      continue;
    }

    // 6. Any other statement (misspelled keyword or bare expression)
    const firstWord = text.split(/\s+|\(/)[0];
    if (
      /^(?:improt|imprt|form|frm|deff|dfn|retrun|retrn)$/.test(firstWord)
    ) {
      diagnostics.push({
        id: `launch-py-kw-typo-${line}-${firstWord}`,
        severity: 'error',
        line,
        message: `[SyntaxError] Invalid Python keyword "${firstWord}" at line ${line}.`,
      });
      continue;
    }

    validatePythonExpressionLines(stmt.lines, definedSymbols, diagnostics);
    diagnostics.push({
      id: `launch-py-unexpected-stmt-${line}`,
      severity: 'error',
      line,
      message: `[SyntaxError] Invalid or incomplete statement "${text.slice(0, 40)}" at line ${line}.`,
    });
  }

  // Check get_package_share_path / get_package_share_directory package name & URDF/RViz paths per line
  let foundUrdfLiteral = false;
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const stripped = lines[i].replace(/#.*$/, '');

    const pkgShareMatch = stripped.match(
      /get_package_share_(?:path|directory)\s*\(\s*(['"])([^'"]*)\1\s*\)/,
    );
    if (pkgShareMatch) {
      const pkgName = pkgShareMatch[2];
      if (pkgName !== 'my_robot_description') {
        diagnostics.push({
          id: `launch-py-bad-pkg-${lineNum}`,
          severity: 'error',
          line: lineNum,
          message: `[PackageNotFoundError] Package "${pkgName}" at line ${lineNum} not found in workspace; expected "my_robot_description".`,
        });
      }
    }

    const m = stripped.match(/(['"])([^'"]*\.(?:urdf|xacro))\1/);
    if (m) {
      foundUrdfLiteral = true;
      const fileLiteral = m[2];
      const candidatePath = fileLiteral.startsWith('my_robot_description/')
        ? fileLiteral
        : `my_robot_description/urdf/${fileLiteral.replace(/^urdf\//, '')}`;
      targetUrdfPath = candidatePath;
      if (!workspaceFiles[candidatePath]) {
        diagnostics.push({
          id: `launch-py-urdf-not-found-${lineNum}`,
          severity: 'error',
          line: lineNum,
          message: `[ros2 launch] URDF file "${candidatePath}" referenced at line ${lineNum} does not exist in my_robot_description/urdf/.`,
        });
      }
    }

    const rvizMatch = stripped.match(/(['"])([^'"]*\.rviz)\1/);
    if (rvizMatch) {
      const rvizLiteral = rvizMatch[2];
      const candidateRviz = rvizLiteral.startsWith('my_robot_description/')
        ? rvizLiteral
        : `my_robot_description/rviz/${rvizLiteral.replace(/^rviz\//, '')}`;
      targetRvizConfigPath = candidateRviz;
      if (!workspaceFiles[candidateRviz]) {
        diagnostics.push({
          id: `launch-py-rviz-not-found-${lineNum}`,
          severity: 'error',
          line: lineNum,
          message: `[ros2 launch] RViz config "${candidateRviz}" referenced at line ${lineNum} does not exist in my_robot_description/rviz/.`,
        });
      }
    }
  }

  if (!definedSymbols.LaunchDescription) {
    diagnostics.push({
      id: 'launch-py-missing-ld-import',
      severity: 'error',
      line: 1,
      message: `[ros2 launch] Missing "from launch import LaunchDescription" in ${entry.name}.`,
    });
  }

  if (!definedSymbols.Node) {
    diagnostics.push({
      id: 'launch-py-missing-node-import',
      severity: 'error',
      line: 1,
      message: `[ros2 launch] Missing "from launch_ros.actions import Node" in ${entry.name}.`,
    });
  }

  if (!hasGenerateLaunchDescFn) {
    diagnostics.push({
      id: 'launch-py-missing-fn',
      severity: 'error',
      line: 1,
      message: `[ros2 launch] ROS 2 Python launch file must define "def generate_launch_description():".`,
    });
  }

  if (!hasReturnLaunchDesc) {
    diagnostics.push({
      id: 'launch-py-missing-return',
      severity: 'error',
      line: lines.length,
      message: `[ros2 launch] generate_launch_description() must return LaunchDescription([...]).`,
    });
  }

  if (!foundUrdfLiteral) {
    diagnostics.push({
      id: 'launch-py-no-urdf-path',
      severity: 'error',
      line: 1,
      message: `[ros2 launch] No .urdf or .urdf.xacro file path found in ${entry.name}.`,
    });
  }

  if (!nodesStarted.includes('robot_state_publisher')) {
    diagnostics.push({
      id: 'launch-py-missing-rsp',
      severity: 'error',
      line: 1,
      message: `[ros2 launch] Missing robot_state_publisher Node in ${entry.name}.`,
    });
  }

  return {
    diagnostics,
    nodesStarted,
    targetUrdfPath,
    targetRvizConfigPath,
    usesXacroCommand,
  };
}

const ALLOWED_CMAKE_COMMANDS = new Set([
  'cmake_minimum_required',
  'project',
  'if',
  'elseif',
  'else',
  'endif',
  'add_compile_options',
  'find_package',
  'install',
  'ament_package',
  'set',
  'message',
  'include_directories',
  'add_executable',
  'add_library',
  'target_link_libraries',
  'ament_target_dependencies',
  'ament_export_dependencies',
]);

function validateCmakeListsFile(entry: WorkspaceFileEntry): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  const content = entry.content;

  if (!content.trim()) {
    diagnostics.push({
      id: 'cmake-empty-1',
      severity: 'error',
      line: 1,
      message:
        '[ament_cmake] CMakeLists.txt is empty. Expected cmake_minimum_required(), project(my_robot_description), find_package(ament_cmake REQUIRED), and ament_package().',
    });
    return diagnostics;
  }

  const lines = content.split('\n');
  let parenDepth = 0;
  let lastOpenLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const stripped = lines[i].replace(/#.*$/, '').trim();
    if (!stripped) continue;

    if (parenDepth === 0) {
      const cmdMatch = stripped.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
      if (!cmdMatch) {
        diagnostics.push({
          id: `cmake-syntax-line-${lineNum}`,
          severity: 'error',
          line: lineNum,
          message: `[CMake Error] Unexpected statement "${stripped.slice(0, 32)}" at line ${lineNum}; expected a CMake command call.`,
        });
      } else {
        const cmdName = cmdMatch[1].toLowerCase();
        if (!ALLOWED_CMAKE_COMMANDS.has(cmdName)) {
          diagnostics.push({
            id: `cmake-unknown-cmd-${lineNum}-${cmdName}`,
            severity: 'error',
            line: lineNum,
            message: `[CMake Error] Unknown CMake command "${cmdMatch[1]}()" at line ${lineNum}.`,
          });
        }
      }
    }

    for (const ch of stripped) {
      if (ch === '(') {
        if (parenDepth === 0) lastOpenLine = lineNum;
        parenDepth++;
      } else if (ch === ')') {
        parenDepth--;
        if (parenDepth < 0) {
          diagnostics.push({
            id: `cmake-unmatched-paren-${lineNum}`,
            severity: 'error',
            line: lineNum,
            message: `[CMake Error] Unexpected closing ")" at line ${lineNum}.`,
          });
          parenDepth = 0;
        }
      }
    }
  }

  if (parenDepth > 0) {
    diagnostics.push({
      id: `cmake-unclosed-paren-${lastOpenLine}`,
      severity: 'error',
      line: lastOpenLine,
      message: `[CMake Error] Unclosed "(" in CMakeLists.txt opened at line ${lastOpenLine}.`,
    });
  }

  if (!/cmake_minimum_required\s*\(\s*VERSION\s+\d+/i.test(content)) {
    diagnostics.push({
      id: 'cmake-missing-min-req',
      severity: 'error',
      line: 1,
      message: '[ament_cmake] Missing cmake_minimum_required(VERSION 3.8) in CMakeLists.txt.',
    });
  }

  const projMatch = content.match(/project\s*\(\s*([^\s)]+)\s*\)/i);
  if (!projMatch) {
    diagnostics.push({
      id: 'cmake-missing-project',
      severity: 'error',
      line: 1,
      message: '[ament_cmake] Missing project(my_robot_description) in CMakeLists.txt.',
    });
  } else if (projMatch[1] !== 'my_robot_description') {
    diagnostics.push({
      id: 'cmake-project-mismatch',
      severity: 'error',
      line: 2,
      message: `[ament_cmake] project(${projMatch[1]}) in CMakeLists.txt must match package name "my_robot_description".`,
    });
  }

  if (!/find_package\s*\(\s*ament_cmake\s+REQUIRED\s*\)/i.test(content)) {
    diagnostics.push({
      id: 'cmake-missing-ament',
      severity: 'error',
      line: 1,
      message: '[ament_cmake] Missing find_package(ament_cmake REQUIRED) in CMakeLists.txt.',
    });
  }

  const installMatch = content.match(
    /install\s*\(\s*DIRECTORY\s+([\s\S]*?)\s+DESTINATION\s+([^\s)]+)\s*\)/i,
  );
  if (!installMatch) {
    diagnostics.push({
      id: 'cmake-missing-install',
      severity: 'error',
      line: 1,
      message:
        '[ament_cmake] CMakeLists.txt is missing install(DIRECTORY urdf launch rviz DESTINATION share/${PROJECT_NAME}/).',
    });
  } else {
    const dirs = installMatch[1].trim().split(/\s+/).filter(Boolean);
    const validPkgDirs = new Set(['urdf', 'launch', 'rviz', 'meshes', 'config']);
    for (const d of dirs) {
      if (!validPkgDirs.has(d)) {
        diagnostics.push({
          id: `cmake-bad-install-dir-${d}`,
          severity: 'error',
          line: 10,
          message: `[ament_cmake] install(DIRECTORY ...): directory "${d}" does not exist in my_robot_description (expected urdf, launch, rviz).`,
        });
      }
    }
  }

  if (!/ament_package\s*\(\s*\)/i.test(content)) {
    diagnostics.push({
      id: 'cmake-missing-ament-pkg',
      severity: 'error',
      line: lines.length,
      message: '[ament_cmake] Missing ament_package() call at the end of CMakeLists.txt.',
    });
  }

  return diagnostics;
}

const ALLOWED_PACKAGE_XML_CHILDREN = new Set([
  'name',
  'version',
  'description',
  'maintainer',
  'license',
  'url',
  'author',
  'build_depend',
  'build_export_depend',
  'buildtool_depend',
  'buildtool_export_depend',
  'exec_depend',
  'depend',
  'doc_depend',
  'test_depend',
  'conflict',
  'replace',
  'member_of_group',
  'export',
]);

function validatePackageXmlFile(
  entry: WorkspaceFileEntry,
): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  const content = entry.content;

  if (!content.trim()) {
    diagnostics.push({
      id: 'pkg-xml-empty-1',
      severity: 'error',
      line: 1,
      message:
        '[ament_package] package.xml is empty. Expected a ROS 2 <package format="3"> manifest.',
    });
    return diagnostics;
  }

  const { root, errors } = parseXmlWithLines(content);
  for (const err of errors) {
    diagnostics.push({
      id: `pkg-xml-err-${err.line}-${err.column}-${diagnostics.length}`,
      severity: 'error',
      line: err.line,
      column: err.column,
      message: `[package.xml] ${err.message}`,
    });
  }

  if (!root) return diagnostics;

  if (root.tagName !== 'package') {
    diagnostics.push({
      id: `pkg-xml-root-${root.line}`,
      severity: 'error',
      line: root.line,
      message: `[package.xml] Root element must be <package format="3">, but found <${root.tagName}>.`,
    });
    return diagnostics;
  }

  for (const child of root.children) {
    if (!ALLOWED_PACKAGE_XML_CHILDREN.has(child.tagName)) {
      diagnostics.push({
        id: `pkg-xml-unknown-tag-${child.line}-${child.tagName}`,
        severity: 'error',
        line: child.line,
        message: `[package.xml] Unknown element "<${child.tagName}>" at line ${child.line} in package.xml.`,
      });
    }
  }

  const nameNode = root.children.find((c) => c.tagName === 'name');
  if (!nameNode || !nameNode.text.trim()) {
    diagnostics.push({
      id: `pkg-xml-no-name-${root.line}`,
      severity: 'error',
      line: root.line,
      message: '[package.xml] Missing <name>my_robot_description</name> in package.xml.',
    });
  } else if (nameNode.text.trim() !== 'my_robot_description') {
    diagnostics.push({
      id: `pkg-xml-bad-name-${nameNode.line}`,
      severity: 'error',
      line: nameNode.line,
      message: `[package.xml] Package <name> "${nameNode.text.trim()}" does not match package directory "my_robot_description".`,
    });
  }

  for (const reqTag of ['version', 'description', 'maintainer', 'license']) {
    const found = root.children.find((c) => c.tagName === reqTag);
    if (!found || !found.text.trim()) {
      diagnostics.push({
        id: `pkg-xml-missing-${reqTag}`,
        severity: 'error',
        line: root.line,
        message: `[package.xml] Missing required <${reqTag}> element in package.xml.`,
      });
    } else if (reqTag === 'maintainer' && !found.attributes.email) {
      diagnostics.push({
        id: `pkg-xml-maintainer-email-${found.line}`,
        severity: 'error',
        line: found.line,
        message: `[package.xml] <maintainer> at line ${found.line} is missing required email="..." attribute.`,
      });
    }
  }

  const hasAmentBuildtool = root.children.some(
    (c) =>
      c.tagName === 'buildtool_depend' && c.text.trim() === 'ament_cmake',
  );
  if (!hasAmentBuildtool) {
    diagnostics.push({
      id: 'pkg-xml-no-ament-buildtool',
      severity: 'warning',
      line: root.line,
      message:
        '[package.xml] Missing <buildtool_depend>ament_cmake</buildtool_depend>.',
    });
  }

  return diagnostics;
}

function validateRvizYamlFile(entry: WorkspaceFileEntry): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  const content = entry.content;

  if (!content.trim()) {
    diagnostics.push({
      id: 'rviz-yaml-empty-1',
      severity: 'error',
      line: 1,
      message:
        '[rviz2] urdf_config.rviz is empty. Expected RViz2 YAML configuration with Visualization Manager and Displays.',
    });
    return diagnostics;
  }

  if (!content.includes('Visualization Manager:')) {
    diagnostics.push({
      id: 'rviz-yaml-no-vm',
      severity: 'error',
      line: 1,
      message: '[rviz2] urdf_config.rviz is missing "Visualization Manager:" section.',
    });
  }
  if (!content.includes('Displays:')) {
    diagnostics.push({
      id: 'rviz-yaml-no-displays',
      severity: 'error',
      line: 1,
      message: '[rviz2] urdf_config.rviz is missing "Displays:" section.',
    });
  }
  if (!content.includes('Fixed Frame:')) {
    diagnostics.push({
      id: 'rviz-yaml-no-fixed-frame',
      severity: 'warning',
      line: 1,
      message: '[rviz2] urdf_config.rviz is missing "Fixed Frame:" under Global Options.',
    });
  }

  return diagnostics;
}

function validateJsonFile(entry: WorkspaceFileEntry): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  const content = entry.content;

  if (!content.trim()) {
    diagnostics.push({
      id: 'json-empty-1',
      severity: 'error',
      line: 1,
      message: `[${entry.name}] JSON file is empty.`,
    });
    return diagnostics;
  }

  try {
    JSON.parse(content);
  } catch (err) {
    const msg = (err as Error).message;
    diagnostics.push({
      id: 'json-parse-err-1',
      severity: 'error',
      line: 1,
      message: `[${entry.name}] Invalid JSON syntax: ${msg}`,
    });
  }

  return diagnostics;
}

/**
 * Validates any file in the ROS 2 package workspace (`display.launch.xml`,
 * `display.launch.py`, `CMakeLists.txt`, `package.xml`, `urdf_config.rviz`,
 * `.vscode/settings.json`, `my_robot.urdf.xacro`, or `my_robot.urdf`) and
 * returns line-accurate diagnostics.
 */
export function validateWorkspaceFile(
  filePath: string,
  workspaceFiles: Record<string, WorkspaceFileEntry>,
): CompilerDiagnostic[] {
  const entry = workspaceFiles[filePath];
  if (!entry) {
    return [
      {
        id: `ws-missing-${filePath}`,
        severity: 'error',
        line: 1,
        message: `Workspace file "${filePath}" not found.`,
      },
    ];
  }

  switch (entry.language) {
    case 'launch_xml':
      return validateLaunchXmlFile(entry, workspaceFiles).diagnostics;
    case 'launch_py':
      return validateLaunchPyFile(entry, workspaceFiles).diagnostics;
    case 'cmake':
      return validateCmakeListsFile(entry);
    case 'package_xml':
      return validatePackageXmlFile(entry);
    case 'rviz_yaml':
      return validateRvizYamlFile(entry);
    case 'json':
      return validateJsonFile(entry);
    case 'urdf':
    case 'xacro':
      return compileUrdf(entry.content).diagnostics;
    default:
      return [];
  }
}

/**
 * Validates and interprets either display.launch.xml or display.launch.py
 * against the workspace files in my_robot_description (including CMakeLists.txt,
 * package.xml, and the referenced URDF/Xacro model).
 */
export function evaluateRos2LaunchFile(
  launchFilePath: string,
  workspaceFiles: Record<string, WorkspaceFileEntry>,
): LaunchExecutionSummary {
  const entry = workspaceFiles[launchFilePath];
  const diagnostics: CompilerDiagnostic[] = [];
  let nodesStarted: string[] = [];
  let targetUrdfPath = 'my_robot_description/urdf/my_robot.urdf.xacro';
  let targetRvizConfigPath = 'my_robot_description/rviz/urdf_config.rviz';
  let usesXacroCommand = true;

  if (!entry) {
    diagnostics.push({
      id: 'launch-missing-file',
      severity: 'error',
      line: 1,
      column: 1,
      message: `Launch file "${launchFilePath}" not found in workspace.`,
    });
    return {
      launchFile: launchFilePath,
      targetUrdfPath,
      targetRvizConfigPath,
      usesXacroCommand,
      nodesStarted: [],
      diagnostics,
      success: false,
    };
  }

  if (entry.language === 'launch_xml') {
    const res = validateLaunchXmlFile(entry, workspaceFiles);
    diagnostics.push(...res.diagnostics);
    nodesStarted = res.nodesStarted;
    if (res.targetUrdfPath) targetUrdfPath = res.targetUrdfPath;
    if (res.targetRvizConfigPath) targetRvizConfigPath = res.targetRvizConfigPath;
    usesXacroCommand = res.usesXacroCommand;
  } else if (entry.language === 'launch_py') {
    const res = validateLaunchPyFile(entry, workspaceFiles);
    diagnostics.push(...res.diagnostics);
    nodesStarted = res.nodesStarted;
    if (res.targetUrdfPath) targetUrdfPath = res.targetUrdfPath;
    if (res.targetRvizConfigPath) targetRvizConfigPath = res.targetRvizConfigPath;
    usesXacroCommand = res.usesXacroCommand;
  }

  // Also check CMakeLists.txt and package.xml for package-level build/manifest errors
  const cmakeDiags = validateWorkspaceFile(
    'my_robot_description/CMakeLists.txt',
    workspaceFiles,
  );
  for (const cd of cmakeDiags) {
    diagnostics.push({
      ...cd,
      id: `launch-cmake-${cd.id}`,
      message: `[CMakeLists.txt Ln ${cd.line}] ${cd.message}`,
    });
  }

  const pkgDiags = validateWorkspaceFile(
    'my_robot_description/package.xml',
    workspaceFiles,
  );
  for (const pd of pkgDiags) {
    diagnostics.push({
      ...pd,
      id: `launch-pkg-${pd.id}`,
      message: `[package.xml Ln ${pd.line}] ${pd.message}`,
    });
  }

  // Validate the target URDF/Xacro file if the launch file had no missing-file error
  const targetEntry = workspaceFiles[targetUrdfPath];
  if (targetEntry) {
    const urdfModel = compileUrdf(targetEntry.content);
    for (const ud of urdfModel.diagnostics) {
      diagnostics.push({
        ...ud,
        id: `launch-urdf-${ud.id}`,
        message: `[${targetEntry.name} Ln ${ud.line}] ${ud.message}`,
      });
    }
  }

  const hasErrors = diagnostics.some((d) => d.severity === 'error');
  if (hasErrors) {
    nodesStarted = [];
  }

  const rvizEntry = workspaceFiles[targetRvizConfigPath];
  const rvizLayersOverride =
    !hasErrors && rvizEntry
      ? parseRvizConfigLayers(rvizEntry.content)
      : undefined;

  return {
    launchFile: launchFilePath,
    targetUrdfPath,
    targetRvizConfigPath,
    usesXacroCommand,
    nodesStarted,
    diagnostics,
    success: !hasErrors,
    rvizLayersOverride,
  };
}

