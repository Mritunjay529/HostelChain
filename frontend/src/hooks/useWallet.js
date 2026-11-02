import { useCallback, useEffect, useState } from "react";
import { CHAIN_ID, RPC_URL } from "../lib/chain";

const hexChain = "0x" + CHAIN_ID.toString(16);

export function useWallet() {
  const eth = typeof window !== "undefined" ? window.ethereum : undefined;
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!eth) return undefined;
    eth.request({ method: "eth_accounts" }).then((a) => setAccount(a[0] ?? null)).catch(() => {});
    eth.request({ method: "eth_chainId" }).then((c) => setChainId(parseInt(c, 16))).catch(() => {});

    const onAccounts = (a) => setAccount(a[0] ?? null);
    const onChain = (c) => setChainId(parseInt(c, 16));
    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener("accountsChanged", onAccounts);
      eth.removeListener("chainChanged", onChain);
    };
  }, [eth]);

  const connect = useCallback(async () => {
    setError(null);
    if (!eth) {
      setError("No wallet found. Install MetaMask to continue.");
      return;
    }
    try {
      const a = await eth.request({ method: "eth_requestAccounts" });
      setAccount(a[0] ?? null);
    } catch (e) {
      setError(e?.code === 4001 ? "Connection cancelled." : "Could not connect to the wallet.");
    }
  }, [eth]);

  const switchNetwork = useCallback(async () => {
    setError(null);
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChain }] });
    } catch (e) {
      if (e?.code === 4902 || e?.data?.originalError?.code === 4902) {
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: hexChain,
                chainName: CHAIN_ID === 31337 ? "Hardhat Local" : `Chain ${CHAIN_ID}`,
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: [RPC_URL],
              },
            ],
          });
        } catch {
          setError("Could not add the network to your wallet.");
        }
      } else if (e?.code !== 4001) {
        setError("Could not switch network.");
      }
    }
  }, [eth]);

  return {
    hasWallet: !!eth,
    account,
    chainId,
    wrongNetwork: !!account && chainId !== null && chainId !== CHAIN_ID,
    error,
    connect,
    switchNetwork,
  };
}
