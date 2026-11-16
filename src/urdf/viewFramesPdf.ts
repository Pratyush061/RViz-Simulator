import { KinematicTreeNode, ParsedUrdfModel, UrdfJoint } from './types';

export interface ViewFramesNodeLayout {
  linkName: string;
  x: number; // center X in top-down points
  y: number; // center Y in top-down points
  rx: number; // ellipse horizontal radius
  ry: number; // ellipse vertical radius
  depth: number;
  joint?: UrdfJoint;
  parentX?: number;
  parentY?: number;
  parentRy?: number;
  broadcaster: string;
  averageRate: string;
  bufferLength: string;
  mostRecentTransform: string;
  oldestTransform: string;
  children: ViewFramesNodeLayout[];
}

export interface ViewFramesDiagramLayout {
  width: number;
  height: number;
  recordedAtTime: string;
  headerBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  nodes: ViewFramesNodeLayout[];
}

const SLOT_MIN_WIDTH = 218;
const SIBLING_GAP = 18;
const LEVEL_VERTICAL_STEP = 142;
const MARGIN_X = 48;
const MARGIN_TOP = 32;
const MARGIN_BOTTOM = 36;
const HEADER_WIDTH = 216;
const HEADER_HEIGHT = 48;
const ROOT_TOP_Y = MARGIN_TOP + HEADER_HEIGHT + 36;
const ELLIPSE_RY = 15;

interface SubtreeMeasure {
  node: KinematicTreeNode;
  rx: number;
  ry: number;
  subtreeWidth: number;
  children: SubtreeMeasure[];
}

function measureSubtree(node: KinematicTreeNode): SubtreeMeasure {
  // Estimate ellipse horizontal radius from linkName character count
  const textWidth = Math.max(46, node.linkName.length * 6.2 + 24);
  const rx = Math.max(38, textWidth * 0.56);
  const ry = ELLIPSE_RY;

  const measuredChildren = node.children.map((c) => measureSubtree(c));

  const ownRequiredWidth = Math.max(
    node.joint ? SLOT_MIN_WIDTH : rx * 2 + 24,
    rx * 2 + 24,
  );

  if (measuredChildren.length === 0) {
    return {
      node,
      rx,
      ry,
      subtreeWidth: ownRequiredWidth,
      children: [],
    };
  }

  const childrenTotalWidth =
    measuredChildren.reduce((acc, c) => acc + c.subtreeWidth, 0) +
    (measuredChildren.length - 1) * SIBLING_GAP;

  return {
    node,
    rx,
    ry,
    subtreeWidth: Math.max(ownRequiredWidth, childrenTotalWidth),
    children: measuredChildren,
  };
}

/**
 * Computes a deterministic, non-overlapping Graphviz-style tree layout
 * matching `ros2 run tf2_tools view_frames`.
 */
export function buildViewFramesLayout(
  model: ParsedUrdfModel,
  timestampSec?: number,
): ViewFramesDiagramLayout {
  const nowSec =
    timestampSec !== undefined ? timestampSec : Date.now() / 1000;
  const recordedAtTime = nowSec.toFixed(7);
  const recentDynamicTime = (nowSec - 0.019793).toFixed(6);
  const oldestDynamicTime = (nowSec - 5.01989).toFixed(6);

  // Fallback synthetic root if model has no valid tree
  const rootTreeNode: KinematicTreeNode = model.tree ?? {
    linkName: model.rootLink || 'base_link',
    link: {
      name: model.rootLink || 'base_link',
      visuals: [],
      collisions: [],
      line: 1,
      endLine: 1,
    },
    children: [],
    depth: 0,
  };

  const rootMeasure = measureSubtree(rootTreeNode);
  const contentWidth = Math.max(540, rootMeasure.subtreeWidth);
  const totalWidth = contentWidth + MARGIN_X * 2;

  const flatNodes: ViewFramesNodeLayout[] = [];
  let maxDepth = 0;

  function assignCoordinates(
    m: SubtreeMeasure,
    leftX: number,
    depth: number,
    parentLayout?: ViewFramesNodeLayout,
  ): ViewFramesNodeLayout {
    if (depth > maxDepth) maxDepth = depth;

    const centerX = leftX + m.subtreeWidth / 2;
    const centerY = ROOT_TOP_Y + depth * LEVEL_VERTICAL_STEP;

    const joint = m.node.joint;
    const isFixed = !joint || joint.type === 'fixed';

    const layoutNode: ViewFramesNodeLayout = {
      linkName: m.node.linkName,
      x: centerX,
      y: centerY,
      rx: m.rx,
      ry: m.ry,
      depth,
      joint,
      parentX: parentLayout?.x,
      parentY: parentLayout?.y,
      parentRy: parentLayout?.ry,
      broadcaster: 'default_authority',
      averageRate: isFixed ? '10000.0' : '10.2',
      bufferLength: isFixed ? '0.0' : '5.0',
      mostRecentTransform: isFixed ? '0.0' : recentDynamicTime,
      oldestTransform: isFixed ? '0.0' : oldestDynamicTime,
      children: [],
    };

    flatNodes.push(layoutNode);

    if (m.children.length > 0) {
      const childrenTotalWidth =
        m.children.reduce((acc, c) => acc + c.subtreeWidth, 0) +
        (m.children.length - 1) * SIBLING_GAP;
      let cursorX = centerX - childrenTotalWidth / 2;

      for (const childMeasure of m.children) {
        const childLayout = assignCoordinates(
          childMeasure,
          cursorX,
          depth + 1,
          layoutNode,
        );
        layoutNode.children.push(childLayout);
        cursorX += childMeasure.subtreeWidth + SIBLING_GAP;
      }
    }

    return layoutNode;
  }

  assignCoordinates(rootMeasure, MARGIN_X, 0, undefined);

  const totalHeight =
    ROOT_TOP_Y + maxDepth * LEVEL_VERTICAL_STEP + ELLIPSE_RY + MARGIN_BOTTOM;

  return {
    width: Math.ceil(totalWidth),
    height: Math.ceil(totalHeight),
    recordedAtTime,
    headerBox: {
      x: totalWidth / 2 - HEADER_WIDTH / 2,
      y: MARGIN_TOP,
      width: HEADER_WIDTH,
      height: HEADER_HEIGHT,
    },
    nodes: flatNodes,
  };
}

function escapePdfText(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Generates a self-contained, vector-sharp PDF-1.4 document matching
 * `ros2 run tf2_tools view_frames` (Graphviz dot output).
 */
export function generateViewFramesPdfBytes(
  model: ParsedUrdfModel,
  timestampSec?: number,
): Uint8Array {
  const layout = buildViewFramesLayout(model, timestampSec);
  const W = layout.width;
  const H = layout.height;

  // Helper to convert top-down Y to bottom-up PDF Y coordinate
  const toPdfY = (topDownY: number) => +(H - topDownY).toFixed(2);
  const fmt = (n: number) => +n.toFixed(2);

  const ops: string[] = [];

  // 1. White Page Background
  ops.push('1 1 1 rg');
  ops.push(`0 0 ${W} ${H} re f`);

  // Default black stroke and fill
  ops.push('0 0 0 RG');
  ops.push('0 0 0 rg');
  ops.push('1.1 w');

  // Helper for centered text in Times-Roman
  const drawCenteredText = (
    text: string,
    cx: number,
    topDownBaselineY: number,
    fontSize: number,
  ) => {
    // Approximate Times-Roman average character width ~ 0.46 * fontSize
    const estWidth = text.length * fontSize * 0.455;
    const startX = fmt(cx - estWidth / 2);
    const pdfY = toPdfY(topDownBaselineY);
    ops.push(
      `BT /F1 ${fontSize} Tf ${startX} ${pdfY} Td (${escapePdfText(text)}) Tj ET`,
    );
  };

  // Helper for left-aligned text in Times-Roman
  const drawLeftText = (
    text: string,
    leftX: number,
    topDownBaselineY: number,
    fontSize: number,
  ) => {
    const pdfY = toPdfY(topDownBaselineY);
    ops.push(
      `BT /F1 ${fontSize} Tf ${fmt(leftX)} ${pdfY} Td (${escapePdfText(text)}) Tj ET`,
    );
  };

  // Helper to draw a 4-segment cubic Bezier ellipse in PDF
  const drawEllipse = (cx: number, cyTopDown: number, rx: number, ry: number) => {
    const cy = toPdfY(cyTopDown);
    const k = 0.55228475;
    const ox = rx * k;
    const oy = ry * k;

    ops.push(`${fmt(cx + rx)} ${fmt(cy)} m`);
    ops.push(
      `${fmt(cx + rx)} ${fmt(cy + oy)} ${fmt(cx + ox)} ${fmt(cy + ry)} ${fmt(cx)} ${fmt(cy + ry)} c`,
    );
    ops.push(
      `${fmt(cx - ox)} ${fmt(cy + ry)} ${fmt(cx - rx)} ${fmt(cy + oy)} ${fmt(cx - rx)} ${fmt(cy)} c`,
    );
    ops.push(
      `${fmt(cx - rx)} ${fmt(cy - oy)} ${fmt(cx - ox)} ${fmt(cy - ry)} ${fmt(cx)} ${fmt(cy - ry)} c`,
    );
    ops.push(
      `${fmt(cx + ox)} ${fmt(cy - ry)} ${fmt(cx + rx)} ${fmt(cy - oy)} ${fmt(cx + rx)} ${fmt(cy)} c`,
    );
    ops.push('S');
  };

  // 2. Draw Top Header Box ("view_frames Result" / "Recorded at time: ...")
  const hb = layout.headerBox;
  ops.push('1.2 w');
  ops.push(
    `${fmt(hb.x)} ${toPdfY(hb.y + hb.height)} ${fmt(hb.width)} ${fmt(hb.height)} re S`,
  );
  drawCenteredText('view_frames Result', hb.x + hb.width / 2, hb.y + 18, 10.5);
  drawCenteredText(
    `Recorded at time: ${layout.recordedAtTime}`,
    hb.x + hb.width / 2,
    hb.y + 36,
    10.0,
  );

  // 3. Draw Edges (Curved Bezier Arrows + 5-Line Broadcaster Metadata)
  ops.push('0.95 w');
  for (const node of layout.nodes) {
    if (
      node.parentX === undefined ||
      node.parentY === undefined ||
      node.parentRy === undefined
    ) {
      continue;
    }

    const startX = node.parentX;
    const startY = node.parentY + node.parentRy;
    const endX = node.x;
    const endY = node.y - node.ry;
    const arrowLen = 7.5;
    const arrowHalfW = 3.2;

    const dx = endX - startX;
    const isNearlyVertical = Math.abs(dx) < 8;

    // Curve control points in top-down space (matching Graphviz dot shoulder curves)
    const cp1X = isNearlyVertical ? startX : startX + dx * 0.85;
    const cp1Y = isNearlyVertical
      ? startY + (endY - startY) * 0.35
      : startY + 14;
    const cp2X = endX;
    const cp2Y = startY + (endY - startY) * 0.55;
    const curveEndY = endY - arrowLen;

    ops.push(`${fmt(startX)} ${toPdfY(startY)} m`);
    ops.push(
      `${fmt(cp1X)} ${toPdfY(cp1Y)} ${fmt(cp2X)} ${toPdfY(cp2Y)} ${fmt(endX)} ${toPdfY(curveEndY)} c S`,
    );

    // Solid black arrowhead pointing vertically down into (endX, endY)
    ops.push(`${fmt(endX)} ${toPdfY(endY)} m`);
    ops.push(`${fmt(endX - arrowHalfW)} ${toPdfY(endY - arrowLen)} l`);
    ops.push(`${fmt(endX + arrowHalfW)} ${toPdfY(endY - arrowLen)} l`);
    ops.push('h f');

    // 5-Line Edge Transform Metadata Block
    const metaLines = [
      `Broadcaster: ${node.broadcaster}`,
      `Average rate: ${node.averageRate}`,
      `Buffer length: ${node.bufferLength}`,
      `Most recent transform: ${node.mostRecentTransform}`,
      `Oldest transform: ${node.oldestTransform}`,
    ];

    const textBlockTopY = startY + 25;
    const lineStep = 10.6;
    const fontSize = 9.2;

    // White halo pad behind the 5-line metadata block so curve strokes never cut across text
    const padWidth = 178;
    const padHeight = metaLines.length * lineStep + 4;
    const padLeftX = isNearlyVertical ? endX + 3 : endX - padWidth / 2;
    const padBottomPdfY = toPdfY(textBlockTopY + padHeight - 8);
    ops.push('1 1 1 rg');
    ops.push(
      `${fmt(padLeftX)} ${fmt(padBottomPdfY)} ${fmt(padWidth)} ${fmt(padHeight)} re f`,
    );
    ops.push('0 0 0 rg');

    metaLines.forEach((lineStr, idx) => {
      const lineY = textBlockTopY + idx * lineStep;
      if (isNearlyVertical) {
        drawLeftText(lineStr, endX + 6, lineY, fontSize);
      } else {
        drawCenteredText(lineStr, endX, lineY, fontSize);
      }
    });
  }

  // 4. Draw Link Ellipses & Centered Link Names
  ops.push('1.05 w');
  for (const node of layout.nodes) {
    drawEllipse(node.x, node.y, node.rx, node.ry);
    drawCenteredText(node.linkName, node.x, node.y + 3.5, 10.5);
  }

  const contentStream = ops.join('\n');

  // Assemble standard PDF-1.4 objects with exact byte offsets
  const objects: string[] = [
    // 1: Catalog
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    // 2: Pages
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    // 3: Page
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 ${W} ${H}] /Contents 5 0 R >>\nendobj\n`,
    // 4: Font (Standard Type1 Times-Roman)
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>\nendobj\n',
    // 5: Content Stream
    `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  let pdfStr = '%PDF-1.4\n';
  const offsets: number[] = [0]; // index 0 is free object

  for (const obj of objects) {
    offsets.push(pdfStr.length);
    pdfStr += obj;
  }

  const xrefOffset = pdfStr.length;
  pdfStr += `xref\n0 ${objects.length + 1}\n`;
  pdfStr += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    const offStr = String(offsets[i]).padStart(10, '0');
    pdfStr += `${offStr} 00000 n \n`;
  }

  pdfStr += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdfStr += `startxref\n${xrefOffset}\n%%EOF\n`;

  const encoder = new TextEncoder();
  return encoder.encode(pdfStr);
}

/**
 * Formats a timestamped filename matching `ros2 run tf2_tools view_frames`:
 * e.g. `frames_2026-11-13_10.13.15.pdf`
 */
export function getViewFramesPdfFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `frames_${yyyy}-${mm}-${dd}_${hh}.${min}.${ss}.pdf`;
}

/**
 * Triggers a browser download of the generated `view_frames` PDF.
 */
export function downloadViewFramesPdf(model: ParsedUrdfModel): string {
  const pdfBytes = generateViewFramesPdfBytes(model);
  const filename = getViewFramesPdfFilename();
  const blob = new Blob([pdfBytes as unknown as BlobPart], {
    type: 'application/pdf',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return filename;
}
