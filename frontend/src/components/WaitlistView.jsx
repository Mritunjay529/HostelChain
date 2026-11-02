import { ROOM_TYPES, shortAddress, sameAddress } from "../lib/chain";

export default function WaitlistView({ waitlists, account, isWarden }) {
  return (
    <div className="two-col">
      {waitlists.map((list, type) => (
        <div key={type}>
          <h3>
            {ROOM_TYPES[type]} waitlist <span className="muted">({list.length})</span>
          </h3>
          {list.length === 0 ? (
            <p className="empty">Nobody is waiting.</p>
          ) : (
            <ol className="queue">
              {list.map((s, i) => (
                <li key={s.wallet} className={sameAddress(s.wallet, account) ? "me" : ""}>
                  <span className="pos">{i + 1}</span>
                  <span className="mono">{shortAddress(s.wallet)}</span>
                  <span className="muted">Year {s.year}</span>
                  {isWarden && <span className="muted">Roll {s.rollNo}</span>}
                  {sameAddress(s.wallet, account) && <span className="tag tag-you">You</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  );
}
