import { useMemo, useState } from "react";
import Header from "./components/Header.jsx";
import RoomMap from "./components/RoomMap.jsx";
import RoomDetail from "./components/RoomDetail.jsx";
import StudentPanel from "./components/StudentPanel.jsx";
import WardenPanel from "./components/WardenPanel.jsx";
import WaitlistView from "./components/WaitlistView.jsx";
import Ledger from "./components/Ledger.jsx";
import Toasts from "./components/Toasts.jsx";
import { useWallet } from "./hooks/useWallet.js";
import { useHostel } from "./hooks/useHostel.js";
import { useToasts } from "./hooks/useToasts.js";
import { useTx } from "./hooks/useTx.js";
import { CHAIN_ID, CONTRACT_ADDRESS, ROOM_TYPES, RPC_URL, shortAddress } from "./lib/chain";

export default function App() {
  const wallet = useWallet();
  const { status, data, error, reload } = useHostel(wallet.account);
  const toasts = useToasts();
  const tx = useTx({ push: toasts.push, update: toasts.update, reload });

  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("waitlist");

  const busy = tx.busy || wallet.wrongNetwork;
  const txApi = { run: tx.run };

  const summary = useMemo(() => {
    if (!data) return null;
    const open = data.rooms.filter((r) => !r.maintenance);
    const beds = open.reduce((n, r) => n + r.capacity, 0);
    const taken = open.reduce((n, r) => n + r.occupied, 0);
    return { beds, taken, waiting: data.waitlists.map((l) => l.length) };
  }, [data]);

  const selectedRoom = data?.rooms.find((r) => r.id === selectedId) || null;

  return (
    <>
      <Header wallet={wallet} isWarden={!!data?.isWarden} paused={!!data?.paused} />

      <main className="shell">
        <div className="page-head">
          <h1>Hostel room allocation</h1>
          {summary && (
            <p className="muted">
              {summary.taken} of {summary.beds} beds taken. {summary.waiting[0]} waiting for Non-AC, {summary.waiting[1]} waiting for AC.
              Every allocation and waitlist change is recorded on the blockchain, so nobody can reorder the list quietly.
            </p>
          )}
        </div>

        {status === "error" && (
          <div className="banner banner-error" role="alert">
            <strong>{error}</strong> Start the local node with <code>npm run node</code>, then run{" "}
            <code>npm run deploy:local</code>. The app reads from <code>{RPC_URL}</code> (chain {CHAIN_ID}).
          </div>
        )}
        {wallet.wrongNetwork && (
          <div className="banner banner-warn" role="alert">
            Your wallet is on a different network. Switch to chain {CHAIN_ID} to apply or make changes.
          </div>
        )}
        {wallet.error && <div className="banner banner-warn" role="alert">{wallet.error}</div>}

        {status === "loading" && <p className="muted">Loading rooms from the blockchain…</p>}

        {data && (
          <div className="layout">
            <div className="main">
              <RoomMap
                rooms={data.rooms}
                me={data.me}
                filter={filter}
                onFilter={setFilter}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              <RoomDetail
                room={selectedRoom}
                residents={data.residents}
                account={wallet.account}
                isWarden={data.isWarden}
                busy={busy}
                onMaintenance={(room, on) =>
                  tx.run(`${on ? "Close" : "Reopen"} room ${room.number}`, "setMaintenance", room.id, on)
                }
              />

              <section className="card">
                <div className="tabs" role="tablist">
                  <button role="tab" aria-selected={tab === "waitlist"} className={tab === "waitlist" ? "on" : ""} onClick={() => setTab("waitlist")}>
                    Waitlist
                  </button>
                  <button role="tab" aria-selected={tab === "ledger"} className={tab === "ledger" ? "on" : ""} onClick={() => setTab("ledger")}>
                    Activity
                  </button>
                </div>
                {tab === "waitlist" ? (
                  <WaitlistView waitlists={data.waitlists} account={wallet.account} isWarden={data.isWarden} />
                ) : (
                  <Ledger events={data.events} rooms={data.rooms} />
                )}
              </section>
            </div>

            <aside className="aside">
              {!wallet.account ? (
                <section className="card">
                  <h2>Apply for a room</h2>
                  <p className="muted">
                    Connect your wallet to register and apply. You can browse rooms, the waitlist and the activity log without one.
                  </p>
                  <button className="btn btn-primary" onClick={wallet.connect}>
                    {wallet.hasWallet ? "Connect wallet" : "Install MetaMask"}
                  </button>
                </section>
              ) : data.isWarden ? (
                <WardenPanel data={data} tx={txApi} busy={busy} />
              ) : (
                <StudentPanel data={data} tx={txApi} busy={busy} />
              )}
            </aside>
          </div>
        )}
      </main>

      <footer className="footer">
        <span>
          Contract <span className="mono" title={CONTRACT_ADDRESS}>{shortAddress(CONTRACT_ADDRESS)}</span> on chain {CHAIN_ID}
        </span>
        <span>{ROOM_TYPES.join(" and ")} rooms · priority by year, then first come first served</span>
      </footer>

      <Toasts toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </>
  );
}
