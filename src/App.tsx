import { useState, useEffect, useRef } from 'react';

const BREAK_TIME = 5 * 60;
const WORK_OPTIONS = [25, 40, 45];
const PRIORITY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981',
};
const CATEGORY_COLORS: Record<string, string> = {
  work: '#6366f1',
  meeting: '#f59e0b',
  personal: '#10b981',
  focus: '#8b5cf6',
};
const RECUR_LABELS: Record<string, string> = {
  none: '—',
  daily: 'Daily',
  weekdays: 'Weekdays',
  weekly: 'Weekly',
};
const today = new Date().toDateString();

const taskMatchesDay = (task: any, dayDate: Date) => {
  const ds = dayDate.toDateString();
  if (!task.recurrence || task.recurrence === 'none') return task.date === ds;
  const start = new Date(task.date);
  if (dayDate < start) return false;
  if (task.recurrence === 'daily') return true;
  if (task.recurrence === 'weekdays')
    return [1, 2, 3, 4, 5].includes(dayDate.getDay());
  if (task.recurrence === 'weekly') return dayDate.getDay() === start.getDay();
  return false;
};

export default function App() {
  const [tab, setTab] = useState('planner');
  const [tasks, setTasks] = useState([
    {
      id: 1,
      title: 'Review Q2 marketing plan',
      date: today,
      time: '09:00',
      priority: 'high',
      category: 'work',
      okrId: 1,
      completed: false,
      recurrence: 'none',
    },
    {
      id: 2,
      title: 'Team standup',
      date: today,
      time: '10:00',
      priority: 'medium',
      category: 'meeting',
      okrId: null,
      completed: false,
      recurrence: 'weekdays',
    },
    {
      id: 3,
      title: 'Draft pitch deck',
      date: today,
      time: '14:00',
      priority: 'high',
      category: 'focus',
      okrId: 1,
      completed: false,
      recurrence: 'none',
    },
  ]);
  const [okrs, setOkrs] = useState([
    {
      id: 1,
      objective: 'Launch game to market by Q3',
      keyResults: [
        { id: 1, title: 'Complete GTM strategy', progress: 60, target: 100 },
        { id: 2, title: 'Onboard beta testers', progress: 1, target: 5 },
        { id: 3, title: 'Define pricing model', progress: 80, target: 100 },
      ],
    },
    {
      id: 2,
      objective: 'Grow brand awareness to 10k reach',
      keyResults: [
        { id: 4, title: 'Publish 8 content pieces', progress: 3, target: 8 },
        {
          id: 5,
          title: 'Reach 10k impressions',
          progress: 4200,
          target: 10000,
        },
      ],
    },
  ]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(today);
  const [taskInput, setTaskInput] = useState('');
  const [recurrenceInput, setRecurrenceInput] = useState('none');
  const [parsing, setParsing] = useState(false);
  const [briefing, setBriefing] = useState('');
  const [insights, setInsights] = useState('');
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [newObj, setNewObj] = useState('');
  const [showAddObj, setShowAddObj] = useState(false);
  const [newKR, setNewKR] = useState<Record<number, string>>({});
  const [workDuration, setWorkDuration] = useState(25);
  const [pomo, setPomo] = useState({
    running: false,
    isBreak: false,
    timeLeft: 25 * 60,
    sessions: 0,
    taskId: null as number | null,
    show: false,
  });
  const timerRef = useRef<any>(null);
  const [completedIds, setCompletedIds] = useState(new Set<string>());

  useEffect(() => {
    if (pomo.running) {
      timerRef.current = setInterval(() => {
        setPomo((p) => {
          if (p.timeLeft <= 1) {
            const breaking = !p.isBreak;
            return {
              ...p,
              running: false,
              isBreak: breaking,
              timeLeft: breaking ? BREAK_TIME : workDuration * 60,
              sessions: breaking ? p.sessions : p.sessions + 1,
            };
          }
          return { ...p, timeLeft: p.timeLeft - 1 };
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [pomo.running, workDuration]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(
      2,
      '0'
    )}`;

  const getWeekDays = () => {
    const d = new Date();
    const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
    d.setDate(d.getDate() + diff + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(d);
      x.setDate(d.getDate() + i);
      return x;
    });
  };
  const weekDays = getWeekDays();

  const parseTask = async () => {
    if (!taskInput.trim()) return;
    setParsing(true);
    try {
      const days = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: `Today is ${new Date().toDateString()} (${
                days[new Date().getDay()]
              }). Parse this task. Return ONLY raw JSON, no markdown.\nTask: "${taskInput}"\nAvailable OKRs: ${JSON.stringify(
                okrs.map((o) => ({ id: o.id, objective: o.objective }))
              )}\nReturn: {"title":"...","date":"<date string like 'Mon Apr 28 2025'>","time":"HH:MM or null","priority":"high|medium|low","category":"work|meeting|personal|focus","okrId":null or number,"recurrence":"none|daily|weekdays|weekly"}`,
            },
          ],
        }),
      });
      const data = await res.json();
      const raw =
        data.content?.find((b: any) => b.type === 'text')?.text || '{}';
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      const finalRecurrence =
        recurrenceInput !== 'none'
          ? recurrenceInput
          : parsed.recurrence || 'none';
      setTasks((p) => [
        ...p,
        {
          id: Date.now(),
          completed: false,
          ...parsed,
          recurrence: finalRecurrence,
        },
      ]);
      if (parsed.date) setSelectedDay(parsed.date);
      setTaskInput('');
      setRecurrenceInput('none');
    } catch (e) {
      console.error(e);
    }
    setParsing(false);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const todayTasks = tasks.filter((t) => taskMatchesDay(t, new Date()));
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 200,
            messages: [
              {
                role: 'user',
                content: `Short morning briefing in Vietnamese (2 sentences, friendly & energetic). Today: ${new Date().toDateString()}. Tasks today: ${JSON.stringify(
                  todayTasks.map((t: any) => t.title)
                )}. OKRs: ${JSON.stringify(okrs.map((o) => o.objective))}.`,
              },
            ],
          }),
        });
        const data = await res.json();
        setBriefing(
          data.content?.find((b: any) => b.type === 'text')?.text || ''
        );
      } catch (e) {}
    };
    load();
  }, []);

  const genInsights = async () => {
    setLoadingInsights(true);
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: `You are a productivity coach. Respond in casual Vietnamese. Tasks: ${JSON.stringify(
                tasks
              )}. OKRs: ${JSON.stringify(
                okrs
              )}. Today: ${today}.\nGive:\n1. 📊 Overall assessment (2-3 sentences)\n2. ⚠️ OKRs at risk & why\n3. 🎯 Top 3 plan adjustments\n4. 💡 One power tip\nUse emojis, keep it sharp.`,
            },
          ],
        }),
      });
      const data = await res.json();
      setInsights(
        data.content?.find((b: any) => b.type === 'text')?.text || ''
      );
    } catch (e) {
      setInsights('Không load được, thử lại nhé!');
    }
    setLoadingInsights(false);
  };

  const isCompleted = (task: any, dayStr: string) => {
    if (task.recurrence === 'none' || !task.recurrence) return task.completed;
    return completedIds.has(`${task.id}__${dayStr}`);
  };
  const toggleTask = (task: any, dayStr: string) => {
    if (task.recurrence === 'none' || !task.recurrence) {
      setTasks((p) =>
        p.map((t: any) =>
          t.id === task.id ? { ...t, completed: !t.completed } : t
        )
      );
    } else {
      const key = `${task.id}__${dayStr}`;
      setCompletedIds((prev) => {
        const s = new Set(prev);
        s.has(key) ? s.delete(key) : s.add(key);
        return s;
      });
    }
  };

  const startPomo = (taskId: number) =>
    setPomo((p) => ({
      ...p,
      taskId,
      running: true,
      isBreak: false,
      timeLeft: workDuration * 60,
      show: true,
    }));
  const getProgress = (okr: any) => {
    const s = okr.keyResults.reduce((a: number, k: any) => a + k.progress, 0),
      m = okr.keyResults.reduce((a: number, k: any) => a + k.target, 0);
    return m > 0 ? Math.round((s / m) * 100) : 0;
  };
  const updateKR = (oid: number, kid: number, v: string) =>
    setOkrs((p) =>
      p.map((o) =>
        o.id === oid
          ? {
              ...o,
              keyResults: o.keyResults.map((k: any) =>
                k.id === kid
                  ? { ...k, progress: Math.max(0, Math.min(k.target, +v)) }
                  : k
              ),
            }
          : o
      )
    );
  const addObj = () => {
    if (!newObj.trim()) return;
    setOkrs((p) => [
      ...p,
      { id: Date.now(), objective: newObj, keyResults: [] },
    ]);
    setNewObj('');
    setShowAddObj(false);
  };
  const addKR = (oid: number) => {
    const v = newKR[oid];
    if (!v?.trim()) return;
    setOkrs((p) =>
      p.map((o) =>
        o.id === oid
          ? {
              ...o,
              keyResults: [
                ...o.keyResults,
                { id: Date.now(), title: v, progress: 0, target: 100 },
              ],
            }
          : o
      )
    );
    setNewKR((p) => ({ ...p, [oid]: '' }));
  };

  const selectedDayDate = new Date(selectedDay);
  const dayTasks = tasks.filter((t) => taskMatchesDay(t, selectedDayDate));
  const totalDone =
    tasks.filter((t) =>
      !t.recurrence || t.recurrence === 'none' ? t.completed : false
    ).length + completedIds.size;
  const pomoTask = tasks.find((t) => t.id === pomo.taskId);
  const workSecs = workDuration * 60;
  const pomoPct = ((workSecs - pomo.timeLeft) / workSecs) * 100;

  const s: Record<string, any> = {
    app: {
      fontFamily: 'Inter,system-ui,sans-serif',
      background: '#0f172a',
      minHeight: '100vh',
      color: '#e2e8f0',
      display: 'flex',
      flexDirection: 'column',
    },
    header: {
      padding: '14px 20px',
      borderBottom: '1px solid #1e293b',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    briefing: {
      background: 'linear-gradient(135deg,#1e1b4b,#312e81)',
      padding: '10px 20px',
      fontSize: '13px',
      color: '#c7d2fe',
      borderBottom: '1px solid #1e293b',
    },
    tabs: {
      padding: '10px 20px',
      display: 'flex',
      gap: '4px',
      borderBottom: '1px solid #1e293b',
    },
    tab: (a: boolean) => ({
      padding: '8px 18px',
      border: 'none',
      background: a ? '#6366f1' : 'transparent',
      color: a ? 'white' : '#64748b',
      borderRadius: '8px',
      cursor: 'pointer',
      fontWeight: a ? 600 : 400,
      fontSize: '13px',
      transition: 'all .2s',
    }),
    content: { flex: 1, padding: '16px 20px', overflowY: 'auto' },
    card: {
      background: '#1e293b',
      borderRadius: '12px',
      padding: '14px',
      marginBottom: '12px',
    },
    input: {
      background: '#0f172a',
      border: '1px solid #334155',
      borderRadius: '8px',
      padding: '9px 13px',
      color: '#e2e8f0',
      fontSize: '14px',
      outline: 'none',
      width: '100%',
      boxSizing: 'border-box',
    },
    btn: (c = '#6366f1') => ({
      background: c,
      border: 'none',
      color: 'white',
      padding: '9px 16px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: '13px',
    }),
    bar: (w: number, c: string) => ({
      width: `${Math.min(100, w)}%`,
      height: '100%',
      background: c,
      borderRadius: '4px',
      transition: 'width .3s',
    }),
  };

  const recurColor: Record<string, string> = {
    none: '#334155',
    daily: '#6366f1',
    weekdays: '#8b5cf6',
    weekly: '#10b981',
  };

  return (
    <div style={s.app}>
      <div style={s.header}>
        <div>
          <div style={{ fontSize: '17px', fontWeight: 700, color: 'white' }}>
            ✨ Productivity Hub
          </div>
          <div style={{ fontSize: '11px', color: '#475569', marginTop: '1px' }}>
            {new Date().toLocaleDateString('vi-VN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div
            style={{
              background: '#1e293b',
              padding: '5px 11px',
              borderRadius: '20px',
              fontSize: '12px',
              color: '#94a3b8',
            }}
          >
            ✅ {totalDone}
          </div>
          <button
            onClick={() => setPomo((p) => ({ ...p, show: !p.show }))}
            style={{
              background: pomo.running ? '#ef4444' : '#1e293b',
              border: 'none',
              color: 'white',
              padding: '5px 13px',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            🍅 {fmt(pomo.timeLeft)}
          </button>
        </div>
      </div>

      {briefing && (
        <div style={s.briefing}>
          🌅 <strong>Briefing:</strong> {briefing}
        </div>
      )}

      {pomo.show && (
        <div
          style={{
            background: '#1e293b',
            margin: '12px 20px 0',
            borderRadius: '12px',
            padding: '14px',
            border: `2px solid ${pomo.isBreak ? '#10b981' : '#6366f1'}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ flex: 1, minWidth: '120px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                {pomo.isBreak ? '☕ Break' : '🍅 Deep Work'} · {pomo.sessions}{' '}
                sessions
              </div>
              {pomoTask && (
                <div
                  style={{
                    fontSize: '13px',
                    color: '#e2e8f0',
                    fontWeight: 500,
                    marginTop: '2px',
                  }}
                >
                  {(pomoTask as any).title}
                </div>
              )}
              {!pomo.running && (
                <div style={{ display: 'flex', gap: '5px', marginTop: '8px' }}>
                  {WORK_OPTIONS.map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setWorkDuration(m);
                        setPomo((p) => ({
                          ...p,
                          timeLeft: m * 60,
                          isBreak: false,
                        }));
                      }}
                      style={{
                        background: workDuration === m ? '#6366f1' : '#0f172a',
                        border: `1px solid ${
                          workDuration === m ? '#6366f1' : '#334155'
                        }`,
                        color: workDuration === m ? 'white' : '#94a3b8',
                        padding: '3px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: workDuration === m ? 700 : 400,
                      }}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  fontSize: '30px',
                  fontWeight: 700,
                  color: pomo.isBreak ? '#10b981' : '#6366f1',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmt(pomo.timeLeft)}
              </div>
              <button
                onClick={() => setPomo((p) => ({ ...p, running: !p.running }))}
                style={{
                  background: '#6366f1',
                  border: 'none',
                  color: 'white',
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontSize: '15px',
                }}
              >
                {pomo.running ? '⏸' : '▶'}
              </button>
              <button
                onClick={() =>
                  setPomo((p) => ({
                    ...p,
                    running: false,
                    timeLeft: workDuration * 60,
                    isBreak: false,
                  }))
                }
                style={{
                  background: '#334155',
                  border: 'none',
                  color: '#94a3b8',
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontSize: '15px',
                }}
              >
                ↺
              </button>
            </div>
          </div>
          <div
            style={{
              marginTop: '8px',
              background: '#0f172a',
              borderRadius: '4px',
              height: '4px',
            }}
          >
            <div
              style={s.bar(
                pomo.isBreak ? 100 : pomoPct,
                pomo.isBreak ? '#10b981' : '#6366f1'
              )}
            />
          </div>
        </div>
      )}

      <div style={s.tabs}>
        {[
          ['planner', '📅 Planner'],
          ['okr', '🎯 OKR'],
          ['insights', '🤖 Insights'],
        ].map(([id, label]) => (
          <button
            key={id}
            style={s.tab(tab === id)}
            onClick={() => {
              setTab(id);
              if (id === 'insights') genInsights();
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={s.content}>
        {tab === 'planner' && (
          <div>
            <div style={s.card}>
              <div
                style={{
                  fontSize: '12px',
                  color: '#64748b',
                  marginBottom: '6px',
                }}
              >
                ✏️ Nhập task bằng ngôn ngữ tự nhiên
              </div>
              <div
                style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}
              >
                <input
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && parseTask()}
                  placeholder="VD: Họp investor 3pm thứ 4, morning journal mỗi ngày..."
                  style={{ ...s.input, flex: 1 }}
                />
                <button
                  onClick={parseTask}
                  disabled={parsing}
                  style={{
                    ...s.btn(),
                    opacity: parsing ? 0.7 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {parsing ? '⏳' : '+ Add'}
                </button>
              </div>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  🔁 Repeat:
                </span>
                {Object.entries(RECUR_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setRecurrenceInput(key)}
                    style={{
                      background:
                        recurrenceInput === key ? recurColor[key] : '#0f172a',
                      border: `1px solid ${
                        recurrenceInput === key ? recurColor[key] : '#334155'
                      }`,
                      color: recurrenceInput === key ? 'white' : '#64748b',
                      padding: '3px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      transition: 'all .15s',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <button
                onClick={() => setWeekOffset((w) => w - 1)}
                style={{
                  background: '#1e293b',
                  border: 'none',
                  color: '#94a3b8',
                  padding: '5px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                ←
              </button>
              <span
                style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}
              >
                {weekOffset === 0
                  ? 'Tuần này'
                  : weekOffset === 1
                  ? 'Tuần sau'
                  : weekOffset === -1
                  ? 'Tuần trước'
                  : `${weekOffset > 0 ? '+' : ''}${weekOffset}w`}
              </span>
              <button
                onClick={() => setWeekOffset((w) => w + 1)}
                style={{
                  background: '#1e293b',
                  border: 'none',
                  color: '#94a3b8',
                  padding: '5px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                →
              </button>
            </div>

            <div style={{ display: 'flex', gap: '5px', marginBottom: '16px' }}>
              {weekDays.map((day) => {
                const ds = day.toDateString(),
                  cnt = tasks.filter((t) => taskMatchesDay(t, day)).length,
                  isTdy = ds === today,
                  isSel = ds === selectedDay;
                return (
                  <div
                    key={ds}
                    onClick={() => setSelectedDay(ds)}
                    style={{
                      flex: 1,
                      background: isSel ? '#6366f1' : '#1e293b',
                      border:
                        isTdy && !isSel
                          ? '2px solid #6366f1'
                          : '2px solid transparent',
                      borderRadius: '10px',
                      padding: '8px 4px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'all .2s',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '10px',
                        color: isSel ? '#c7d2fe' : '#64748b',
                        marginBottom: '3px',
                      }}
                    >
                      {day.toLocaleDateString('vi-VN', { weekday: 'short' })}
                    </div>
                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        color: isSel ? 'white' : isTdy ? '#6366f1' : '#e2e8f0',
                      }}
                    >
                      {day.getDate()}
                    </div>
                    {cnt > 0 && (
                      <div
                        style={{
                          marginTop: '3px',
                          display: 'flex',
                          justifyContent: 'center',
                        }}
                      >
                        <div
                          style={{
                            width: '5px',
                            height: '5px',
                            borderRadius: '50%',
                            background: isSel ? 'white' : '#6366f1',
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#64748b',
                marginBottom: '10px',
              }}
            >
              {selectedDayDate.toLocaleDateString('vi-VN', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}{' '}
              · {dayTasks.length} tasks
            </div>

            {dayTasks.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  color: '#334155',
                  padding: '32px',
                  fontSize: '14px',
                }}
              >
                Chưa có task nào 🌿
              </div>
            ) : (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                {dayTasks.map((task) => {
                  const done = isCompleted(task, selectedDay);
                  const linkedOKR = okrs.find(
                    (o) => o.id === (task as any).okrId
                  );
                  const isRecurring =
                    (task as any).recurrence &&
                    (task as any).recurrence !== 'none';
                  return (
                    <div
                      key={`${task.id}-${selectedDay}`}
                      style={{
                        background: '#1e293b',
                        borderRadius: '10px',
                        padding: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        opacity: done ? 0.5 : 1,
                        borderLeft: `3px solid ${
                          PRIORITY_COLORS[(task as any).priority] || '#475569'
                        }`,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => toggleTask(task, selectedDay)}
                        style={{
                          width: '15px',
                          height: '15px',
                          cursor: 'pointer',
                          accentColor: '#6366f1',
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '14px',
                            fontWeight: 500,
                            textDecoration: done ? 'line-through' : 'none',
                            color: done ? '#475569' : '#e2e8f0',
                          }}
                        >
                          {(task as any).title}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            gap: '6px',
                            marginTop: '4px',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                          }}
                        >
                          {(task as any).time && (
                            <span
                              style={{ fontSize: '11px', color: '#64748b' }}
                            >
                              🕐 {(task as any).time}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: '11px',
                              background:
                                CATEGORY_COLORS[(task as any).category] + '22',
                              color: CATEGORY_COLORS[(task as any).category],
                              padding: '1px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            {(task as any).category}
                          </span>
                          {isRecurring && (
                            <span
                              style={{
                                fontSize: '11px',
                                background:
                                  recurColor[(task as any).recurrence] + '33',
                                color: recurColor[(task as any).recurrence],
                                padding: '1px 6px',
                                borderRadius: '4px',
                              }}
                            >
                              🔁 {RECUR_LABELS[(task as any).recurrence]}
                            </span>
                          )}
                          {linkedOKR && (
                            <span
                              style={{ fontSize: '11px', color: '#818cf8' }}
                            >
                              🎯 {linkedOKR.objective.slice(0, 26)}…
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => startPomo(task.id)}
                        style={{
                          background: '#312e81',
                          border: 'none',
                          color: '#c7d2fe',
                          padding: '5px 9px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        🍅
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'okr' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '14px',
              }}
            >
              <div style={{ fontSize: '16px', fontWeight: 700 }}>
                🎯 OKR Tracker
              </div>
              <button onClick={() => setShowAddObj((v) => !v)} style={s.btn()}>
                + Objective
              </button>
            </div>
            {showAddObj && (
              <div style={{ ...s.card, display: 'flex', gap: '8px' }}>
                <input
                  value={newObj}
                  onChange={(e) => setNewObj(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addObj()}
                  placeholder="Mục tiêu lớn..."
                  style={{ ...s.input, flex: 1 }}
                />
                <button onClick={addObj} style={s.btn()}>
                  Add
                </button>
              </div>
            )}
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {okrs.map((okr) => {
                const pct = getProgress(okr),
                  col =
                    pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';
                return (
                  <div key={okr.id} style={s.card}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '8px',
                      }}
                    >
                      <div style={{ flex: 1, paddingRight: '10px' }}>
                        <div
                          style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#e2e8f0',
                          }}
                        >
                          {okr.objective}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: '#475569',
                            marginTop: '2px',
                          }}
                        >
                          {okr.keyResults.length} KRs ·{' '}
                          {
                            tasks.filter((t) => (t as any).okrId === okr.id)
                              .length
                          }{' '}
                          tasks linked
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: '22px',
                          fontWeight: 700,
                          color: col,
                          flexShrink: 0,
                        }}
                      >
                        {pct}%
                      </div>
                    </div>
                    <div
                      style={{
                        background: '#0f172a',
                        borderRadius: '4px',
                        height: '6px',
                        marginBottom: '14px',
                      }}
                    >
                      <div style={s.bar(pct, col)} />
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        marginBottom: '12px',
                      }}
                    >
                      {okr.keyResults.map((kr: any) => (
                        <div key={kr.id}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '4px',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '13px',
                                color: '#94a3b8',
                                flex: 1,
                                paddingRight: '8px',
                              }}
                            >
                              {kr.title}
                            </span>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                flexShrink: 0,
                              }}
                            >
                              <input
                                type="number"
                                value={kr.progress}
                                min={0}
                                max={kr.target}
                                onChange={(e) =>
                                  updateKR(okr.id, kr.id, e.target.value)
                                }
                                style={{
                                  width: '48px',
                                  background: '#0f172a',
                                  border: '1px solid #334155',
                                  borderRadius: '6px',
                                  padding: '2px 6px',
                                  color: '#e2e8f0',
                                  fontSize: '12px',
                                  textAlign: 'center',
                                  outline: 'none',
                                }}
                              />
                              <span
                                style={{ fontSize: '11px', color: '#475569' }}
                              >
                                /{kr.target}
                              </span>
                            </div>
                          </div>
                          <div
                            style={{
                              background: '#0f172a',
                              borderRadius: '3px',
                              height: '4px',
                            }}
                          >
                            <div
                              style={s.bar(
                                (kr.progress / kr.target) * 100,
                                '#6366f1'
                              )}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        value={newKR[okr.id] || ''}
                        onChange={(e) =>
                          setNewKR((p) => ({ ...p, [okr.id]: e.target.value }))
                        }
                        onKeyDown={(e) => e.key === 'Enter' && addKR(okr.id)}
                        placeholder="+ Thêm Key Result..."
                        style={{
                          ...s.input,
                          flex: 1,
                          fontSize: '13px',
                          padding: '7px 12px',
                        }}
                      />
                      <button
                        onClick={() => addKR(okr.id)}
                        style={{
                          ...s.btn('#334155'),
                          color: '#94a3b8',
                          padding: '7px 12px',
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'insights' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '14px',
              }}
            >
              <div style={{ fontSize: '16px', fontWeight: 700 }}>
                🤖 AI Insights
              </div>
              <button
                onClick={genInsights}
                disabled={loadingInsights}
                style={{ ...s.btn(), opacity: loadingInsights ? 0.7 : 1 }}
              >
                {loadingInsights ? '⏳ Analyzing…' : '↻ Refresh'}
              </button>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '10px',
                marginBottom: '14px',
              }}
            >
              {(
                [
                  [tasks.length, 'Tasks', '#6366f1'],
                  [totalDone, 'Done', '#10b981'],
                  [okrs.length, 'OKRs', '#f59e0b'],
                ] as const
              ).map(([n, l, c]) => (
                <div
                  key={l}
                  style={{
                    ...s.card,
                    textAlign: 'center',
                    padding: '14px',
                    marginBottom: 0,
                  }}
                >
                  <div style={{ fontSize: '26px', fontWeight: 700, color: c }}>
                    {n}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#475569',
                      marginTop: '2px',
                    }}
                  >
                    {l}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ ...s.card, marginBottom: '14px' }}>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#64748b',
                  marginBottom: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                OKR Overview
              </div>
              {okrs.map((okr) => {
                const pct = getProgress(okr),
                  col =
                    pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';
                return (
                  <div key={okr.id} style={{ marginBottom: '10px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '13px',
                        color: '#e2e8f0',
                        marginBottom: '4px',
                      }}
                    >
                      <span style={{ flex: 1, paddingRight: '8px' }}>
                        {okr.objective.length > 40
                          ? okr.objective.slice(0, 40) + '…'
                          : okr.objective}
                      </span>
                      <span
                        style={{ color: col, fontWeight: 700, flexShrink: 0 }}
                      >
                        {pct}%
                      </span>
                    </div>
                    <div
                      style={{
                        background: '#0f172a',
                        borderRadius: '3px',
                        height: '4px',
                      }}
                    >
                      <div style={s.bar(pct, col)} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ ...s.card, minHeight: '140px', marginBottom: 0 }}>
              {loadingInsights ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '120px',
                    color: '#475569',
                    fontSize: '14px',
                  }}
                >
                  ⏳ AI đang phân tích...
                </div>
              ) : insights ? (
                <div
                  style={{
                    fontSize: '14px',
                    lineHeight: '1.8',
                    color: '#e2e8f0',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {insights}
                </div>
              ) : (
                <div
                  style={{
                    color: '#334155',
                    fontSize: '14px',
                    textAlign: 'center',
                    paddingTop: '44px',
                  }}
                >
                  Bấm Refresh để AI phân tích 🚀
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
