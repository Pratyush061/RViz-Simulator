import { CustomMeshAsset, StarterTemplate } from './types';

/**
 * Generates a realistic multi-facet ASCII STL mesh for an octagonal ROS2 LiDAR
 * sensor head (`lidar_head.stl`), pre-registered so `package://` mesh tags
 * work out-of-the-box and users can also download/upload custom STL files.
 */
export function createSampleLidarStl(): string {
  const sides = 12;
  const radius = 0.055;
  const zBottom = -0.025;
  const zTop = 0.025;
  const lines: string[] = ['solid lidar_head'];

  function addTriangle(
    v1: [number, number, number],
    v2: [number, number, number],
    v3: [number, number, number],
  ) {
    const ux = v2[0] - v1[0];
    const uy = v2[1] - v1[1];
    const uz = v2[2] - v1[2];
    const vx = v3[0] - v1[0];
    const vy = v3[1] - v1[1];
    const vz = v3[2] - v1[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    lines.push(
      `  facet normal ${(nx / len).toFixed(4)} ${(ny / len).toFixed(4)} ${(nz / len).toFixed(4)}`,
    );
    lines.push('    outer loop');
    lines.push(`      vertex ${v1[0].toFixed(4)} ${v1[1].toFixed(4)} ${v1[2].toFixed(4)}`);
    lines.push(`      vertex ${v2[0].toFixed(4)} ${v2[1].toFixed(4)} ${v2[2].toFixed(4)}`);
    lines.push(`      vertex ${v3[0].toFixed(4)} ${v3[1].toFixed(4)} ${v3[2].toFixed(4)}`);
    lines.push('    endloop');
    lines.push('  endfacet');
  }

  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const x0 = Math.cos(a0) * radius;
    const y0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius;
    const y1 = Math.sin(a1) * radius;

    // Top cap
    addTriangle([0, 0, zTop + 0.008], [x0, y0, zTop], [x1, y1, zTop]);
    // Bottom cap
    addTriangle([0, 0, zBottom], [x1, y1, zBottom], [x0, y0, zBottom]);
    // Side wall 2 triangles
    addTriangle([x0, y0, zBottom], [x1, y1, zBottom], [x1, y1, zTop]);
    addTriangle([x0, y0, zBottom], [x1, y1, zTop], [x0, y0, zTop]);
  }

  lines.push('endsolid lidar_head');
  return lines.join('\n');
}

export function getDefaultBuiltInMeshes(): Record<string, CustomMeshAsset> {
  const stlContent = createSampleLidarStl();
  return {
    'lidar_head.stl': {
      name: 'lidar_head.stl',
      originalPath: 'package://amr_description/meshes/lidar_head.stl',
      format: 'stl',
      sizeBytes: stlContent.length,
      content: stlContent,
      vertexCount: 12 * 4 * 3,
      isBuiltIn: true,
    },
  };
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'ur5e_industrial_arm',
    name: '6-DOF Industrial Arm (UR-Style)',
    category: 'Manipulator',
    description:
      'Articulated 6-DOF robotic manipulator with shoulder, elbow, 3-axis spherical wrist, parallel gripper fingers, collision hulls, and inertial tensors.',
    dofCount: 7,
    urdfXml: `<?xml version="1.0"?>
<robot name="ur5e_industrial_arm">
  <!-- Global ROS2 RViz Materials -->
  <material name="dark_steel">
    <color rgba="0.18 0.22 0.28 1.0"/>
  </material>
  <material name="ur_blue">
    <color rgba="0.22 0.62 0.92 1.0"/>
  </material>
  <material name="brushed_aluminum">
    <color rgba="0.76 0.80 0.85 1.0"/>
  </material>
  <material name="safety_amber">
    <color rgba="0.96 0.62 0.04 1.0"/>
  </material>

  <!-- Base Pedestal Link -->
  <link name="base_link">
    <visual>
      <origin xyz="0 0 0.04" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.095" length="0.08"/>
      </geometry>
      <material name="dark_steel"/>
    </visual>
    <visual>
      <origin xyz="0 0 0.005" rpy="0 0 0"/>
      <geometry>
        <box size="0.24 0.24 0.01"/>
      </geometry>
      <material name="dark_steel"/>
    </visual>
    <collision>
      <origin xyz="0 0 0.04" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.10" length="0.08"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 0.04" rpy="0 0 0"/>
      <mass value="4.0"/>
      <inertia ixx="0.012" ixy="0" ixz="0" iyy="0.012" iyz="0" izz="0.018"/>
    </inertial>
  </link>

  <!-- J1: Shoulder Pan Joint -->
  <joint name="shoulder_pan_joint" type="revolute">
    <parent link="base_link"/>
    <child link="shoulder_link"/>
    <origin xyz="0 0 0.08" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-3.1416" upper="3.1416" effort="150.0" velocity="3.14"/>
  </joint>

  <link name="shoulder_link">
    <visual>
      <origin xyz="0 0 0.065" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.068" length="0.13"/>
      </geometry>
      <material name="ur_blue"/>
    </visual>
    <visual>
      <origin xyz="0 0.065 0.085" rpy="1.5708 0 0"/>
      <geometry>
        <cylinder radius="0.058" length="0.07"/>
      </geometry>
      <material name="brushed_aluminum"/>
    </visual>
    <collision>
      <origin xyz="0 0 0.065" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.072" length="0.14"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 0.065" rpy="0 0 0"/>
      <mass value="3.7"/>
      <inertia ixx="0.010" ixy="0" ixz="0" iyy="0.010" iyz="0" izz="0.008"/>
    </inertial>
  </link>

  <!-- J2: Shoulder Lift Joint -->
  <joint name="shoulder_lift_joint" type="revolute">
    <parent link="shoulder_link"/>
    <child link="upper_arm_link"/>
    <origin xyz="0 0.11 0.085" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-2.356" upper="2.356" effort="150.0" velocity="3.14"/>
  </joint>

  <link name="upper_arm_link">
    <visual>
      <origin xyz="0 0 0.21" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.052" length="0.42"/>
      </geometry>
      <material name="brushed_aluminum"/>
    </visual>
    <visual>
      <origin xyz="0 0 0" rpy="1.5708 0 0"/>
      <geometry>
        <cylinder radius="0.06" length="0.08"/>
      </geometry>
      <material name="ur_blue"/>
    </visual>
    <visual>
      <origin xyz="0 0 0.42" rpy="1.5708 0 0"/>
      <geometry>
        <cylinder radius="0.055" length="0.08"/>
      </geometry>
      <material name="ur_blue"/>
    </visual>
    <collision>
      <origin xyz="0 0 0.21" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.058" length="0.44"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 0.21" rpy="0 0 0"/>
      <mass value="8.39"/>
      <inertia ixx="0.133" ixy="0" ixz="0" iyy="0.133" iyz="0" izz="0.015"/>
    </inertial>
  </link>

  <!-- J3: Elbow Joint -->
  <joint name="elbow_joint" type="revolute">
    <parent link="upper_arm_link"/>
    <child link="forearm_link"/>
    <origin xyz="0 -0.09 0.42" rpy="0 0.55 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-2.618" upper="2.618" effort="150.0" velocity="3.14"/>
  </joint>

  <link name="forearm_link">
    <visual>
      <origin xyz="0 0 0.18" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.042" length="0.36"/>
      </geometry>
      <material name="brushed_aluminum"/>
    </visual>
    <visual>
      <origin xyz="0 0 0.36" rpy="1.5708 0 0"/>
      <geometry>
        <cylinder radius="0.046" length="0.07"/>
      </geometry>
      <material name="ur_blue"/>
    </visual>
    <collision>
      <origin xyz="0 0 0.18" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.048" length="0.38"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 0.18" rpy="0 0 0"/>
      <mass value="2.27"/>
      <inertia ixx="0.031" ixy="0" ixz="0" iyy="0.031" iyz="0" izz="0.004"/>
    </inertial>
  </link>

  <!-- J4: Wrist 1 Joint -->
  <joint name="wrist_1_joint" type="revolute">
    <parent link="forearm_link"/>
    <child link="wrist_1_link"/>
    <origin xyz="0 0.08 0.36" rpy="0 -0.55 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-3.1416" upper="3.1416" effort="28.0" velocity="6.28"/>
  </joint>

  <link name="wrist_1_link">
    <visual>
      <origin xyz="0 0 0.04" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.038" length="0.09"/>
      </geometry>
      <material name="ur_blue"/>
    </visual>
    <collision>
      <origin xyz="0 0 0.04" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.042" length="0.09"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 0.04" rpy="0 0 0"/>
      <mass value="1.22"/>
      <inertia ixx="0.0025" ixy="0" ixz="0" iyy="0.0025" iyz="0" izz="0.0022"/>
    </inertial>
  </link>

  <!-- J5: Wrist 2 Joint -->
  <joint name="wrist_2_joint" type="revolute">
    <parent link="wrist_1_link"/>
    <child link="wrist_2_link"/>
    <origin xyz="0 0 0.09" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-3.1416" upper="3.1416" effort="28.0" velocity="6.28"/>
  </joint>

  <link name="wrist_2_link">
    <visual>
      <origin xyz="0 0 0.04" rpy="0 0 0"/>
      <geometry>
        <box size="0.11 0.055 0.065"/>
      </geometry>
      <material name="dark_steel"/>
    </visual>
    <collision>
      <origin xyz="0 0 0.04" rpy="0 0 0"/>
      <geometry>
        <box size="0.12 0.06 0.07"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 0.04" rpy="0 0 0"/>
      <mass value="0.85"/>
      <inertia ixx="0.0018" ixy="0" ixz="0" iyy="0.0018" iyz="0" izz="0.0015"/>
    </inertial>
  </link>

  <!-- J6a: Prismatic Parallel Gripper Left Finger (Leader Joint) -->
  <joint name="left_finger_joint" type="prismatic">
    <parent link="wrist_2_link"/>
    <child link="left_finger_link"/>
    <origin xyz="0.022 0 0.075" rpy="0 0 0"/>
    <axis xyz="1 0 0"/>
    <limit lower="0.0" upper="0.035" effort="20.0" velocity="0.5"/>
  </joint>

  <link name="left_finger_link">
    <visual>
      <origin xyz="0 0 0.035" rpy="0 0 0"/>
      <geometry>
        <box size="0.014 0.024 0.07"/>
      </geometry>
      <material name="safety_amber"/>
    </visual>
    <collision>
      <origin xyz="0 0 0.035" rpy="0 0 0"/>
      <geometry>
        <box size="0.016 0.026 0.072"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 0.035" rpy="0 0 0"/>
      <mass value="0.16"/>
      <inertia ixx="0.0003" ixy="0" ixz="0" iyy="0.0003" iyz="0" izz="0.0002"/>
    </inertial>
  </link>

  <!-- J6b: Prismatic Parallel Gripper Right Finger (Mimics left_finger_joint) -->
  <joint name="right_finger_joint" type="prismatic">
    <parent link="wrist_2_link"/>
    <child link="right_finger_link"/>
    <origin xyz="-0.022 0 0.075" rpy="0 0 0"/>
    <axis xyz="-1 0 0"/>
    <limit lower="0.0" upper="0.035" effort="20.0" velocity="0.5"/>
    <mimic joint="left_finger_joint" multiplier="1.0" offset="0.0"/>
  </joint>

  <link name="right_finger_link">
    <visual>
      <origin xyz="0 0 0.035" rpy="0 0 0"/>
      <geometry>
        <box size="0.014 0.024 0.07"/>
      </geometry>
      <material name="safety_amber"/>
    </visual>
    <collision>
      <origin xyz="0 0 0.035" rpy="0 0 0"/>
      <geometry>
        <box size="0.016 0.026 0.072"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 0.035" rpy="0 0 0"/>
      <mass value="0.16"/>
      <inertia ixx="0.0003" ixy="0" ixz="0" iyy="0.0003" iyz="0" izz="0.0002"/>
    </inertial>
  </link>
</robot>`,
  },
  {
    id: 'turtlebot4_amr_rover',
    name: 'Differential Drive AMR + STL LiDAR',
    category: 'Mobile Robot',
    description:
      'Autonomous mobile robot with continuous left/right drive wheels, front/rear caster spheres, pan-tilt depth camera, and an STL mesh LiDAR turret.',
    dofCount: 4,
    urdfXml: `<?xml version="1.0"?>
<robot name="amr_rover_bot">
  <material name="chassis_slate">
    <color rgba="0.16 0.21 0.30 1.0"/>
  </material>
  <material name="deck_silver">
    <color rgba="0.78 0.82 0.88 1.0"/>
  </material>
  <material name="tire_rubber">
    <color rgba="0.11 0.13 0.16 1.0"/>
  </material>
  <material name="lidar_cyan">
    <color rgba="0.22 0.74 0.97 1.0"/>
  </material>
  <material name="estop_red">
    <color rgba="0.94 0.27 0.27 1.0"/>
  </material>

  <!-- Base Footprint & Main Chassis -->
  <link name="base_link">
    <visual>
      <origin xyz="0 0 0.085" rpy="0 0 0"/>
      <geometry>
        <box size="0.44 0.32 0.10"/>
      </geometry>
      <material name="chassis_slate"/>
    </visual>
    <visual>
      <origin xyz="0 0 0.142" rpy="0 0 0"/>
      <geometry>
        <box size="0.40 0.28 0.012"/>
      </geometry>
      <material name="deck_silver"/>
    </visual>
    <!-- Front and Rear Caster Spheres -->
    <visual>
      <origin xyz="0.16 0 0.025" rpy="0 0 0"/>
      <geometry>
        <sphere radius="0.025"/>
      </geometry>
      <material name="deck_silver"/>
    </visual>
    <visual>
      <origin xyz="-0.16 0 0.025" rpy="0 0 0"/>
      <geometry>
        <sphere radius="0.025"/>
      </geometry>
      <material name="deck_silver"/>
    </visual>
    <visual>
      <origin xyz="-0.15 0 0.16" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.022" length="0.025"/>
      </geometry>
      <material name="estop_red"/>
    </visual>
    <collision>
      <origin xyz="0 0 0.09" rpy="0 0 0"/>
      <geometry>
        <box size="0.46 0.34 0.12"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 0.085" rpy="0 0 0"/>
      <mass value="12.5"/>
      <inertia ixx="0.12" ixy="0" ixz="0" iyy="0.21" iyz="0" izz="0.28"/>
    </inertial>
  </link>

  <!-- Left Drive Wheel -->
  <joint name="left_wheel_joint" type="continuous">
    <parent link="base_link"/>
    <child link="left_wheel_link"/>
    <origin xyz="0 0.185 0.065" rpy="-1.5708 0 0"/>
    <axis xyz="0 0 1"/>
  </joint>

  <link name="left_wheel_link">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.065" length="0.036"/>
      </geometry>
      <material name="tire_rubber"/>
    </visual>
    <visual>
      <origin xyz="0 0 0.019" rpy="0 0 0"/>
      <geometry>
        <box size="0.08 0.016 0.004"/>
      </geometry>
      <material name="lidar_cyan"/>
    </visual>
    <collision>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.065" length="0.036"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <mass value="0.85"/>
      <inertia ixx="0.0012" ixy="0" ixz="0" iyy="0.0012" iyz="0" izz="0.0018"/>
    </inertial>
  </link>

  <!-- Right Drive Wheel -->
  <joint name="right_wheel_joint" type="continuous">
    <parent link="base_link"/>
    <child link="right_wheel_link"/>
    <origin xyz="0 -0.185 0.065" rpy="-1.5708 0 0"/>
    <axis xyz="0 0 1"/>
  </joint>

  <link name="right_wheel_link">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.065" length="0.036"/>
      </geometry>
      <material name="tire_rubber"/>
    </visual>
    <visual>
      <origin xyz="0 0 -0.019" rpy="0 0 0"/>
      <geometry>
        <box size="0.08 0.016 0.004"/>
      </geometry>
      <material name="lidar_cyan"/>
    </visual>
    <collision>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.065" length="0.036"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <mass value="0.85"/>
      <inertia ixx="0.0012" ixy="0" ixz="0" iyy="0.0012" iyz="0" izz="0.0018"/>
    </inertial>
  </link>

  <!-- Spinning 3D LiDAR Tower using package:// STL Mesh -->
  <joint name="lidar_spin_joint" type="continuous">
    <parent link="base_link"/>
    <child link="lidar_link"/>
    <origin xyz="0.06 0 0.18" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
  </joint>

  <link name="lidar_link">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <mesh filename="package://amr_description/meshes/lidar_head.stl" scale="1 1 1"/>
      </geometry>
      <material name="lidar_cyan"/>
    </visual>
    <collision>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.058" length="0.055"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <mass value="0.42"/>
      <inertia ixx="0.0005" ixy="0" ixz="0" iyy="0.0005" iyz="0" izz="0.0007"/>
    </inertial>
  </link>

  <!-- Front RGB-D Depth Camera Tilt Joint -->
  <joint name="camera_tilt_joint" type="revolute">
    <parent link="base_link"/>
    <child link="depth_camera_link"/>
    <origin xyz="0.19 0 0.165" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-0.785" upper="0.785" effort="5.0" velocity="2.0"/>
  </joint>

  <link name="depth_camera_link">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <box size="0.032 0.11 0.028"/>
      </geometry>
      <material name="deck_silver"/>
    </visual>
    <collision>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <box size="0.036 0.115 0.032"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <mass value="0.18"/>
      <inertia ixx="0.0002" ixy="0" ixz="0" iyy="0.0001" iyz="0" izz="0.0002"/>
    </inertial>
  </link>
</robot>`,
  },
  {
    id: 'unitree_quadruped_b1',
    name: '8-DOF Quadruped Robot Dog',
    category: 'Legged Robot',
    description:
      'Articulated four-legged quadruped robot with trunk body, 4 hip pitch and 4 knee pitch joints, foot contact spheres, and inertial parameters.',
    dofCount: 8,
    urdfXml: `<?xml version="1.0"?>
<robot name="quadruped_scout">
  <material name="carbon_trunk">
    <color rgba="0.15 0.19 0.26 1.0"/>
  </material>
  <material name="actuator_silver">
    <color rgba="0.78 0.83 0.89 1.0"/>
  </material>
  <material name="leg_cyan">
    <color rgba="0.18 0.68 0.90 1.0"/>
  </material>
  <material name="foot_amber">
    <color rgba="0.96 0.62 0.04 1.0"/>
  </material>

  <!-- Main Quadruped Trunk -->
  <link name="trunk_link">
    <visual>
      <origin xyz="0 0 0.34" rpy="0 0 0"/>
      <geometry>
        <box size="0.48 0.20 0.11"/>
      </geometry>
      <material name="carbon_trunk"/>
    </visual>
    <visual>
      <origin xyz="0.21 0 0.36" rpy="0 0.25 0"/>
      <geometry>
        <box size="0.09 0.14 0.065"/>
      </geometry>
      <material name="leg_cyan"/>
    </visual>
    <collision>
      <origin xyz="0 0 0.34" rpy="0 0 0"/>
      <geometry>
        <box size="0.50 0.22 0.12"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 0.34" rpy="0 0 0"/>
      <mass value="9.5"/>
      <inertia ixx="0.065" ixy="0" ixz="0" iyy="0.22" iyz="0" izz="0.25"/>
    </inertial>
  </link>

  <!-- Front Left Leg -->
  <joint name="fl_hip_joint" type="revolute">
    <parent link="trunk_link"/>
    <child link="fl_thigh_link"/>
    <origin xyz="0.18 0.125 0.34" rpy="0 0.45 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-1.4" upper="1.4" effort="45.0" velocity="12.0"/>
  </joint>

  <link name="fl_thigh_link">
    <visual>
      <origin xyz="0 0 0" rpy="1.5708 0 0"/>
      <geometry>
        <cylinder radius="0.038" length="0.05"/>
      </geometry>
      <material name="actuator_silver"/>
    </visual>
    <visual>
      <origin xyz="0 0 -0.09" rpy="0 0 0"/>
      <geometry>
        <box size="0.036 0.028 0.18"/>
      </geometry>
      <material name="leg_cyan"/>
    </visual>
    <collision>
      <origin xyz="0 0 -0.09" rpy="0 0 0"/>
      <geometry>
        <box size="0.04 0.032 0.18"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 -0.09" rpy="0 0 0"/>
      <mass value="1.1"/>
      <inertia ixx="0.004" ixy="0" ixz="0" iyy="0.004" iyz="0" izz="0.001"/>
    </inertial>
  </link>

  <joint name="fl_knee_joint" type="revolute">
    <parent link="fl_thigh_link"/>
    <child link="fl_calf_link"/>
    <origin xyz="0 0 -0.18" rpy="0 -0.90 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-2.2" upper="0.2" effort="55.0" velocity="12.0"/>
  </joint>

  <link name="fl_calf_link">
    <visual>
      <origin xyz="0 0 -0.085" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.014" length="0.17"/>
      </geometry>
      <material name="actuator_silver"/>
    </visual>
    <visual>
      <origin xyz="0 0 -0.175" rpy="0 0 0"/>
      <geometry>
        <sphere radius="0.022"/>
      </geometry>
      <material name="foot_amber"/>
    </visual>
    <collision>
      <origin xyz="0 0 -0.09" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.018" length="0.18"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 -0.085" rpy="0 0 0"/>
      <mass value="0.45"/>
      <inertia ixx="0.0018" ixy="0" ixz="0" iyy="0.0018" iyz="0" izz="0.0003"/>
    </inertial>
  </link>

  <!-- Front Right Leg -->
  <joint name="fr_hip_joint" type="revolute">
    <parent link="trunk_link"/>
    <child link="fr_thigh_link"/>
    <origin xyz="0.18 -0.125 0.34" rpy="0 0.45 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-1.4" upper="1.4" effort="45.0" velocity="12.0"/>
  </joint>

  <link name="fr_thigh_link">
    <visual>
      <origin xyz="0 0 0" rpy="1.5708 0 0"/>
      <geometry>
        <cylinder radius="0.038" length="0.05"/>
      </geometry>
      <material name="actuator_silver"/>
    </visual>
    <visual>
      <origin xyz="0 0 -0.09" rpy="0 0 0"/>
      <geometry>
        <box size="0.036 0.028 0.18"/>
      </geometry>
      <material name="leg_cyan"/>
    </visual>
    <collision>
      <origin xyz="0 0 -0.09" rpy="0 0 0"/>
      <geometry>
        <box size="0.04 0.032 0.18"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 -0.09" rpy="0 0 0"/>
      <mass value="1.1"/>
      <inertia ixx="0.004" ixy="0" ixz="0" iyy="0.004" iyz="0" izz="0.001"/>
    </inertial>
  </link>

  <joint name="fr_knee_joint" type="revolute">
    <parent link="fr_thigh_link"/>
    <child link="fr_calf_link"/>
    <origin xyz="0 0 -0.18" rpy="0 -0.90 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-2.2" upper="0.2" effort="55.0" velocity="12.0"/>
  </joint>

  <link name="fr_calf_link">
    <visual>
      <origin xyz="0 0 -0.085" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.014" length="0.17"/>
      </geometry>
      <material name="actuator_silver"/>
    </visual>
    <visual>
      <origin xyz="0 0 -0.175" rpy="0 0 0"/>
      <geometry>
        <sphere radius="0.022"/>
      </geometry>
      <material name="foot_amber"/>
    </visual>
    <collision>
      <origin xyz="0 0 -0.09" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.018" length="0.18"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 -0.085" rpy="0 0 0"/>
      <mass value="0.45"/>
      <inertia ixx="0.0018" ixy="0" ixz="0" iyy="0.0018" iyz="0" izz="0.0003"/>
    </inertial>
  </link>

  <!-- Rear Left Leg -->
  <joint name="rl_hip_joint" type="revolute">
    <parent link="trunk_link"/>
    <child link="rl_thigh_link"/>
    <origin xyz="-0.18 0.125 0.34" rpy="0 0.45 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-1.4" upper="1.4" effort="45.0" velocity="12.0"/>
  </joint>

  <link name="rl_thigh_link">
    <visual>
      <origin xyz="0 0 0" rpy="1.5708 0 0"/>
      <geometry>
        <cylinder radius="0.038" length="0.05"/>
      </geometry>
      <material name="actuator_silver"/>
    </visual>
    <visual>
      <origin xyz="0 0 -0.09" rpy="0 0 0"/>
      <geometry>
        <box size="0.036 0.028 0.18"/>
      </geometry>
      <material name="leg_cyan"/>
    </visual>
    <collision>
      <origin xyz="0 0 -0.09" rpy="0 0 0"/>
      <geometry>
        <box size="0.04 0.032 0.18"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 -0.09" rpy="0 0 0"/>
      <mass value="1.1"/>
      <inertia ixx="0.004" ixy="0" ixz="0" iyy="0.004" iyz="0" izz="0.001"/>
    </inertial>
  </link>

  <joint name="rl_knee_joint" type="revolute">
    <parent link="rl_thigh_link"/>
    <child link="rl_calf_link"/>
    <origin xyz="0 0 -0.18" rpy="0 -0.90 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-2.2" upper="0.2" effort="55.0" velocity="12.0"/>
  </joint>

  <link name="rl_calf_link">
    <visual>
      <origin xyz="0 0 -0.085" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.014" length="0.17"/>
      </geometry>
      <material name="actuator_silver"/>
    </visual>
    <visual>
      <origin xyz="0 0 -0.175" rpy="0 0 0"/>
      <geometry>
        <sphere radius="0.022"/>
      </geometry>
      <material name="foot_amber"/>
    </visual>
    <collision>
      <origin xyz="0 0 -0.09" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.018" length="0.18"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 -0.085" rpy="0 0 0"/>
      <mass value="0.45"/>
      <inertia ixx="0.0018" ixy="0" ixz="0" iyy="0.0018" iyz="0" izz="0.0003"/>
    </inertial>
  </link>

  <!-- Rear Right Leg -->
  <joint name="rr_hip_joint" type="revolute">
    <parent link="trunk_link"/>
    <child link="rr_thigh_link"/>
    <origin xyz="-0.18 -0.125 0.34" rpy="0 0.45 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-1.4" upper="1.4" effort="45.0" velocity="12.0"/>
  </joint>

  <link name="rr_thigh_link">
    <visual>
      <origin xyz="0 0 0" rpy="1.5708 0 0"/>
      <geometry>
        <cylinder radius="0.038" length="0.05"/>
      </geometry>
      <material name="actuator_silver"/>
    </visual>
    <visual>
      <origin xyz="0 0 -0.09" rpy="0 0 0"/>
      <geometry>
        <box size="0.036 0.028 0.18"/>
      </geometry>
      <material name="leg_cyan"/>
    </visual>
    <collision>
      <origin xyz="0 0 -0.09" rpy="0 0 0"/>
      <geometry>
        <box size="0.04 0.032 0.18"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 -0.09" rpy="0 0 0"/>
      <mass value="1.1"/>
      <inertia ixx="0.004" ixy="0" ixz="0" iyy="0.004" iyz="0" izz="0.001"/>
    </inertial>
  </link>

  <joint name="rr_knee_joint" type="revolute">
    <parent link="rr_thigh_link"/>
    <child link="rr_calf_link"/>
    <origin xyz="0 0 -0.18" rpy="0 -0.90 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-2.2" upper="0.2" effort="55.0" velocity="12.0"/>
  </joint>

  <link name="rr_calf_link">
    <visual>
      <origin xyz="0 0 -0.085" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.014" length="0.17"/>
      </geometry>
      <material name="actuator_silver"/>
    </visual>
    <visual>
      <origin xyz="0 0 -0.175" rpy="0 0 0"/>
      <geometry>
        <sphere radius="0.022"/>
      </geometry>
      <material name="foot_amber"/>
    </visual>
    <collision>
      <origin xyz="0 0 -0.09" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.018" length="0.18"/>
      </geometry>
    </collision>
    <inertial>
      <origin xyz="0 0 -0.085" rpy="0 0 0"/>
      <mass value="0.45"/>
      <inertia ixx="0.0018" ixy="0" ixz="0" iyy="0.0018" iyz="0" izz="0.0003"/>
    </inertial>
  </link>
</robot>`,
  },
  {
    id: 'ros2_r2d2_view_frames',
    name: 'ROS2 R2D2 Tutorial Bot (view_frames Tree)',
    category: 'Mobile Manipulator',
    description:
      'Classic ROS2 urdf_tutorial R2D2 robot with base_link, gripper_pole, head, left_leg, right_leg, grippers, and 4 wheels matching the tf2_tools view_frames tree.',
    dofCount: 8,
    urdfXml: `<?xml version="1.0"?>
<robot name="r2d2_tutorial_bot">
  <material name="blue">
    <color rgba="0.18 0.48 0.85 1.0"/>
  </material>
  <material name="white">
    <color rgba="0.92 0.94 0.96 1.0"/>
  </material>
  <material name="black">
    <color rgba="0.14 0.16 0.20 1.0"/>
  </material>

  <link name="base_link">
    <visual>
      <origin xyz="0 0 0.42" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.20" length="0.60"/>
      </geometry>
      <material name="blue"/>
    </visual>
  </link>

  <!-- Branch 1: gripper_pole -> left_gripper/left_tip & right_gripper/right_tip -->
  <joint name="gripper_extension" type="prismatic">
    <parent link="base_link"/>
    <child link="gripper_pole"/>
    <origin xyz="0.19 0 0.62" rpy="0 0 0"/>
    <axis xyz="1 0 0"/>
    <limit lower="-0.38" upper="0.0" effort="1000.0" velocity="0.5"/>
  </joint>

  <link name="gripper_pole">
    <visual>
      <origin xyz="0.1 0 0" rpy="0 1.5708 0"/>
      <geometry>
        <cylinder radius="0.01" length="0.2"/>
      </geometry>
      <material name="white"/>
    </visual>
  </link>

  <joint name="left_gripper_joint" type="revolute">
    <parent link="gripper_pole"/>
    <child link="left_gripper"/>
    <origin xyz="0.2 0.02 0" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="0.0" upper="0.548" effort="1000.0" velocity="0.5"/>
  </joint>

  <link name="left_gripper">
    <visual>
      <origin xyz="0.03 0 0" rpy="0 0 0"/>
      <geometry>
        <box size="0.06 0.02 0.02"/>
      </geometry>
      <material name="white"/>
    </visual>
  </link>

  <joint name="left_tip_joint" type="fixed">
    <parent link="left_gripper"/>
    <child link="left_tip"/>
    <origin xyz="0.06 0 0" rpy="0 0 0"/>
  </joint>

  <link name="left_tip">
    <visual>
      <origin xyz="0.015 0 0" rpy="0 0 0"/>
      <geometry>
        <box size="0.03 0.01 0.01"/>
      </geometry>
      <material name="black"/>
    </visual>
  </link>

  <joint name="right_gripper_joint" type="revolute">
    <parent link="gripper_pole"/>
    <child link="right_gripper"/>
    <origin xyz="0.2 -0.02 0" rpy="0 0 0"/>
    <axis xyz="0 0 -1"/>
    <limit lower="0.0" upper="0.548" effort="1000.0" velocity="0.5"/>
    <mimic joint="left_gripper_joint" multiplier="1.0" offset="0.0"/>
  </joint>

  <link name="right_gripper">
    <visual>
      <origin xyz="0.03 0 0" rpy="0 0 0"/>
      <geometry>
        <box size="0.06 0.02 0.02"/>
      </geometry>
      <material name="white"/>
    </visual>
  </link>

  <joint name="right_tip_joint" type="fixed">
    <parent link="right_gripper"/>
    <child link="right_tip"/>
    <origin xyz="0.06 0 0" rpy="0 0 0"/>
  </joint>

  <link name="right_tip">
    <visual>
      <origin xyz="0.015 0 0" rpy="0 0 0"/>
      <geometry>
        <box size="0.03 0.01 0.01"/>
      </geometry>
      <material name="black"/>
    </visual>
  </link>

  <!-- Branch 2: head -> box -->
  <joint name="head_swivel" type="continuous">
    <parent link="base_link"/>
    <child link="head"/>
    <origin xyz="0 0 0.72" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
  </joint>

  <link name="head">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <sphere radius="0.20"/>
      </geometry>
      <material name="white"/>
    </visual>
  </link>

  <joint name="tobox" type="fixed">
    <parent link="head"/>
    <child link="box"/>
    <origin xyz="0.1814 0 0.1414" rpy="0 0 0"/>
  </joint>

  <link name="box">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <box size="0.08 0.08 0.08"/>
      </geometry>
      <material name="blue"/>
    </visual>
  </link>

  <!-- Branch 3: left_leg -> left_base -> left_back_wheel & left_front_wheel -->
  <joint name="base_to_left_leg" type="fixed">
    <parent link="base_link"/>
    <child link="left_leg"/>
    <origin xyz="0 0.22 0.67" rpy="0 0 0"/>
  </joint>

  <link name="left_leg">
    <visual>
      <origin xyz="0 0 -0.3" rpy="0 0 0"/>
      <geometry>
        <box size="0.10 0.06 0.60"/>
      </geometry>
      <material name="white"/>
    </visual>
  </link>

  <joint name="left_base_joint" type="fixed">
    <parent link="left_leg"/>
    <child link="left_base"/>
    <origin xyz="0 0 -0.6" rpy="0 0 0"/>
  </joint>

  <link name="left_base">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <box size="0.40 0.10 0.10"/>
      </geometry>
      <material name="white"/>
    </visual>
  </link>

  <joint name="left_back_wheel_joint" type="continuous">
    <parent link="left_base"/>
    <child link="left_back_wheel"/>
    <origin xyz="-0.1333 0 -0.085" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
  </joint>

  <link name="left_back_wheel">
    <visual>
      <origin xyz="0 0 0" rpy="1.5708 0 0"/>
      <geometry>
        <cylinder radius="0.035" length="0.10"/>
      </geometry>
      <material name="black"/>
    </visual>
  </link>

  <joint name="left_front_wheel_joint" type="continuous">
    <parent link="left_base"/>
    <child link="left_front_wheel"/>
    <origin xyz="0.1333 0 -0.085" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
  </joint>

  <link name="left_front_wheel">
    <visual>
      <origin xyz="0 0 0" rpy="1.5708 0 0"/>
      <geometry>
        <cylinder radius="0.035" length="0.10"/>
      </geometry>
      <material name="black"/>
    </visual>
  </link>

  <!-- Branch 4: right_leg -> right_base -> right_back_wheel & right_front_wheel -->
  <joint name="base_to_right_leg" type="fixed">
    <parent link="base_link"/>
    <child link="right_leg"/>
    <origin xyz="0 -0.22 0.67" rpy="0 0 0"/>
  </joint>

  <link name="right_leg">
    <visual>
      <origin xyz="0 0 -0.3" rpy="0 0 0"/>
      <geometry>
        <box size="0.10 0.06 0.60"/>
      </geometry>
      <material name="white"/>
    </visual>
  </link>

  <joint name="right_base_joint" type="fixed">
    <parent link="right_leg"/>
    <child link="right_base"/>
    <origin xyz="0 0 -0.6" rpy="0 0 0"/>
  </joint>

  <link name="right_base">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <box size="0.40 0.10 0.10"/>
      </geometry>
      <material name="white"/>
    </visual>
  </link>

  <joint name="right_back_wheel_joint" type="continuous">
    <parent link="right_base"/>
    <child link="right_back_wheel"/>
    <origin xyz="-0.1333 0 -0.085" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
  </joint>

  <link name="right_back_wheel">
    <visual>
      <origin xyz="0 0 0" rpy="1.5708 0 0"/>
      <geometry>
        <cylinder radius="0.035" length="0.10"/>
      </geometry>
      <material name="black"/>
    </visual>
  </link>

  <joint name="right_front_wheel_joint" type="continuous">
    <parent link="right_base"/>
    <child link="right_front_wheel"/>
    <origin xyz="0.1333 0 -0.085" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
  </joint>

  <link name="right_front_wheel">
    <visual>
      <origin xyz="0 0 0" rpy="1.5708 0 0"/>
      <geometry>
        <cylinder radius="0.035" length="0.10"/>
      </geometry>
      <material name="black"/>
    </visual>
  </link>
</robot>`,
  },
  {
    id: 'sample_xacro_robot',
    name: 'Sample Xacro Robot (.urdf.xacro)',
    category: 'ROS2 Xacro',
    description:
      'Parameterized ROS2 .urdf.xacro mobile robot using <xacro:property>, <xacro:macro name="box_inertia">, <xacro:macro name="wheel">, and ${...} math expressions.',
    dofCount: 2,
    isXacro: true,
    urdfXml: `<?xml version="1.0"?>
<robot name="sample_robot" xmlns:xacro="http://www.ros.org/wiki/xacro">

  <!-- ==================== CONSTANTS & PROPERTIES ==================== -->
  <xacro:property name="PI" value="3.1415926535897931"/>
  <xacro:property name="base_length" value="0.6"/>
  <xacro:property name="base_width" value="0.4"/>
  <xacro:property name="base_height" value="0.2"/>
  <xacro:property name="base_mass" value="5.0"/>

  <xacro:property name="wheel_radius" value="0.1"/>
  <xacro:property name="wheel_width" value="0.05"/>
  <xacro:property name="wheel_mass" value="0.5"/>

  <!-- ==================== MACROS ==================== -->
  <xacro:macro name="box_inertia" params="m w h d">
    <inertial>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <mass value="\${m}"/>
      <inertia ixx="\${(m/12) * (h*h + d*d)}" ixy="0.0" ixz="0.0"
               iyy="\${(m/12) * (w*w + d*d)}" iyz="0.0"
               izz="\${(m/12) * (w*w + h*h)}"/>
    </inertial>
  </xacro:macro>

  <xacro:macro name="wheel" params="prefix lr_xyz">
    <link name="\${prefix}_wheel">
      <visual>
        <origin xyz="0 0 0" rpy="\${PI/2} 0 0"/>
        <geometry>
          <cylinder radius="\${wheel_radius}" length="\${wheel_width}"/>
        </geometry>
        <material name="black">
          <color rgba="0.1 0.1 0.1 1.0"/>
        </material>
      </visual>
      <collision>
        <origin xyz="0 0 0" rpy="\${PI/2} 0 0"/>
        <geometry>
          <cylinder radius="\${wheel_radius}" length="\${wheel_width}"/>
        </geometry>
      </collision>
      <inertial>
        <origin xyz="0 0 0" rpy="\${PI/2} 0 0"/>
        <mass value="\${wheel_mass}"/>
        <inertia ixx="\${(1/12) * wheel_mass * (3*wheel_radius*wheel_radius + wheel_width*wheel_width)}" ixy="0.0" ixz="0.0"
                 iyy="\${(1/12) * wheel_mass * (3*wheel_radius*wheel_radius + wheel_width*wheel_width)}" iyz="0.0"
                 izz="\${(1/2) * wheel_mass * wheel_radius * wheel_radius}"/>
      </inertial>
    </link>

    <joint name="\${prefix}_wheel_joint" type="continuous">
      <parent link="base_link"/>
      <child link="\${prefix}_wheel"/>
      <origin xyz="\${lr_xyz}" rpy="0 0 0"/>
      <axis xyz="0 1 0"/>
    </joint>
  </xacro:macro>

  <!-- ==================== BASE LINK ==================== -->
  <link name="base_link">
    <visual>
      <origin xyz="0 0 \${base_height/2}" rpy="0 0 0"/>
      <geometry>
        <box size="\${base_length} \${base_width} \${base_height}"/>
      </geometry>
      <material name="blue">
        <color rgba="0.2 0.6 0.8 1.0"/>
      </material>
    </visual>
    <collision>
      <origin xyz="0 0 \${base_height/2}" rpy="0 0 0"/>
      <geometry>
        <box size="\${base_length} \${base_width} \${base_height}"/>
      </geometry>
    </collision>
    <xacro:box_inertia m="\${base_mass}" w="\${base_length}" h="\${base_width}" d="\${base_height}"/>
  </link>

  <!-- ==================== WHEELS ==================== -->
  <xacro:wheel prefix="left" lr_xyz="0.2 \${base_width/2 + wheel_width/2} 0"/>
  <xacro:wheel prefix="right" lr_xyz="0.2 -\${base_width/2 + wheel_width/2} 0"/>

</robot>`,
  },
];


