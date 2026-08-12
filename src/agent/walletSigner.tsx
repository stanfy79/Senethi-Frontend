import { useEffect, useState } from "react";
import {
  usePrivy,
  useSigners,
  useWallets,
} from "@privy-io/react-auth";

export function WalletSigner() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { addSigners } = useSigners();

  const [status, setStatus] = useState<
    "idle" | "adding" | "success" | "error"
  >("idle");

  const [error, setError] = useState<string | null>(null);

  const wallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy"
  );

  useEffect(() => {
    if (!ready || !authenticated) return;

    console.log("[PRIVY] Wallets:", wallets);
    console.log("[PRIVY] Embedded wallet:", wallet?.address);
  }, [ready, authenticated, wallets, wallet]);

  if (!ready || !authenticated) {
    return null;
  }

  if (!wallet) return null;

  const enableSentinel = async () => {
    try {
      setStatus("adding");
      setError(null);

      console.log(
        "[PRIVY] Adding Sentinel signer to:",
        wallet.address
      );

      await addSigners({
        address: wallet.address,
        signers: [
          {
            signerId: import.meta.env.VITE_PRIVY_SIGNER_ID,
            policyIds: [],
          },
        ],
      });

      console.log("[PRIVY] Sentinel signer added");

      setStatus("success");
    } catch (err) {
      console.error(
        "[PRIVY] Failed to add Sentinel signer:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : String(err)
      );

      setStatus("error");
    }
  };

  if (status === "success") return;

  return (
    <div className="signer-button">
      <button
        onClick={enableSentinel}
        disabled={status === "adding"}
      >
        {status === "adding"
          ? "Enabling Sentinel..."
          : "Enable Sentinel"}
      </button>

      {error && (
        <p>
          {error}
        </p>
      )}
    </div>
  );
}