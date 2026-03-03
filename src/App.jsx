import { useState, useEffect, useCallback } from "react";
import { db } from "./firebase";
import { ref, onValue, set, push, remove, update } from "firebase/database";

const APP_NAME = "The Porch";

// ── Helpers ──────────────────────────────────────────────────────────
const fmt = (iso) => {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};
const fmtFull = (iso) => {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
};

// Parse time strings like "10:00 AM", "2:30pm", "14:00"
const parseTimeStr = (str) => {
  if (!str) return null;
  const m = str.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = (m[3] || "").toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return { h, m: min };
};

// Build Google Calendar "Add Event" URL
const buildGCalUrl = (ev) => {
  const dateClean = ev.date.replace(/-/g, "");
  let startStr, endStr;
  const timeParsed = parseTimeStr(ev.time);
  if (timeParsed) {
    const pad = (n) => String(n).padStart(2, "0");
    startStr = `${dateClean}T${pad(timeParsed.h)}${pad(timeParsed.m)}00`;
    const endH = timeParsed.h + 2;
    endStr = `${dateClean}T${pad(endH > 23 ? 23 : endH)}${pad(timeParsed.m)}00`;
  } else {
    const next = new Date(ev.date + "T12:00:00");
    next.setDate(next.getDate() + 1);
    const ny = next.getFullYear(), nm = String(next.getMonth()+1).padStart(2,"0"), nd = String(next.getDate()).padStart(2,"0");
    startStr = dateClean;
    endStr = `${ny}${nm}${nd}`;
  }
  const details = [ev.notes, `RSVP & vote on activities in The Porch app`].filter(Boolean).join("\\n\\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${startStr}/${endStr}`,
    details,
    location: ev.location || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

// Build .ics file content
const buildIcsContent = (ev) => {
  const dateClean = ev.date.replace(/-/g, "");
  const timeParsed = parseTimeStr(ev.time);
  let dtStart, dtEnd;
  if (timeParsed) {
    const pad = (n) => String(n).padStart(2, "0");
    dtStart = `${dateClean}T${pad(timeParsed.h)}${pad(timeParsed.m)}00`;
    const endH = timeParsed.h + 2;
    dtEnd = `${dateClean}T${pad(endH > 23 ? 23 : endH)}${pad(timeParsed.m)}00`;
  } else {
    const next = new Date(ev.date + "T12:00:00");
    next.setDate(next.getDate() + 1);
    const ny = next.getFullYear(), nm = String(next.getMonth()+1).padStart(2,"0"), nd = String(next.getDate()).padStart(2,"0");
    dtStart = dateClean;
    dtEnd = `${ny}${nm}${nd}`;
  }
  const valType = timeParsed ? "" : ";VALUE=DATE";
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Porch//EN",
    "BEGIN:VEVENT",
    `DTSTART${valType}:${dtStart}`, `DTEND${valType}:${dtEnd}`,
    `SUMMARY:${ev.title}`, `LOCATION:${ev.location || ""}`,
    `DESCRIPTION:${ev.notes || ""}`, `UID:${ev.id}@theporch`,
    "END:VEVENT", "END:VCALENDAR"
  ].join("\r\n");
};

const downloadIcs = (ev) => {
  const blob = new Blob([buildIcsContent(ev)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${ev.title.replace(/[^a-zA-Z0-9]/g, "_")}.ics`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Icons ────────────────────────────────────────────────────────────
const Icon = ({ d, size = 20, color = "currentColor", ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>{typeof d === "string" ? <path d={d} /> : d}</svg>
);
const CalendarIcon = (p) => <Icon {...p} d={<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>} />;
const PlusIcon = (p) => <Icon {...p} d="M12 5v14M5 12h14" />;
const HeartIcon = (p) => <Icon {...p} d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />;
const StarIcon = (p) => <Icon {...p} d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />;
const TrashIcon = (p) => <Icon {...p} d={<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>} />;
const BackIcon = (p) => <Icon {...p} d="M19 12H5M12 19l-7-7 7-7" />;
const GCalIcon = (p) => <Icon {...p} d={<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h2v2H8z"/></>} />;
const UsersIcon = (p) => <Icon {...p} d={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>} />;
const VoteIcon = (p) => <Icon {...p} d={<><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></>} />;
const EditIcon = (p) => <Icon {...p} d={<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>} />;
const EyeIcon = (p) => <Icon {...p} d={<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>} />;
const EyeOffIcon = (p) => <Icon {...p} d={<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>} />;

// ── Main App ─────────────────────────────────────────────────────────
export default function App() {
  const [events, setEvents] = useState([]);
  const [userName, setUserName] = useState(() => localStorage.getItem("porch-user") || "");
  const [nameInput, setNameInput] = useState("");
  const [currentView, setCurrentView] = useState("list");
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dbConnected, setDbConnected] = useState(true);

  // Create form state
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Activity input
  const [activityInput, setActivityInput] = useState("");

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // ── Firebase: Subscribe to events in real-time ─────────────────────
  useEffect(() => {
    const eventsRef = ref(db, "events");
    const unsubscribe = onValue(eventsRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        const arr = Object.entries(val).map(([key, ev]) => ({
          ...ev,
          id: key,
          rsvps: ev.rsvps ? Object.values(ev.rsvps) : [],
          activities: ev.activities
            ? Object.entries(ev.activities).map(([aKey, a]) => ({
                ...a,
                id: aKey,
                votes: a.votes ? Object.values(a.votes) : [],
              }))
            : [],
        }));
        setEvents(arr);
      } else {
        setEvents([]);
      }
      setLoading(false);
    }, (error) => {
      console.error("Firebase read error:", error);
      setDbConnected(false);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ── Actions ────────────────────────────────────────────────────────
  const saveName = (name) => {
    setUserName(name);
    localStorage.setItem("porch-user", name);
  };

  const createEvent = async () => {
    if (!formTitle || !formDate) return;
    const eventsRef = ref(db, "events");
    const newRef = push(eventsRef);
    await set(newRef, {
      title: formTitle,
      date: formDate,
      time: formTime || "",
      location: formLocation || "",
      notes: formNotes || "",
      createdBy: userName,
      createdAt: Date.now(),
      published: true,
      rsvps: { [userName]: { name: userName, status: "yes" } },
      activities: {},
    });
    setFormTitle(""); setFormDate(""); setFormTime(""); setFormLocation(""); setFormNotes("");
    setCurrentView("list");
  };

  const deleteEvent = async (id) => {
    await remove(ref(db, `events/${id}`));
    setConfirmDelete(null);
    setCurrentView("list");
  };

  const togglePublish = async (eventId, currentlyPublished) => {
    await update(ref(db, `events/${eventId}`), { published: !currentlyPublished });
  };

  const startEditing = (ev) => {
    setEditTitle(ev.title);
    setEditDate(ev.date);
    setEditTime(ev.time || "");
    setEditLocation(ev.location || "");
    setEditNotes(ev.notes || "");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const saveEditing = async (eventId) => {
    if (!editTitle || !editDate) return;
    await update(ref(db, `events/${eventId}`), {
      title: editTitle,
      date: editDate,
      time: editTime || "",
      location: editLocation || "",
      notes: editNotes || "",
    });
    setEditing(false);
  };

  const rsvp = async (eventId, status) => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;
    const existing = ev.rsvps.find(r => r.name === userName);
    const rsvpRef = ref(db, `events/${eventId}/rsvps/${userName}`);
    if (existing && existing.status === status) {
      // Toggle off
      await remove(rsvpRef);
    } else {
      await set(rsvpRef, { name: userName, status });
    }
  };

  const addActivity = async (eventId) => {
    if (!activityInput.trim()) return;
    const activitiesRef = ref(db, `events/${eventId}/activities`);
    const newRef = push(activitiesRef);
    await set(newRef, {
      name: activityInput.trim(),
      by: userName,
      votes: {},
    });
    setActivityInput("");
  };

  const voteActivity = async (eventId, activityId) => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;
    const activity = ev.activities.find(a => a.id === activityId);
    if (!activity) return;
    const voteRef = ref(db, `events/${eventId}/activities/${activityId}/votes/${userName}`);
    if (activity.votes.includes(userName)) {
      await remove(voteRef);
    } else {
      await set(voteRef, userName);
    }
  };

  const removeActivity = async (eventId, activityId) => {
    await remove(ref(db, `events/${eventId}/activities/${activityId}`));
  };

  // ── Derived ────────────────────────────────────────────────────────
  const selectedEvent = events.find(e => e.id === selectedId);
  const today = new Date().toISOString().split("T")[0];
  // Show all events to their creator, but only published events to others
  const visibleEvents = events.filter(e => e.published !== false || e.createdBy === userName);
  const upcoming = visibleEvents.filter(e => e.date >= today).sort((a,b) => a.date.localeCompare(b.date));
  const past = visibleEvents.filter(e => e.date < today).sort((a,b) => b.date.localeCompare(a.date));

  if (loading) {
    return (
      <div className="app" style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'60vh'}}>
        <p style={{color:'var(--text3)'}}>Loading...</p>
      </div>
    );
  }

  // ── Name Gate ──────────────────────────────────────────────────────
  if (!userName) {
    return (
      <div className="app">
        <div className="header">
          <div className="header-icon"><HeartIcon size={28} color="white" /></div>
          <h1>{APP_NAME}</h1>
          <p>Neighborhood get-togethers, made easy</p>
        </div>
        <div className="name-gate fade-up">
          <h2>Welcome!</h2>
          <p>Enter your first name to get started. This is how others will see you.</p>
          <div className="name-input-row">
            <input
              type="text"
              placeholder="Your first name"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && nameInput.trim() && saveName(nameInput.trim())}
              autoFocus
            />
            <button className="btn btn-sage" onClick={() => nameInput.trim() && saveName(nameInput.trim())}>
              Join
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Detail View ────────────────────────────────────────────────────
  if (currentView === "detail" && selectedEvent) {
    const ev = selectedEvent;
    const myRsvp = ev.rsvps.find(r => r.name === userName);
    const yesCount = ev.rsvps.filter(r => r.status === "yes").length;
    const sortedActivities = [...ev.activities].sort((a,b) => b.votes.length - a.votes.length);
    const isPast = ev.date < today;
    const isOwner = ev.createdBy === userName;
    const isPublished = ev.published !== false;

    return (
      <div className="app">
        <div className="detail-header fade-up">
          <button className="btn btn-icon btn-secondary" onClick={() => { setCurrentView("list"); setConfirmDelete(null); setEditing(false); }}>
            <BackIcon size={18} />
          </button>
          <div style={{flex:1}}>
            <div className="event-date" style={isPast ? {color:'var(--text3)'} : {}}>{fmtFull(ev.date)}</div>
            <h2 style={{fontSize:22}}>{ev.title}</h2>
          </div>
          {isOwner && !editing && (
            <button className="btn btn-icon btn-secondary" onClick={() => startEditing(ev)} title="Edit event">
              <EditIcon size={18} />
            </button>
          )}
        </div>

        {/* Unpublished banner */}
        {!isPublished && (
          <div className="card fade-up" style={{background:'#FFF8E1',borderColor:'#F0D060',marginBottom:16,display:'flex',alignItems:'center',gap:10,fontSize:14,color:'#8B7000'}}>
            <EyeOffIcon size={18} color="#8B7000" />
            <span style={{flex:1}}>This event is unpublished — only you can see it.</span>
          </div>
        )}

        {/* Info — normal or edit mode */}
        {editing && isOwner ? (
          <div className="card fade-up delay-1" style={{marginBottom:16}}>
            <div className="create-form">
              <div className="form-group">
                <label>What's the plan? *</label>
                <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus />
              </div>
              <div className="form-group">
                <label>Date *</label>
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Time</label>
                <input type="text" placeholder="e.g. 10:00 AM" value={editTime} onChange={e => setEditTime(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Location</label>
                <input type="text" placeholder="e.g. Maple Street Park" value={editLocation} onChange={e => setEditLocation(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea placeholder="Any details or things to bring..." value={editNotes} onChange={e => setEditNotes(e.target.value)} />
              </div>
              <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:4}}>
                <button className="btn btn-sm btn-secondary" onClick={cancelEditing}>Cancel</button>
                <button className="btn btn-sm btn-sage" onClick={() => saveEditing(ev.id)} disabled={!editTitle || !editDate} style={{opacity:(!editTitle||!editDate)?0.5:1}}>
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="card fade-up delay-1" style={{marginBottom:16}}>
            {ev.time && <p style={{fontSize:14,color:'var(--text2)',marginBottom:4}}>🕐 {ev.time}</p>}
            {ev.location && <p style={{fontSize:14,color:'var(--text2)',marginBottom:4}}>📍 {ev.location}</p>}
            {ev.notes && <p style={{fontSize:14,color:'var(--text2)',marginTop:8}}>{ev.notes}</p>}
            <p style={{fontSize:12,color:'var(--text3)',marginTop:10}}>Created by {ev.createdBy}</p>

            {/* Add to Calendar */}
            <div className="cal-buttons">
              <a className="cal-btn" href={buildGCalUrl(ev)} target="_blank" rel="noopener noreferrer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" fill="#4285F4"/><rect x="3" y="3" width="9" height="9" rx="1" fill="#EA4335"/><rect x="12" y="3" width="9" height="9" rx="1" fill="#FBBC04"/><rect x="3" y="12" width="9" height="9" rx="1" fill="#34A853"/><rect x="12" y="12" width="9" height="9" rx="1" fill="#4285F4"/><rect x="6" y="6" width="12" height="12" rx="2" fill="white"/><text x="12" y="15.5" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#4285F4">+</text></svg>
                Google Calendar
              </a>
              <button className="cal-btn" onClick={() => downloadIcs(ev)}>
                <GCalIcon size={16} />
                Download .ics
              </button>
            </div>
          </div>
        )}

        {/* RSVP */}
        <div className="card fade-up delay-2 rsvp-section" style={{marginBottom:16}}>
          <div className="section-label">RSVP · {yesCount} going</div>
          {!isPast && (
            <div className="rsvp-buttons">
              <button className={`rsvp-btn ${myRsvp?.status === 'yes' ? 'active-yes' : ''}`} onClick={() => rsvp(ev.id, 'yes')}>
                ✓ Going
              </button>
              <button className={`rsvp-btn ${myRsvp?.status === 'maybe' ? 'active-maybe' : ''}`} onClick={() => rsvp(ev.id, 'maybe')}>
                ~ Maybe
              </button>
              <button className={`rsvp-btn ${myRsvp?.status === 'no' ? 'active-no' : ''}`} onClick={() => rsvp(ev.id, 'no')}>
                ✗ Can't
              </button>
            </div>
          )}
          <div style={{marginTop:12}}>
            {ev.rsvps.map(r => (
              <div className="rsvp-row" key={r.name}>
                <span className="rsvp-name">{r.name}{r.name === userName ? ' (you)' : ''}</span>
                <span className={`rsvp-status rsvp-${r.status}`}>
                  {r.status === 'yes' ? 'Going' : r.status === 'maybe' ? 'Maybe' : "Can't"}
                </span>
              </div>
            ))}
            {ev.rsvps.length === 0 && <p style={{fontSize:14,color:'var(--text3)',padding:'8px 0'}}>No RSVPs yet</p>}
          </div>
        </div>

        {/* Activities & Voting */}
        <div className="card fade-up delay-3">
          <div className="section-label">Activity Ideas · Vote for your favorites</div>
          {sortedActivities.map(a => (
            <div className="activity-card" key={a.id}>
              <div className="activity-info">
                <div className="activity-name">{a.name}</div>
                <div className="activity-by">suggested by {a.by}{a.by === userName ? ' (you)' : ''}</div>
              </div>
              <div className="vote-area">
                <span className="vote-count">{a.votes.length}</span>
                <button
                  className={`vote-btn ${a.votes.includes(userName) ? 'voted' : ''}`}
                  onClick={() => voteActivity(ev.id, a.id)}
                  title="Vote"
                >
                  <VoteIcon size={18} />
                </button>
                {a.by === userName && (
                  <button className="vote-btn" onClick={() => removeActivity(ev.id, a.id)} title="Remove" style={{marginLeft:2}}>
                    <TrashIcon size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {sortedActivities.length === 0 && <p style={{fontSize:14,color:'var(--text3)',marginBottom:8}}>No suggestions yet — add one!</p>}
          {!isPast && (
            <div className="add-activity-row">
              <input
                type="text"
                placeholder="Suggest an activity..."
                value={activityInput}
                onChange={e => setActivityInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addActivity(ev.id)}
              />
              <button className="btn btn-sm btn-sage" onClick={() => addActivity(ev.id)}>Add</button>
            </div>
          )}
        </div>

        {/* Owner actions: Unpublish + Delete */}
        {isOwner && (
          <div style={{marginTop:20,display:'flex',flexDirection:'column',gap:8}}>
            {/* Unpublish / Republish */}
            <button
              className="btn btn-ghost btn-sm"
              style={{color: isPublished ? 'var(--text2)' : 'var(--sage)'}}
              onClick={() => togglePublish(ev.id, isPublished)}
            >
              {isPublished ? <><EyeOffIcon size={14} /> Unpublish event</> : <><EyeIcon size={14} /> Republish event</>}
            </button>

            {/* Delete */}
            {confirmDelete === ev.id ? (
              <div className="delete-bar">
                <span>Delete this event?</span>
                <div style={{display:'flex',gap:6}}>
                  <button className="btn btn-sm btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
                  <button className="btn btn-sm" style={{background:'var(--accent)',color:'white'}} onClick={() => deleteEvent(ev.id)}>Delete</button>
                </div>
              </div>
            ) : (
              <button className="btn btn-ghost btn-sm" style={{color:'var(--accent)'}} onClick={() => setConfirmDelete(ev.id)}>
                <TrashIcon size={14} /> Delete event
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Create View ────────────────────────────────────────────────────
  if (currentView === "create") {
    return (
      <div className="app">
        <div className="detail-header fade-up">
          <button className="btn btn-icon btn-secondary" onClick={() => setCurrentView("list")}>
            <BackIcon size={18} />
          </button>
          <h2 style={{fontSize:22}}>New Get-Together</h2>
        </div>
        <div className="card fade-up delay-1">
          <div className="create-form">
            <div className="form-group">
              <label>What's the plan? *</label>
              <input type="text" placeholder="e.g. Coffee & Playground Hangout" value={formTitle} onChange={e => setFormTitle(e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label>Date *</label>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} min={today} />
            </div>
            <div className="form-group">
              <label>Time</label>
              <input type="text" placeholder="e.g. 10:00 AM" value={formTime} onChange={e => setFormTime(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Location</label>
              <input type="text" placeholder="e.g. Maple Street Park" value={formLocation} onChange={e => setFormLocation(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea placeholder="Any details or things to bring..." value={formNotes} onChange={e => setFormNotes(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={createEvent} disabled={!formTitle || !formDate} style={{alignSelf:'flex-end',marginTop:4, opacity: (!formTitle||!formDate) ? 0.5 : 1}}>
              <CalendarIcon size={16} /> Publish Event
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── List View ──────────────────────────────────────────────────────
  return (
    <div className="app">
      <div className="header fade-up">
        <div className="header-icon"><HeartIcon size={28} color="white" /></div>
        <h1>{APP_NAME}</h1>
        <p>Neighborhood get-togethers, made easy</p>
      </div>

      <div style={{display:'flex',justifyContent:'center'}} className="fade-up">
        <div className="user-badge" onClick={() => { if(window.confirm("Change your name?")) { localStorage.removeItem("porch-user"); setUserName(""); }}}>
          <span className="user-dot" /> {userName}
        </div>
      </div>

      {!dbConnected && (
        <div className="card fade-up" style={{background:'#FDE8E4',borderColor:'var(--accent)',marginBottom:16,textAlign:'center',fontSize:14}}>
          Unable to connect to the database. Check your Firebase setup.
        </div>
      )}

      {upcoming.length === 0 && past.length === 0 && (
        <div className="empty fade-up delay-1">
          <div className="empty-icon"><CalendarIcon size={28} color="var(--text3)" /></div>
          <h3 style={{marginBottom:8}}>No events yet</h3>
          <p>Tap the + button to create the first get-together!</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="fade-up delay-1" style={{marginBottom:24}}>
          <div className="section-label">Upcoming</div>
          <div className="event-list">
            {upcoming.map(ev => (
              <div key={ev.id} className="card event-card upcoming" onClick={() => { setSelectedId(ev.id); setCurrentView("detail"); setEditing(false); }}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div className="event-date">{fmt(ev.date)}</div>
                  {ev.published === false && <span style={{fontSize:11,fontWeight:600,color:'#8B7000',background:'#FFF8E1',padding:'2px 8px',borderRadius:10}}>Draft</span>}
                </div>
                <div className="event-title">{ev.title}</div>
                {ev.location && <div style={{fontSize:13,color:'var(--text2)'}}>📍 {ev.location}</div>}
                <div className="event-meta">
                  <span><UsersIcon size={14} /> {ev.rsvps.filter(r=>r.status==='yes').length} going</span>
                  <span><StarIcon size={14} /> {ev.activities.length} {ev.activities.length === 1 ? 'idea' : 'ideas'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div className="fade-up delay-2" style={{marginBottom:24}}>
          <div className="section-label">Past</div>
          <div className="event-list">
            {past.map(ev => (
              <div key={ev.id} className="card event-card past" onClick={() => { setSelectedId(ev.id); setCurrentView("detail"); setEditing(false); }} style={{opacity:0.7}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div className="event-date">{fmt(ev.date)}</div>
                  {ev.published === false && <span style={{fontSize:11,fontWeight:600,color:'#8B7000',background:'#FFF8E1',padding:'2px 8px',borderRadius:10}}>Draft</span>}
                </div>
                <div className="event-title">{ev.title}</div>
                <div className="event-meta">
                  <span><UsersIcon size={14} /> {ev.rsvps.filter(r=>r.status==='yes').length} attended</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button className="fab" onClick={() => setCurrentView("create")} title="New event">
        <PlusIcon size={26} color="white" />
      </button>
    </div>
  );
}
