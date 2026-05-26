import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import { testerApi } from '../api';
import { Lecture } from '../types';

interface ZhukovodstvoPageProps {
  user: any;
  onLogout: () => void;
}

interface SkillNode {
  id: number;
  title: string;
  area: string;
  order: number;
  row: number;
  col: number;
  requires?: number[];
  status: 'locked' | 'active' | 'passed';
  score?: number;
  color: string;
}

const SKILL_COLORS: Record<string, string> = {
  HTML: '#1D9E75',
  CSS: '#7F77DD',
  DevTools: '#EF9F27',
  Browser: '#EF9F27',
  Responsive: '#7F77DD',
  Network: '#1D9E75',
  JavaScript: '#EF9F27',
  Bug: '#1D9E75',
  Advanced: '#e05252',
};

function getSkillColor(area: string): string {
  for (const key of Object.keys(SKILL_COLORS)) {
    if (area.includes(key)) return SKILL_COLORS[key];
  }
  return '#7F77DD';
}

// Predefined layout for the skill tree (row, col positions)
const TREE_LAYOUT: Record<number, { row: number; col: number }> = {
  1: { row: 0, col: 2 }, // HTML Basics — center top
  2: { row: 1, col: 1 }, // CSS Fundamentals — left
  3: { row: 1, col: 3 }, // DevTools — right
  4: { row: 2, col: 2 }, // Console — center
  5: { row: 2, col: 0 }, // Responsive — far left
  6: { row: 2, col: 4 }, // CSS Debugging — far right
  7: { row: 3, col: 3 }, // Network — right
  8: { row: 3, col: 1 }, // JavaScript — left
  9: { row: 4, col: 2 }, // Bug Reporting — center
  10: { row: 5, col: 2 }, // Advanced — bottom
};

const CONNECTIONS: [number, number][] = [
  [1, 2], [1, 3], [1, 4],
  [2, 5], [2, 6],
  [3, 4], [3, 7],
  [4, 8],
  [5, 9], [6, 9], [7, 9], [8, 9],
  [9, 10],
];

export default function ZhukovodstvoPage({ user, onLogout }: ZhukovodstvoPageProps) {
  const navigate = useNavigate();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [selected, setSelected] = useState<SkillNode | null>(null);

  useEffect(() => {
    if (user.role === 'tester') {
      testerApi.getLectures().then(r => setLectures(r.data)).catch(() => {});
    }
  }, []);

  const nodes: SkillNode[] = lectures.length > 0
    ? lectures.map(l => ({
        id: l.id,
        title: l.title,
        area: l.skill_area,
        order: l.order_num,
        row: TREE_LAYOUT[l.order_num]?.row ?? 0,
        col: TREE_LAYOUT[l.order_num]?.col ?? 0,
        status: l.status,
        score: l.score,
        color: getSkillColor(l.skill_area),
      }))
    : [
        { id: 1, title: 'HTML Basics', area: 'HTML', order: 1, row: 0, col: 2, status: 'active', color: '#1D9E75' },
        { id: 2, title: 'CSS Fundamentals', area: 'CSS', order: 2, row: 1, col: 1, status: 'locked', color: '#7F77DD' },
        { id: 3, title: 'DevTools', area: 'DevTools', order: 3, row: 1, col: 3, status: 'locked', color: '#EF9F27' },
        { id: 4, title: 'Console & Errors', area: 'Browser', order: 4, row: 2, col: 2, status: 'locked', color: '#EF9F27' },
        { id: 5, title: 'Responsive Design', area: 'Responsive', order: 5, row: 2, col: 0, status: 'locked', color: '#7F77DD' },
        { id: 6, title: 'CSS Debugging', area: 'CSS', order: 6, row: 2, col: 4, status: 'locked', color: '#7F77DD' },
        { id: 7, title: 'Network Tab', area: 'Network', order: 7, row: 3, col: 3, status: 'locked', color: '#1D9E75' },
        { id: 8, title: 'JS for QA', area: 'JavaScript', order: 8, row: 3, col: 1, status: 'locked', color: '#EF9F27' },
        { id: 9, title: 'Bug Reporting', area: 'Bug', order: 9, row: 4, col: 2, status: 'locked', color: '#1D9E75' },
        { id: 10, title: 'Advanced Testing', area: 'Advanced', order: 10, row: 5, col: 2, status: 'locked', color: '#e05252' },
      ];

  const COLS = 5;
  const ROWS = 6;
  const NODE_W = 110;
  const NODE_H = 56;
  const GAP_X = 140;
  const GAP_Y = 100;
  const PAD_X = 60;
  const PAD_Y = 40;

  const svgW = COLS * GAP_X + PAD_X * 2;
  const svgH = ROWS * GAP_Y + PAD_Y * 2;

  const getNodeXY = (node: SkillNode) => ({
    x: PAD_X + node.col * GAP_X,
    y: PAD_Y + node.row * GAP_Y,
  });

  const getNodeById = (id: number) => nodes.find(n => n.order === id);

  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-6 py-8 fade-in">
        {/* Header */}
        <div className="mb-8">
          <h1
            className="font-pixel text-primary mb-2"
            style={{ fontSize: '0.8rem', lineHeight: 1.8 }}
          >
            🗺️ Жуководство
          </h1>
          <p className="text-pixel/50 text-sm font-sans">
            Дерево навыков QA-тестировщика
          </p>
        </div>

        {/* Legend */}
        <div className="flex gap-6 mb-6 flex-wrap">
          {[
            { color: '#1D9E75', label: 'Пройдено' },
            { color: '#EF9F27', label: 'Доступно' },
            { color: 'rgba(232,232,208,0.15)', label: 'Закрыто' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{
                  background: item.color,
                  boxShadow: `1px 0 0 0 ${item.color}, -1px 0 0 0 ${item.color}, 0 1px 0 0 ${item.color}, 0 -1px 0 0 ${item.color}`,
                }}
              />
              <span className="text-pixel/50 text-xs font-sans">{item.label}</span>
            </div>
          ))}
        </div>

        {/* Skill tree SVG */}
        <div
          className="rounded p-4 overflow-x-auto"
          style={{
            background: '#1a1a2e',
            boxShadow: '2px 0 0 0 #1D9E75, -2px 0 0 0 #1D9E75, 0 2px 0 0 #1D9E75, 0 -2px 0 0 #1D9E75',
          }}
        >
          <svg
            width={svgW}
            height={svgH}
            viewBox={`0 0 ${svgW} ${svgH}`}
            style={{ display: 'block', minWidth: svgW }}
          >
            {/* Connections */}
            {CONNECTIONS.map(([fromOrder, toOrder]) => {
              const from = getNodeById(fromOrder);
              const to = getNodeById(toOrder);
              if (!from || !to) return null;
              const fp = getNodeXY(from);
              const tp = getNodeXY(to);
              const fromPassed = from.status === 'passed';
              return (
                <line
                  key={`${fromOrder}-${toOrder}`}
                  x1={fp.x + NODE_W / 2}
                  y1={fp.y + NODE_H}
                  x2={tp.x + NODE_W / 2}
                  y2={tp.y}
                  stroke={fromPassed ? '#1D9E75' : 'rgba(232,232,208,0.1)'}
                  strokeWidth={fromPassed ? 2 : 1}
                  strokeDasharray={fromPassed ? 'none' : '4,4'}
                />
              );
            })}

            {/* Nodes */}
            {nodes.map(node => {
              const { x, y } = getNodeXY(node);
              const isPassed = node.status === 'passed';
              const isActive = node.status === 'active';
              const isLocked = node.status === 'locked';
              const bgColor = isPassed ? node.color : isActive ? '#EF9F27' : '#0f0f1a';
              const textColor = (isPassed || isActive) ? '#0f0f1a' : 'rgba(232,232,208,0.3)';
              const borderColor = isPassed ? node.color : isActive ? '#EF9F27' : 'rgba(232,232,208,0.1)';

              return (
                <g
                  key={node.id}
                  onClick={() => setSelected(node)}
                  style={{ cursor: isLocked ? 'default' : 'pointer' }}
                >
                  {/* Node bg */}
                  <rect
                    x={x}
                    y={y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={2}
                    fill={bgColor}
                    stroke={borderColor}
                    strokeWidth={2}
                  />
                  {/* Glow for active */}
                  {isActive && (
                    <rect
                      x={x - 2}
                      y={y - 2}
                      width={NODE_W + 4}
                      height={NODE_H + 4}
                      rx={3}
                      fill="none"
                      stroke="#EF9F27"
                      strokeWidth={1}
                      opacity={0.4}
                    />
                  )}

                  {/* Lock icon */}
                  {isLocked && (
                    <text x={x + 8} y={y + 20} fill="rgba(232,232,208,0.2)" fontSize={12}>
                      🔒
                    </text>
                  )}

                  {/* Check mark */}
                  {isPassed && (
                    <text x={x + 6} y={y + 20} fill="#0f0f1a" fontSize={12} fontWeight="bold">
                      ✓
                    </text>
                  )}

                  {/* Title */}
                  <text
                    x={x + (isLocked ? 26 : isPassed ? 26 : 8)}
                    y={y + 20}
                    fill={textColor}
                    fontSize={8}
                    fontFamily="Inter, sans-serif"
                    fontWeight="600"
                  >
                    {node.title.length > 14 ? node.title.slice(0, 13) + '…' : node.title}
                  </text>

                  {/* Area tag */}
                  <text
                    x={x + 8}
                    y={y + 36}
                    fill={isPassed || isActive ? 'rgba(15,15,26,0.7)' : 'rgba(232,232,208,0.2)'}
                    fontSize={7}
                    fontFamily="Inter, sans-serif"
                  >
                    {node.area}
                  </text>

                  {/* Score */}
                  {isPassed && node.score != null && (
                    <text
                      x={x + NODE_W - 8}
                      y={y + 36}
                      fill="rgba(15,15,26,0.7)"
                      fontSize={7}
                      fontFamily="Inter, sans-serif"
                      textAnchor="end"
                    >
                      {Math.round(node.score)}%
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected node detail panel */}
        {selected && (
          <div
            className="mt-6 p-5 rounded"
            style={{
              background: '#1a1a2e',
              boxShadow: `2px 0 0 0 ${selected.color}, -2px 0 0 0 ${selected.color}, 0 2px 0 0 ${selected.color}, 0 -2px 0 0 ${selected.color}`,
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p
                  className="font-pixel mb-1"
                  style={{ color: selected.color, fontSize: '0.6rem', lineHeight: 1.8 }}
                >
                  {selected.title}
                </p>
                <p className="text-pixel/50 text-xs font-sans">{selected.area}</p>
              </div>
              <div className="flex gap-2 items-center">
                {selected.status === 'passed' && (
                  <span className="badge-passed">сдан · {Math.round(selected.score || 0)}%</span>
                )}
                {selected.status === 'active' && (
                  <button
                    onClick={() => {
                      const lec = lectures.find(l => l.order_num === selected.order);
                      if (lec) navigate(`/lecture/${lec.id}/quiz`);
                    }}
                    className="btn-amber text-xs px-3 py-1"
                  >
                    Начать →
                  </button>
                )}
                {selected.status === 'locked' && (
                  <span className="badge-locked">🔒 закрыт</span>
                )}
                <button
                  onClick={() => setSelected(null)}
                  className="text-pixel/30 hover:text-pixel text-lg cursor-pointer"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Skill areas legend */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(SKILL_COLORS).slice(0, 8).map(([area, color]) => (
            <div
              key={area}
              className="px-3 py-2 rounded flex items-center gap-2"
              style={{
                background: `${color}10`,
                boxShadow: `1px 0 0 0 ${color}40, -1px 0 0 0 ${color}40, 0 1px 0 0 ${color}40, 0 -1px 0 0 ${color}40`,
              }}
            >
              <div className="w-2 h-2 rounded" style={{ background: color }} />
              <span className="text-pixel/60 text-xs font-sans">{area}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
