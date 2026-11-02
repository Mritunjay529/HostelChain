import { useState } from "react";
import { ALLOCATION, REGISTRATION, ROOM_TYPES, shortAddress } from "../lib/chain";

function studentStatus(s, rooms) {
  if (s.registration === REGISTRATION.PENDING) return "Pending approval";
  if (s.allocation === ALLOCATION.ALLOCATED) {
    return `Room ${rooms.find((r) => r.id === s.roomId)?.number ?? s.roomId}`;
  }
  if (s.allocation === ALLOCATION.WAITLISTED) return `Waitlist (${ROOM_TYPES[s.requestedType]})`;
  return "Approved, no room";
}

export default function WardenPanel({ data, tx, busy }) {
  const { rooms, students, paused } = data;
  const [number, setNumber] = useState("");
  const [type, setType] = useState(0);
  const [capacity, setCapacity] = useState(2);

  const pending = students.filter((s) => s.registration === REGISTRATION.PENDING);
  const approved = students.filter((s) => s.registration === REGISTRATION.VERIFIED);

  return (
    <>
      <section className="card">
        <h2>Add a room</h2>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await tx.run(`Add room ${number}`, "addRoom", number.trim(), type, capacity)) setNumber("");
          }}
        >
          <label>
            Room number
            <input value={number} onChange={(e) => setNumber(e.target.value)} maxLength={16} placeholder="e.g. C-301" required />
          </label>
          <div className="row">
            <label>
              Type
              <select value={type} onChange={(e) => setType(Number(e.target.value))}>
                {ROOM_TYPES.map((t, i) => (
                  <option key={t} value={i}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Beds
              <select value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <button className="btn btn-primary" disabled={busy || !number.trim()}>Add room</button>
        </form>
      </section>

      <section className="card">
        <h2>Registrations to review</h2>
        {pending.length === 0 ? (
          <p className="empty">Nothing waiting for approval.</p>
        ) : (
          <ul className="rows">
            {pending.map((s) => (
              <li key={s.wallet}>
                <div>
                  <strong className="mono">{s.rollNo}</strong>
                  <span className="muted"> · Year {s.year} · <span className="mono">{shortAddress(s.wallet)}</span></span>
                </div>
                <div className="actions">
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => tx.run(`Approve ${s.rollNo}`, "approveStudent", s.wallet)}>
                    Approve
                  </button>
                  <button className="btn btn-sm" disabled={busy} onClick={() => tx.run(`Reject ${s.rollNo}`, "rejectStudent", s.wallet)}>
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Students</h2>
        {approved.length === 0 ? (
          <p className="empty">No approved students yet.</p>
        ) : (
          <ul className="rows">
            {approved.map((s) => (
              <li key={s.wallet}>
                <div>
                  <strong className="mono">{s.rollNo}</strong>
                  <span className="muted"> · Year {s.year}</span>
                  <div className="muted small">{studentStatus(s, rooms)}</div>
                </div>
                {s.allocation !== ALLOCATION.NONE && (
                  <button
                    className="btn btn-sm btn-danger"
                    disabled={busy}
                    onClick={() =>
                      window.confirm(`Remove ${s.rollNo} from their ${s.allocation === ALLOCATION.ALLOCATED ? "room" : "waitlist spot"}?`) &&
                      tx.run(`Remove ${s.rollNo}`, "evictStudent", s.wallet)
                    }
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Applications</h2>
        <p className="muted">
          {paused
            ? "Applications are paused. Students can still give up rooms."
            : "Pause applications in an emergency, for example while fixing the room list."}
        </p>
        <button className="btn" disabled={busy} onClick={() => tx.run(paused ? "Resume applications" : "Pause applications", paused ? "unpause" : "pause")}>
          {paused ? "Resume applications" : "Pause applications"}
        </button>
      </section>
    </>
  );
}
