import { useCallback, useEffect, useRef, useState } from "react";
import { Contract } from "ethers";
import {
  ABI,
  ALLOCATION,
  CONTRACT_ADDRESS,
  DEPLOY_BLOCK,
  REGISTRATION,
  getReadProvider,
  iface,
  sameAddress,
} from "../lib/chain";

const POLL_MS = 4000;
const HIDDEN_EVENTS = new Set(["OwnershipTransferred"]);

const toRoom = (r) => ({
  id: Number(r.id),
  number: r.number,
  type: Number(r.roomType),
  capacity: Number(r.capacity),
  occupied: Number(r.occupied),
  maintenance: r.underMaintenance,
});

const toStudent = (wallet, s) => ({
  wallet,
  rollNo: s.rollNo,
  year: Number(s.year),
  registration: Number(s.registration),
  allocation: Number(s.allocation),
  requestedType: Number(s.requestedType),
  roomId: Number(s.roomId),
});

export async function fetchAll(account) {
  const provider = getReadProvider();
  if ((await provider.getCode(CONTRACT_ADDRESS)) === "0x") {
    const err = new Error("The contract is not deployed on this chain.");
    err.code = "NO_CONTRACT";
    throw err;
  }
  const c = new Contract(CONTRACT_ADDRESS, ABI, provider);

  const [owner, paused, roomsRaw, studentsRaw, waitNon, waitAc, logs] = await Promise.all([
    c.owner(),
    c.paused(),
    c.getRooms(0, 500),
    c.getStudents(0, 1000),
    c.getWaitlist(0),
    c.getWaitlist(1),
    provider.getLogs({ address: CONTRACT_ADDRESS, fromBlock: DEPLOY_BLOCK, toBlock: "latest" }),
  ]);

  const rooms = roomsRaw.map(toRoom);
  const [wallets, data] = [studentsRaw[0], studentsRaw[1]];
  const students = wallets
    .map((w, i) => toStudent(w, data[i]))
    .filter((s) => s.registration !== REGISTRATION.NONE);
  const byWallet = new Map(students.map((s) => [s.wallet.toLowerCase(), s]));

  const residents = {};
  for (const s of students) {
    if (s.allocation === ALLOCATION.ALLOCATED) (residents[s.roomId] ||= []).push(s);
  }

  const toEntries = (list) => list.map((w) => byWallet.get(w.toLowerCase())).filter(Boolean);
  const waitlists = [toEntries(waitNon), toEntries(waitAc)];

  const me = account ? byWallet.get(account.toLowerCase()) || null : null;
  const myPosition =
    me && me.allocation === ALLOCATION.WAITLISTED ? Number(await c.waitlistPosition(account)) : 0;

  // Activity ledger, newest first, with block timestamps for the most recent entries.
  const events = [];
  for (const log of logs) {
    const parsed = iface.parseLog(log);
    if (!parsed || HIDDEN_EVENTS.has(parsed.name)) continue;
    events.push({
      key: `${log.transactionHash}-${log.index}`,
      name: parsed.name,
      args: parsed.args,
      block: log.blockNumber,
      tx: log.transactionHash,
    });
  }
  events.reverse();
  const recent = events.slice(0, 60);
  const blockNumbers = [...new Set(recent.map((e) => e.block))];
  const blocks = await Promise.all(blockNumbers.map((n) => provider.getBlock(n)));
  const times = new Map(blocks.filter(Boolean).map((b) => [b.number, b.timestamp]));
  recent.forEach((e) => (e.time = times.get(e.block)));

  return {
    owner,
    paused,
    rooms,
    students,
    residents,
    waitlists,
    me,
    myPosition,
    events: recent,
    isWarden: sameAddress(owner, account),
  };
}

/** Loads everything the UI needs and keeps it fresh. */
export function useHostel(account) {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const accountRef = useRef(account);
  accountRef.current = account;

  const reload = useCallback(async () => {
    try {
      const data = await fetchAll(accountRef.current);
      setState({ status: "ready", data, error: null });
    } catch (e) {
      setState((prev) => ({
        status: "error",
        data: prev.data,
        error: e?.code === "NO_CONTRACT" ? e.message : "Cannot reach the blockchain node.",
      }));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload, account]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) reload();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [reload]);

  return { ...state, reload };
}
