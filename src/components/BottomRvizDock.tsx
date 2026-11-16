import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Layers,
  Sliders,
  RotateCcw,
  Shuffle,
  Eye,
  ShieldAlert,
  Axis3d,
  Compass,
  Scale,
  BoxSelect,
  Grid,
} from 'lucide-react';
import { ParsedUrdfModel, UrdfJoint, ViewportLayers } from '../urdf/types';
import { resolveMimicJointValues } from '../urdf/urdfCompiler';

interface BottomRvizDockProps {
  model: ParsedUrdfModel;
  layers: ViewportLayers;
  onToggleLayer: (key: keyof ViewportLayers) => void;
  jointValues: Record<string, number>;
  onChangeJointValue: (jointName: string, value: number) => void;
  onZeroJoints: () => void;
  onRandomizeJoints: () => void;
  onSelectJoint: (jointName: string) => void;
}

export const BottomRvizDock: React.FC<BottomRvizDockProps> = ({
  model,
  layers,
  onToggleLayer,
  jointValues,
  onChangeJointValue,
  onZeroJoints,
  onRandomizeJoints,
  onSelectJoint,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'layers' | 'joints'>('layers');
  const [angleUnit, setAngleUnit] = useState<'rad' | 'deg'>('rad');

  const movableJoints: UrdfJoint[] = (
    Object.values(model.joints) as UrdfJoint[]
  ).filter(
    (j) =>
      j.type === 'revolute' ||
      j.type === 'continuous' ||
      j.type === 'prismatic',
  );

  const effectiveJointValues = resolveMimicJointValues(model, jointValues);

  const layerItems: {
    key: keyof ViewportLayers;
    label: string;
    icon: React.ReactNode;
    accentClass: string;
  }[] = [
    {
      key: 'visual',
      label: 'Visual Mesh',
      icon: <Eye className="w-3.5 h-3.5" />,
      accentClass: 'border-sky-500/50 bg-sky-500/15 text-sky-300',
    },
    {
      key: 'collision',
      label: 'Collision Hull',
      icon: <ShieldAlert className="w-3.5 h-3.5" />,
      accentClass: 'border-amber-500/50 bg-amber-500/15 text-amber-300',
    },
    {
      key: 'tfFrames',
      label: 'TF Axes (RGB)',
      icon: <Axis3d className="w-3.5 h-3.5" />,
      accentClass: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300',
    },
    {
      key: 'jointAxes',
      label: 'Joint Vectors',
      icon: <Compass className="w-3.5 h-3.5" />,
      accentClass: 'border-yellow-500/50 bg-yellow-500/15 text-yellow-300',
    },
    {
      key: 'centerOfMass',
      label: 'Center of Mass',
      icon: <Scale className="w-3.5 h-3.5" />,
      accentClass: 'border-pink-500/50 bg-pink-500/15 text-pink-300',
    },
    {
      key: 'inertiaBoxes',
      label: 'Inertia Tensor',
      icon: <BoxSelect className="w-3.5 h-3.5" />,
      accentClass: 'border-purple-500/50 bg-purple-500/15 text-purple-300',
    },
    {
      key: 'wireframeVisual',
      label: 'Wireframe Mode',
      icon: <Layers className="w-3.5 h-3.5" />,
      accentClass: 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300',
    },
    {
      key: 'grid',
      label: 'Z-Up Grid',
      icon: <Grid className="w-3.5 h-3.5" />,
      accentClass: 'border-slate-400/50 bg-slate-700/60 text-slate-200',
    },
  ];

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 w-[min(920px,95%)] pointer-events-auto">
      {/* Top Collapse / Tab Header Bar */}
      <div className="flex items-center justify-between gap-2 bg-[#111827] border border-[#26334d] rounded-t-lg px-3 py-1.5 shadow-lg overflow-x-auto">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab('layers');
              setCollapsed(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'layers' && !collapsed
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>RViz Overlays</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('joints');
              setCollapsed(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'joints' && !collapsed
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Joint Sliders ({movableJoints.length} DOF)</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {activeTab === 'joints' && !collapsed && movableJoints.length > 0 && (
            <>
              <button
                type="button"
                onClick={() =>
                  setAngleUnit((u) => (u === 'rad' ? 'deg' : 'rad'))
                }
                className="px-2 py-1 text-xs font-mono text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded whitespace-nowrap shrink-0"
              >
                {angleUnit.toUpperCase()}
              </button>
              <button
                type="button"
                onClick={onZeroJoints}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Zero</span>
              </button>
              <button
                type="button"
                onClick={onRandomizeJoints}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-sky-300 hover:text-sky-200 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 rounded whitespace-nowrap shrink-0"
              >
                <Shuffle className="w-3 h-3" />
                <span>Randomize</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand RViz Dock' : 'Collapse RViz Dock'}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-400 hover:text-white rounded transition-colors whitespace-nowrap shrink-0"
          >
            {collapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Show</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Hide</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Body */}
      {!collapsed && (
        <div className="bg-[#111827] border-x border-b border-[#26334d] rounded-b-lg p-3 shadow-xl">
          {activeTab === 'layers' ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {layerItems.map((item) => {
                const active = layers[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onToggleLayer(item.key)}
                    aria-pressed={active}
                    className={`flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? item.accentClass
                        : 'border-[#26334d] bg-[#161f30] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {item.icon}
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="font-mono text-[11px] uppercase">
                      {active ? 'ON' : 'OFF'}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : movableJoints.length === 0 ? (
            <div className="py-4 text-center text-xs text-slate-400">
              No movable joints (revolute, continuous, or prismatic) found in
              the compiled URDF model.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 max-h-40 overflow-y-auto pr-1">
              {movableJoints.map((j) => {
                const val = effectiveJointValues[j.name] ?? 0;
                const min = j.type === 'continuous' ? -Math.PI : j.limit.lower;
                const max = j.type === 'continuous' ? Math.PI : j.limit.upper;
                const isPrismatic = j.type === 'prismatic';
                const displayVal = isPrismatic
                  ? `${val.toFixed(3)} m`
                  : angleUnit === 'deg'
                    ? `${((val * 180) / Math.PI).toFixed(1)}°`
                    : `${val.toFixed(2)} rad`;

                const mimicInfo =
                  j.mimic ||
                  (j.name === 'right_finger_joint' &&
                  model.joints.left_finger_joint
                    ? {
                        joint: 'left_finger_joint',
                        multiplier: 1,
                        offset: 0,
                        line: j.line,
                      }
                    : undefined);

                return (
                  <div
                    key={j.name}
                    className={`flex items-center gap-2.5 bg-[#161f30] border rounded-md px-2.5 py-1.5 ${
                      mimicInfo ? 'border-sky-500/40' : 'border-[#26334d]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectJoint(j.name)}
                      className="flex items-center gap-1.5 text-left text-xs font-mono text-slate-200 hover:text-sky-300 w-44 shrink-0"
                      title={
                        mimicInfo
                          ? `${j.name} mimics ${mimicInfo.joint} (×${mimicInfo.multiplier} + ${mimicInfo.offset})`
                          : `Jump to ${j.name} (${j.type})`
                      }
                    >
                      <span className="truncate">{j.name}</span>
                      {mimicInfo && (
                        <span className="text-[10px] text-sky-400 shrink-0">
                          [mimic]
                        </span>
                      )}
                    </button>

                    <input
                      type="range"
                      aria-label={`Joint ${j.name} position`}
                      min={min}
                      max={max}
                      step={isPrismatic ? 0.001 : 0.01}
                      value={val}
                      onChange={(e) =>
                        onChangeJointValue(j.name, parseFloat(e.target.value))
                      }
                      className="w-full accent-sky-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                    />

                    <span className="text-xs font-mono tabular-nums text-sky-300 w-20 text-right shrink-0">
                      {displayVal}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
