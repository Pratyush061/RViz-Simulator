import React, { useMemo } from 'react';
import { Download, FileText, X } from 'lucide-react';
import { ParsedUrdfModel } from '../urdf/types';
import {
  buildViewFramesLayout,
  downloadViewFramesPdf,
} from '../urdf/viewFramesPdf';

interface ViewFramesModalProps {
  open: boolean;
  onClose: () => void;
  model: ParsedUrdfModel;
}

export const ViewFramesModal: React.FC<ViewFramesModalProps> = ({
  open,
  onClose,
  model,
}) => {
  const layout = useMemo(() => buildViewFramesLayout(model), [model, open]);

  if (!open) return null;

  const hb = layout.headerBox;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ROS2 tf2_tools view_frames Result"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
    >
      <div className="flex flex-col w-[min(1180px,96vw)] max-h-[90vh] bg-[#111827] border border-[#26334d] rounded-xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-3 bg-[#161f30] border-b border-[#26334d] shrink-0">
          <div className="flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-sky-400" />
            <div>
              <h2 className="text-sm font-semibold text-white">
                ros2 run tf2_tools view_frames — Kinematic TF Tree Diagram
              </h2>
              <p className="text-xs text-slate-400">
                Vector PDF &amp; Graphviz-style TF tree generated from{' '}
                <span className="font-mono text-sky-300">
                  {model.robotName || 'robot'}.urdf
                </span>{' '}
                ({layout.nodes.length} link frames)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => downloadViewFramesPdf(model)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download view_frames PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close view_frames modal"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Vector Diagram Canvas (Authentic White Paper Graphviz Style) */}
        <div className="flex-1 overflow-auto bg-slate-200 p-5">
          <div className="bg-white shadow-xl border border-slate-300 rounded p-3 mx-auto w-full">
            <svg
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              style={{
                fontFamily: '"Times New Roman", Times, Georgia, serif',
              }}
              className="block w-full h-auto max-h-[74vh] bg-white text-black"
            >
              {/* Top Header Box: view_frames Result */}
              <rect
                x={hb.x}
                y={hb.y}
                width={hb.width}
                height={hb.height}
                fill="#ffffff"
                stroke="#000000"
                strokeWidth={1.3}
              />
              <text
                x={hb.x + hb.width / 2}
                y={hb.y + 19}
                textAnchor="middle"
                fontSize={11.5}
                fill="#000000"
              >
                view_frames Result
              </text>
              <text
                x={hb.x + hb.width / 2}
                y={hb.y + 37}
                textAnchor="middle"
                fontSize={10.5}
                fill="#000000"
              >
                Recorded at time: {layout.recordedAtTime}
              </text>

              {/* Directed Joint Edges & 5-Line TF Broadcaster Annotations */}
              {layout.nodes.map((node) => {
                if (
                  node.parentX === undefined ||
                  node.parentY === undefined ||
                  node.parentRy === undefined
                ) {
                  return null;
                }

                const startX = node.parentX;
                const startY = node.parentY + node.parentRy;
                const endX = node.x;
                const endY = node.y - node.ry;
                const arrowLen = 8;
                const arrowHalfW = 3.4;

                const dx = endX - startX;
                const isNearlyVertical = Math.abs(dx) < 8;

                const cp1X = isNearlyVertical ? startX : startX + dx * 0.85;
                const cp1Y = isNearlyVertical
                  ? startY + (endY - startY) * 0.35
                  : startY + 14;
                const cp2X = endX;
                const cp2Y = startY + (endY - startY) * 0.55;
                const curveEndY = endY - arrowLen;

                const metaLines = [
                  `Broadcaster: ${node.broadcaster}`,
                  `Average rate: ${node.averageRate}`,
                  `Buffer length: ${node.bufferLength}`,
                  `Most recent transform: ${node.mostRecentTransform}`,
                  `Oldest transform: ${node.oldestTransform}`,
                ];

                const textBlockTopY = startY + 25;
                const lineStep = 11;
                const padW = 182;
                const padH = metaLines.length * lineStep + 4;
                const padX = isNearlyVertical ? endX + 3 : endX - padW / 2;

                return (
                  <g key={`edge-${node.linkName}`}>
                    <path
                      d={`M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${curveEndY}`}
                      fill="none"
                      stroke="#000000"
                      strokeWidth={1.05}
                    />
                    <polygon
                      points={`${endX},${endY} ${endX - arrowHalfW},${endY - arrowLen} ${endX + arrowHalfW},${endY - arrowLen}`}
                      fill="#000000"
                    />
                    <rect
                      x={padX}
                      y={textBlockTopY - 10}
                      width={padW}
                      height={padH}
                      fill="#ffffff"
                    />
                    {metaLines.map((lineStr, idx) => (
                      <text
                        key={idx}
                        x={isNearlyVertical ? endX + 6 : endX}
                        y={textBlockTopY + idx * lineStep}
                        textAnchor={isNearlyVertical ? 'start' : 'middle'}
                        fontSize={9.6}
                        fill="#000000"
                      >
                        {lineStr}
                      </text>
                    ))}
                  </g>
                );
              })}

              {/* Link Ellipse Nodes */}
              {layout.nodes.map((node) => (
                <g key={`node-${node.linkName}`}>
                  <ellipse
                    cx={node.x}
                    cy={node.y}
                    rx={node.rx}
                    ry={node.ry}
                    fill="#ffffff"
                    stroke="#000000"
                    strokeWidth={1.15}
                  />
                  <text
                    x={node.x}
                    y={node.y + 4}
                    textAnchor="middle"
                    fontSize={11}
                    fill="#000000"
                  >
                    {node.linkName}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
