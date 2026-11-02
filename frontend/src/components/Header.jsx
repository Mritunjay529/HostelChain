import { CHAIN_ID, shortAddress } from "../lib/chain";

const NETWORK_NAMES = { 31337: "Local network", 11155111: "Sepolia testnet" };

export default function Header({ wallet, isWarden, paused }) {
  const { account, hasWallet, wrongNetwork, connect, switchNetwork } = wallet;

  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="HostelChain home">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="#17202B" />
          <rect x="6" y="6" width="9" height="9" rx="2" fill="#2BB3A8" />
          <rect x="17" y="6" width="9" height="9" rx="2" fill="#fff" />
          <rect x="6" y="17" width="9" height="9" rx="2" fill="#fff" />
          <rect x="17" y="17" width="9" height="9" rx="2" fill="#F0B429" />
        </svg>
        <span>HostelChain</span>
      </a>

      <div className="topbar-right">
        {paused && <span className="chip chip-warn">Applications paused</span>}
        <span className="chip">{NETWORK_NAMES[CHAIN_ID] || `Chain ${CHAIN_ID}`}</span>
        {account && <span className="chip chip-role">{isWarden ? "Warden" : "Student"}</span>}

        {wrongNetwork ? (
          <button className="btn btn-warn" onClick={switchNetwork}>
            Switch to {NETWORK_NAMES[CHAIN_ID] || `chain ${CHAIN_ID}`}
          </button>
        ) : account ? (
          <span className="wallet mono" title={account}>
            {shortAddress(account)}
          </span>
        ) : (
          <button className="btn btn-primary" onClick={connect}>
            {hasWallet ? "Connect wallet" : "Install MetaMask"}
          </button>
        )}
      </div>
    </header>
  );
}
