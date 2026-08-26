/**
 * MaatruMitra — Network status & offline simulation hook.
 *
 * Detects browser online/offline status and provides a manual simulation switch
 * for evaluating offline queue behavior during live demonstrations.
 */

import { useState, useEffect, useCallback } from "react";

export interface NetworkStatus {
  isOnline: boolean;
  isSimulatedOffline: boolean;
  effectiveOnline: boolean;
  toggleSimulatedOffline: () => void;
  setSimulatedOffline: (simulated: boolean) => void;
}

export function useNetworkStatus(): NetworkStatus {
  const [browserOnline, setBrowserOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [isSimulatedOffline, setIsSimulatedOffline] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const toggleSimulatedOffline = useCallback(() => {
    setIsSimulatedOffline((prev) => !prev);
  }, []);

  const setSimulatedOffline = useCallback((simulated: boolean) => {
    setIsSimulatedOffline(simulated);
  }, []);

  const effectiveOnline = browserOnline && !isSimulatedOffline;

  return {
    isOnline: browserOnline,
    isSimulatedOffline,
    effectiveOnline,
    toggleSimulatedOffline,
    setSimulatedOffline,
  };
}
