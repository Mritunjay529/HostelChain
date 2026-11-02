import { useCallback, useState } from "react";
import { BrowserProvider, Contract } from "ethers";
import { ABI, CONTRACT_ADDRESS, friendlyError } from "../lib/chain";

/**
 * Sends a state-changing transaction through the user's wallet and reports
 * progress via toasts. Returns true when the transaction was mined.
 */
export function useTx({ push, update, reload }) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (label, method, ...args) => {
      setBusy(true);
      const id = push({ kind: "pending", text: `${label}: confirm in your wallet…` });
      try {
        const signer = await new BrowserProvider(window.ethereum).getSigner();
        const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);
        const tx = await contract[method](...args);
        update(id, { text: `${label}: waiting for the network…` });
        await tx.wait();
        update(id, { kind: "ok", text: `${label}: done.` });
        await reload();
        return true;
      } catch (e) {
        update(id, { kind: "error", text: friendlyError(e) });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [push, update, reload]
  );

  return { run, busy };
}
