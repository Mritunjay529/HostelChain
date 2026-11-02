import { Interface, JsonRpcProvider } from "ethers";
import deployment from "../contracts/HostelAllocation.json";

export const CONTRACT_ADDRESS = deployment.address;
export const ABI = deployment.abi;
export const CHAIN_ID = deployment.chainId;
export const DEPLOY_BLOCK = deployment.deployBlock ?? 0;
export const RPC_URL = import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545";

export const iface = new Interface(ABI);

// Enum values mirror the Solidity enums.
export const ROOM_TYPES = ["Non-AC", "AC"];
export const REGISTRATION = { NONE: 0, PENDING: 1, VERIFIED: 2 };
export const ALLOCATION = { NONE: 0, ALLOCATED: 1, WAITLISTED: 2 };
export const YEARS = [1, 2, 3, 4, 5];

let readProvider;
/** Read-only provider, so anyone can inspect allocations without a wallet. */
export function getReadProvider() {
  if (!readProvider) {
    readProvider = new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true, batchMaxCount: 1 });
  }
  return readProvider;
}

export const shortAddress = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const sameAddress = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

const MESSAGES = {
  OwnableUnauthorizedAccount: "Only the warden account can do this.",
  EnforcedPause: "Applications are paused by the warden.",
  InvalidRollNo: "Enter a roll number of 1 to 32 characters.",
  InvalidYear: "Pick a year between 1 and 5.",
  InvalidCapacity: "A room holds between 1 and 6 beds.",
  InvalidRoomNumber: "Enter a room number of 1 to 16 characters.",
  RoomNumberTaken: "A room with this number already exists.",
  RoomNotFound: "That room does not exist.",
  RoomNotEmpty: "The room still has residents.",
  NoChange: "The room is already in that state.",
  AlreadyRegistered: "This wallet is already registered.",
  RollNoTaken: "This roll number is already registered by another wallet.",
  NotPending: "This registration is no longer pending.",
  NotVerified: "The warden has not approved your registration yet.",
  AlreadyApplied: "You already have a room or a place on the waitlist.",
  NotAllocated: "You do not have a room to vacate.",
  NotWaitlisted: "You are not on the waitlist.",
  NothingToEvict: "This student has no room and is not on the waitlist.",
};

function parseData(data) {
  if (typeof data !== "string" || !data.startsWith("0x") || data.length < 10) return null;
  try {
    return iface.parseError(data);
  } catch {
    return null;
  }
}

/** Turns any wallet / RPC / contract failure into a sentence a student can act on. */
export function friendlyError(e) {
  if (e?.code === "ACTION_REJECTED" || e?.info?.error?.code === 4001) {
    return "You cancelled the request in your wallet.";
  }
  const name =
    e?.revert?.name ||
    parseData(e?.data)?.name ||
    parseData(e?.error?.data)?.name ||
    parseData(e?.info?.error?.data)?.name;
  if (name && MESSAGES[name]) return MESSAGES[name];
  if (e?.code === "INSUFFICIENT_FUNDS") return "Your wallet has no funds to pay the network fee.";
  return e?.shortMessage || (e?.message ? e.message.slice(0, 140) : "Something went wrong.");
}

export function formatTime(seconds) {
  if (!seconds) return "";
  return new Date(seconds * 1000).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
