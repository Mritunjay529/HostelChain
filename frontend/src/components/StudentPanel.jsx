import { useState } from "react";
import { ALLOCATION, REGISTRATION, ROOM_TYPES, YEARS } from "../lib/chain";

function freeBeds(rooms, type) {
  return rooms
    .filter((r) => r.type === type && !r.maintenance)
    .reduce((n, r) => n + (r.capacity - r.occupied), 0);
}

export default function StudentPanel({ data, tx, busy }) {
  const { me, myPosition, rooms, waitlists, paused } = data;
  const [rollNo, setRollNo] = useState("");
  const [year, setYear] = useState(1);
  const [type, setType] = useState(0);

  // 1. Not registered yet
  if (!me) {
    return (
      <section className="card">
        <h2>Register</h2>
        <p className="muted">
          Enter your college roll number. The warden checks it against college records before you can apply.
        </p>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            tx.run("Registration", "register", rollNo.trim(), year);
          }}
        >
          <label>
            Roll number
            <input value={rollNo} onChange={(e) => setRollNo(e.target.value)} maxLength={32} placeholder="e.g. 2329383" required />
          </label>
          <label>
            Year of study
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {YEARS.map((y) => (
                <option key={y} value={y}>Year {y}</option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" disabled={busy || !rollNo.trim()}>Register</button>
        </form>
      </section>
    );
  }

  // 2. Waiting for the warden
  if (me.registration === REGISTRATION.PENDING) {
    return (
      <section className="card">
        <h2>Waiting for approval</h2>
        <p>
          Roll number <strong className="mono">{me.rollNo}</strong>, year {me.year}, is with the warden. You can apply for a room once it is approved.
        </p>
      </section>
    );
  }

  // 3. Has a room
  if (me.allocation === ALLOCATION.ALLOCATED) {
    const room = rooms.find((r) => r.id === me.roomId);
    return (
      <section className="card">
        <h2>Your room</h2>
        <p className="big">{room?.number}</p>
        <p className="muted">{room ? `${ROOM_TYPES[room.type]}, ${room.capacity} beds` : ""}</p>
        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={() => window.confirm(`Give up room ${room?.number}? The next student on the waitlist will get it.`) && tx.run("Vacate room", "vacateRoom")}
        >
          Vacate room
        </button>
      </section>
    );
  }

  // 4. On the waitlist
  if (me.allocation === ALLOCATION.WAITLISTED) {
    const list = waitlists[me.requestedType];
    return (
      <section className="card">
        <h2>On the waitlist</h2>
        <p className="big">#{myPosition} <span className="of">of {list.length}</span></p>
        <p className="muted">
          Waiting for a {ROOM_TYPES[me.requestedType]} room. Higher years go first; inside a year it is first come, first served. You get a room automatically when a bed frees up.
        </p>
        <button className="btn" disabled={busy} onClick={() => tx.run("Leave waitlist", "cancelApplication")}>
          Leave waitlist
        </button>
      </section>
    );
  }

  // 5. Verified, no room yet
  const beds = freeBeds(rooms, type);
  return (
    <section className="card">
      <h2>Apply for a room</h2>
      <div className="seg seg-wide" role="radiogroup" aria-label="Room type">
        {ROOM_TYPES.map((label, i) => (
          <button key={label} role="radio" aria-checked={type === i} className={type === i ? "on" : ""} onClick={() => setType(i)}>
            {label}
          </button>
        ))}
      </div>
      <p className="muted spaced">
        {beds > 0
          ? `${beds} ${ROOM_TYPES[type]} ${beds === 1 ? "bed is" : "beds are"} free. You get one straight away.`
          : `No ${ROOM_TYPES[type]} beds are free. You will join the waitlist (${waitlists[type].length} waiting).`}
      </p>
      <button className="btn btn-primary" disabled={busy || paused} onClick={() => tx.run("Application", "applyForRoom", type)}>
        {beds > 0 ? "Apply for room" : "Join waitlist"}
      </button>
      {paused && <p className="note">Applications are paused by the warden.</p>}
    </section>
  );
}
