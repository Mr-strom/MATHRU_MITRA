/**
 * MaatruMitra — Network status & offline simulation hook.
 *
 * Detects browser online/offline status, provides manual simulation switch,
 * and manages low-bandwidth mode for rural field usability.
 */

import { useState, useEffect, useCallback } from "react";

export interface NetworkStatus {
  isOnline: boolean;
  isSimulatedOffline: boolean;
  effectiveOnline: boolean;
  isLowBandwidth: boolean;
  toggleSimulatedOffline: () => void;
  setSimulatedOffline: (simulated: boolean) => void;
  toggleLowBandwidth: () => void;
  setLowBandwidth: (lowBandwidth: boolean) => void;
}

const STORAGE_KEY = "maatrumitra_low_bandwidth";

export function useNetworkStatus(): NetworkStatus {
  const [browserOnline, setBrowserOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [isSimulatedOffline, setIsSimulatedOffline] = useState<boolean>(false);
  const [isLowBandwidth, setIsLowBandwidthState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === "true";
    // Check saveData connection hint
    const conn = (navigator as any).connection;
    return conn ? conn.saveData === true : false;
  });

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

  const setLowBandwidth = useCallback((val: boolean) => {
    setIsLowBandwidthState(val);
    try {
      localStorage.setItem(STORAGE_KEY, String(val));
    } catch {}
  }, []);

  const toggleLowBandwidth = useCallback(() => {
    setIsLowBandwidthState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  const effectiveOnline = browserOnline && !isSimulatedOffline;

  return {
    isOnline: browserOnline,
    isSimulatedOffline,
    effectiveOnline,
    isLowBandwidth,
    toggleSimulatedOffline,
    setSimulatedOffline,
    toggleLowBandwidth,
    setLowBandwidth,
  };
}

