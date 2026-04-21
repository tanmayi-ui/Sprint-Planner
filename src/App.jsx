import React, { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const STATUS_CONFIG = {
  backlog:       { label: 'Backlog',      color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  todo:          { label: 'To do',        color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  'in-progress': { label: 'In progress',  color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  review:        { label: 'Review',       color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  },
  blocked:       { label: 'Blocked',      color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  done:          { label: 'Done',         color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
};
const STATUS_ORDER = Object.keys(STATUS_CONFIG);
const PRIORITY_CONFIG = {
  high: { color: '#ef4444' }, medium: { color: '#f59e0b' }, low: { color: '#94a3b8' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractId(url) { return url.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1]; }
function normalize(str) { return (str || '').toLowerCase().trim(); }
function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('');
}
function parseOwners(ownerStr) {
  if (!ownerStr) return [];
  return ownerStr.split(',').map(s => s.trim()).filter(Boolean);
}
function mapRow(row, headers, i) {
  const obj = { id: i, status: 'backlog', priority: 'medium', sprint: 1 };
  headers.forEach((h, idx) => {
    const key = normalize(h); const val = row[idx] || '';
    if      (key.includes('project'))                                   obj.project     = val;
    else if (key.includes('task') || key === 'name' || key === 'title') obj.task        = val;
    else if (key.includes('desc'))                                       obj.description = val;
    else if (key.includes('owner') || key.includes('assign'))           obj.owner       = val;
    else if (key.includes('status'))   obj.status   = normalize(val).replace(/\s+/g, '-') || 'backlog';
    else if (key.includes('priority')) obj.priority = normalize(val) || 'medium';
    else if (key.includes('due') || key.includes('date')) obj.dueDate = val;
    // remarks = any column containing 'remark', 'note', 'comment', 'tag', 'label'
    else if (key.includes('remark') || key.includes('note') || key.includes('comment') ||
             key.includes('tag')    || key.includes('label')) obj.remarks = val;
    else if (key.includes('sprint')) obj.sprint = parseInt(val) || 1;
  });
  if (!obj.task) obj.task = obj.project || `Task ${i + 1}`;
  return obj;
}

// ── Date helpers ──────────────────────────────────────────────────────────────
const TODAY = new Date();
function getMonday(d) {
  const dt = new Date(d); const day = dt.getDay();
  dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day));
  dt.setHours(0, 0, 0, 0); return dt;
}
function addDays(d, n) { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt; }
function fmtDate(d) { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
function fmtShort(d) { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }

function getSprintDates(sprintNum, allTasks) {
  const SPRINT_DURATION = 14;
  const sprint1Tasks = allTasks.filter(t => (t.sprint || 1) === 1 && t.dueDate);
  let anchor;
  if (sprint1Tasks.length > 0) {
    const dates = sprint1Tasks.map(t => new Date(t.dueDate)).filter(d => !isNaN(d)).sort((a, b) => a - b);
    if (dates.length > 0) anchor = getMonday(dates[0]);
  }
  if (!anchor) {
    const allSprints = [...new Set(allTasks.map(t => t.sprint || 1))].sort((a, b) => a - b);
    const maxSprint  = allSprints.length > 0 ? Math.max(...allSprints) : 1;
    anchor = addDays(getMonday(TODAY), -(maxSprint - 1) * SPRINT_DURATION);
  }
  const start = addDays(anchor, (sprintNum - 1) * SPRINT_DURATION);
  const end   = addDays(start, SPRINT_DURATION - 1);
  return { start, end };
}

// ── Sheet write-back (no-cors GET) ────────────────────────────────────────────
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwToadtXh722rrfwRg-dBrxRIZlXtriSQi56GqDpqL3u_RCQnDBA8pKNgsr_Ac7gCg/exec';

async function writeToSheet(action, sheetId, sheetName, rowIndex, data) {
  if (!APPS_SCRIPT_URL) return { ok: false };
  try {
    const payload = encodeURIComponent(JSON.stringify({ action, sheetId, sheetName, rowIndex, data }));
    await fetch(`${APPS_SCRIPT_URL}?p=${payload}`, { method: 'GET', mode: 'no-cors' });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// ── Sample data ───────────────────────────────────────────────────────────────
const SAMPLE_DATA = [
  { id:0,  sprint:1, project:'Website Redesign', task:'Wireframe homepage',   description:'Create lo-fi wireframes', owner:'Alex M',          status:'done',        priority:'high',   dueDate:'2025-04-05', remarks:'Approved by design lead'         },
  { id:1,  sprint:1, project:'Website Redesign', task:'Design system tokens', description:'Set up color & type',     owner:'Priya S',         status:'in-progress', priority:'high',   dueDate:'2025-04-12', remarks:'Blocked on brand guide sign-off'  },
  { id:2,  sprint:1, project:'Website Redesign', task:'Component library',    description:'Build React components',  owner:'Priya S, Alex M', status:'todo',        priority:'medium', dueDate:'2025-04-20', remarks:''                                 },
  { id:3,  sprint:1, project:'Website Redesign', task:'SEO audit',            description:'Audit meta tags',         owner:'Jordan K',        status:'backlog',     priority:'low',    dueDate:'',           remarks:'Needs SEO tool access first'      },
  { id:4,  sprint:2, project:'Mobile App',       task:'Auth flow',            description:'Login & signup screens',  owner:'Alex M',          status:'review',      priority:'high',   dueDate:'2025-04-08', remarks:'PR open, awaiting 2 reviews'      },
  { id:5,  sprint:2, project:'Mobile App',       task:'Push notifications',   description:'Integrate FCM',           owner:'Sam T',           status:'blocked',     priority:'medium', dueDate:'2025-04-15', remarks:'Firebase quota exceeded'          },
  { id:6,  sprint:2, project:'Mobile App',       task:'Offline sync',         description:'Cache for offline',       owner:'Sam T, Jordan K', status:'done',        priority:'low',    dueDate:'',           remarks:''                                 },
  { id:7,  sprint:2, project:'Data Pipeline',    task:'ETL job setup',        description:'Nightly ingestion',       owner:'Jordan K',        status:'done',        priority:'high',   dueDate:'2025-04-01', remarks:'Runs at 2am UTC'                  },
  { id:8,  sprint:3, project:'Data Pipeline',    task:'Dashboard charts',     description:'Build visualizations',    owner:'Priya S',         status:'in-progress', priority:'medium', dueDate:'2025-04-18', remarks:'Recharts + D3 hybrid approach'    },
  { id:9,  sprint:3, project:'Data Pipeline',    task:'Alerting rules',       description:'Anomaly detection',       owner:'Jordan K',        status:'todo',        priority:'medium', dueDate:'2025-04-22', remarks:'Discuss thresholds with data team' },
  { id:10, sprint:3, project:'Mobile App',       task:'Dark mode',            description:'Dark mode toggle',        owner:'Priya S, Sam T',  status:'backlog',     priority:'low',    dueDate:'',           remarks:''                                 },
];

// ── Shared UI atoms ───────────────────────────────────────────────────────────
const btnBase = { padding: '6px 14px', fontSize: 13, borderRadius: 8, cursor: 'pointer', border: '0.5px solid #e2e8f0', background: '#fff', color: '#0f172a' };
const moveBtnStyle = { padding: '2px 8px', fontSize: 11, border: '0.5px solid #e2e8f0', background: '#f8fafc', color: '#64748b', borderRadius: 4, cursor: 'pointer' };

function Avatar({ name, size = 22 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#dbeafe', color: '#1d4ed8',
      fontSize: size * 0.45, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {initials(name)}
    </div>
  );
}
function StatusPill({ status }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.backlog;
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 500, background: c.bg, color: c.color }}>{c.label}</span>;
}
function PriorityDot({ priority }) {
  const c = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, display: 'inline-block', flexShrink: 0 }} />;
}

// ── Remarks chip — reused across all views ────────────────────────────────────
function RemarksChip({ remarks }) {
  if (!remarks) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 5,
      background: '#fefce8', border: '0.5px solid #fde68a',
      borderRadius: 6, padding: '4px 8px', marginTop: 6,
    }}>
      {/* pencil icon */}
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
        <path d="M11.5 2.5a2.121 2.121 0 0 1 3 3L5 15H2v-3L11.5 2.5Z" stroke="#a16207" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
      <span style={{ fontSize: 11, color: '#92400e', lineHeight: 1.5 }}>{remarks}</span>
    </div>
  );
}

// ── New Task Modal ────────────────────────────────────────────────────────────
function NewTaskModal({ onClose, onSave, projectOptions, ownerOptions, currentSprint }) {
  const [form, setForm] = useState({
    task: '', project: projectOptions[0] || '', description: '', owner: '',
    status: 'todo', priority: 'medium', dueDate: '', sprint: currentSprint, remarks: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = async () => {
    if (!form.task.trim()) return;
    setSaving(true); await onSave(form); setSaving(false); onClose();
  };
  const inp = { width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '0.5px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', boxSizing: 'border-box' };
  const lbl = { fontSize: 12, color: '#64748b', marginBottom: 4, display: 'block' };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: 500, maxWidth: '96vw', border: '0.5px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: '#0f172a' }}>New task</span>
          <button onClick={onClose} style={{ ...btnBase, padding: '2px 9px', fontSize: 18, color: '#94a3b8' }}>x</button>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={lbl}>Task name *</label>
            <input style={inp} value={form.task} onChange={e => set('task', e.target.value)} placeholder="Enter task name" autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Project</label>
              <input style={inp} value={form.project} onChange={e => set('project', e.target.value)} list="proj-dl" placeholder="Project name" />
              <datalist id="proj-dl">{projectOptions.map(p => <option key={p} value={p} />)}</datalist>
            </div>
            <div>
              <label style={lbl}>Owner(s) — comma separated</label>
              <input style={inp} value={form.owner} onChange={e => set('owner', e.target.value)} list="own-dl" placeholder="e.g. Alex M, Priya S" />
              <datalist id="own-dl">{ownerOptions.map(o => <option key={o} value={o} />)}</datalist>
            </div>
          </div>
          <div>
            <label style={lbl}>Description</label>
            <textarea style={{ ...inp, resize: 'vertical', minHeight: 52 }} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label style={lbl}>Remarks / Notes</label>
            <textarea style={{ ...inp, resize: 'vertical', minHeight: 52, background: '#fefce8', borderColor: '#fde68a' }}
              value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Any notes, blockers, or context..." />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Status</label>
              <select style={inp} value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
              </select></div>
            <div><label style={lbl}>Priority</label>
              <select style={inp} value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </select></div>
            <div><label style={lbl}>Sprint</label>
              <input style={inp} type="number" min="1" value={form.sprint} onChange={e => set('sprint', parseInt(e.target.value) || 1)} /></div>
            <div><label style={lbl}>Due date</label>
              <input style={inp} type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} /></div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button style={btnBase} onClick={onClose}>Cancel</button>
          <button style={{ ...btnBase, background: '#0f172a', color: '#fff', border: 'none', opacity: saving ? 0.6 : 1 }}
            onClick={handleSave} disabled={saving || !form.task.trim()}>{saving ? 'Saving...' : 'Add task'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Board view ────────────────────────────────────────────────────────────────
function BoardView({ tasks, onSaveBoardChanges }) {
  const [overrides,    setOverrides]    = useState({});
  const [expandedDone, setExpandedDone] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const hasChanges = Object.keys(overrides).length > 0;
  const effectiveStatus = (t) => overrides[t.id] ?? t.status;

  const byStatus = {};
  STATUS_ORDER.forEach(s => (byStatus[s] = []));
  tasks.forEach(t => { const s = effectiveStatus(t); byStatus[STATUS_ORDER.includes(s) ? s : 'backlog'].push(t); });

  const move = (id, dir) => {
    const t       = tasks.find(t => t.id === id);
    const current = effectiveStatus(t);
    const idx     = STATUS_ORDER.indexOf(current);
    const newSt   = STATUS_ORDER[Math.max(0, Math.min(STATUS_ORDER.length - 1, idx + dir))];
    setOverrides(prev => {
      const next = { ...prev };
      if (newSt === t.status) delete next[id]; else next[id] = newSt;
      return next;
    });
  };

  const handleSave = async () => { setSaving(true); await onSaveBoardChanges(overrides); setOverrides({}); setSaving(false); };
  const doneTasks = byStatus['done'] || [];

  return (
    <div>
      {hasChanges && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, background: '#fffbeb', border: '0.5px solid #fcd34d', borderRadius: 10, padding: '10px 16px' }}>
          <span style={{ fontSize: 13, color: '#92400e', flex: 1 }}>{Object.keys(overrides).length} unsaved change{Object.keys(overrides).length !== 1 ? 's' : ''}</span>
          <button style={{ ...btnBase, fontSize: 12, color: '#64748b' }} onClick={() => setOverrides({})}>Discard</button>
          <button style={{ ...btnBase, background: '#0f172a', color: '#fff', border: 'none', fontSize: 12, opacity: saving ? 0.6 : 1 }}
            onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 12 }}>
        {STATUS_ORDER.map(status => {
          const isDone = status === 'done';
          const allItems = byStatus[status] || [];
          const visibleItems = isDone && !expandedDone ? [] : allItems;
          const c = STATUS_CONFIG[status];
          return (
            <div key={status} style={{ background: '#f8fafc', borderRadius: 12, padding: 12, border: '0.5px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, display: 'inline-block' }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: c.color }}>{c.label}</span>
                </div>
                <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: '#fff', color: '#64748b', border: '0.5px solid #e2e8f0' }}>{allItems.length}</span>
              </div>
              {visibleItems.map(p => {
                const changed = overrides[p.id] !== undefined;
                return (
                  <div key={p.id} style={{ background: '#fff', border: `0.5px solid ${changed ? '#fcd34d' : '#e2e8f0'}`, borderRadius: 8, padding: 10, marginBottom: 8, outline: changed ? '2px solid #fef9c3' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{p.task}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {changed && <span style={{ fontSize: 10, color: '#92400e', background: '#fef9c3', padding: '1px 5px', borderRadius: 4 }}>edited</span>}
                        <PriorityDot priority={p.priority} />
                      </div>
                    </div>
                    {p.project     && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>{p.project}</div>}
                    {p.description && <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, lineHeight: 1.5 }}>{p.description}</div>}
                    {/* REMARKS in board card */}
                    <RemarksChip remarks={p.remarks} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: p.remarks ? 6 : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b' }}>
                        <Avatar name={parseOwners(p.owner)[0] || ''} size={20} />{p.owner || '-'}
                      </div>
                      {p.dueDate && <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.dueDate}</span>}
                    </div>
                    {!isDone && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                        <button onClick={() => move(p.id, -1)} style={moveBtnStyle}>Back</button>
                        <button onClick={() => move(p.id,  1)} style={moveBtnStyle}>Forward</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {isDone && doneTasks.length > 0 && (
                <button onClick={() => setExpandedDone(e => !e)}
                  style={{ width: '100%', padding: '6px', fontSize: 12, cursor: 'pointer', border: '0.5px dashed #cbd5e1', borderRadius: 8, background: 'transparent', color: '#94a3b8', marginTop: 4 }}>
                  {expandedDone ? `Hide ${doneTasks.length} done` : `Show ${doneTasks.length} done`}
                </button>
              )}
              {!isDone && allItems.length === 0 && <div style={{ fontSize: 12, color: '#cbd5e1', textAlign: 'center', padding: '16px 0' }}>Empty</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────
function ListView({ tasks }) {
  const [showDone,     setShowDone]     = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const done    = tasks.filter(t => t.status === 'done');
  const visible = showDone ? tasks : tasks.filter(t => t.status !== 'done');
  const col  = (flex) => ({ flex, fontSize: 13, color: '#0f172a' });
  const head = (flex) => ({ flex, fontSize: 12, color: '#64748b', fontWeight: 500 });
  const toggleRow = (id) => setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', padding: '8px 12px', background: '#f8fafc', borderBottom: '0.5px solid #e2e8f0' }}>
        <span style={head(2)}>Task</span>
        <span style={head(1.5)}>Project</span>
        <span style={head(1)}>Owner</span>
        <span style={head(1)}>Status</span>
        <span style={head(0.5)}>Sprint</span>
        <span style={{ ...head(0.6), textAlign: 'right' }}>Due</span>
      </div>
      {visible.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No tasks</div>}
      {visible.map(p => (
        <div key={p.id}>
          <div
            onClick={() => (p.remarks || p.description) && toggleRow(p.id)}
            style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: expandedRows[p.id] ? 'none' : '0.5px solid #f1f5f9',
              opacity: p.status === 'done' ? 0.6 : 1, cursor: (p.remarks || p.description) ? 'pointer' : 'default',
              background: expandedRows[p.id] ? '#fffdf0' : 'transparent' }}>
            <span style={{ ...col(2), display: 'flex', alignItems: 'center', gap: 6 }}>
              <PriorityDot priority={p.priority} />
              {p.task}
              {/* small dot indicator if remarks exist */}
              {p.remarks && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} title="Has remarks" />}
            </span>
            <span style={{ ...col(1.5), color: '#64748b', fontSize: 12 }}>{p.project || '-'}</span>
            <span style={{ ...col(1), fontSize: 12, color: '#64748b' }}>{p.owner || '-'}</span>
            <span style={col(1)}><StatusPill status={p.status} /></span>
            <span style={{ ...col(0.5), fontSize: 12, color: '#94a3b8' }}>S{p.sprint || 1}</span>
            <span style={{ flex: 0.6, textAlign: 'right', fontSize: 12, color: '#94a3b8' }}>{p.dueDate || '-'}</span>
          </div>
          {/* EXPANDED ROW: remarks + description */}
          {expandedRows[p.id] && (
            <div style={{ padding: '0 12px 10px 32px', borderBottom: '0.5px solid #f1f5f9', background: '#fffdf0' }}>
              {p.description && (
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: p.remarks ? 6 : 0, lineHeight: 1.6 }}>{p.description}</div>
              )}
              {p.remarks && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, background: '#fefce8', border: '0.5px solid #fde68a', borderRadius: 6, padding: '5px 10px' }}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                    <path d="M11.5 2.5a2.121 2.121 0 0 1 3 3L5 15H2v-3L11.5 2.5Z" stroke="#a16207" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>{p.remarks}</span>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {done.length > 0 && (
        <div onClick={() => setShowDone(s => !s)} style={{ padding: '10px 12px', cursor: 'pointer', fontSize: 12, color: '#94a3b8', background: '#f8fafc', borderTop: '0.5px solid #e2e8f0', textAlign: 'center' }}>
          {showDone ? `Hide ${done.length} completed` : `Show ${done.length} completed`}
        </div>
      )}
      {visible.some(t => t.remarks || t.description) && (
        <div style={{ padding: '6px 12px', fontSize: 11, color: '#94a3b8', background: '#f8fafc', borderTop: '0.5px solid #f1f5f9', textAlign: 'right' }}>
          Click a row to expand description & remarks
        </div>
      )}
    </div>
  );
}

// ── Summary view ──────────────────────────────────────────────────────────────
function SummaryView({ tasks }) {
  const total = tasks.length, done = tasks.filter(t => t.status === 'done').length;
  const blocked = tasks.filter(t => t.status === 'blocked').length;
  const inProg  = tasks.filter(t => t.status === 'in-progress').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const grouped = tasks.reduce((acc, p) => { const k = p.project || 'Uncategorized'; if (!acc[k]) acc[k] = []; acc[k].push(p); return acc; }, {});
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 12, marginBottom: 24 }}>
        {[{ label:'Total',value:total,color:'#0f172a' },{ label:'Completed',value:done,color:'#10b981' },
          { label:'In progress',value:inProg,color:'#3b82f6' },{ label:'Blocked',value:blocked,color:'#ef4444' },
          { label:'Overall',value:`${pct}%`,color:'#0f172a' }].map(m => (
          <div key={m.label} style={{ background: '#f8fafc', borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>
      {Object.entries(grouped).map(([proj, ptasks]) => {
        const t = ptasks.length, d = ptasks.filter(x => x.status === 'done').length;
        const p = t > 0 ? Math.round((d / t) * 100) : 0;
        const pc = p === 100 ? '#10b981' : p > 50 ? '#3b82f6' : '#f59e0b';
        return (
          <div key={proj} style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#0f172a' }}>{proj}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>{d}/{t} done</span>
                {p === 100 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>Complete</span>}
              </div>
            </div>
            <div style={{ height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ width: `${p}%`, height: '100%', background: pc, borderRadius: 999 }} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {STATUS_ORDER.filter(s => ptasks.some(x => x.status === s)).map(s => {
                const cnt = ptasks.filter(x => x.status === s).length;
                const c = STATUS_CONFIG[s];
                return <span key={s} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: c.bg, color: c.color }}>{c.label}: {cnt}</span>;
              })}
            </div>
            {ptasks.filter(t2 => t2.status !== 'done').map(t2 => (
              <div key={t2.id} style={{ padding: '6px 0', borderBottom: '0.5px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}><PriorityDot priority={t2.priority} />{t2.task}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{t2.owner || ''}</span>
                    <StatusPill status={t2.status} />
                  </span>
                </div>
                {/* REMARKS in summary */}
                {t2.remarks && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, paddingLeft: 13 }}>
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M11.5 2.5a2.121 2.121 0 0 1 3 3L5 15H2v-3L11.5 2.5Z" stroke="#a16207" strokeWidth="1.5" strokeLinejoin="round"/>
                    </svg>
                    <span style={{ fontSize: 11, color: '#92400e', background: '#fefce8', padding: '1px 7px', borderRadius: 4 }}>{t2.remarks}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Owners view ───────────────────────────────────────────────────────────────
function OwnersView({ tasks }) {
  const [expandedOwner, setExpandedOwner] = useState({});
  const ownerMap = {};
  tasks.forEach(t => {
    const owners = parseOwners(t.owner);
    const list   = owners.length > 0 ? owners : ['Unassigned'];
    list.forEach(o => { if (!ownerMap[o]) ownerMap[o] = []; ownerMap[o].push(t); });
  });
  const ownerNames = Object.keys(ownerMap).sort();
  const COLORS = [['#dbeafe','#1d4ed8'],['#fce7f3','#be185d'],['#d1fae5','#065f46'],['#fef3c7','#92400e'],['#ede9fe','#5b21b6'],['#fee2e2','#991b1b']];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
      {ownerNames.map((owner, oi) => {
        const ot = ownerMap[owner];
        const total = ot.length, done = ot.filter(t => t.status === 'done').length;
        const pending = total - done, blocked = ot.filter(t => t.status === 'blocked').length;
        const inProg  = ot.filter(t => t.status === 'in-progress').length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const [bg, fg] = COLORS[oi % COLORS.length];
        const showDone = expandedOwner[owner];
        const nonDone  = ot.filter(t => t.status !== 'done');
        const doneList = ot.filter(t => t.status === 'done');
        return (
          <div key={owner} style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '0.5px solid #e2e8f0', background: '#fafafa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: bg, color: fg, fontSize: 15, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(owner)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{owner}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{total} task{total !== 1 ? 's' : ''}</div>
                </div>
                {blocked > 0 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>{blocked} blocked</span>}
              </div>
              <div style={{ height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#10b981' : '#3b82f6', borderRadius: 999 }} />
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {[{ label:'Done',value:done,color:'#10b981' },{ label:'Pending',value:pending,color:'#f59e0b' },{ label:'In progress',value:inProg,color:'#3b82f6' }].map(m => (
                  <div key={m.label}><div style={{ fontSize: 17, fontWeight: 500, color: m.color }}>{m.value}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>{m.label}</div></div>
                ))}
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={{ fontSize: 17, fontWeight: 500, color: '#0f172a' }}>{pct}%</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>completion</div>
                </div>
              </div>
            </div>
            <div>
              {nonDone.map(t => {
                const sc = STATUS_CONFIG[t.status] || STATUS_CONFIG.backlog;
                const isShared = parseOwners(t.owner).length > 1;
                return (
                  <div key={t.id} style={{ padding: '8px 16px', borderBottom: '0.5px solid #f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.task}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{t.project || ''}{isShared ? ' · shared' : ''}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {t.sprint && <span style={{ fontSize: 11, color: '#94a3b8' }}>S{t.sprint}</span>}
                        <StatusPill status={t.status} />
                      </div>
                    </div>
                    {/* REMARKS in owner card */}
                    {t.remarks && (
                      <div style={{ marginTop: 5, marginLeft: 15 }}>
                        <RemarksChip remarks={t.remarks} />
                      </div>
                    )}
                  </div>
                );
              })}
              {doneList.length > 0 && (
                <>
                  <div onClick={() => setExpandedOwner(e => ({ ...e, [owner]: !e[owner] }))}
                    style={{ padding: '8px 16px', cursor: 'pointer', fontSize: 12, color: '#94a3b8', background: '#f8fafc', textAlign: 'center' }}>
                    {showDone ? `Hide ${doneList.length} done` : `Show ${doneList.length} done`}
                  </div>
                  {showDone && doneList.map(t => (
                    <div key={t.id} style={{ padding: '7px 16px', borderBottom: '0.5px solid #f8fafc', opacity: 0.55 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: '#64748b', flex: 1, textDecoration: 'line-through', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.task}</span>
                      </div>
                      {t.remarks && <div style={{ marginTop: 4, marginLeft: 15 }}><RemarksChip remarks={t.remarks} /></div>}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Sprint view ───────────────────────────────────────────────────────────────
function SprintChartBar({ sprints: sprintList, tasksBySprint }) {
  const canvasRef = useRef(null); const chartRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    const labels = sprintList.map(s => `S${s}`);
    const totals = sprintList.map(s => (tasksBySprint[s] || []).length);
    const dones  = sprintList.map(s => (tasksBySprint[s] || []).filter(t => t.status === 'done').length);
    const last   = sprintList.length - 1;
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: { labels, datasets: [
        { label:'Total', data:totals, backgroundColor:sprintList.map((_,i)=>i===last?'#93c5fd':'#dbeafe'), borderColor:sprintList.map((_,i)=>i===last?'#3b82f6':'#93c5fd'), borderWidth:1, borderRadius:4 },
        { label:'Done',  data:dones,  backgroundColor:sprintList.map((_,i)=>i===last?'#34d399':'#a7f3d0'), borderColor:sprintList.map((_,i)=>i===last?'#10b981':'#6ee7b7'), borderWidth:1, borderRadius:4 },
      ]},
      options: { responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{ callbacks:{ afterLabel:(ctx)=>{ if(ctx.datasetIndex===1){ const t=totals[ctx.dataIndex]; return t>0?`${Math.round((ctx.raw/t)*100)}% done`:''; }}}}},
        scales:{ x:{grid:{display:false},ticks:{font:{size:11},color:'#94a3b8'}}, y:{beginAtZero:true,grid:{color:'rgba(148,163,184,0.12)'},ticks:{font:{size:11},color:'#94a3b8',stepSize:1}} },
      },
    });
    return () => chartRef.current?.destroy();
  }, [sprintList, tasksBySprint]);
  return <div style={{ position:'relative', width:'100%', height:200, marginBottom:24 }}><canvas ref={canvasRef} role="img" aria-label="Sprint completion bar chart" /></div>;
}

function SprintView({ tasks, sprints, currentSprint }) {
  const [selectedSprint, setSelectedSprint] = useState(currentSprint);
  const [showDone,       setShowDone]       = useState(false);

  const tasksBySprint = sprints.reduce((acc, s) => { acc[s] = tasks.filter(t => (t.sprint||1)===s); return acc; }, {});
  const sprintTasks   = tasksBySprint[selectedSprint] || [];
  const total   = sprintTasks.length;
  const done    = sprintTasks.filter(t => t.status === 'done').length;
  const pending = sprintTasks.filter(t => t.status !== 'done' && t.status !== 'backlog').length;
  const blocked = sprintTasks.filter(t => t.status === 'blocked').length;
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0;
  const prevSprint = sprints[sprints.indexOf(selectedSprint) - 1];
  const prevDone   = prevSprint ? (tasksBySprint[prevSprint] || []).filter(t => t.status === 'done').length : null;
  const delta      = prevDone !== null ? done - prevDone : null;
  const nonDone    = sprintTasks.filter(t => t.status !== 'done');
  const doneList   = sprintTasks.filter(t => t.status === 'done');
  const sorted     = [...nonDone].sort((a, b) => ['blocked','in-progress','review','todo','backlog'].indexOf(a.status) - ['blocked','in-progress','review','todo','backlog'].indexOf(b.status));

  const { start: sprintStart, end: sprintEnd } = getSprintDates(selectedSprint, tasks);
  const isCurrentSprint = selectedSprint === currentSprint;
  const todayStr   = fmtDate(TODAY);
  const startStr   = fmtShort(sprintStart);
  const endStr     = fmtShort(sprintEnd);
  const daysLeft   = Math.ceil((sprintEnd - TODAY) / (1000 * 60 * 60 * 24));
  const sprintOver = daysLeft < 0;
  const navBtnStyle = { ...btnBase, padding: '5px 12px', fontSize: 13 };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>Sprint tracker</span>
          <div style={{ fontSize: 12, padding: '3px 10px', borderRadius: 8, background: '#f1f5f9', color: '#64748b' }}>Today: {todayStr}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={navBtnStyle} onClick={() => { const i = sprints.indexOf(selectedSprint); if (i > 0) setSelectedSprint(sprints[i-1]); }}>Prev</button>
          <select value={selectedSprint} onChange={e => setSelectedSprint(parseInt(e.target.value))}
            style={{ padding: '5px 10px', fontSize: 13, borderRadius: 8, border: '0.5px solid #e2e8f0', background: '#fff', color: '#0f172a', fontWeight: 500 }}>
            {sprints.map(s => <option key={s} value={s}>Sprint {s}{s === currentSprint ? ' (current)' : ''}</option>)}
          </select>
          <button style={navBtnStyle} onClick={() => { const i = sprints.indexOf(selectedSprint); if (i < sprints.length-1) setSelectedSprint(sprints[i+1]); }}>Next</button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Sprint {selectedSprint} dates</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{startStr} - {endStr}</div>
          </div>
          {isCurrentSprint && !sprintOver && (
            <div style={{ borderLeft: '0.5px solid #e2e8f0', paddingLeft: 16 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Days remaining</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: daysLeft <= 3 ? '#ef4444' : '#0f172a' }}>{daysLeft} day{daysLeft !== 1 ? 's' : ''}</div>
            </div>
          )}
          {isCurrentSprint && sprintOver && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>Sprint ended</span>}
          {!isCurrentSprint && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#f1f5f9', color: '#64748b' }}>Past sprint</span>}
        </div>
        {isCurrentSprint && !sprintOver && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 120, height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(0, Math.min(100, Math.round(((14 - daysLeft) / 14) * 100)))}%`, height: '100%', background: '#3b82f6', borderRadius: 999 }} />
            </div>
            <span style={{ fontSize: 11, color: '#64748b' }}>Sprint progress</span>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 12, marginBottom: 20 }}>
        {[{ label:'Total tasks',value:total,color:'#0f172a' },{ label:'Completed',value:done,color:'#10b981',delta },
          { label:'Completion %',value:`${pct}%`,color:'#0f172a' },{ label:'In progress',value:pending,color:'#3b82f6' },
          { label:'Blocked',value:blocked,color:'#ef4444' }].map(m => (
          <div key={m.label} style={{ background: '#f8fafc', borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
              {m.label}
              {m.delta !== undefined && m.delta !== null && (
                <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 6, color: m.delta > 0 ? '#10b981' : m.delta < 0 ? '#ef4444' : '#94a3b8' }}>
                  {m.delta > 0 ? `+${m.delta}` : m.delta < 0 ? m.delta : '-'}
                </span>
              )}
            </div>
            <div style={{ fontSize: 22, fontWeight: 500, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 12, color: '#64748b' }}>
        {[['#3b82f6','#dbeafe','Total'],['#10b981','#a7f3d0','Done']].map(([border,bg,label]) => (
          <span key={label} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ width:10, height:10, borderRadius:2, background:bg, border:`1px solid ${border}` }} />{label}
          </span>
        ))}
        <span style={{ marginLeft:'auto', fontSize:12, color:'#94a3b8' }}>Current sprint highlighted</span>
      </div>
      <SprintChartBar sprints={sprints} tasksBySprint={tasksBySprint} />

      <p style={{ fontSize: 13, fontWeight: 500, color: '#64748b', marginBottom: 10 }}>
        Tasks in Sprint {selectedSprint}{isCurrentSprint ? ' - current' : ''}
      </p>
      <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '0.5px solid #f1f5f9', display: 'flex', gap: 8, flexWrap: 'wrap', background: '#fafafa' }}>
          {STATUS_ORDER.filter(s => sprintTasks.some(t => t.status === s)).map(s => {
            const cnt = sprintTasks.filter(t => t.status === s).length;
            const c = STATUS_CONFIG[s];
            return <span key={s} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: c.bg, color: c.color }}>{c.label}: {cnt}</span>;
          })}
        </div>
        {sorted.length === 0 && !doneList.length && <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No tasks in this sprint</div>}
        {sorted.map(t => {
          const sc = STATUS_CONFIG[t.status] || STATUS_CONFIG.backlog;
          return (
            <div key={t.id} style={{ padding: '9px 16px', borderBottom: '0.5px solid #f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.task}</div>
                  {t.project && <div style={{ fontSize: 11, color: '#94a3b8' }}>{t.project}</div>}
                </div>
                <span style={{ fontSize: 11, color: '#64748b', flexShrink: 0 }}>{t.owner || '-'}</span>
                <StatusPill status={t.status} />
                <PriorityDot priority={t.priority} />
              </div>
              {/* REMARKS in sprint task list */}
              {t.remarks && <div style={{ paddingLeft: 17, marginTop: 4 }}><RemarksChip remarks={t.remarks} /></div>}
            </div>
          );
        })}
        {doneList.length > 0 && (
          <>
            <div onClick={() => setShowDone(s => !s)}
              style={{ padding: '9px 16px', cursor: 'pointer', fontSize: 12, color: '#94a3b8', background: '#f8fafc', textAlign: 'center', borderTop: sorted.length ? '0.5px solid #f1f5f9' : 'none' }}>
              {showDone ? `Hide ${doneList.length} completed` : `Show ${doneList.length} completed`}
            </div>
            {showDone && doneList.map(t => (
              <div key={t.id} style={{ padding: '8px 16px', borderBottom: '0.5px solid #f8fafc', opacity: 0.55 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#64748b', flex: 1, textDecoration: 'line-through' }}>{t.task}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{t.owner || '-'}</span>
                  <StatusPill status="done" />
                </div>
                {t.remarks && <div style={{ paddingLeft: 17, marginTop: 4 }}><RemarksChip remarks={t.remarks} /></div>}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Sprint banner ─────────────────────────────────────────────────────────────
function SprintBanner({ sprints, currentSprint, selectedSprint, onSelect, onRollover, rolloverMsg, allTasks }) {
  const { start, end } = getSprintDates(selectedSprint === 'all' ? currentSprint : selectedSprint, allTasks);
  const todayStr = fmtDate(TODAY);
  const rangeStr = `${fmtShort(start)} - ${fmtShort(end)}`;
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 12, padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', padding: '4px 10px', borderRadius: 8, border: '0.5px solid #e2e8f0' }}>
          Today: <span style={{ fontWeight: 500, color: '#0f172a' }}>{todayStr}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#64748b' }}>Sprint</span>
          <select value={selectedSprint} onChange={e => onSelect(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            style={{ padding: '5px 10px', fontSize: 13, borderRadius: 8, border: '0.5px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontWeight: 500 }}>
            <option value="all">All sprints</option>
            {sprints.map(s => <option key={s} value={s}>Sprint {s}{s === currentSprint ? ' (current)' : ''}</option>)}
          </select>
        </div>
        {selectedSprint !== 'all' && (
          <div style={{ fontSize: 12, color: '#64748b' }}>
            <span style={{ color: '#94a3b8' }}>Dates: </span>
            <span style={{ fontWeight: 500, color: '#0f172a' }}>{rangeStr}</span>
            {selectedSprint === currentSprint && (
              <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 7px', borderRadius: 999, background: 'rgba(59,130,246,0.1)', color: '#1d4ed8', fontWeight: 500 }}>current</span>
            )}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {rolloverMsg && <span style={{ fontSize: 12, color: '#10b981' }}>{rolloverMsg}</span>}
        <button onClick={onRollover}
          style={{ ...btnBase, background: 'rgba(239,68,68,0.07)', color: '#dc2626', border: '0.5px solid rgba(239,68,68,0.2)', fontSize: 12 }}>
          Roll over to Sprint {currentSprint + 1}
        </button>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function ProjectPlanner() {
  const [projects,       setProjects]      = useState([]);
  const [view,           setView]          = useState('board');
  const [syncMsg,        setSyncMsg]       = useState('');
  const [syncOk,         setSyncOk]        = useState(true);
  const [sheetUrl,       setSheetUrl]      = useState('https://docs.google.com/spreadsheets/d/1cZ3iMZVdT6C9F7J3x5bgzPsn67LdxeRPO-R84dVRh_M/edit');
  const [sheetTab,       setSheetTab]      = useState('Sheet1');
  const [search,         setSearch]        = useState('');
  const [filterProject,  setFP]            = useState('');
  const [filterOwner,    setFO]            = useState('');
  const [filterPriority, setFPri]          = useState('');
  const [selectedSprint, setSelectedSprint]= useState('all');
  const [showNewTask,    setShowNewTask]    = useState(false);
  const [rolloverMsg,    setRolloverMsg]    = useState('');
  const [writeMsg,       setWriteMsg]       = useState('');

  const sprints       = [...new Set(projects.map(p => p.sprint || 1))].sort((a, b) => a - b);
  const currentSprint = sprints.length > 0 ? Math.max(...sprints) : 1;

  const loadData = async () => {
    const id = extractId(sheetUrl);
    if (!id) { setSyncMsg('Invalid URL'); setSyncOk(false); return; }
    setSyncMsg('Syncing...'); setSyncOk(true);
    try {
      const res  = await fetch(`https://opensheet.elk.sh/${id}/${sheetTab}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      if (!data?.length) throw new Error('No data');
      const headers = Object.keys(data[0]);
      const mapped  = data.map((r, i) => mapRow(headers.map(h => r[h]), headers, i));
      setProjects(mapped);
      const nums = [...new Set(mapped.map(p => p.sprint || 1))].sort((a, b) => a - b);
      setSelectedSprint(nums.length > 0 ? Math.max(...nums) : 1);
      setSyncMsg(`Synced ${mapped.length} tasks`); setSyncOk(true);
    } catch {
      setProjects(SAMPLE_DATA);
      setSyncMsg('Could not load - showing sample data'); setSyncOk(false);
      setSelectedSprint(3);
    }
  };

  useEffect(() => { loadData(); }, []); // eslint-disable-line

  const handleSaveBoardChanges = async (overrides) => {
    setProjects(prev => prev.map(p => overrides[p.id] ? { ...p, status: overrides[p.id] } : p));
    if (APPS_SCRIPT_URL) {
      const sheetId = extractId(sheetUrl);
      const batch   = Object.entries(overrides).map(([id, status]) => ({ rowIndex: parseInt(id), fields: { status } }));
      const result  = await writeToSheet('batchUpdate', sheetId, sheetTab, null, batch);
      setWriteMsg(result.ok ? 'Saved to sheet' : 'Saved locally (sheet write failed)');
    } else {
      setWriteMsg('Saved locally - set APPS_SCRIPT_URL to sync to sheet');
    }
    setTimeout(() => setWriteMsg(''), 4000);
  };

  const handleAddTask = async (form) => {
    const newTask = { ...form, id: Date.now(), sprint: form.sprint || currentSprint };
    setProjects(prev => [...prev, newTask]);
    if (APPS_SCRIPT_URL) {
      const sheetId = extractId(sheetUrl);
      const result  = await writeToSheet('prepend', sheetId, sheetTab, null, {
        task: form.task, project: form.project, description: form.description,
        owner: form.owner, status: form.status, priority: form.priority,
        duedate: form.dueDate, sprint: form.sprint, remarks: form.remarks,
      });
      setWriteMsg(result.ok ? 'Task added to sheet' : 'Saved locally (sheet write failed)');
    } else {
      setWriteMsg('Added locally - configure APPS_SCRIPT_URL to write to sheet');
    }
    setTimeout(() => setWriteMsg(''), 4000);
  };

  const handleRollover = () => {
    let count = 0; const nextSprint = currentSprint + 1; const updates = [];
    setProjects(prev => prev.map(p => {
      if ((p.sprint || 1) === currentSprint && p.status !== 'done') {
        count++; updates.push({ rowIndex: p.id, fields: { sprint: nextSprint } });
        return { ...p, sprint: nextSprint };
      }
      return p;
    }));
    setRolloverMsg(`${count} task${count !== 1 ? 's' : ''} rolled to Sprint ${nextSprint}`);
    setSelectedSprint(nextSprint);
    setTimeout(() => setRolloverMsg(''), 4000);
    if (APPS_SCRIPT_URL && updates.length) writeToSheet('batchUpdate', extractId(sheetUrl), sheetTab, null, updates);
  };

  const hideFilters    = view === 'sprint' || view === 'owners';
  const sprintFiltered = selectedSprint === 'all' ? projects : projects.filter(p => (p.sprint || 1) === selectedSprint);
  const filtered = sprintFiltered.filter(p =>
    (!search         || normalize(p.task).includes(normalize(search)) || normalize(p.description || '').includes(normalize(search)) || normalize(p.owner).includes(normalize(search)) || normalize(p.remarks || '').includes(normalize(search))) &&
    (!filterProject  || p.project === filterProject) &&
    (!filterOwner    || parseOwners(p.owner).some(o => normalize(o) === normalize(filterOwner))) &&
    (!filterPriority || p.priority === filterPriority)
  );

  const projectOptions = [...new Set(projects.map(p => p.project).filter(Boolean))];
  const ownerOptions   = [...new Set(projects.flatMap(p => parseOwners(p.owner)).filter(Boolean))];

  const tabStyle = (v) => ({ padding: '6px 14px', fontSize: 13, cursor: 'pointer',
    border: view === v ? '0.5px solid #e2e8f0' : 'none', background: view === v ? '#fff' : 'transparent',
    color: view === v ? '#0f172a' : '#64748b', fontWeight: view === v ? 500 : 400, borderRadius: 6 });
  const sel = { padding: '6px 10px', fontSize: 13, borderRadius: 8, border: '0.5px solid #e2e8f0', background: '#fff', color: '#0f172a' };

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif', background: '#f8fafc', minHeight: '100vh' }}>
      {showNewTask && (
        <NewTaskModal onClose={() => setShowNewTask(false)} onSave={handleAddTask}
          projectOptions={projectOptions} ownerOptions={ownerOptions} currentSprint={currentSprint} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 500, color: '#0f172a' }}>Project Planner By Travtech</span>
          {syncMsg  && <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 8, background: syncOk ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: syncOk ? '#10b981' : '#ef4444' }}>{syncMsg}</span>}
          {writeMsg && <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 8, background: 'rgba(59,130,246,0.1)', color: '#1d4ed8' }}>{writeMsg}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setShowNewTask(true)} style={{ ...btnBase, background: '#0f172a', color: '#fff', border: 'none', fontWeight: 500 }}>+ New task</button>
          <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 8 }}>
            {['board','list','summary','owners','sprint'].map(v => (
              <button key={v} style={tabStyle(v)} onClick={() => setView(v)}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} placeholder="Paste Google Sheets URL"
          style={{ flex: 1, minWidth: 220, fontSize: 13, padding: '7px 12px', borderRadius: 8, border: '0.5px solid #e2e8f0', background: '#fff', color: '#0f172a' }} />
        <select value={sheetTab} onChange={e => setSheetTab(e.target.value)} style={sel}>
          <option>Sheet1</option><option>Sheet2</option><option>Sheet3</option>
        </select>
        <button onClick={loadData} style={{ ...sel, background: 'rgba(59,130,246,0.1)', color: '#1d4ed8', border: '0.5px solid rgba(59,130,246,0.3)', cursor: 'pointer' }}>Sync</button>
        {APPS_SCRIPT_URL
          ? <span style={{ fontSize: 12, color: '#10b981' }}>Write-back enabled</span>
          : <span style={{ fontSize: 12, color: '#94a3b8' }}>Read-only - set APPS_SCRIPT_URL for write-back</span>}
      </div>

      {!hideFilters && (
        <SprintBanner sprints={sprints.length > 0 ? sprints : [1]} currentSprint={currentSprint}
          selectedSprint={selectedSprint} onSelect={setSelectedSprint}
          onRollover={handleRollover} rolloverMsg={rolloverMsg} allTasks={projects} />
      )}

      {!hideFilters && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks & remarks" style={{ ...sel, width: 200 }} />
          <select value={filterProject} onChange={e => setFP(e.target.value)} style={sel}>
            <option value="">All projects</option>{projectOptions.map(p => <option key={p}>{p}</option>)}
          </select>
          <select value={filterOwner} onChange={e => setFO(e.target.value)} style={sel}>
            <option value="">All owners</option>{ownerOptions.map(o => <option key={o}>{o}</option>)}
          </select>
          <select value={filterPriority} onChange={e => setFPri(e.target.value)} style={sel}>
            <option value="">All priorities</option><option>high</option><option>medium</option><option>low</option>
          </select>
          <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>{filtered.length} task{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {view === 'board'   && <BoardView   tasks={filtered} onSaveBoardChanges={handleSaveBoardChanges} />}
      {view === 'list'    && <ListView    tasks={filtered} />}
      {view === 'summary' && <SummaryView tasks={filtered} />}
      {view === 'owners'  && <OwnersView  tasks={projects} />}
      {view === 'sprint'  && <SprintView  tasks={projects} sprints={sprints.length > 0 ? sprints : [1]} currentSprint={currentSprint} />}
    </div>
  );
}
