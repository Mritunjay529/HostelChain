import { ROOM_TYPES } from "../lib/chain";

function roomStatus(room) {
  if (room.maintenance) return "maint";
  if (room.occupied >= room.capacity) return "full";
  if (room.occupied > 0) return "part";
  return "free";
}

const STATUS_LABEL = {
  free: "free",
  part: "partly filled",
  full: "full",
  maint: "under maintenance",
};

export default function RoomMap({ rooms, me, filter, onFilter, selectedId, onSelect }) {
  const visible = rooms.filter((r) => filter === "all" || r.type === Number(filter));
  const myRoomId = me?.roomId || 0;

  return (
    <section className="card" aria-labelledby="map-title">
      <div className="card-head">
        <div>
          <h2 id="map-title">Rooms</h2>
          <p className="muted">Each square is a bed. Filled squares are taken.</p>
        </div>
        <div className="seg" role="radiogroup" aria-label="Filter by room type">
          {[
            ["all", "All"],
            ["0", ROOM_TYPES[0]],
            ["1", ROOM_TYPES[1]],
          ].map(([value, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={filter === value}
              className={filter === value ? "on" : ""}
              onClick={() => onFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {rooms.length === 0 ? (
        <p className="empty">No rooms yet. The warden adds rooms from the warden panel.</p>
      ) : (
        <div className="room-grid">
          {visible.map((room) => {
            const status = roomStatus(room);
            const mine = room.id === myRoomId;
            return (
              <button
                key={room.id}
                className={`room ${status}${mine ? " mine" : ""}${room.id === selectedId ? " selected" : ""}`}
                onClick={() => onSelect(room.id === selectedId ? null : room.id)}
                aria-pressed={room.id === selectedId}
                aria-label={`Room ${room.number}, ${ROOM_TYPES[room.type]}, ${room.occupied} of ${room.capacity} beds taken, ${STATUS_LABEL[status]}${mine ? ", your room" : ""}`}
              >
                <span className="room-top">
                  <span className="room-no">{room.number}</span>
                  {room.type === 1 && <span className="room-ac">AC</span>}
                </span>
                <span className="pips" aria-hidden="true">
                  {Array.from({ length: room.capacity }, (_, i) => (
                    <i key={i} className={i < room.occupied ? "on" : ""} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <ul className="legend" aria-label="Legend">
        <li><i className="sw free" />Free</li>
        <li><i className="sw part" />Partly filled</li>
        <li><i className="sw full" />Full</li>
        <li><i className="sw maint" />Maintenance</li>
        <li><i className="sw mine" />Your room</li>
      </ul>
    </section>
  );
}
