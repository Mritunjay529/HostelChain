import { ROOM_TYPES, shortAddress, sameAddress } from "../lib/chain";

export default function RoomDetail({ room, residents, account, isWarden, onMaintenance, busy }) {
  if (!room) return null;
  const list = residents[room.id] || [];

  return (
    <section className="card detail" aria-live="polite">
      <div className="card-head">
        <div>
          <h3>Room {room.number}</h3>
          <p className="muted">
            {ROOM_TYPES[room.type]} · {room.occupied} of {room.capacity} beds taken
            {room.maintenance ? " · under maintenance" : ""}
          </p>
        </div>
        {isWarden && (
          <button
            className="btn"
            disabled={busy || (!room.maintenance && room.occupied > 0)}
            title={!room.maintenance && room.occupied > 0 ? "Empty the room first" : undefined}
            onClick={() => onMaintenance(room, !room.maintenance)}
          >
            {room.maintenance ? "Reopen room" : "Close for maintenance"}
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <p className="empty">Nobody lives here yet.</p>
      ) : (
        <ul className="people">
          {list.map((s) => (
            <li key={s.wallet}>
              <span className="mono">{shortAddress(s.wallet)}</span>
              <span className="muted">Year {s.year}</span>
              {isWarden && <span className="muted">Roll {s.rollNo}</span>}
              {sameAddress(s.wallet, account) && <span className="tag tag-you">You</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
