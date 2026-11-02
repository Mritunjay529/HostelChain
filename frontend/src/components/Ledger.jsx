import { ROOM_TYPES, formatTime, shortAddress } from "../lib/chain";

function describe(e, rooms) {
  const room = (id) => rooms.find((r) => r.id === Number(id))?.number ?? `#${id}`;
  const who = (a) => <span className="mono">{shortAddress(a)}</span>;
  const a = e.args;

  switch (e.name) {
    case "RoomAdded":
      return <>Room {a.number} added ({ROOM_TYPES[Number(a.roomType)]}, {Number(a.capacity)} beds)</>;
    case "RoomMaintenanceChanged":
      return <>Room {room(a.roomId)} {a.underMaintenance ? "closed for maintenance" : "reopened"}</>;
    case "StudentRegistered":
      return <>{who(a.student)} registered (year {Number(a.year)})</>;
    case "StudentApproved":
      return <>{who(a.student)} approved by the warden</>;
    case "StudentRejected":
      return <>{who(a.student)} registration rejected</>;
    case "RoomAllocated":
      return <>{who(a.student)} got room {room(a.roomId)}{a.fromWaitlist ? " from the waitlist" : ""}</>;
    case "AddedToWaitlist":
      return <>{who(a.student)} joined the {ROOM_TYPES[Number(a.roomType)]} waitlist (year {Number(a.year)})</>;
    case "LeftWaitlist":
      return <>{who(a.student)} {a.byWarden ? "was removed from" : "left"} the waitlist</>;
    case "RoomVacated":
      return <>{who(a.student)} {a.byWarden ? "was removed from" : "left"} room {room(a.roomId)}</>;
    case "Paused":
      return <>Applications paused</>;
    case "Unpaused":
      return <>Applications resumed</>;
    default:
      return <>{e.name}</>;
  }
}

export default function Ledger({ events, rooms }) {
  if (events.length === 0) return <p className="empty">Nothing has happened yet.</p>;
  return (
    <ul className="ledger">
      {events.map((e) => (
        <li key={e.key}>
          <span className="ledger-text">{describe(e, rooms)}</span>
          <span className="ledger-meta muted">
            {formatTime(e.time)} · block {e.block} · <span className="mono">{e.tx.slice(0, 10)}…</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
