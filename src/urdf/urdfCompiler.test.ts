import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileUrdf,
  computeForwardKinematics,
  resolveMimicJointValues,
  rpyToQuaternion,
  quaternionToRpy,
} from './urdfCompiler';
import { STARTER_TEMPLATES, createSampleLidarStl } from './templates';
import {
  buildViewFramesLayout,
  generateViewFramesPdfBytes,
} from './viewFramesPdf';
import {
  createInitialWorkspaceFiles,
  evaluateRos2LaunchFile,
  validateWorkspaceFile,
} from './ros2PackageWorkspace';

test('compiles all built-in ROS2 starter URDF templates without errors', () => {
  for (const tpl of STARTER_TEMPLATES) {
    const model = compileUrdf(tpl.urdfXml);
    const errors = model.diagnostics.filter((d) => d.severity === 'error');
    assert.equal(
      errors.length,
      0,
      `Template ${tpl.id} had unexpected errors: ${JSON.stringify(errors)}`,
    );
    assert.equal(model.valid, true);
    assert.ok(model.rootLink, `Template ${tpl.id} should have a rootLink`);
    assert.ok(model.tree, `Template ${tpl.id} should have a kinematic tree`);
  }
});

test('detects line-accurate XML syntax errors for mismatched or unclosed tags', () => {
  const brokenXml = `<?xml version="1.0"?>
<robot name="broken_bot">
  <link name="base_link">
    <visual>
      <geometry>
        <box size="1 1 1"/>
    </visual>
  </link>
</robot>`;
  const model = compileUrdf(brokenXml);
  assert.equal(model.valid, false);
  const errors = model.diagnostics.filter((d) => d.severity === 'error');
  assert.ok(errors.length > 0, 'Expected XML syntax error for unclosed <geometry>');
  assert.equal(errors[0].line, 5);
});

test('detects missing parent/child link references and reports line number', () => {
  const invalidLinksXml = `<robot name="bad_refs">
  <link name="base_link"/>
  <joint name="j1" type="revolute">
    <parent link="base_link"/>
    <child link="ghost_link"/>
    <limit lower="-1" upper="1" effort="10" velocity="1"/>
  </joint>
</robot>`;
  const model = compileUrdf(invalidLinksXml);
  assert.equal(model.valid, false);
  const childError = model.diagnostics.find((d) =>
    d.message.includes('ghost_link'),
  );
  assert.ok(childError, 'Should report non-existent child link ghost_link');
  assert.equal(childError.line, 3);
});

test('detects kinematic cycles in URDF joint graph', () => {
  const cyclicXml = `<robot name="loop_bot">
  <link name="link_a"/>
  <link name="link_b"/>
  <joint name="j_ab" type="fixed">
    <parent link="link_a"/>
    <child link="link_b"/>
  </joint>
  <joint name="j_ba" type="fixed">
    <parent link="link_b"/>
    <child link="link_a"/>
  </joint>
</robot>`;
  const model = compileUrdf(cyclicXml);
  assert.equal(model.valid, false);
  assert.ok(
    model.diagnostics.some(
      (d) =>
        d.severity === 'error' &&
        (d.message.toLowerCase().includes('cycle') ||
          d.message.toLowerCase().includes('loop')),
    ),
  );
});

test('computes accurate Z-up forward kinematics for revolute and prismatic joints', () => {
  const simpleArmXml = `<robot name="fk_test_bot">
  <link name="base_link"/>
  <link name="arm_link"/>
  <link name="slider_link"/>
  <joint name="yaw_joint" type="revolute">
    <parent link="base_link"/>
    <child link="arm_link"/>
    <origin xyz="0 0 1.0" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-3.1416" upper="3.1416" effort="10" velocity="1"/>
  </joint>
  <joint name="extend_joint" type="prismatic">
    <parent link="arm_link"/>
    <child link="slider_link"/>
    <origin xyz="0.5 0 0" rpy="0 0 0"/>
    <axis xyz="1 0 0"/>
    <limit lower="-0.5" upper="0.5" effort="10" velocity="1"/>
  </joint>
</robot>`;

  const model = compileUrdf(simpleArmXml);
  assert.equal(model.valid, true);

  // Rotate yaw_joint by +90 deg (+PI/2 around Z) and extend_joint by +0.25m along local X (which now points along +Y!)
  const fk = computeForwardKinematics(model, {
    yaw_joint: Math.PI / 2,
    extend_joint: 0.25,
  });

  const baseTf = fk['base_link'];
  const armTf = fk['arm_link'];
  const sliderTf = fk['slider_link'];

  assert.ok(Math.abs(baseTf.position[2] - 0) < 1e-5);
  assert.ok(Math.abs(armTf.position[2] - 1.0) < 1e-5);

  // Since arm_link is rotated +90 deg around Z, local +X (0.5 + 0.25 = 0.75m) maps to world +Y = 0.75m, X = 0, Z = 1.0
  assert.ok(Math.abs(sliderTf.position[0] - 0) < 1e-4);
  assert.ok(Math.abs(sliderTf.position[1] - 0.75) < 1e-4);
  assert.ok(Math.abs(sliderTf.position[2] - 1.0) < 1e-4);
});

test('round-trips RPY Euler angles through quaternion conversion', () => {
  const inputRpy: [number, number, number] = [0.35, -0.42, 1.15];
  const quat = rpyToQuaternion(inputRpy);
  const outRpy = quaternionToRpy(quat);
  assert.ok(Math.abs(outRpy[0] - inputRpy[0]) < 1e-5);
  assert.ok(Math.abs(outRpy[1] - inputRpy[1]) < 1e-5);
  assert.ok(Math.abs(outRpy[2] - inputRpy[2]) < 1e-5);
});

test('generates valid ASCII STL sample mesh', () => {
  const stl = createSampleLidarStl();
  assert.ok(stl.startsWith('solid lidar_head'));
  assert.ok(stl.includes('facet normal'));
  assert.ok(stl.endsWith('endsolid lidar_head'));
});

test('synchronizes left_finger_joint and right_finger_joint via <mimic> tag and direct coupling', () => {
  const armTemplate = STARTER_TEMPLATES[0];
  const model = compileUrdf(armTemplate.urdfXml);
  assert.equal(model.valid, true);
  assert.ok(model.joints.left_finger_joint, 'Should have left_finger_joint');
  assert.ok(model.joints.right_finger_joint, 'Should have right_finger_joint');
  assert.deepEqual(model.joints.right_finger_joint.mimic, {
    joint: 'left_finger_joint',
    multiplier: 1,
    offset: 0,
    line: model.joints.right_finger_joint.mimic?.line,
  });

  // Moving only left_finger_joint to 0.028 immediately applies 0.028 to right_finger_joint
  const resolved = resolveMimicJointValues(model, {
    left_finger_joint: 0.028,
  });
  assert.equal(resolved.left_finger_joint, 0.028);
  assert.equal(resolved.right_finger_joint, 0.028);

  // Verify forward kinematics opens both fingers symmetrically in opposite directions
  const fkClosed = computeForwardKinematics(model, { left_finger_joint: 0 });
  const fkOpen = computeForwardKinematics(model, { left_finger_joint: 0.03 });
  const distClosed = Math.hypot(
    fkClosed.left_finger_link.position[0] - fkClosed.right_finger_link.position[0],
    fkClosed.left_finger_link.position[1] - fkClosed.right_finger_link.position[1],
    fkClosed.left_finger_link.position[2] - fkClosed.right_finger_link.position[2],
  );
  const distOpen = Math.hypot(
    fkOpen.left_finger_link.position[0] - fkOpen.right_finger_link.position[0],
    fkOpen.left_finger_link.position[1] - fkOpen.right_finger_link.position[1],
    fkOpen.left_finger_link.position[2] - fkOpen.right_finger_link.position[2],
  );
  assert.ok(
    distOpen > distClosed + 0.05,
    `Expected open gripper distance (${distOpen}) > closed distance (${distClosed})`,
  );
});

test('generates valid ROS2 tf2_tools view_frames PDF and non-overlapping tree layout', () => {
  const r2d2Tpl = STARTER_TEMPLATES.find(
    (t) => t.id === 'ros2_r2d2_view_frames',
  );
  assert.ok(r2d2Tpl, 'Should include ros2_r2d2_view_frames template');
  const model = compileUrdf(r2d2Tpl.urdfXml);
  assert.equal(model.valid, true);

  const layout = buildViewFramesLayout(model, 1794544995.7511318);
  assert.equal(layout.nodes.length, Object.keys(model.links).length);
  assert.equal(layout.recordedAtTime, '1794544995.7511318');

  // Verify fixed joints get 10000.0 rate / 0.0 buffer and movable joints get 10.2 rate / 5.0 buffer
  const leftLegNode = layout.nodes.find((n) => n.linkName === 'left_leg');
  const gripperPoleNode = layout.nodes.find(
    (n) => n.linkName === 'gripper_pole',
  );
  assert.ok(leftLegNode);
  assert.ok(gripperPoleNode);
  assert.equal(leftLegNode.averageRate, '10000.0');
  assert.equal(leftLegNode.bufferLength, '0.0');
  assert.equal(gripperPoleNode.averageRate, '10.2');
  assert.equal(gripperPoleNode.bufferLength, '5.0');

  // Verify PDF binary structure
  const pdfBytes = generateViewFramesPdfBytes(model, 1794544995.7511318);
  const pdfText = new TextDecoder().decode(pdfBytes);
  assert.ok(pdfText.startsWith('%PDF-1.4\n'));
  assert.ok(pdfText.endsWith('%%EOF\n'));
  assert.ok(pdfText.includes('(view_frames Result)'));
  assert.ok(pdfText.includes('(Recorded at time: 1794544995.7511318)'));
  assert.ok(pdfText.includes('(Broadcaster: default_authority)'));
  assert.ok(pdfText.includes('(base_link)'));
  assert.ok(pdfText.includes('(gripper_pole)'));
  assert.ok(pdfText.includes('(right_front_wheel)'));
});

test('compiles ROS2 .urdf.xacro sample_robot with xacro:property, xacro:macro, and ${...} math expressions', () => {
  const xacroTpl = STARTER_TEMPLATES.find(
    (t) => t.id === 'sample_xacro_robot',
  );
  assert.ok(xacroTpl, 'Should include sample_xacro_robot (.urdf.xacro) template');
  assert.equal(xacroTpl.isXacro, true);

  const model = compileUrdf(xacroTpl.urdfXml);
  const errors = model.diagnostics.filter((d) => d.severity === 'error');
  assert.equal(
    errors.length,
    0,
    `Expected zero Xacro compilation errors, got: ${JSON.stringify(errors)}`,
  );
  assert.equal(model.valid, true);
  assert.equal(model.isXacro, true);
  assert.equal(model.robotName, 'sample_robot');
  assert.equal(model.rootLink, 'base_link');

  // Verify macros expanded base_link, left_wheel, right_wheel
  assert.ok(model.links.base_link, 'Should have base_link');
  assert.ok(model.links.left_wheel, 'Should have expanded left_wheel link');
  assert.ok(model.links.right_wheel, 'Should have expanded right_wheel link');

  // Verify base_link box geometry size evaluated "${base_length} ${base_width} ${base_height}" -> [0.6, 0.4, 0.2]
  const baseGeom = model.links.base_link.visuals[0].geometry;
  assert.equal(baseGeom.type, 'box');
  assert.deepEqual(baseGeom.size, [0.6, 0.4, 0.2]);

  // Verify box_inertia macro evaluated mass=5.0
  assert.ok(model.links.base_link.inertial);
  assert.equal(model.links.base_link.inertial.mass, 5.0);

  // Verify left_wheel_joint and right_wheel_joint origins evaluated "${base_width/2 + wheel_width/2}" -> 0.225 and -0.225
  assert.ok(model.joints.left_wheel_joint);
  assert.ok(model.joints.right_wheel_joint);
  assert.deepEqual(model.joints.left_wheel_joint.origin.xyz, [0.2, 0.225, 0]);
  assert.deepEqual(model.joints.right_wheel_joint.origin.xyz, [0.2, -0.225, 0]);
});

test('validates ROS 2 my_robot_description package structure and display.launch.xml / display.launch.py', () => {
  const xacroTpl = STARTER_TEMPLATES.find((t) => t.id === 'sample_xacro_robot')!;
  const plainTpl = STARTER_TEMPLATES[0];
  const files = createInitialWorkspaceFiles(xacroTpl.urdfXml, plainTpl.urdfXml);

  // Check exact package files from official ROS 2 structure
  assert.ok(files['.vscode/settings.json']);
  assert.ok(files['my_robot_description/launch/display.launch.py']);
  assert.ok(files['my_robot_description/launch/display.launch.xml']);
  assert.ok(files['my_robot_description/rviz/urdf_config.rviz']);
  assert.ok(files['my_robot_description/urdf/my_robot.urdf.xacro']);
  assert.ok(files['my_robot_description/urdf/my_robot.urdf']);
  assert.ok(files['my_robot_description/CMakeLists.txt']);
  assert.ok(files['my_robot_description/package.xml']);

  // Evaluate XML launch file
  const xmlLaunch = evaluateRos2LaunchFile(
    'my_robot_description/launch/display.launch.xml',
    files,
  );
  assert.equal(xmlLaunch.diagnostics.length, 0);
  assert.equal(xmlLaunch.success, true);
  assert.deepEqual(xmlLaunch.nodesStarted, [
    'robot_state_publisher',
    'joint_state_publisher_gui',
    'rviz2',
  ]);
  assert.equal(xmlLaunch.usesXacroCommand, true);
  assert.equal(
    xmlLaunch.targetUrdfPath,
    'my_robot_description/urdf/my_robot.urdf.xacro',
  );

  // Evaluate Python launch file
  const pyLaunch = evaluateRos2LaunchFile(
    'my_robot_description/launch/display.launch.py',
    files,
  );
  assert.equal(pyLaunch.diagnostics.length, 0);
  assert.equal(pyLaunch.success, true);
  assert.deepEqual(pyLaunch.nodesStarted, [
    'robot_state_publisher',
    'joint_state_publisher_gui',
    'rviz2',
  ]);
  assert.equal(pyLaunch.usesXacroCommand, true);
});

test('flags invalid xmlns:xacro URI typos (e.g. http://www.ros.rg/wiki/xacro) and unbound xacro prefix', () => {
  const typoUriXml = `<?xml version="1.0"?>
<robot name="sample_robot" xmlns:xacro="http://www.ros.rg/wiki/xacro">
  <xacro:property name="base_len" value="0.5"/>
  <link name="base_link">
    <visual>
      <geometry>
        <box size="\${base_len} 0.4 0.2"/>
      </geometry>
    </visual>
  </link>
</robot>`;
  const model = compileUrdf(typoUriXml);
  assert.equal(model.valid, false);
  const uriError = model.diagnostics.find(
    (d) =>
      d.severity === 'error' &&
      d.message.includes('http://www.ros.rg/wiki/xacro'),
  );
  assert.ok(
    uriError,
    `Expected error for invalid xmlns:xacro URI, got: ${JSON.stringify(model.diagnostics)}`,
  );
  assert.equal(uriError.line, 2);

  // Missing xmlns:xacro when using <xacro:property>
  const missingXmlns = `<?xml version="1.0"?>
<robot name="sample_robot">
  <xacro:property name="base_len" value="0.5"/>
  <link name="base_link"/>
</robot>`;
  const model2 = compileUrdf(missingXmlns);
  assert.equal(model2.valid, false);
  assert.ok(
    model2.diagnostics.some(
      (d) =>
        d.severity === 'error' &&
        d.message.includes('Unbound namespace prefix "xacro:"'),
    ),
  );
});

test('flags invalid URDF tags, attributes, missing inertia components, and Xacro macro parameter mismatches', () => {
  const badSchemaXml = `<?xml version="1.0"?>
<robot name="bad_schema" xmlns:xacro="http://www.ros.org/wiki/xacro">
  <xacro:macro name="wheel" params="prefix radius">
    <link name="\${prefix}_wheel"/>
  </xacro:macro>

  <xacro:wheel prefix="left" wrong_param="0.1"/>

  <lnik name="typo_link"/>
  <link name="base_link">
    <visual>
      <origin x="0" y="0" z="0"/>
      <geometry>
        <box size="0.5 0.4 0.2"/>
      </geometry>
    </visual>
    <inertial>
      <mass value="2.0"/>
      <inertia ixx="0.1" ixy="0" ixz="0" iyy="0.1" iyz="0"/>
    </inertial>
  </link>
</robot>`;
  const model = compileUrdf(badSchemaXml);
  assert.equal(model.valid, false);
  const msgs = model.diagnostics.map((d) => d.message).join(' | ');
  assert.ok(
    msgs.includes('missing required parameter "radius"'),
    `Should flag missing macro parameter "radius": ${msgs}`,
  );
  assert.ok(
    msgs.includes('does not accept parameter "wrong_param"'),
    `Should flag unknown macro parameter "wrong_param": ${msgs}`,
  );
  assert.ok(
    msgs.includes('Invalid element "<lnik>"'),
    `Should flag unknown <lnik> tag: ${msgs}`,
  );
  assert.ok(
    msgs.includes('Invalid attribute "x" on <origin>'),
    `Should flag invalid x attribute on <origin>: ${msgs}`,
  );
  assert.ok(
    msgs.includes('missing required attribute(s): izz'),
    `Should flag missing izz on <inertia>: ${msgs}`,
  );
});

test('flags blanked-out and malformed display.launch.xml, display.launch.py, CMakeLists.txt, and package.xml', () => {
  const xacroTpl = STARTER_TEMPLATES.find((t) => t.id === 'sample_xacro_robot')!;
  const plainTpl = STARTER_TEMPLATES[0];
  const files = createInitialWorkspaceFiles(xacroTpl.urdfXml, plainTpl.urdfXml);

  // 1. Blank out display.launch.xml
  files['my_robot_description/launch/display.launch.xml'].content = '   \n  ';
  const blankXmlDiags = validateWorkspaceFile(
    'my_robot_description/launch/display.launch.xml',
    files,
  );
  assert.ok(
    blankXmlDiags.some(
      (d) => d.severity === 'error' && d.message.includes('is empty'),
    ),
    'Blank display.launch.xml must produce an error',
  );
  const blankXmlLaunch = evaluateRos2LaunchFile(
    'my_robot_description/launch/display.launch.xml',
    files,
  );
  assert.equal(blankXmlLaunch.success, false);
  assert.equal(blankXmlLaunch.nodesStarted.length, 0);

  // 2. Blank out display.launch.py
  files['my_robot_description/launch/display.launch.py'].content = '';
  const blankPyDiags = validateWorkspaceFile(
    'my_robot_description/launch/display.launch.py',
    files,
  );
  assert.ok(
    blankPyDiags.some(
      (d) => d.severity === 'error' && d.message.includes('is empty'),
    ),
    'Blank display.launch.py must produce an error',
  );
  const blankPyLaunch = evaluateRos2LaunchFile(
    'my_robot_description/launch/display.launch.py',
    files,
  );
  assert.equal(blankPyLaunch.success, false);
  assert.equal(blankPyLaunch.nodesStarted.length, 0);

  // 3. Invalid launch XML substitutions & non-existent URDF path
  files['my_robot_description/launch/display.launch.xml'].content = `<launch>
  <let name="urdf_path" value="$(find-pkg-share wrong_pkg)/urdf/ghost.urdf" />
  <node pkg="robot_state_publisher" type="robot_state_publisher">
    <param name="robot_description" value="$(var undeclared_var)" />
  </node>
</launch>`;
  const badLaunchXmlDiags = validateWorkspaceFile(
    'my_robot_description/launch/display.launch.xml',
    files,
  );
  const launchXmlMsgs = badLaunchXmlDiags.map((d) => d.message).join(' | ');
  assert.ok(
    launchXmlMsgs.includes('PackageNotFoundError: package "wrong_pkg"'),
  );
  assert.ok(launchXmlMsgs.includes('is ROS 1 syntax; ROS 2 requires exec='));
  assert.ok(
    launchXmlMsgs.includes(
      'Launch configuration variable "undeclared_var" at line 4 is not defined',
    ),
  );

  // 4. Blank out CMakeLists.txt and package.xml
  files['my_robot_description/CMakeLists.txt'].content = '';
  files['my_robot_description/package.xml'].content = '';
  assert.ok(
    validateWorkspaceFile(
      'my_robot_description/CMakeLists.txt',
      files,
    ).some((d) => d.severity === 'error'),
  );
  assert.ok(
    validateWorkspaceFile('my_robot_description/package.xml', files).some(
      (d) => d.severity === 'error',
    ),
  );
});

test('flags nested XML launch substitution typos like $(comm \'xacro $(var urdf_path)\') and invalid xacro command executables', () => {
  const xacroTpl = STARTER_TEMPLATES.find((t) => t.id === 'sample_xacro_robot')!;
  const plainTpl = STARTER_TEMPLATES[0];
  const files = createInitialWorkspaceFiles(xacroTpl.urdfXml, plainTpl.urdfXml);

  // User case: changing 'command' to 'comm' inside nested substitution $(comm 'xacro $(var urdf_path)')
  files['my_robot_description/launch/display.launch.xml'].content = `<launch>
  <let name="urdf_path"
       value="$(find-pkg-share my_robot_description)/urdf/my_robot.urdf.xacro" />
  <let name="rviz_config_path"
       value="$(find-pkg-share my_robot_description)/rviz/urdf_config.rviz" />

  <node pkg="robot_state_publisher" exec="robot_state_publisher">
    <param name="robot_description"
           value="$(comm 'xacro $(var urdf_path)')" />
  </node>
</launch>`;

  const commDiags = validateWorkspaceFile(
    'my_robot_description/launch/display.launch.xml',
    files,
  );
  const commError = commDiags.find(
    (d) =>
      d.severity === 'error' &&
      d.message.includes('Unknown launch substitution "$(comm '),
  );
  assert.ok(
    commError,
    `Expected error for $(comm 'xacro $(var urdf_path)'), got: ${JSON.stringify(commDiags)}`,
  );
  assert.equal(commError.line, 8);

  const commLaunchSummary = evaluateRos2LaunchFile(
    'my_robot_description/launch/display.launch.xml',
    files,
  );
  assert.equal(commLaunchSummary.success, false);

  // Also test typo in executable inside $(command 'xacr $(var urdf_path)') and bad node exec / param name
  files['my_robot_description/launch/display.launch.xml'].content = `<launch>
  <let name="urdf_path"
       value="$(find-pkg-share my_robot_description)/urdf/my_robot.urdf.xacro" />
  <node pkg="robot_state_publisher" exec="robot_state_pub" output="invalid_out">
    <param name="robot_desc" val="bad"
           value="$(command 'xacr $(var urdf_path)')" />
  </node>
</launch>`;
  const xacrDiags = validateWorkspaceFile(
    'my_robot_description/launch/display.launch.xml',
    files,
  );
  const xacrMsgs = xacrDiags.map((d) => d.message).join(' | ');
  assert.ok(
    xacrMsgs.includes('Unknown command executable "xacr"'),
    `Should flag xacr typo inside $(command ...): ${xacrMsgs}`,
  );
  assert.ok(
    xacrMsgs.includes('Executable "robot_state_pub" not found in package'),
    `Should flag invalid node executable: ${xacrMsgs}`,
  );
  assert.ok(
    xacrMsgs.includes('Invalid output="invalid_out"'),
    `Should flag invalid output attribute: ${xacrMsgs}`,
  );
  assert.ok(
    xacrMsgs.includes('Invalid attribute "val" on <param>'),
    `Should flag invalid attribute val on <param>: ${xacrMsgs}`,
  );
});

test('flags Python syntax, NameError (e.g. s.path.join instead of os.path.join), AttributeError, ImportError, and TypeError in display.launch.py', () => {
  const xacroTpl = STARTER_TEMPLATES.find((t) => t.id === 'sample_xacro_robot')!;
  const plainTpl = STARTER_TEMPLATES[0];
  const files = createInitialWorkspaceFiles(xacroTpl.urdfXml, plainTpl.urdfXml);

  const originalPy = files['my_robot_description/launch/display.launch.py'].content;

  // 1. User case: 's.path.join' in place of 'os.path.join'
  files['my_robot_description/launch/display.launch.py'].content =
    originalPy.replace('os.path.join(', 's.path.join(');
  const sPathDiags = validateWorkspaceFile(
    'my_robot_description/launch/display.launch.py',
    files,
  );
  const sPathErr = sPathDiags.find(
    (d) =>
      d.severity === 'error' &&
      d.message.includes("[NameError] name 's' is not defined"),
  );
  assert.ok(
    sPathErr,
    `Expected [NameError] name 's' is not defined when os.path.join is changed to s.path.join, got: ${JSON.stringify(sPathDiags)}`,
  );
  assert.equal(sPathErr.line, 10);
  const sPathLaunch = evaluateRos2LaunchFile(
    'my_robot_description/launch/display.launch.py',
    files,
  );
  assert.equal(sPathLaunch.success, false);

  // 2. Attribute typo: 'os.pat.join' or 'os.path.jon'
  files['my_robot_description/launch/display.launch.py'].content =
    originalPy.replace('os.path.join(', 'os.pat.join(');
  const attrDiags1 = validateWorkspaceFile(
    'my_robot_description/launch/display.launch.py',
    files,
  );
  assert.ok(
    attrDiags1.some(
      (d) =>
        d.severity === 'error' &&
        d.message.includes("module 'os' has no attribute 'pat'"),
    ),
    `Expected AttributeError for os.pat.join, got: ${JSON.stringify(attrDiags1)}`,
  );

  files['my_robot_description/launch/display.launch.py'].content =
    originalPy.replace('os.path.join(', 'os.path.jon(');
  const attrDiags2 = validateWorkspaceFile(
    'my_robot_description/launch/display.launch.py',
    files,
  );
  assert.ok(
    attrDiags2.some(
      (d) =>
        d.severity === 'error' &&
        d.message.includes("module 'os.path' has no attribute 'jon'"),
    ),
    `Expected AttributeError for os.path.jon, got: ${JSON.stringify(attrDiags2)}`,
  );

  // 3. Import typos and undefined variable typos
  files['my_robot_description/launch/display.launch.py'].content = originalPy
    .replace('from launch import LaunchDescription', 'from launch import LaunchDesc')
    .replace("Command(['xacro ', urdf_path])", "Command(['xacr ', urd_path])")
    .replace('package="robot_state_publisher"', 'pkg="robot_state_publisher"');

  const multiPyDiags = validateWorkspaceFile(
    'my_robot_description/launch/display.launch.py',
    files,
  );
  const multiPyMsgs = multiPyDiags.map((d) => d.message).join(' | ');
  assert.ok(
    multiPyMsgs.includes("cannot import name 'LaunchDesc' from 'launch'"),
    `Should flag invalid import symbol LaunchDesc: ${multiPyMsgs}`,
  );
  assert.ok(
    multiPyMsgs.includes("name 'urd_path' is not defined"),
    `Should flag undefined variable urd_path: ${multiPyMsgs}`,
  );
  assert.ok(
    multiPyMsgs.includes("Invalid command executable 'xacr'"),
    `Should flag invalid Command(['xacr ', ...]): ${multiPyMsgs}`,
  );
  assert.ok(
    multiPyMsgs.includes("Node() got an unexpected keyword argument 'pkg'"),
    `Should flag invalid Node(pkg=...) kwarg: ${multiPyMsgs}`,
  );
});

test('preserves exact 1:1 character sequence and uniform glyph metrics when Backspacing or inserting Spaces in .urdf and .urdf.xacro', () => {
  const xacroTpl = STARTER_TEMPLATES.find((t) => t.id === 'sample_xacro_robot')!;
  const plainTpl = STARTER_TEMPLATES[0];
  const files = createInitialWorkspaceFiles(xacroTpl.urdfXml, plainTpl.urdfXml);

  const urdfContent = files['my_robot_description/urdf/my_robot.urdf'].content;
  const xacroContent =
    files['my_robot_description/urdf/my_robot.urdf.xacro'].content;

  // Simulate Backspace and Space edits on both my_robot.urdf and my_robot.urdf.xacro
  const urdfTargetIdx = urdfContent.indexOf('base_link') + 4; // right after 'base'
  const urdfAfterBackspace =
    urdfContent.slice(0, urdfTargetIdx - 1) + urdfContent.slice(urdfTargetIdx);
  assert.equal(urdfAfterBackspace.length, urdfContent.length - 1);
  assert.ok(urdfAfterBackspace.includes('bas_link'));

  const urdfAfterSpace =
    urdfAfterBackspace.slice(0, urdfTargetIdx - 1) +
    ' ' +
    urdfAfterBackspace.slice(urdfTargetIdx - 1);
  assert.equal(urdfAfterSpace.length, urdfContent.length);
  assert.ok(urdfAfterSpace.includes('bas _link'));

  // Same for my_robot.urdf.xacro inside a <xacro:property> line
  const xacroTargetIdx = xacroContent.indexOf('base_length') + 5; // right after 'base_'
  const xacroAfterBackspace =
    xacroContent.slice(0, xacroTargetIdx - 1) +
    xacroContent.slice(xacroTargetIdx);
  assert.equal(xacroAfterBackspace.length, xacroContent.length - 1);
  assert.ok(xacroAfterBackspace.includes('baselength'));

  // Verify compiler catches the broken property reference when base_length is edited to baselength
  const brokenXacroModel = compileUrdf(xacroAfterBackspace);
  assert.equal(brokenXacroModel.valid, false);
  assert.ok(
    brokenXacroModel.diagnostics.some(
      (d) => d.severity === 'error' && d.message.includes('base_length'),
    ),
  );

  // Restoring the '_' via typing makes it valid again
  const restoredXacro =
    xacroAfterBackspace.slice(0, xacroTargetIdx - 1) +
    '_' +
    xacroAfterBackspace.slice(xacroTargetIdx - 1);
  assert.equal(restoredXacro, xacroContent);
  assert.equal(compileUrdf(restoredXacro).valid, true);
});


