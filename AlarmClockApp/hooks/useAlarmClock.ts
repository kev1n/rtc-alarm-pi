import { useState, useEffect, useCallback } from "react";
import useAlarmClockBLE, {
  Alarm,
  DeviceStatus,
  ConnectionState,
} from "./useAlarmClockBLE";

export interface AlarmClockState {
  // Connection
  connectionState: ConnectionState;
  isConnecting: boolean;
  lastError: string | null;

  // Alarms
  alarms: Alarm[];
  isLoading: boolean;

  // Device status
  deviceStatus: DeviceStatus | null;

  // Auto-connection
  isAutoConnecting: boolean;
}

export interface AlarmClockActions {
  // Alarm management
  refreshAlarms: () => Promise<void>;
  addAlarm: (
    hour: number,
    minute: number,
    name?: string,
    days?: number[],
    recurring?: boolean
  ) => Promise<boolean>;
  removeAlarm: (nameOrIndex: string | number) => Promise<boolean>;
  toggleAlarm: (nameOrIndex: string | number) => Promise<boolean>;

  // Device
  getStatus: () => Promise<void>;
  ping: () => Promise<boolean>;

  // Error handling
  clearError: () => void;
}

export function useAlarmClock(): [AlarmClockState, AlarmClockActions] {
  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [expectedAlarmCount, setExpectedAlarmCount] = useState(0);
  const [loadingTimeoutId, setLoadingTimeoutId] =
    useState<NodeJS.Timeout | null>(null);
  const [reconnectTimeoutId, setReconnectTimeoutId] =
    useState<NodeJS.Timeout | null>(null);

  // Use the new BLE hook
  const {
    connectionState,
    error,
    alarms,
    deviceStatus,
    requestPermissions,
    scanForPeripherals,
    connectToDevice: bleConnectToDevice,
    disconnect: bleDisconnect,
    listAlarms,
    addAlarm: bleAddAlarm,
    removeAlarm: bleRemoveAlarm,
    toggleAlarm: bleToggleAlarm,
    getStatus: bleGetStatus,
    ping: blePing,
    allDevices,
    onResponse,
    autoConnect: bleAutoConnect,
  } = useAlarmClockBLE();

  // Auto-reconnect logic
  useEffect(() => {
    let isMounted = true;

    const attemptReconnect = async () => {
      if (!isMounted) return;

      console.log("🔄 Attempting automatic reconnection...");
      setIsAutoConnecting(true);

      try {
        const connected = await bleAutoConnect();
        if (isMounted) {
          if (connected) {
            console.log("✅ Automatic reconnection successful");
            setLastError(null);
          } else {
            console.log("❌ Automatic reconnection failed, will retry...");
            // Schedule next retry in 10 seconds
            if (isMounted) {
              const timeoutId = setTimeout(() => {
                if (isMounted && connectionState === "disconnected") {
                  attemptReconnect();
                }
              }, 10000);
              setReconnectTimeoutId(timeoutId);
            }
          }
        }
      } catch (error) {
        if (isMounted) {
          console.error("❌ Reconnection attempt failed:", error);
          // Schedule next retry in 15 seconds on error
          const timeoutId = setTimeout(() => {
            if (isMounted && connectionState === "disconnected") {
              attemptReconnect();
            }
          }, 15000);
          setReconnectTimeoutId(timeoutId);
        }
      } finally {
        if (isMounted) {
          setIsAutoConnecting(false);
        }
      }
    };

    // Start auto-connection if disconnected
    if (connectionState === "disconnected") {
      // Clear any existing timeout
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
        setReconnectTimeoutId(null);
      }

      // Start immediate connection attempt
      attemptReconnect();
    }

    return () => {
      isMounted = false;
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
      }
    };
  }, [connectionState, bleAutoConnect, reconnectTimeoutId]);

  // Define refreshAlarms first to avoid circular dependencies
  const refreshAlarms = useCallback(async (): Promise<void> => {
    if (connectionState !== "connected") return;

    setIsLoading(true);
    await listAlarms();

    // Set loading to false after a timeout if no response
    setTimeout(() => {
      setIsLoading(false);
    }, 3000);
  }, [connectionState, listAlarms]);

  // Sync error state
  useEffect(() => {
    if (error) {
      setLastError(error);
    }
  }, [error]);

  // Listen to responses for additional state management
  useEffect(() => {
    const unsubscribe = onResponse((response: string) => {
      console.log("🎯 Handling response:", response);

      if (response.startsWith("OK:LIST:")) {
        // Handle alarm list start - set loading state and ensure clean start
        const parts = response.split(":");
        const count = parseInt(parts[2] || "0");
        console.log(`🗂️ Alarm list starting, expecting ${count} alarms`);

        // Clear any existing timeout
        if (loadingTimeoutId) {
          clearTimeout(loadingTimeoutId);
        }

        setExpectedAlarmCount(count);
        setIsLoading(count > 0);

        // Set timeout to stop loading if we don't receive all alarms
        if (count > 0) {
          const timeoutId = setTimeout(() => {
            console.log("⏰ Alarm loading timeout, stopping load");
            setIsLoading(false);
          }, 3000); // 3 second timeout
          setLoadingTimeoutId(timeoutId);
        }
      } else if (response.startsWith("ALARM:") || response.startsWith("A")) {
        // Handle both original ALARM format and compact A format
        console.log("📋 Alarm data received");
        // The alarm state will be updated in useAlarmClockBLE,
        // we'll check completion in a separate effect
      } else if (
        response.startsWith("OK:CLEAR") ||
        response.startsWith("OK:ALARMS_CLEARED")
      ) {
        // Alarms cleared, stop loading
        console.log("🗑️ Alarms cleared, stopping load");
        if (loadingTimeoutId) {
          clearTimeout(loadingTimeoutId);
          setLoadingTimeoutId(null);
        }
        setIsLoading(false);
      } else if (
        response.startsWith("OK:ADDED:") ||
        response.startsWith("OK:REMOVED:") ||
        response.startsWith("OK:TOGGLE:")
      ) {
        // Operations completed, refresh alarms
        console.log("🔄 Operation completed, refreshing alarms");
        setTimeout(() => refreshAlarms(), 500);
      } else if (response.startsWith("HEARTBEAT:")) {
        // Just log heartbeat, no action needed
        console.log("💓 Heartbeat received");
      }
    });

    return unsubscribe;
  }, [onResponse, refreshAlarms, loadingTimeoutId]);

  // Check if we've received all expected alarms
  useEffect(() => {
    if (expectedAlarmCount > 0 && alarms.length >= expectedAlarmCount) {
      console.log(
        `✅ Received all ${expectedAlarmCount} alarms, stopping load`
      );
      if (loadingTimeoutId) {
        clearTimeout(loadingTimeoutId);
        setLoadingTimeoutId(null);
      }
      setIsLoading(false);
      setExpectedAlarmCount(0);
    }
  }, [alarms.length, expectedAlarmCount, loadingTimeoutId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (loadingTimeoutId) {
        clearTimeout(loadingTimeoutId);
      }
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
      }
    };
  }, [loadingTimeoutId, reconnectTimeoutId]);

  const getStatus = useCallback(async (): Promise<void> => {
    if (connectionState !== "connected") return;
    await bleGetStatus();
  }, [connectionState, bleGetStatus]);

  const addAlarm = useCallback(
    async (
      hour: number,
      minute: number,
      name?: string,
      days?: number[],
      recurring: boolean = true
    ): Promise<boolean> => {
      if (connectionState !== "connected") return false;

      setLastError(null);
      return await bleAddAlarm(hour, minute, name, days, recurring);
    },
    [connectionState, bleAddAlarm]
  );

  const removeAlarm = useCallback(
    async (nameOrIndex: string | number): Promise<boolean> => {
      if (connectionState !== "connected") return false;

      setLastError(null);
      return await bleRemoveAlarm(nameOrIndex);
    },
    [connectionState, bleRemoveAlarm]
  );

  const toggleAlarm = useCallback(
    async (nameOrIndex: string | number): Promise<boolean> => {
      if (connectionState !== "connected") return false;

      setLastError(null);
      return await bleToggleAlarm(nameOrIndex);
    },
    [connectionState, bleToggleAlarm]
  );

  const ping = useCallback(async (): Promise<boolean> => {
    if (connectionState !== "connected") return false;
    return await blePing();
  }, [connectionState, blePing]);

  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  const state: AlarmClockState = {
    connectionState,
    isConnecting:
      connectionState === "scanning" || connectionState === "connecting",
    lastError,
    alarms,
    isLoading,
    deviceStatus,
    isAutoConnecting,
  };

  const actions: AlarmClockActions = {
    refreshAlarms,
    addAlarm,
    removeAlarm,
    toggleAlarm,
    getStatus,
    ping,
    clearError,
  };

  return [state, actions];
}
