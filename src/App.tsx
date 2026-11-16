import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Download,
  Box,
  FolderOpen,
  RotateCcw,
  FileDown,
} from 'lucide-react';
import {
  compileUrdf,
  computeForwardKinematics,
  resolveMimicJointValues,
} from './urdf/urdfCompiler';
import {
  getDefaultBuiltInMeshes,
  STARTER_TEMPLATES,
} from './urdf/templates';
import {
  CustomMeshAsset,
  ParsedUrdfModel,
  RvizTreeDisplaySettings,
  UrdfJoint,
  ViewportLayers,
} from './urdf/types';
import {
  createInitialWorkspaceFiles,
  evaluateRos2LaunchFile,
  LaunchExecutionSummary,
  WorkspaceFileEntry,
} from './urdf/ros2PackageWorkspace';
import { XmlEditorPane } from './components/XmlEditorPane';
import { RvizViewport } from './components/RvizViewport';
import { BottomRvizDock } from './components/BottomRvizDock';
import { MeshAssetsModal } from './components/MeshAssetsModal';
import { ViewFramesModal } from './components/ViewFramesModal';
import { downloadViewFramesPdf } from './urdf/viewFramesPdf';

const STORAGE_KEY_XML = 'rviz_urdf_studio_xml_v2';
const STORAGE_KEY_TEMPLATE = 'rviz_urdf_studio_tpl_v2';

export default function App() {
  const initialTemplate = STARTER_TEMPLATES[0];
  const sampleXacroTemplate =
    STARTER_TEMPLATES.find((t) => t.id === 'sample_xacro_robot') ||
    initialTemplate;

  const [activeTemplateId, setActiveTemplateId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_TEMPLATE) || initialTemplate.id;
    } catch {
      return initialTemplate.id;
    }
  });

  const [xmlCode, setXmlCode] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_XML);
      if (saved && saved.trim().length > 0) return saved;
    } catch {
      // ignore storage errors
    }
    return initialTemplate.urdfXml;
  });

  const [compiledXml, setCompiledXml] = useState<string>(xmlCode);
  const [model, setModel] = useState<ParsedUrdfModel>(() =>
    compileUrdf(xmlCode),
  );
  const [fileFormat, setFileFormat] = useState<'urdf' | 'xacro'>(() => {
    if (
      xmlCode.includes('xmlns:xacro') ||
      xmlCode.includes('<xacro:') ||
      initialTemplate.isXacro
    ) {
      return 'xacro';
    }
    return 'urdf';
  });

  // ROS 2 my_robot_description package workspace files
  const [workspaceFiles, setWorkspaceFiles] = useState<
    Record<string, WorkspaceFileEntry>
  >(() =>
    createInitialWorkspaceFiles(
      xmlCode.includes('xmlns:xacro') ? xmlCode : sampleXacroTemplate.urdfXml,
      xmlCode.includes('xmlns:xacro') ? initialTemplate.urdfXml : xmlCode,
    ),
  );

  const [activeFilePath, setActiveFilePath] = useState<string>(() =>
    fileFormat === 'xacro'
      ? 'my_robot_description/urdf/my_robot.urdf.xacro'
      : 'my_robot_description/urdf/my_robot.urdf',
  );

  const [openTabPaths, setOpenTabPaths] = useState<string[]>([
    'my_robot_description/urdf/my_robot.urdf.xacro',
    'my_robot_description/urdf/my_robot.urdf',
    'my_robot_description/launch/display.launch.xml',
    'my_robot_description/launch/display.launch.py',
  ]);

  const [lastLaunchSummary, setLastLaunchSummary] =
    useState<LaunchExecutionSummary | null>(null);

  const [liveSync, setLiveSync] = useState<boolean>(false);

  const [jointValues, setJointValues] = useState<Record<string, number>>({});
  const [selectedNode, setSelectedNode] = useState<{
    type: 'link' | 'joint';
    name: string;
  } | null>(null);

  const [layers, setLayers] = useState<ViewportLayers>({
    visual: true,
    collision: false,
    tfFrames: true,
    tfLabels: false,
    jointAxes: false,
    centerOfMass: false,
    inertiaBoxes: false,
    grid: true,
    wireframeVisual: false,
  });

  const [treeSettings, setTreeSettings] = useState<RvizTreeDisplaySettings>({
    treeStyle: 'hierarchy',
    expandDetails: false,
    disabledLinks: {},
    disabledTfFrames: {},
    disabledJoints: {},
    tfMarkerScale: 1.0,
  });

  const [meshAssets, setMeshAssets] = useState<Record<string, CustomMeshAsset>>(
    () => getDefaultBuiltInMeshes(),
  );
  const [meshModalOpen, setMeshModalOpen] = useState(false);
  const [viewFramesModalOpen, setViewFramesModalOpen] = useState(false);

  // Split pane width percentage (Left VS Code workspace vs Right 3D RViz viewport)
  const [leftWidthPct, setLeftWidthPct] = useState<number>(48);
  const isDraggingSplitRef = useRef<boolean>(false);
  const urdfFileInputRef = useRef<HTMLInputElement | null>(null);

  // Persist XML code & template ID to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_XML, xmlCode);
      localStorage.setItem(STORAGE_KEY_TEMPLATE, activeTemplateId);
    } catch {
      // ignore quota errors
    }
  }, [xmlCode, activeTemplateId]);

  const handleUpdateXmlAndSyncWorkspace = (nextXml: string) => {
    setXmlCode(nextXml);
    const targetUrdfKey =
      activeFilePath === 'my_robot_description/urdf/my_robot.urdf.xacro' ||
      activeFilePath === 'my_robot_description/urdf/my_robot.urdf'
        ? activeFilePath
        : fileFormat === 'xacro'
          ? 'my_robot_description/urdf/my_robot.urdf.xacro'
          : 'my_robot_description/urdf/my_robot.urdf';
    setWorkspaceFiles((prev) => ({
      ...prev,
      [targetUrdfKey]: {
        ...prev[targetUrdfKey],
        content: nextXml,
      },
    }));
  };

  const executeCompile = (sourceXml: string) => {
    const nextModel = compileUrdf(sourceXml);
    setModel(nextModel);
    setCompiledXml(sourceXml);

    // Preserve existing joint values where valid, initialize new movable joints to 0
    setJointValues((prev) => {
      const next: Record<string, number> = {};
      for (const j of Object.values(nextModel.joints) as UrdfJoint[]) {
        if (
          j.type === 'revolute' ||
          j.type === 'continuous' ||
          j.type === 'prismatic'
        ) {
          const existing = prev[j.name] ?? 0;
          next[j.name] =
            j.type === 'revolute' || j.type === 'prismatic'
              ? Math.max(j.limit.lower, Math.min(j.limit.upper, existing))
              : existing;
        }
      }
      return resolveMimicJointValues(nextModel, next);
    });
  };

  const handleSelectWorkspaceFile = (filePath: string) => {
    const entry = workspaceFiles[filePath];
    if (!entry) return;
    setActiveFilePath(filePath);
    setOpenTabPaths((prev) =>
      prev.includes(filePath) ? prev : [...prev, filePath],
    );

    if (entry.language === 'xacro') {
      setFileFormat('xacro');
      setXmlCode(entry.content);
      executeCompile(entry.content);
    } else if (entry.language === 'urdf') {
      setFileFormat('urdf');
      setXmlCode(entry.content);
      executeCompile(entry.content);
    }
  };

  const handleCloseWorkspaceTab = (filePath: string) => {
    setOpenTabPaths((prev) => {
      const next = prev.filter((p) => p !== filePath);
      if (next.length === 0) {
        return ['my_robot_description/urdf/my_robot.urdf.xacro'];
      }
      if (activeFilePath === filePath) {
        const fallback = next[next.length - 1];
        setActiveFilePath(fallback);
        const fbEntry = workspaceFiles[fallback];
        if (fbEntry?.language === 'xacro' || fbEntry?.language === 'urdf') {
          setFileFormat(fbEntry.language);
          setXmlCode(fbEntry.content);
          executeCompile(fbEntry.content);
        }
      }
      return next;
    });
  };

  const handleUpdateWorkspaceFile = (filePath: string, content: string) => {
    setWorkspaceFiles((prev) => {
      const existing = prev[filePath];
      if (!existing) return prev;
      return {
        ...prev,
        [filePath]: {
          ...existing,
          content,
        },
      };
    });
  };

  const handleRunLaunchFile = (launchPath: string) => {
    const summary = evaluateRos2LaunchFile(launchPath, workspaceFiles);
    setLastLaunchSummary(summary);

    if (!summary.success) {
      return;
    }

    // Apply RViz config layer overrides if present in urdf_config.rviz
    if (summary.rvizLayersOverride) {
      setLayers((prev) => ({
        ...prev,
        ...summary.rvizLayersOverride,
      }));
    }

    // Compile the target URDF/Xacro file referenced by the launch file
    const targetEntry = workspaceFiles[summary.targetUrdfPath];
    if (targetEntry) {
      setFileFormat(targetEntry.language === 'xacro' ? 'xacro' : 'urdf');
      setXmlCode(targetEntry.content);
      executeCompile(targetEntry.content);
    } else {
      executeCompile(xmlCode);
    }
  };

  // Optional debounced Live Sync compilation when enabled
  useEffect(() => {
    if (!liveSync) return;
    const timer = window.setTimeout(() => {
      executeCompile(xmlCode);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [xmlCode, liveSync]);

  // Split resizer drag handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSplitRef.current) return;
      const pct = (e.clientX / window.innerWidth) * 100;
      setLeftWidthPct(Math.max(28, Math.min(70, pct)));
    };
    const handleMouseUp = () => {
      isDraggingSplitRef.current = false;
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const worldTransforms = useMemo(
    () => computeForwardKinematics(model, jointValues),
    [model, jointValues],
  );

  const handleSelectTemplate = (templateId: string) => {
    const found = STARTER_TEMPLATES.find((t) => t.id === templateId);
    if (!found) return;
    const nextFormat = found.isXacro ? 'xacro' : 'urdf';
    const targetFilePath = found.isXacro
      ? 'my_robot_description/urdf/my_robot.urdf.xacro'
      : 'my_robot_description/urdf/my_robot.urdf';

    setActiveTemplateId(found.id);
    setXmlCode(found.urdfXml);
    setFileFormat(nextFormat);
    setActiveFilePath(targetFilePath);
    setOpenTabPaths((prev) =>
      prev.includes(targetFilePath) ? prev : [targetFilePath, ...prev],
    );
    setWorkspaceFiles((prev) => ({
      ...prev,
      'my_robot_description/urdf/my_robot.urdf.xacro': {
        ...prev['my_robot_description/urdf/my_robot.urdf.xacro'],
        content: found.isXacro
          ? found.urdfXml
          : found.urdfXml.replace(
              /<robot(\s+[^>]*)?>/,
              (m) =>
                m.slice(0, -1) + ' xmlns:xacro="http://www.ros.org/wiki/xacro">',
            ),
      },
      'my_robot_description/urdf/my_robot.urdf': {
        ...prev['my_robot_description/urdf/my_robot.urdf'],
        content: found.urdfXml,
      },
    }));
    setSelectedNode(null);
    executeCompile(found.urdfXml);
  };

  const handleChangeFileFormat = (nextFormat: 'urdf' | 'xacro') => {
    const targetFilePath =
      nextFormat === 'xacro'
        ? 'my_robot_description/urdf/my_robot.urdf.xacro'
        : 'my_robot_description/urdf/my_robot.urdf';
    const targetEntry = workspaceFiles[targetFilePath];
    let nextContent = targetEntry ? targetEntry.content : xmlCode;

    if (nextFormat === 'xacro' && !nextContent.includes('xmlns:xacro')) {
      nextContent = nextContent.replace(
        /<robot(\s+[^>]*)?>/,
        (match) =>
          match.slice(0, -1) +
          ' xmlns:xacro="http://www.ros.org/wiki/xacro">',
      );
      handleUpdateWorkspaceFile(targetFilePath, nextContent);
    }

    setFileFormat(nextFormat);
    setActiveFilePath(targetFilePath);
    setOpenTabPaths((prev) =>
      prev.includes(targetFilePath) ? prev : [...prev, targetFilePath],
    );
    setXmlCode(nextContent);
    executeCompile(nextContent);
  };

  const handleUploadUrdfFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    const isUploadedXacro = lowerName.endsWith('.xacro');
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const nextFormat =
        isUploadedXacro ||
        content.includes('xmlns:xacro') ||
        content.includes('<xacro:')
          ? 'xacro'
          : 'urdf';
      const targetPath =
        nextFormat === 'xacro'
          ? 'my_robot_description/urdf/my_robot.urdf.xacro'
          : 'my_robot_description/urdf/my_robot.urdf';
      setXmlCode(content);
      setFileFormat(nextFormat);
      setActiveFilePath(targetPath);
      handleUpdateWorkspaceFile(targetPath, content);
      setSelectedNode(null);
      executeCompile(content);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownloadUrdfFile = () => {
    const activeEntry = workspaceFiles[activeFilePath];
    const isEditingOtherFile =
      activeEntry &&
      activeEntry.language !== 'urdf' &&
      activeEntry.language !== 'xacro';
    if (isEditingOtherFile) {
      const blob = new Blob([activeEntry.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = activeEntry.name;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const ext = fileFormat === 'xacro' ? '.urdf.xacro' : '.urdf';
    const blob = new Blob([xmlCode], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${model.robotName || 'robot'}${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadMeshes = (files: FileList) => {
    Array.from(files).forEach((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'stl' && ext !== 'obj') return;

      const reader = new FileReader();
      reader.onload = () => {
        if (!reader.result) return;
        setMeshAssets((prev) => ({
          ...prev,
          [file.name]: {
            name: file.name,
            originalPath: `package://robot_description/meshes/${file.name}`,
            format: ext as 'stl' | 'obj',
            sizeBytes: file.size,
            content: reader.result as ArrayBuffer,
            vertexCount: 0,
            isBuiltIn: false,
          },
        }));
      };
      if (ext === 'stl') {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  const handleRemoveMesh = (name: string) => {
    setMeshAssets((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleInsertMeshSnippet = (filename: string) => {
    const snippet = `\n    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <mesh filename="package://robot_description/meshes/${filename}" scale="1 1 1"/>
      </geometry>
    </visual>\n`;
    const firstLinkClose = xmlCode.indexOf('</link>');
    if (firstLinkClose !== -1) {
      const next =
        xmlCode.slice(0, firstLinkClose) +
        snippet +
        xmlCode.slice(firstLinkClose);
      handleUpdateXmlAndSyncWorkspace(next);
      executeCompile(next);
    }
  };

  const handleToggleLayer = (key: keyof ViewportLayers) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleChangeJointValue = (jointName: string, val: number) => {
    setJointValues((prev) => {
      const next: Record<string, number> = {
        ...prev,
        [jointName]: val,
      };

      // Direct parallel gripper listener: capture left_finger_joint position and immediately apply to right_finger_joint
      if (
        jointName === 'left_finger_joint' &&
        model.joints.right_finger_joint
      ) {
        next.right_finger_joint = val;
      }

      // If user moves a mimic follower slider directly (e.g. right_finger_joint), back-propagate to leader joint
      const movedJoint = model.joints[jointName];
      if (movedJoint?.mimic && movedJoint.mimic.multiplier !== 0) {
        const leaderName = movedJoint.mimic.joint;
        if (model.joints[leaderName]) {
          next[leaderName] =
            (val - movedJoint.mimic.offset) / movedJoint.mimic.multiplier;
        }
      } else if (
        jointName === 'right_finger_joint' &&
        model.joints.left_finger_joint
      ) {
        next.left_finger_joint = val;
      }

      // Evaluate all URDF <mimic> tags and clamp within limits
      return resolveMimicJointValues(model, next);
    });
  };

  const handleZeroJoints = () => {
    setJointValues((prev) => {
      const zeroed: Record<string, number> = {};
      for (const k of Object.keys(prev)) {
        zeroed[k] = 0;
      }
      return resolveMimicJointValues(model, zeroed);
    });
  };

  const handleRandomizeJoints = () => {
    const next: Record<string, number> = {};
    for (const j of Object.values(model.joints) as UrdfJoint[]) {
      if (j.type === 'revolute' || j.type === 'prismatic') {
        const span = j.limit.upper - j.limit.lower;
        next[j.name] =
          j.limit.lower + (0.2 + Math.random() * 0.6) * span;
      } else if (j.type === 'continuous') {
        next[j.name] = (Math.random() - 0.5) * Math.PI * 2;
      }
    }
    setJointValues(resolveMimicJointValues(model, next));
  };

  const isDirty = xmlCode !== compiledXml;

  const handlePrimaryRunButton = () => {
    const activeEntry = workspaceFiles[activeFilePath];
    if (
      activeEntry?.language === 'launch_xml' ||
      activeEntry?.language === 'launch_py'
    ) {
      handleRunLaunchFile(activeFilePath);
    } else {
      executeCompile(xmlCode);
    }
  };

  return (
    <div className="flex flex-col w-screen h-screen bg-[#0b0f17] text-slate-100 overflow-hidden">
      {/* Top Bar Contract: 3 Clean Zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-5 py-2.5 bg-[#111827] border-b border-[#26334d] shrink-0">
        {/* Zone 1: Single Text Element Brand Wordmark */}
        <a
          href="#workspace"
          onClick={(e) => e.preventDefault()}
          className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          RViz URDF Studio
        </a>

        {/* Zone 2: Concise Workspace Controls / File Actions */}
        <nav
          aria-label="URDF Workspace Actions"
          className="flex items-center gap-4 text-xs font-medium text-slate-300 overflow-x-auto"
        >
          {/* Starter Robot Selector */}
          <label className="flex items-center gap-2 whitespace-nowrap shrink-0">
            <span className="text-slate-400">Robot Template:</span>
            <select
              aria-label="Starter URDF Robot Template"
              value={activeTemplateId}
              onChange={(e) => handleSelectTemplate(e.target.value)}
              className="bg-[#161f30] text-slate-100 border border-[#26334d] rounded-md px-2.5 py-1 text-xs font-medium focus:outline-none focus:border-sky-400"
            >
              {STARTER_TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => handleSelectTemplate(activeTemplateId)}
            title="Reset template XML to default"
            className="flex items-center gap-1 text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Template</span>
          </button>

          <button
            type="button"
            onClick={() => urdfFileInputRef.current?.click()}
            className="flex items-center gap-1 text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
            <span>Import .urdf / .xacro</span>
          </button>
          <input
            ref={urdfFileInputRef}
            type="file"
            accept=".urdf,.xacro,.urdf.xacro,.xml"
            onChange={handleUploadUrdfFile}
            className="hidden"
          />

          <button
            type="button"
            onClick={handleDownloadUrdfFile}
            className="flex items-center gap-1 text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>
              Export {fileFormat === 'xacro' ? '.urdf.xacro' : '.urdf'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => downloadViewFramesPdf(model)}
            aria-label="Download view_frames PDF"
            title="Generate and download ROS2 tf2_tools view_frames PDF directly from current URDF"
            className="flex items-center gap-1.5 px-2.5 py-1 text-sky-300 hover:text-white bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <FileDown className="w-3.5 h-3.5 text-sky-400" />
            <span>view_frames PDF</span>
          </button>

          <button
            type="button"
            onClick={() => setMeshModalOpen(true)}
            className="flex items-center gap-1 text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Box className="w-3.5 h-3.5 text-amber-400" />
            <span>STL/OBJ Meshes ({Object.keys(meshAssets).length})</span>
          </button>

          <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white whitespace-nowrap shrink-0">
            <input
              type="checkbox"
              checked={liveSync}
              onChange={(e) => setLiveSync(e.target.checked)}
              className="rounded border-slate-600 accent-sky-400"
            />
            <span>Live Auto-Compile</span>
          </label>
        </nav>

        {/* Zone 3: 1 Primary Action Button (Run / Compile URDF or Launch) */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handlePrimaryRunButton}
            className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors shadow-sm whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5 fill-slate-950" />
            <span>Run / Compile</span>
          </button>
        </div>
      </header>

      {/* Main Two-Pane Split Workspace */}
      <main
        id="workspace"
        className="flex flex-col lg:flex-row flex-1 min-h-0 w-full overflow-hidden"
      >
        {/* Left Pane: VS Code Package Explorer, URDF/Xacro/Launch Editor, Kinematic Tree & Console */}
        <section
          aria-label="URDF XML Editor Pane"
          style={{ width: `${leftWidthPct}%` }}
          className="w-full lg:h-full h-1/2 min-w-[360px] shrink-0"
        >
          <XmlEditorPane
            xmlCode={xmlCode}
            onChangeXml={handleUpdateXmlAndSyncWorkspace}
            onRunCompile={() => executeCompile(xmlCode)}
            model={model}
            isDirty={isDirty}
            fileFormat={fileFormat}
            onChangeFileFormat={handleChangeFileFormat}
            workspaceFiles={workspaceFiles}
            activeFilePath={activeFilePath}
            openTabPaths={openTabPaths}
            onSelectWorkspaceFile={handleSelectWorkspaceFile}
            onCloseWorkspaceTab={handleCloseWorkspaceTab}
            onUpdateWorkspaceFile={handleUpdateWorkspaceFile}
            onRunLaunchFile={handleRunLaunchFile}
            lastLaunchSummary={lastLaunchSummary}
            selectedNode={selectedNode}
            onSelectNode={setSelectedNode}
            worldTransforms={worldTransforms}
            layers={layers}
            onUpdateLayers={setLayers}
            treeSettings={treeSettings}
            onUpdateTreeSettings={setTreeSettings}
            onDownloadViewFramesPdf={() => downloadViewFramesPdf(model)}
            onPreviewViewFrames={() => setViewFramesModalOpen(true)}
          />
        </section>

        {/* Draggable Vertical Splitter Handle (Desktop) */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize XML Editor and 3D Viewport"
          onMouseDown={() => {
            isDraggingSplitRef.current = true;
            document.body.style.cursor = 'col-resize';
          }}
          className="hidden lg:flex w-1.5 h-full bg-[#161f30] hover:bg-sky-500/60 cursor-col-resize items-center justify-center transition-colors shrink-0"
        >
          <div className="w-0.5 h-8 bg-slate-600 rounded-full" />
        </div>

        {/* Right Pane: Real-Time ROS2 Z-Up 3D RViz Viewport */}
        <section
          aria-label="3D RViz Visualization Viewport"
          className="flex-1 min-w-0 h-1/2 lg:h-full relative"
        >
          <RvizViewport
            model={model}
            jointValues={jointValues}
            layers={layers}
            treeSettings={treeSettings}
            meshAssets={meshAssets}
            selectedNode={selectedNode}
            onSelectNode={setSelectedNode}
            worldTransforms={worldTransforms}
          >
            <BottomRvizDock
              model={model}
              layers={layers}
              onToggleLayer={handleToggleLayer}
              jointValues={jointValues}
              onChangeJointValue={handleChangeJointValue}
              onZeroJoints={handleZeroJoints}
              onRandomizeJoints={handleRandomizeJoints}
              onSelectJoint={(jointName) =>
                setSelectedNode({ type: 'joint', name: jointName })
              }
            />
          </RvizViewport>
        </section>
      </main>

      {/* Custom STL / OBJ Mesh Assets Upload & Package URI Manager Modal */}
      <MeshAssetsModal
        open={meshModalOpen}
        onClose={() => setMeshModalOpen(false)}
        meshAssets={meshAssets}
        onUploadMeshes={handleUploadMeshes}
        onRemoveMesh={handleRemoveMesh}
        onInsertMeshSnippet={handleInsertMeshSnippet}
      />

      {/* ROS2 tf2_tools view_frames Diagram Preview & PDF Download Modal */}
      <ViewFramesModal
        open={viewFramesModalOpen}
        onClose={() => setViewFramesModalOpen(false)}
        model={model}
      />
    </div>
  );
}
