import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  GitBranch,
  Plus,
  Minus,
  Terminal,
  Box,
  Link2,
  Axis3d,
  FileDown,
  Eye,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  Play,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Settings,
} from 'lucide-react';
import {
  CompilerDiagnostic,
  KinematicTreeNode,
  LinkWorldTransform,
  ParsedUrdfModel,
  RvizTreeDisplaySettings,
  UrdfJoint,
  UrdfLink,
  ViewportLayers,
} from '../urdf/types';
import {
  LaunchExecutionSummary,
  validateWorkspaceFile,
  WorkspaceFileEntry,
  WorkspaceFileLanguage,
} from '../urdf/ros2PackageWorkspace';
import { compileUrdf } from '../urdf/urdfCompiler';

interface XmlEditorPaneProps {
  xmlCode: string;
  onChangeXml: (nextXml: string) => void;
  onRunCompile: () => void;
  model: ParsedUrdfModel;
  isDirty: boolean;
  fileFormat: 'urdf' | 'xacro';
  onChangeFileFormat: (format: 'urdf' | 'xacro') => void;
  workspaceFiles: Record<string, WorkspaceFileEntry>;
  activeFilePath: string;
  openTabPaths: string[];
  onSelectWorkspaceFile: (path: string) => void;
  onCloseWorkspaceTab: (path: string) => void;
  onUpdateWorkspaceFile: (path: string, content: string) => void;
  onRunLaunchFile: (launchPath: string) => void;
  lastLaunchSummary: LaunchExecutionSummary | null;
  selectedNode: { type: 'link' | 'joint'; name: string } | null;
  onSelectNode: (node: { type: 'link' | 'joint'; name: string } | null) => void;
  worldTransforms: Record<string, LinkWorldTransform>;
  layers: ViewportLayers;
  onUpdateLayers: React.Dispatch<React.SetStateAction<ViewportLayers>>;
  treeSettings: RvizTreeDisplaySettings;
  onUpdateTreeSettings: React.Dispatch<
    React.SetStateAction<RvizTreeDisplaySettings>
  >;
  onDownloadViewFramesPdf: () => void;
  onPreviewViewFrames: () => void;
}

const STORAGE_KEY_FONT_SIZE = 'rviz_urdf_editor_font_size_v1';
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 24;
const DEFAULT_FONT_SIZE = 13;

/**
 * Highlights ${...} and $(...) Xacro / ROS2 Launch substitutions inside XML attribute values.
 * Uses uniform 400 normal font weight so glyph widths match the transparent textarea 1:1.
 */
function renderAttrValueWithXacroExpressions(
  attrVal: string,
  baseKey: number,
): React.ReactNode {
  if (!attrVal.includes('${') && !attrVal.includes('$(')) {
    return (
      <span key={baseKey} className="text-[#CE9178]">
        {attrVal}
      </span>
    );
  }
  const parts: React.ReactNode[] = [];
  const regex = /(\$\{[^}]*\}|\$\([^)]*\))/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let subKey = 0;

  while ((match = regex.exec(attrVal)) !== null) {
    if (match.index > lastIdx) {
      parts.push(
        <span key={`${baseKey}-s-${subKey++}`} className="text-[#CE9178]">
          {attrVal.slice(lastIdx, match.index)}
        </span>,
      );
    }
    parts.push(
      <span key={`${baseKey}-x-${subKey++}`} className="text-[#DCDCAA]">
        {match[0]}
      </span>,
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < attrVal.length) {
    parts.push(
      <span key={`${baseKey}-s-${subKey++}`} className="text-[#CE9178]">
        {attrVal.slice(lastIdx)}
      </span>,
    );
  }
  return <span key={baseKey}>{parts}</span>;
}

/**
 * Tokenizes a single line of XML / URDF / Xacro / Launch XML into VS Code Dark+ spans.
 * Guarantees 100% lossless character preservation and uniform monospace glyph widths.
 */
export function renderVsCodeXmlLine(lineText: string): React.ReactNode {
  if (!lineText) return '\u00A0';

  const tokens: React.ReactNode[] = [];
  let remaining = lineText;
  let keyIdx = 0;

  while (remaining.length > 0) {
    // 1. XML Comment <!-- ... -->
    const commentStart = remaining.indexOf('<!--');
    if (commentStart === 0) {
      const commentEnd = remaining.indexOf('-->');
      if (commentEnd !== -1) {
        const commentStr = remaining.slice(0, commentEnd + 3);
        tokens.push(
          <span key={keyIdx++} className="text-[#6A9955]">
            {commentStr}
          </span>,
        );
        remaining = remaining.slice(commentEnd + 3);
        continue;
      } else {
        tokens.push(
          <span key={keyIdx++} className="text-[#6A9955]">
            {remaining}
          </span>,
        );
        break;
      }
    }

    // 2. XML Processing Instruction <?xml ... ?>
    if (remaining.startsWith('<?')) {
      const piEnd = remaining.indexOf('?>');
      const sliceEnd = piEnd !== -1 ? piEnd + 2 : remaining.length;
      tokens.push(
        <span key={keyIdx++} className="text-[#C586C0]">
          {remaining.slice(0, sliceEnd)}
        </span>,
      );
      remaining = remaining.slice(sliceEnd);
      continue;
    }

    // 3. XML Tag <tag attr="val"> or </tag> or multi-line tag opening
    const fullTagMatch = remaining.match(
      /^<(\/?)([a-zA-Z0-9_:-]+)([^<>]*?)(\/?>)/,
    );
    const tagMatch = remaining.match(
      /^<(\/?)([a-zA-Z0-9_:-]+)([^<>]*?)(\/?>)?$/,
    );
    const activeMatch = fullTagMatch || tagMatch;
    if (activeMatch) {
      const [fullTag, slash, tagName, attrChunk, closeBracket = ''] =
        activeMatch;
      const isXacroTag = tagName.startsWith('xacro:');
      tokens.push(
        <span key={keyIdx++} className="text-[#808080]">
          &lt;{slash}
        </span>,
      );
      tokens.push(
        <span
          key={keyIdx++}
          className={isXacroTag ? 'text-[#4EC9B0]' : 'text-[#569CD6]'}
        >
          {tagName}
        </span>,
      );

      if (attrChunk) {
        let attrRem = attrChunk;
        while (attrRem.length > 0) {
          const attrMatch = attrRem.match(
            /^(\s+)([a-zA-Z0-9_:-]+)(\s*=\s*)("[^"]*"|'[^']*')/,
          );
          if (attrMatch) {
            const [fullAttr, ws, attrName, eq, attrVal] = attrMatch;
            tokens.push(<span key={keyIdx++}>{ws}</span>);
            tokens.push(
              <span
                key={keyIdx++}
                className={
                  attrName.startsWith('xmlns:xacro')
                    ? 'text-[#4EC9B0]'
                    : 'text-[#9CDCFE]'
                }
              >
                {attrName}
              </span>,
            );
            tokens.push(
              <span key={keyIdx++} className="text-[#D4D4D4]">
                {eq}
              </span>,
            );
            tokens.push(renderAttrValueWithXacroExpressions(attrVal, keyIdx++));
            attrRem = attrRem.slice(fullAttr.length);
          } else {
            tokens.push(
              <span key={keyIdx++} className="text-[#D4D4D4]">
                {attrRem}
              </span>,
            );
            break;
          }
        }
      }

      if (closeBracket) {
        tokens.push(
          <span key={keyIdx++} className="text-[#808080]">
            {closeBracket}
          </span>,
        );
      }
      remaining = remaining.slice(fullTag.length);
      continue;
    }

    // 4. Multi-line attribute continuation line (e.g. value="$(find-pkg-share ...)" />)
    const contAttrMatch = remaining.match(
      /^(\s+)([a-zA-Z0-9_:-]+)(\s*=\s*)("[^"]*"|'[^']*')(\s*\/?>?)/,
    );
    if (contAttrMatch) {
      const [fullCont, ws, attrName, eq, attrVal, closePart] = contAttrMatch;
      tokens.push(<span key={keyIdx++}>{ws}</span>);
      tokens.push(
        <span key={keyIdx++} className="text-[#9CDCFE]">
          {attrName}
        </span>,
      );
      tokens.push(
        <span key={keyIdx++} className="text-[#D4D4D4]">
          {eq}
        </span>,
      );
      tokens.push(renderAttrValueWithXacroExpressions(attrVal, keyIdx++));
      if (closePart) {
        tokens.push(
          <span key={keyIdx++} className="text-[#808080]">
            {closePart}
          </span>,
        );
      }
      remaining = remaining.slice(fullCont.length);
      continue;
    }

    // 5. Plain text or whitespace before next '<'
    const nextLt = remaining.indexOf('<', 1);
    if (nextLt !== -1) {
      tokens.push(
        <span key={keyIdx++} className="text-[#D4D4D4]">
          {remaining.slice(0, nextLt)}
        </span>,
      );
      remaining = remaining.slice(nextLt);
    } else {
      tokens.push(
        <span key={keyIdx++} className="text-[#D4D4D4]">
          {remaining}
        </span>,
      );
      break;
    }
  }

  return tokens;
}

/**
 * Tokenizes Python (`display.launch.py`), CMake (`CMakeLists.txt`), or YAML (`urdf_config.rviz`) lines.
 */
function renderVsCodeCodeLine(
  lineText: string,
  language: WorkspaceFileLanguage,
): React.ReactNode {
  if (!lineText) return '\u00A0';

  if (
    language === 'urdf' ||
    language === 'xacro' ||
    language === 'launch_xml' ||
    language === 'package_xml'
  ) {
    return renderVsCodeXmlLine(lineText);
  }

  const trimmed = lineText.trimStart();
  if (trimmed.startsWith('#')) {
    return <span className="text-[#6A9955]">{lineText}</span>;
  }

  if (language === 'launch_py') {
    const tokens: React.ReactNode[] = [];
    const regex =
      /('[^']*'|"[^"]*"|\b(?:from|import|def|return)\b|\b(?:LaunchDescription|ParameterValue|Command|Node|get_package_share_path|generate_launch_description|os|path|join|str)\b|\b(?:package|executable|parameters|output|arguments|value_type)\s*=)/g;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = regex.exec(lineText)) !== null) {
      if (m.index > lastIdx) {
        tokens.push(
          <span key={k++} className="text-[#D4D4D4]">
            {lineText.slice(lastIdx, m.index)}
          </span>,
        );
      }
      const word = m[0];
      if (word.startsWith("'") || word.startsWith('"')) {
        tokens.push(
          <span key={k++} className="text-[#CE9178]">
            {word}
          </span>,
        );
      } else if (
        word === 'from' ||
        word === 'import' ||
        word === 'def' ||
        word === 'return'
      ) {
        tokens.push(
          <span key={k++} className="text-[#C586C0]">
            {word}
          </span>,
        );
      } else if (word.endsWith('=')) {
        tokens.push(
          <span key={k++} className="text-[#9CDCFE]">
            {word}
          </span>,
        );
      } else if (
        word === 'generate_launch_description' ||
        word === 'get_package_share_path' ||
        word === 'join'
      ) {
        tokens.push(
          <span key={k++} className="text-[#DCDCAA]">
            {word}
          </span>,
        );
      } else {
        tokens.push(
          <span key={k++} className="text-[#4EC9B0]">
            {word}
          </span>,
        );
      }
      lastIdx = m.index + word.length;
    }
    if (lastIdx < lineText.length) {
      tokens.push(
        <span key={k++} className="text-[#D4D4D4]">
          {lineText.slice(lastIdx)}
        </span>,
      );
    }
    return tokens;
  }

  if (language === 'cmake') {
    const tokens: React.ReactNode[] = [];
    const regex =
      /(\$\{[^}]+\}|\b(?:cmake_minimum_required|project|if|endif|add_compile_options|find_package|install|ament_package)\b|\b(?:VERSION|REQUIRED|DIRECTORY|DESTINATION|MATCHES|OR)\b)/g;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = regex.exec(lineText)) !== null) {
      if (m.index > lastIdx) {
        tokens.push(
          <span key={k++} className="text-[#D4D4D4]">
            {lineText.slice(lastIdx, m.index)}
          </span>,
        );
      }
      const word = m[0];
      if (word.startsWith('${')) {
        tokens.push(
          <span key={k++} className="text-[#DCDCAA]">
            {word}
          </span>,
        );
      } else if (/^[A-Z_]+$/.test(word)) {
        tokens.push(
          <span key={k++} className="text-[#C586C0]">
            {word}
          </span>,
        );
      } else {
        tokens.push(
          <span key={k++} className="text-[#569CD6]">
            {word}
          </span>,
        );
      }
      lastIdx = m.index + word.length;
    }
    if (lastIdx < lineText.length) {
      tokens.push(
        <span key={k++} className="text-[#D4D4D4]">
          {lineText.slice(lastIdx)}
        </span>,
      );
    }
    return tokens;
  }

  // YAML / JSON
  const colonIdx = lineText.indexOf(':');
  if (colonIdx !== -1) {
    const keyPart = lineText.slice(0, colonIdx + 1);
    const valPart = lineText.slice(colonIdx + 1);
    return (
      <>
        <span className="text-[#9CDCFE]">{keyPart}</span>
        <span className="text-[#CE9178]">{valPart}</span>
      </>
    );
  }

  return <span className="text-[#D4D4D4]">{lineText}</span>;
}

export const XmlEditorPane: React.FC<XmlEditorPaneProps> = ({
  xmlCode,
  onChangeXml,
  onRunCompile,
  model,
  isDirty,
  fileFormat,
  onChangeFileFormat,
  workspaceFiles,
  activeFilePath,
  openTabPaths,
  onSelectWorkspaceFile,
  onCloseWorkspaceTab,
  onUpdateWorkspaceFile,
  onRunLaunchFile,
  lastLaunchSummary,
  selectedNode,
  onSelectNode,
  worldTransforms,
  layers,
  onUpdateLayers,
  treeSettings,
  onUpdateTreeSettings,
  onDownloadViewFramesPdf,
  onPreviewViewFrames,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const gutterInnerRef = useRef<HTMLDivElement | null>(null);
  const highlightPreRef = useRef<HTMLPreElement | null>(null);
  const highlightInnerRef = useRef<HTMLDivElement | null>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(
    null,
  );

  const [fontSize, setFontSize] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY_FONT_SIZE));
      if (saved >= MIN_FONT_SIZE && saved <= MAX_FONT_SIZE) return saved;
    } catch {
      // ignore storage errors
    }
    return DEFAULT_FONT_SIZE;
  });

  const [explorerOpen, setExplorerOpen] = useState<boolean>(true);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    SRC: true,
    '.vscode': false,
    my_robot_description: true,
    'my_robot_description/launch': true,
    'my_robot_description/rviz': false,
    'my_robot_description/urdf': true,
  });

  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const [treeExpanded, setTreeExpanded] = useState(true);
  const [consoleExpanded, setConsoleExpanded] = useState(true);
  const [expandedNodeDetails, setExpandedNodeDetails] = useState<
    Record<string, boolean>
  >({});

  const activeFileEntry = workspaceFiles[activeFilePath];
  const isEditingUrdfOrXacro =
    !activeFileEntry ||
    activeFileEntry.language === 'urdf' ||
    activeFileEntry.language === 'xacro';
  const isEditingLaunchFile =
    activeFileEntry?.language === 'launch_xml' ||
    activeFileEntry?.language === 'launch_py';

  const displayedCode = isEditingUrdfOrXacro
    ? xmlCode
    : activeFileEntry?.content ?? '';
  const activeLanguage: WorkspaceFileLanguage = isEditingUrdfOrXacro
    ? fileFormat
    : activeFileEntry?.language ?? 'urdf';

  // Debounce live URDF/Xacro diagnostic compilation during rapid keystrokes (Backspace/Space)
  const [debouncedXmlCode, setDebouncedXmlCode] = useState<string>(xmlCode);
  useEffect(() => {
    if (!isDirty) {
      setDebouncedXmlCode(xmlCode);
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedXmlCode(xmlCode);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [xmlCode, isDirty]);

  const lineHeightPx = Math.round(fontSize * 1.55);
  const lines = useMemo(() => displayedCode.split('\n'), [displayedCode]);

  const toggleFolder = (folderKey: string) => {
    setOpenFolders((prev) => ({ ...prev, [folderKey]: !prev[folderKey] }));
  };

  const changeFontSizeBy = (delta: number) => {
    setFontSize((prev) => {
      const clamped = Math.max(
        MIN_FONT_SIZE,
        Math.min(MAX_FONT_SIZE, prev + delta),
      );
      try {
        localStorage.setItem(STORAGE_KEY_FONT_SIZE, String(clamped));
      } catch {
        // ignore
      }
      return clamped;
    });
  };

  const resetFontSize = () => {
    setFontSize(DEFAULT_FONT_SIZE);
    try {
      localStorage.setItem(STORAGE_KEY_FONT_SIZE, String(DEFAULT_FONT_SIZE));
    } catch {
      // ignore
    }
  };

  const activeUrdfLiveDiagnostics = useMemo(() => {
    if (!isEditingUrdfOrXacro) return model.diagnostics;
    return isDirty ? compileUrdf(debouncedXmlCode).diagnostics : model.diagnostics;
  }, [isEditingUrdfOrXacro, isDirty, debouncedXmlCode, model.diagnostics]);

  // Compute diagnostics for every file in the ROS 2 workspace
  const workspaceDiagnosticsByFile = useMemo(() => {
    const result: Record<string, CompilerDiagnostic[]> = {};
    for (const [pathKey, entry] of Object.entries(workspaceFiles) as [
      string,
      WorkspaceFileEntry,
    ][]) {
      if (
        pathKey === activeFilePath &&
        (entry.language === 'urdf' || entry.language === 'xacro')
      ) {
        result[pathKey] = activeUrdfLiveDiagnostics;
      } else {
        result[pathKey] = validateWorkspaceFile(pathKey, workspaceFiles);
      }
    }
    return result;
  }, [workspaceFiles, activeFilePath, activeUrdfLiveDiagnostics]);

  const activeFileDiagnostics = useMemo(() => {
    if (isEditingUrdfOrXacro) {
      return activeUrdfLiveDiagnostics;
    }
    return (
      workspaceDiagnosticsByFile[activeFilePath] ??
      validateWorkspaceFile(activeFilePath, workspaceFiles)
    );
  }, [
    isEditingUrdfOrXacro,
    activeUrdfLiveDiagnostics,
    workspaceDiagnosticsByFile,
    activeFilePath,
    workspaceFiles,
  ]);

  const otherWorkspaceDiagnostics = useMemo(() => {
    const list: {
      filePath: string;
      fileName: string;
      diagnostic: CompilerDiagnostic;
    }[] = [];
    for (const [pathKey, diags] of Object.entries(
      workspaceDiagnosticsByFile,
    ) as [string, CompilerDiagnostic[]][]) {
      if (pathKey === activeFilePath) continue;
      const fileName = workspaceFiles[pathKey]?.name ?? pathKey;
      for (const d of diags) {
        list.push({ filePath: pathKey, fileName, diagnostic: d });
      }
    }
    return list;
  }, [workspaceDiagnosticsByFile, activeFilePath, workspaceFiles]);

  // Group active file diagnostics by 1-based line number for the editor gutter
  const diagnosticsByLine = useMemo(() => {
    const map = new Map<number, CompilerDiagnostic[]>();
    for (const d of activeFileDiagnostics) {
      const existing = map.get(d.line) || [];
      existing.push(d);
      map.set(d.line, existing);
    }
    return map;
  }, [activeFileDiagnostics]);

  const errorCount =
    activeFileDiagnostics.filter((d) => d.severity === 'error').length +
    otherWorkspaceDiagnostics.filter((i) => i.diagnostic.severity === 'error')
      .length;
  const warningCount =
    activeFileDiagnostics.filter((d) => d.severity === 'warning').length +
    otherWorkspaceDiagnostics.filter((i) => i.diagnostic.severity === 'warning')
      .length;

  const syncEditorScroll = () => {
    const el = textareaRef.current;
    if (!el) return;
    const top = el.scrollTop;
    const left = el.scrollLeft;
    if (gutterInnerRef.current) {
      gutterInnerRef.current.style.transform = `translate3d(0px, ${-top}px, 0px)`;
    }
    if (highlightInnerRef.current) {
      highlightInnerRef.current.style.transform = `translate3d(${-left}px, ${-top}px, 0px)`;
    }
  };

  const handleScroll = () => {
    syncEditorScroll();
  };

  const updateCursorLineColFromElement = (
    el: HTMLTextAreaElement,
    codeStr: string = el.value,
  ) => {
    const pos = el.selectionStart ?? 0;
    const upToCursor = codeStr.slice(0, pos);
    const split = upToCursor.split('\n');
    setCursorPos({
      line: split.length,
      col: split[split.length - 1].length + 1,
    });
  };

  const updateCursorLineCol = () => {
    const el = textareaRef.current;
    if (!el) return;
    updateCursorLineColFromElement(el, displayedCode);
    syncEditorScroll();
  };

  // Preserve exact selection/caret and scroll alignment across controlled React renders
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const pending = pendingSelectionRef.current;
    if (pending && document.activeElement === el) {
      const maxLen = el.value.length;
      const clampedStart = Math.min(pending.start, maxLen);
      const clampedEnd = Math.min(pending.end, maxLen);
      if (
        el.selectionStart !== clampedStart ||
        el.selectionEnd !== clampedEnd
      ) {
        el.setSelectionRange(clampedStart, clampedEnd);
      }
      pendingSelectionRef.current = null;
    }
    syncEditorScroll();
  }, [displayedCode, activeFilePath, fontSize]);

  const scrollToLine = (lineNumber: number) => {
    setHighlightedLine(lineNumber);
    const el = textareaRef.current;
    if (!el) return;
    const targetScroll = Math.max(0, (lineNumber - 4) * lineHeightPx);
    el.scrollTop = targetScroll;
    syncEditorScroll();
  };

  const handleCodeChange = (nextVal: string) => {
    if (isEditingUrdfOrXacro) {
      onChangeXml(nextVal);
    } else {
      onUpdateWorkspaceFile(activeFilePath, nextVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (isEditingLaunchFile) {
        onRunLaunchFile(activeFilePath);
      } else {
        onRunCompile();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      changeFontSizeBy(1);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault();
      changeFontSizeBy(-1);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const next =
        displayedCode.slice(0, start) + '  ' + displayedCode.slice(end);
      pendingSelectionRef.current = { start: start + 2, end: start + 2 };
      handleCodeChange(next);
    }
  };

  const insertSnippet = (
    type: 'link' | 'joint' | 'xacro_property' | 'xacro_macro',
  ) => {
    const idx = Object.keys(model.links).length + 1;
    const rootLinkName = model.rootLink || 'base_link';
    let snippet = '';
    if (type === 'link') {
      snippet = `\n  <link name="custom_link_${idx}">
    <visual>
      <origin xyz="0 0 0.1" rpy="0 0 0"/>
      <geometry>
        <box size="0.12 0.12 0.12"/>
      </geometry>
      <material name="ur_blue">
        <color rgba="0.22 0.62 0.92 1.0"/>
      </material>
    </visual>
    <collision>
      <origin xyz="0 0 0.1" rpy="0 0 0"/>
      <geometry>
        <box size="0.12 0.12 0.12"/>
      </geometry>
    </collision>
  </link>\n`;
    } else if (type === 'joint') {
      snippet = `\n  <joint name="custom_joint_${idx}" type="revolute">
    <parent link="${rootLinkName}"/>
    <child link="custom_link_${idx}"/>
    <origin xyz="0 0 0.2" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-1.57" upper="1.57" effort="20.0" velocity="2.0"/>
  </joint>\n`;
    } else if (type === 'xacro_property') {
      snippet = `\n  <xacro:property name="custom_prop_${idx}" value="0.25"/>\n`;
    } else {
      snippet = `\n  <xacro:macro name="custom_part_${idx}" params="prefix xyz_offset">
    <link name="\${prefix}_module">
      <visual>
        <origin xyz="0 0 0" rpy="0 0 0"/>
        <geometry>
          <cylinder radius="0.06" length="0.12"/>
        </geometry>
      </visual>
    </link>
    <joint name="\${prefix}_module_joint" type="fixed">
      <parent link="${rootLinkName}"/>
      <child link="\${prefix}_module"/>
      <origin xyz="\${xyz_offset}" rpy="0 0 0"/>
    </joint>
  </xacro:macro>\n`;
    }

    const closeRobotIdx = xmlCode.lastIndexOf('</robot>');
    if (closeRobotIdx !== -1) {
      const next =
        xmlCode.slice(0, closeRobotIdx) +
        snippet +
        xmlCode.slice(closeRobotIdx);
      onChangeXml(next);
    } else {
      onChangeXml(xmlCode + snippet);
    }
  };

  const allLinkNames = useMemo(
    () => Object.keys(model.links).sort((a, b) => a.localeCompare(b)),
    [model.links],
  );
  const allJoints = useMemo(
    () =>
      (Object.values(model.joints) as UrdfJoint[]).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [model.joints],
  );

  const allLinksEnabled = useMemo(
    () =>
      allLinkNames.length > 0 &&
      allLinkNames.every((name) => !treeSettings.disabledLinks[name]),
    [allLinkNames, treeSettings.disabledLinks],
  );

  const allTfFramesEnabled = useMemo(
    () =>
      allLinkNames.length > 0 &&
      allLinkNames.every((name) => !treeSettings.disabledTfFrames[name]),
    [allLinkNames, treeSettings.disabledTfFrames],
  );

  const handleToggleAllLinks = (enabled: boolean) => {
    onUpdateTreeSettings((prev) => {
      const nextDisabled: Record<string, boolean> = {};
      if (!enabled) {
        for (const name of allLinkNames) {
          nextDisabled[name] = true;
        }
      }
      return {
        ...prev,
        disabledLinks: nextDisabled,
      };
    });
  };

  const handleToggleAllTfFrames = (enabled: boolean) => {
    onUpdateTreeSettings((prev) => {
      const nextDisabledTf: Record<string, boolean> = {};
      if (!enabled) {
        for (const name of allLinkNames) {
          nextDisabledTf[name] = true;
        }
      }
      return {
        ...prev,
        disabledTfFrames: nextDisabledTf,
      };
    });
  };

  const handleToggleSingleLink = (linkName: string, enabled: boolean) => {
    onUpdateTreeSettings((prev) => ({
      ...prev,
      disabledLinks: {
        ...prev.disabledLinks,
        [linkName]: !enabled,
      },
    }));
  };

  const handleToggleSingleTfFrame = (linkName: string, enabled: boolean) => {
    onUpdateTreeSettings((prev) => ({
      ...prev,
      disabledTfFrames: {
        ...prev.disabledTfFrames,
        [linkName]: !enabled,
      },
    }));
  };

  const handleToggleSingleJoint = (jointName: string, enabled: boolean) => {
    onUpdateTreeSettings((prev) => ({
      ...prev,
      disabledJoints: {
        ...prev.disabledJoints,
        [jointName]: !enabled,
      },
    }));
  };

  const toggleNodeDetail = (key: string) => {
    setExpandedNodeDetails((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const renderFileIcon = (fileName: string) => {
    if (fileName.endsWith('.py')) {
      return (
        <span className="text-[10px] font-bold font-mono text-[#4B8BBE] shrink-0">
          py
        </span>
      );
    }
    if (fileName === 'CMakeLists.txt') {
      return (
        <span className="text-[11px] font-bold font-mono text-[#569CD6] shrink-0">
          M
        </span>
      );
    }
    if (fileName.endsWith('.rviz')) {
      return <Settings className="w-3.5 h-3.5 text-[#C586C0] shrink-0" />;
    }
    if (fileName.endsWith('.xacro')) {
      return <Code2 className="w-3.5 h-3.5 text-[#4EC9B0] shrink-0" />;
    }
    if (fileName.endsWith('.xml') || fileName.endsWith('.urdf')) {
      return <FileCode className="w-3.5 h-3.5 text-[#CE9178] shrink-0" />;
    }
    return <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
  };

  const renderExplorerFileRow = (filePath: string, indentPx: number) => {
    const entry = workspaceFiles[filePath];
    if (!entry) return null;
    const isActive = activeFilePath === filePath;
    const fileDiags = workspaceDiagnosticsByFile[filePath] || [];
    const fileErrCount = fileDiags.filter((d) => d.severity === 'error').length;
    const fileWarnCount = fileDiags.filter(
      (d) => d.severity === 'warning',
    ).length;

    return (
      <button
        key={filePath}
        type="button"
        data-testid={`explorer-file-${entry.name}`}
        onClick={() => onSelectWorkspaceFile(filePath)}
        style={{ paddingLeft: `${indentPx}px` }}
        className={`w-full flex items-center justify-between gap-1.5 py-1 pr-2 text-left text-[12px] font-mono transition-colors ${
          isActive
            ? 'bg-[#37373d] text-white font-medium'
            : 'text-[#cccccc] hover:bg-[#2a2d2e] hover:text-white'
        }`}
      >
        <span className="flex items-center gap-1.5 min-w-0 truncate">
          {renderFileIcon(entry.name)}
          <span
            className={`truncate ${
              fileErrCount > 0
                ? 'text-rose-400'
                : fileWarnCount > 0
                  ? 'text-amber-300'
                  : ''
            }`}
          >
            {entry.name}
          </span>
        </span>
        {fileErrCount > 0 ? (
          <span
            title={`${fileErrCount} error(s) in ${entry.name}`}
            className="text-[10px] font-bold text-rose-400 shrink-0"
          >
            {fileErrCount}
          </span>
        ) : fileWarnCount > 0 ? (
          <span
            title={`${fileWarnCount} warning(s) in ${entry.name}`}
            className="text-[10px] font-bold text-amber-400 shrink-0"
          >
            {fileWarnCount}
          </span>
        ) : null}
      </button>
    );
  };

  const renderJointRow = (joint: UrdfJoint, indentPx: number) => {
    const isJointSelected =
      selectedNode?.type === 'joint' && selectedNode.name === joint.name;
    const isJointEnabled = !treeSettings.disabledJoints[joint.name];
    const detailKey = `joint:${joint.name}`;
    const showDetails =
      treeSettings.expandDetails || Boolean(expandedNodeDetails[detailKey]);

    return (
      <div key={`joint-${joint.name}`} className="select-none">
        <div
          style={{ paddingLeft: `${indentPx}px` }}
          className={`flex items-center justify-between gap-1.5 py-1 pr-2 text-xs font-mono rounded transition-colors ${
            isJointSelected
              ? 'bg-amber-500/20 text-amber-300'
              : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100'
          }`}
        >
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => toggleNodeDetail(detailKey)}
              aria-label={`Toggle details for joint ${joint.name}`}
              className="p-0.5 text-slate-400 hover:text-white shrink-0"
            >
              {showDetails ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectNode({ type: 'joint', name: joint.name });
                scrollToLine(joint.line);
              }}
              className="flex items-center gap-1.5 truncate text-left flex-1"
            >
              <Link2 className="w-3 h-3 text-amber-400 shrink-0" />
              <span
                className={`truncate ${
                  !isJointEnabled ? 'line-through text-slate-500' : ''
                }`}
              >
                {joint.name}
              </span>
              {joint.mimic && (
                <span className="text-[10px] text-sky-400 shrink-0">
                  [mimic]
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-slate-400">
              {joint.type} · L{joint.line}
            </span>
            <input
              type="checkbox"
              aria-label={`Enable joint ${joint.name}`}
              checked={isJointEnabled}
              onChange={(e) =>
                handleToggleSingleJoint(joint.name, e.target.checked)
              }
              title={`Show/Hide joint ${joint.name} vector in RViz`}
              className="w-3.5 h-3.5 rounded border-slate-600 accent-amber-400 cursor-pointer"
            />
          </div>
        </div>

        {showDetails && (
          <div
            style={{ paddingLeft: `${indentPx + 22}px` }}
            className="py-1 pr-2 text-[11px] font-mono text-slate-400 bg-[#090d16]/70 border-l border-amber-500/30 my-0.5 space-y-0.5"
          >
            <div className="flex justify-between">
              <span>Parent → Child:</span>
              <span className="text-slate-300">
                {joint.parent} → {joint.child}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Origin XYZ:</span>
              <span className="text-slate-300">
                {joint.origin.xyz.map((v) => v.toFixed(3)).join(', ')}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Axis XYZ:</span>
              <span className="text-amber-300">
                [{joint.axis.join(', ')}]
              </span>
            </div>
            {(joint.type === 'revolute' || joint.type === 'prismatic') && (
              <div className="flex justify-between">
                <span>Limits:</span>
                <span className="text-slate-300">
                  [{joint.limit.lower.toFixed(2)}, {joint.limit.upper.toFixed(2)}]
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderLinkRow = (link: UrdfLink, indentPx: number) => {
    const linkName = link.name;
    const isLinkSelected =
      selectedNode?.type === 'link' && selectedNode.name === linkName;
    const isLinkEnabled = !treeSettings.disabledLinks[linkName];
    const isTfEnabled = !treeSettings.disabledTfFrames[linkName];
    const tf = worldTransforms[linkName];
    const detailKey = `link:${linkName}`;
    const showDetails =
      treeSettings.expandDetails || Boolean(expandedNodeDetails[detailKey]);

    return (
      <div key={`link-${linkName}`} className="select-none">
        <div
          style={{ paddingLeft: `${indentPx}px` }}
          className={`flex items-center justify-between gap-1.5 py-1 pr-2 text-xs font-mono rounded transition-colors ${
            isLinkSelected
              ? 'bg-sky-500/20 text-sky-300 font-semibold'
              : 'text-slate-200 hover:bg-slate-800/70'
          }`}
        >
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => toggleNodeDetail(detailKey)}
              aria-label={`Toggle details for link ${linkName}`}
              className="p-0.5 text-slate-400 hover:text-white shrink-0"
            >
              {showDetails ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectNode({ type: 'link', name: linkName });
                scrollToLine(link.line);
              }}
              className="flex items-center gap-1.5 truncate text-left flex-1"
            >
              <Box className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span
                className={`truncate ${
                  !isLinkEnabled ? 'line-through text-slate-500' : ''
                }`}
              >
                {linkName}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-slate-400 tabular-nums">
              {tf
                ? `Z:${tf.position[2].toFixed(2)}m · L${link.line}`
                : `L${link.line}`}
            </span>
            <input
              type="checkbox"
              aria-label={`Enable link ${linkName}`}
              checked={isLinkEnabled}
              onChange={(e) =>
                handleToggleSingleLink(linkName, e.target.checked)
              }
              title={`Enable/Disable link ${linkName} in 3D RViz viewport`}
              className="w-3.5 h-3.5 rounded border-slate-600 accent-sky-400 cursor-pointer"
            />
          </div>
        </div>

        {showDetails && (
          <div
            style={{ paddingLeft: `${indentPx + 22}px` }}
            className="py-1 pr-2 text-[11px] font-mono text-slate-400 bg-[#090d16]/70 border-l border-sky-500/30 my-0.5 space-y-0.5"
          >
            {tf && (
              <>
                <div className="flex justify-between">
                  <span>Position (XYZ):</span>
                  <span className="text-slate-200 tabular-nums">
                    {tf.position.map((v) => v.toFixed(3)).join(', ')} m
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Orientation (RPY):</span>
                  <span className="text-slate-200 tabular-nums">
                    {tf.rpy.map((v) => v.toFixed(2)).join(', ')} rad
                  </span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between">
              <span>TF Frame Axes Enabled:</span>
              <input
                type="checkbox"
                aria-label={`Enable TF frame ${linkName}`}
                checked={isTfEnabled}
                onChange={(e) =>
                  handleToggleSingleTfFrame(linkName, e.target.checked)
                }
                className="w-3 h-3 rounded border-slate-600 accent-emerald-400 cursor-pointer"
              />
            </div>
            <div className="flex justify-between">
              <span>Geometry Elements:</span>
              <span className="text-slate-300">
                {link.visuals.length} visual · {link.collisions.length} collision
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTreeNodeRecursive = (
    node: KinematicTreeNode,
  ): React.ReactNode => {
    const indentPx = node.depth * 14 + 4;
    return (
      <div key={node.linkName}>
        {node.joint && renderJointRow(node.joint, indentPx)}
        {renderLinkRow(node.link, indentPx)}
        {node.children.map((child) => renderTreeNodeRecursive(child))}
      </div>
    );
  };

  // Breadcrumb segments matching VS Code (`my_robot_description > launch > display.launch.xml`)
  const breadcrumbSegments = useMemo(() => {
    return activeFilePath.split('/');
  }, [activeFilePath]);

  return (
    <div className="flex flex-col w-full h-full bg-[#1e1e1e] border-r border-[#26334d] overflow-hidden">
      {/* VS Code Top Tab Bar & Editor Controls */}
      <div className="flex items-center justify-between gap-2 px-2 py-1 bg-[#252526] border-b border-[#2b2b2b] shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
          {/* Toggle VS Code Explorer Sidebar Button */}
          <button
            type="button"
            onClick={() => setExplorerOpen((prev) => !prev)}
            aria-label="Toggle VS Code Explorer"
            title={
              explorerOpen
                ? 'Hide ROS 2 Package Explorer'
                : 'Show ROS 2 Package Explorer'
            }
            className={`p-1.5 rounded transition-colors shrink-0 ${
              explorerOpen
                ? 'bg-[#37373d] text-white'
                : 'text-slate-400 hover:text-white hover:bg-[#37373d]'
            }`}
          >
            {explorerOpen ? (
              <PanelLeftClose className="w-3.5 h-3.5" />
            ) : (
              <PanelLeftOpen className="w-3.5 h-3.5" />
            )}
          </button>

          {/* VS Code Open File Tabs */}
          <div
            role="tablist"
            aria-label="VS Code Open Package Files"
            className="flex items-center gap-0.5 overflow-x-auto"
          >
            {openTabPaths.map((tabPath) => {
              const entry = workspaceFiles[tabPath];
              if (!entry) return null;
              const isTabActive = activeFilePath === tabPath;
              return (
                <div
                  key={tabPath}
                  role="tab"
                  aria-selected={isTabActive}
                  onClick={() => onSelectWorkspaceFile(tabPath)}
                  className={`group flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono cursor-pointer border-t-2 transition-colors whitespace-nowrap shrink-0 ${
                    isTabActive
                      ? 'bg-[#1e1e1e] border-t-[#007acc] text-white'
                      : 'bg-[#2d2d2d] border-t-transparent text-[#969696] hover:bg-[#2a2d2e] hover:text-slate-200'
                  }`}
                >
                  {renderFileIcon(entry.name)}
                  <span>{entry.name}</span>
                  {openTabPaths.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Close ${entry.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseWorkspaceTab(tabPath);
                      }}
                      className="p-0.5 rounded hover:bg-[#3c3c3c] text-slate-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Controls: .urdf vs .urdf.xacro Mode Switcher, Font Size Zoom, and Snippets / Launch */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Active Filename Badge + Two-Option Format Switcher (.urdf vs .urdf.xacro) */}
          <span
            data-testid="active-filename-badge"
            className="hidden xl:inline font-mono text-[11px] font-semibold text-[#e2e8f0]"
          >
            {isEditingUrdfOrXacro
              ? `${model.robotName || 'robot'}${fileFormat === 'xacro' ? '.urdf.xacro' : '.urdf'}`
              : activeFileEntry?.name}
          </span>

          <div
            role="group"
            aria-label="URDF File Format Mode"
            className="inline-flex items-center bg-[#181818] border border-[#3c3c3c] rounded p-0.5"
          >
            <button
              type="button"
              onClick={() => onChangeFileFormat('urdf')}
              data-testid="format-option-urdf"
              title="Open standard my_robot.urdf"
              className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors ${
                fileFormat === 'urdf' && isEditingUrdfOrXacro
                  ? 'bg-sky-500/25 text-sky-300 border border-sky-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              .urdf
            </button>
            <button
              type="button"
              onClick={() => onChangeFileFormat('xacro')}
              data-testid="format-option-xacro"
              title="Open ROS 2 Xacro my_robot.urdf.xacro"
              className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors ${
                fileFormat === 'xacro' && isEditingUrdfOrXacro
                  ? 'bg-teal-500/25 text-teal-300 border border-teal-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              .urdf.xacro
            </button>
          </div>

          {/* VS Code Font Size Controls */}
          <div
            role="group"
            aria-label="Code Editor Font Size Controls"
            className="flex items-center bg-[#181818] border border-[#3c3c3c] rounded px-1 py-0.5"
          >
            <button
              type="button"
              onClick={() => changeFontSizeBy(-1)}
              disabled={fontSize <= MIN_FONT_SIZE}
              aria-label="Decrease Editor Font Size"
              title="Decrease editor font size (Ctrl+-)"
              className="flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-mono text-slate-300 hover:text-white hover:bg-[#37373d] disabled:opacity-40 rounded transition-colors"
            >
              <Minus className="w-3 h-3" />
              <span>A</span>
            </button>
            <button
              type="button"
              onClick={resetFontSize}
              data-testid="editor-font-size-badge"
              title="Reset font size to default (13px)"
              className="px-1.5 py-0.5 text-[11px] font-mono tabular-nums text-sky-300 hover:text-white"
            >
              {fontSize}px
            </button>
            <button
              type="button"
              onClick={() => changeFontSizeBy(1)}
              disabled={fontSize >= MAX_FONT_SIZE}
              aria-label="Increase Editor Font Size"
              title="Increase editor font size (Ctrl+=)"
              className="flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-mono text-slate-300 hover:text-white hover:bg-[#37373d] disabled:opacity-40 rounded transition-colors"
            >
              <span>A</span>
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {isEditingLaunchFile ? (
            <button
              type="button"
              data-testid="ros2-launch-button"
              onClick={() => onRunLaunchFile(activeFilePath)}
              title={`Execute ros2 launch my_robot_description ${activeFileEntry?.name}`}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-semibold text-emerald-300 hover:text-white bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 rounded transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3 h-3 fill-emerald-300" />
              <span>ros2 launch</span>
            </button>
          ) : (
            <>
              {fileFormat === 'xacro' && isEditingUrdfOrXacro && (
                <>
                  <button
                    type="button"
                    onClick={() => insertSnippet('xacro_property')}
                    title="Insert <xacro:property> constant"
                    className="flex items-center gap-1 px-2 py-1 text-xs font-mono text-teal-300 hover:text-white bg-[#181818] hover:bg-[#37373d] border border-teal-500/35 rounded transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3 text-teal-400" />
                    <span>xacro:property</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => insertSnippet('xacro_macro')}
                    title="Insert <xacro:macro> parameterized block"
                    className="flex items-center gap-1 px-2 py-1 text-xs font-mono text-teal-300 hover:text-white bg-[#181818] hover:bg-[#37373d] border border-teal-500/35 rounded transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3 text-teal-400" />
                    <span>xacro:macro</span>
                  </button>
                </>
              )}

              {isEditingUrdfOrXacro && (
                <>
                  <button
                    type="button"
                    onClick={() => insertSnippet('link')}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-200 hover:text-white bg-[#181818] hover:bg-[#37373d] border border-[#3c3c3c] rounded transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3 text-sky-400" />
                    <span>Add &lt;link&gt;</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => insertSnippet('joint')}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-200 hover:text-white bg-[#181818] hover:bg-[#37373d] border border-[#3c3c3c] rounded transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3 text-amber-400" />
                    <span>Add &lt;joint&gt;</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* VS Code Breadcrumb Bar (`my_robot_description > launch > display.launch.xml`) */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#1e1e1e] border-b border-[#2b2b2b] text-[11px] font-mono text-[#a9a9a9] shrink-0">
        <div
          data-testid="vscode-breadcrumb-bar"
          className="flex items-center gap-1 truncate"
        >
          {breadcrumbSegments.map((seg, i) => (
            <React.Fragment key={`${seg}-${i}`}>
              {i > 0 && (
                <ChevronRight className="w-3 h-3 text-[#6e6e6e] shrink-0" />
              )}
              <span
                className={
                  i === breadcrumbSegments.length - 1
                    ? 'text-[#e2e8f0] font-medium flex items-center gap-1'
                    : 'text-[#969696]'
                }
              >
                {i === breadcrumbSegments.length - 1 && renderFileIcon(seg)}
                <span>{seg}</span>
              </span>
            </React.Fragment>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span>
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
          {isDirty && isEditingUrdfOrXacro && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-amber-400">Modified</span>
            </>
          )}
        </div>
      </div>

      {/* Middle Area: VS Code Explorer Sidebar + Synchronized Code Editor */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden bg-[#1e1e1e]">
        {/* Collapsible VS Code EXPLORER Sidebar matching user's SRC/my_robot_description tree */}
        {explorerOpen && (
          <aside
            aria-label="VS Code Package Explorer"
            data-testid="vscode-explorer-sidebar"
            className="w-52 bg-[#252526] border-r border-[#2b2b2b] flex flex-col select-none shrink-0 overflow-y-auto"
          >
            <div className="px-3 py-1.5 text-[11px] font-semibold tracking-wider text-[#bbbbbb] flex items-center justify-between border-b border-[#2b2b2b]">
              <span>EXPLORER</span>
              <span className="text-[10px] font-mono text-slate-400">ROS 2</span>
            </div>

            {/* SRC Root Folder */}
            <div className="py-1">
              <button
                type="button"
                onClick={() => toggleFolder('SRC')}
                className="w-full flex items-center gap-1 px-2 py-1 text-[11px] font-bold tracking-wide text-[#cccccc] hover:bg-[#2a2d2e]"
              >
                {openFolders.SRC ? (
                  <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>SRC</span>
              </button>

              {openFolders.SRC && (
                <div>
                  {/* .vscode folder */}
                  <button
                    type="button"
                    onClick={() => toggleFolder('.vscode')}
                    style={{ paddingLeft: '14px' }}
                    className="w-full flex items-center gap-1 py-1 pr-2 text-[12px] font-mono text-[#cccccc] hover:bg-[#2a2d2e]"
                  >
                    {openFolders['.vscode'] ? (
                      <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>.vscode</span>
                  </button>
                  {openFolders['.vscode'] &&
                    renderExplorerFileRow('.vscode/settings.json', 32)}

                  {/* my_robot_description package folder */}
                  <button
                    type="button"
                    onClick={() => toggleFolder('my_robot_description')}
                    style={{ paddingLeft: '14px' }}
                    className="w-full flex items-center gap-1 py-1 pr-2 text-[12px] font-mono text-[#e2e8f0] font-medium hover:bg-[#2a2d2e]"
                  >
                    {openFolders.my_robot_description ? (
                      <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                    )}
                    {openFolders.my_robot_description ? (
                      <FolderOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    ) : (
                      <Folder className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    )}
                    <span className="truncate">my_robot_description</span>
                  </button>

                  {openFolders.my_robot_description && (
                    <div>
                      {/* launch/ subfolder */}
                      <button
                        type="button"
                        onClick={() =>
                          toggleFolder('my_robot_description/launch')
                        }
                        style={{ paddingLeft: '26px' }}
                        className="w-full flex items-center gap-1 py-1 pr-2 text-[12px] font-mono text-[#cccccc] hover:bg-[#2a2d2e]"
                      >
                        {openFolders['my_robot_description/launch'] ? (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <Folder className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>launch</span>
                      </button>
                      {openFolders['my_robot_description/launch'] && (
                        <>
                          {renderExplorerFileRow(
                            'my_robot_description/launch/display.launch.py',
                            44,
                          )}
                          {renderExplorerFileRow(
                            'my_robot_description/launch/display.launch.xml',
                            44,
                          )}
                        </>
                      )}

                      {/* rviz/ subfolder */}
                      <button
                        type="button"
                        onClick={() =>
                          toggleFolder('my_robot_description/rviz')
                        }
                        style={{ paddingLeft: '26px' }}
                        className="w-full flex items-center gap-1 py-1 pr-2 text-[12px] font-mono text-[#cccccc] hover:bg-[#2a2d2e]"
                      >
                        {openFolders['my_robot_description/rviz'] ? (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <Folder className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span>rviz</span>
                      </button>
                      {openFolders['my_robot_description/rviz'] &&
                        renderExplorerFileRow(
                          'my_robot_description/rviz/urdf_config.rviz',
                          44,
                        )}

                      {/* urdf/ subfolder */}
                      <button
                        type="button"
                        onClick={() =>
                          toggleFolder('my_robot_description/urdf')
                        }
                        style={{ paddingLeft: '26px' }}
                        className="w-full flex items-center gap-1 py-1 pr-2 text-[12px] font-mono text-[#cccccc] hover:bg-[#2a2d2e]"
                      >
                        {openFolders['my_robot_description/urdf'] ? (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>urdf</span>
                      </button>
                      {openFolders['my_robot_description/urdf'] && (
                        <>
                          {renderExplorerFileRow(
                            'my_robot_description/urdf/my_robot.urdf.xacro',
                            44,
                          )}
                          {renderExplorerFileRow(
                            'my_robot_description/urdf/my_robot.urdf',
                            44,
                          )}
                        </>
                      )}

                      {/* CMakeLists.txt & package.xml */}
                      {renderExplorerFileRow(
                        'my_robot_description/CMakeLists.txt',
                        30,
                      )}
                      {renderExplorerFileRow(
                        'my_robot_description/package.xml',
                        30,
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Synchronized Line Numbers & Error Gutter */}
        <div
          ref={gutterRef}
          aria-hidden="true"
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: `${lineHeightPx}px`,
          }}
          className="w-12 py-3 bg-[#181818] border-r border-[#2b2b2b] text-right vscode-code-font select-none overflow-hidden shrink-0"
        >
          <div ref={gutterInnerRef} className="will-change-transform">
            {lines.map((_, idx) => {
              const lineNum = idx + 1;
              const lineDiags = diagnosticsByLine.get(lineNum);
              const hasErr = lineDiags?.some((d) => d.severity === 'error');
              const hasWarn = lineDiags?.some((d) => d.severity === 'warning');
              const isHighlighted = highlightedLine === lineNum;
              const isCursorLine = cursorPos.line === lineNum;

              return (
                <div
                  key={lineNum}
                  style={{ height: `${lineHeightPx}px` }}
                  title={lineDiags?.map((d) => d.message).join('\n')}
                  className={`px-2 flex items-center justify-end gap-1 ${
                    hasErr
                      ? 'bg-rose-500/25 text-rose-400 font-bold'
                      : hasWarn
                        ? 'bg-amber-500/20 text-amber-300 font-semibold'
                        : isHighlighted
                          ? 'bg-sky-500/25 text-sky-300 font-semibold'
                          : isCursorLine
                            ? 'bg-[#282d37] text-[#c6c6c6] font-medium'
                            : 'text-[#858585]'
                  }`}
                >
                  {hasErr ? (
                    <span className="text-rose-400">!</span>
                  ) : hasWarn ? (
                    <span className="text-amber-400">~</span>
                  ) : null}
                  <span>{lineNum}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Synchronized Syntax Highlight Underlay + Editable Textarea Overlay */}
        <div className="relative flex-1 min-w-0 h-full overflow-hidden bg-[#1e1e1e]">
          <pre
            ref={highlightPreRef}
            aria-hidden="true"
            style={{
              fontSize: `${fontSize}px`,
              lineHeight: `${lineHeightPx}px`,
            }}
            className="absolute inset-0 m-0 p-3 vscode-code-font pointer-events-none overflow-hidden whitespace-pre select-none"
          >
            <div
              ref={highlightInnerRef}
              className="min-w-max will-change-transform"
            >
              {lines.map((lineText, idx) => {
                const lineNum = idx + 1;
                const isCursorLine = cursorPos.line === lineNum;
                const isHighlighted = highlightedLine === lineNum;
                return (
                  <div
                    key={lineNum}
                    style={{ height: `${lineHeightPx}px` }}
                    className={`${
                      isHighlighted
                        ? 'bg-sky-500/15'
                        : isCursorLine
                          ? 'bg-[#282d37]/75'
                          : ''
                    }`}
                  >
                    {renderVsCodeCodeLine(lineText, activeLanguage)}
                  </div>
                );
              })}
            </div>
          </pre>

          <textarea
            ref={textareaRef}
            aria-label="URDF XML Code Editor"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            wrap="off"
            value={displayedCode}
            onChange={(e) => {
              const el = e.currentTarget;
              pendingSelectionRef.current = {
                start: el.selectionStart ?? 0,
                end: el.selectionEnd ?? 0,
              };
              handleCodeChange(el.value);
              updateCursorLineColFromElement(el, el.value);
              syncEditorScroll();
            }}
            onScroll={handleScroll}
            onKeyUp={updateCursorLineCol}
            onClick={updateCursorLineCol}
            onMouseUp={updateCursorLineCol}
            onSelect={updateCursorLineCol}
            onKeyDown={handleKeyDown}
            style={{
              fontSize: `${fontSize}px`,
              lineHeight: `${lineHeightPx}px`,
            }}
            className="relative z-10 w-full h-full m-0 p-3 border-0 bg-transparent text-transparent caret-sky-400 selection:bg-[#264f78]/65 vscode-code-font resize-none focus:outline-none overflow-auto whitespace-pre"
          />
        </div>
      </div>

      {/* Collapsible RViz Kinematic Tree & TF Inspector Drawer with Checkboxes */}
      <div className="border-t border-[#26334d] bg-[#111827] shrink-0">
        <div className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#111827]">
          <button
            type="button"
            onClick={() => setTreeExpanded((prev) => !prev)}
            aria-expanded={treeExpanded}
            className="flex items-center gap-2 hover:text-white transition-colors"
          >
            {treeExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            )}
            <GitBranch className="w-3.5 h-3.5 text-sky-400" />
            <span>Kinematic Tree Hierarchy (RViz Links &amp; TF)</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDownloadViewFramesPdf}
              title="Generate and download ROS2 tf2_tools view_frames PDF"
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono font-medium text-sky-300 hover:text-white bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 rounded transition-colors"
            >
              <FileDown className="w-3 h-3" />
              <span>view_frames PDF</span>
            </button>
            <button
              type="button"
              onClick={onPreviewViewFrames}
              title="Preview view_frames TF tree diagram"
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono text-slate-300 hover:text-white bg-[#161f30] hover:bg-slate-800 border border-[#26334d] rounded transition-colors"
            >
              <Eye className="w-3 h-3 text-sky-400" />
              <span>Diagram</span>
            </button>
            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
              {allLinkNames.length} links · {allJoints.length} joints
            </span>
          </div>
        </div>

        {treeExpanded && (
          <div className="bg-[#0d131f] border-t border-[#1e293b]">
            {/* RViz Style Property Header Rows (Matching RViz Links & TF Panels) */}
            <div className="px-3 py-1.5 bg-[#111827]/90 border-b border-[#1e293b] text-[11px] space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-slate-300">
                  <span className="text-slate-400">Link Tree Style:</span>
                  <select
                    aria-label="Link Tree Style"
                    value={treeSettings.treeStyle}
                    onChange={(e) =>
                      onUpdateTreeSettings((prev) => ({
                        ...prev,
                        treeStyle: e.target.value as 'hierarchy' | 'alphabetic',
                      }))
                    }
                    className="bg-[#161f30] text-slate-100 border border-[#26334d] rounded px-1.5 py-0.5 text-[11px] font-mono focus:outline-none focus:border-sky-400"
                  >
                    <option value="hierarchy">Kinematic Tree Hierarchy</option>
                    <option value="alphabetic">
                      Links in Alphabetic Order
                    </option>
                  </select>
                </label>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                    <span>Expand Details</span>
                    <input
                      type="checkbox"
                      aria-label="Expand Link Details"
                      checked={treeSettings.expandDetails}
                      onChange={(e) =>
                        onUpdateTreeSettings((prev) => ({
                          ...prev,
                          expandDetails: e.target.checked,
                        }))
                      }
                      className="w-3.5 h-3.5 rounded border-slate-600 accent-sky-400 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center gap-1.5 text-slate-200 font-medium cursor-pointer">
                    <span>All Links Enabled</span>
                    <input
                      type="checkbox"
                      aria-label="All Links Enabled"
                      checked={allLinksEnabled}
                      onChange={(e) => handleToggleAllLinks(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-slate-600 accent-sky-400 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Second Row: RViz TF Display Options (Show Names, Show Axes, Show Arrows, Marker Scale) */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#1e293b]/80">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 font-semibold text-sky-400">
                    <Axis3d className="w-3.5 h-3.5" />
                    <span>TF:</span>
                  </span>

                  <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
                    <span>Show Names</span>
                    <input
                      type="checkbox"
                      aria-label="Show TF Names"
                      checked={layers.tfLabels}
                      onChange={(e) =>
                        onUpdateLayers((prev) => ({
                          ...prev,
                          tfLabels: e.target.checked,
                        }))
                      }
                      className="w-3.5 h-3.5 rounded border-slate-600 accent-sky-400 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
                    <span>Show Axes</span>
                    <input
                      type="checkbox"
                      aria-label="Show TF Axes"
                      checked={layers.tfFrames}
                      onChange={(e) =>
                        onUpdateLayers((prev) => ({
                          ...prev,
                          tfFrames: e.target.checked,
                        }))
                      }
                      className="w-3.5 h-3.5 rounded border-slate-600 accent-sky-400 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
                    <span>Show Arrows</span>
                    <input
                      type="checkbox"
                      aria-label="Show Joint Arrows"
                      checked={layers.jointAxes}
                      onChange={(e) =>
                        onUpdateLayers((prev) => ({
                          ...prev,
                          jointAxes: e.target.checked,
                        }))
                      }
                      className="w-3.5 h-3.5 rounded border-slate-600 accent-amber-400 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
                    <span>All Frames</span>
                    <input
                      type="checkbox"
                      aria-label="All TF Frames Enabled"
                      checked={allTfFramesEnabled}
                      onChange={(e) =>
                        handleToggleAllTfFrames(e.target.checked)
                      }
                      className="w-3.5 h-3.5 rounded border-slate-600 accent-emerald-400 cursor-pointer"
                    />
                  </label>
                </div>

                <label className="flex items-center gap-1.5 text-slate-300">
                  <span className="text-slate-400">Marker Scale:</span>
                  <input
                    type="number"
                    aria-label="TF Marker Scale"
                    min={0.2}
                    max={3.0}
                    step={0.1}
                    value={treeSettings.tfMarkerScale}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!Number.isNaN(val)) {
                        onUpdateTreeSettings((prev) => ({
                          ...prev,
                          tfMarkerScale: Math.max(0.2, Math.min(3.0, val)),
                        }));
                      }
                    }}
                    className="w-14 bg-[#161f30] text-slate-100 border border-[#26334d] rounded px-1.5 py-0.5 text-[11px] font-mono text-right focus:outline-none focus:border-sky-400"
                  />
                </label>
              </div>
            </div>

            {/* Scrollable Links & Joints Checkbox Tree */}
            <div className="max-h-40 overflow-y-auto px-2 py-1.5">
              {!model.tree ? (
                <div className="py-3 text-center text-xs text-slate-500">
                  No valid kinematic root link compiled yet.
                </div>
              ) : treeSettings.treeStyle === 'alphabetic' ? (
                <div className="space-y-0.5">
                  {allLinkNames.map((name) =>
                    renderLinkRow(model.links[name], 4),
                  )}
                  {allJoints.map((j) => renderJointRow(j, 4))}
                </div>
              ) : (
                renderTreeNodeRecursive(model.tree)
              )}
            </div>
          </div>
        )}
      </div>

      {/* Collapsible URDF / ROS2 Launch Compiler Console */}
      <div className="border-t border-[#26334d] bg-[#111827] shrink-0">
        <button
          type="button"
          onClick={() => setConsoleExpanded((prev) => !prev)}
          aria-expanded={consoleExpanded}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800/60 transition-colors"
        >
          <span className="flex items-center gap-2">
            {consoleExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            )}
            <Terminal className="w-3.5 h-3.5 text-sky-400" />
            <span>ROS 2 Package &amp; URDF Compiler Console</span>
          </span>

          <div
            data-testid="compiler-status-badge"
            className="flex items-center gap-2 font-mono text-[11px] tabular-nums"
          >
            {errorCount === 0 ? (
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {isEditingLaunchFile
                    ? 'VALID ROS 2 LAUNCH'
                    : model.isXacro || fileFormat === 'xacro'
                      ? 'VALID XACRO → URDF'
                      : 'VALID URDF'}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-rose-400">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>
                  {errorCount} {errorCount === 1 ? 'ERROR' : 'ERRORS'}
                </span>
              </span>
            )}
            {warningCount > 0 && (
              <span className="text-amber-400">
                · {warningCount} {warningCount === 1 ? 'WARN' : 'WARNS'}
              </span>
            )}
          </div>
        </button>

        {consoleExpanded && (
          <div
            data-testid="compiler-console-output"
            className="max-h-28 overflow-y-auto px-3 py-2 bg-[#090d16] border-t border-[#1e293b] font-mono text-xs space-y-1"
          >
            {lastLaunchSummary && (
              <div
                className={`flex items-center gap-2 py-0.5 ${
                  lastLaunchSummary.success
                    ? 'text-sky-300'
                    : 'text-rose-400 font-semibold'
                }`}
              >
                {lastLaunchSummary.success ? (
                  <Play className="w-3 h-3 fill-sky-300 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                )}
                <span>
                  {lastLaunchSummary.success
                    ? `[ros2 launch my_robot_description ${lastLaunchSummary.launchFile.split('/').pop()}]: Started nodes [${lastLaunchSummary.nodesStarted.join(', ')}] with ${lastLaunchSummary.usesXacroCommand ? 'xacro ' : ''}${lastLaunchSummary.targetUrdfPath}`
                    : `[ERROR] [ros2 launch my_robot_description ${lastLaunchSummary.launchFile.split('/').pop()}]: Launch failed with ${lastLaunchSummary.diagnostics.filter((d) => d.severity === 'error').length} error(s).`}
                </span>
              </div>
            )}

            {activeFileDiagnostics.length === 0 &&
            otherWorkspaceDiagnostics.length === 0 ? (
              <div className="flex items-center gap-2 text-emerald-400 py-0.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Compiled{' '}
                  {model.isXacro || fileFormat === 'xacro'
                    ? 'Xacro (.urdf.xacro)'
                    : 'URDF (.urdf)'}{' '}
                  robot &quot;{model.robotName}&quot; &amp; ROS 2 package
                  successfully — root link &quot;{model.rootLink}&quot;,{' '}
                  {Object.keys(model.links).length} links,{' '}
                  {Object.keys(model.joints).length} joints
                  {model.isXacro
                    ? ` (${model.xacroPropertyCount ?? 0} properties, ${model.xacroMacroCount ?? 0} macros expanded)`
                    : ''}
                  , zero errors.
                </span>
              </div>
            ) : (
              <>
                {activeFileDiagnostics.map((diag) => (
                  <button
                    key={`active-${diag.id}`}
                    type="button"
                    onClick={() => scrollToLine(diag.line)}
                    className={`w-full text-left flex items-start gap-2 px-2 py-1 rounded transition-colors ${
                      diag.severity === 'error'
                        ? 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                        : 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                    }`}
                  >
                    {diag.severity === 'error' ? (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <span className="shrink-0 font-semibold">
                      [{activeFileEntry?.name ?? 'URDF'} Ln {diag.line}]
                    </span>
                    <span className="flex-1 break-words">{diag.message}</span>
                  </button>
                ))}

                {otherWorkspaceDiagnostics.map((item, idx) => (
                  <button
                    key={`other-${item.filePath}-${item.diagnostic.id}-${idx}`}
                    type="button"
                    onClick={() => {
                      onSelectWorkspaceFile(item.filePath);
                      setTimeout(() => scrollToLine(item.diagnostic.line), 30);
                    }}
                    className={`w-full text-left flex items-start gap-2 px-2 py-1 rounded transition-colors ${
                      item.diagnostic.severity === 'error'
                        ? 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                        : 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                    }`}
                  >
                    {item.diagnostic.severity === 'error' ? (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <span className="shrink-0 font-semibold">
                      [{item.fileName} Ln {item.diagnostic.line}]
                    </span>
                    <span className="flex-1 break-words">
                      {item.diagnostic.message}
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
