import { useState, useEffect, useCallback, useMemo } from "react";
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

  // Time calculations
  alarmsWithTimeUntil: Alarm[];
}

export interface AlarmClockActions {
  // Alarm management
  refreshAlarms: () => Promise<void>;
  addAlarm: (
    hour: number,
    minute: number,
    name?: string,
    days?: number[],
    recurring?: boolean,
    vibration_strength?: number
  ) => Promise<boolean>;
  removeAlarm: (nameOrIndex: string | number) => Promise<boolean>;
  toggleAlarm: (nameOrIndex: string | number) => Promise<boolean>;
  editAlarm: (
    index: number,
    hour: number,
    minute: number,
    name?: string,
    days?: number[],
    recurring?: boolean,
    vibration_strength?: number
  ) => Promise<boolean>;

  // Device
  getStatus: () => Promise<void>;
  ping: () => Promise<boolean>;
  previewVibration: (strength?: number) => Promise<boolean>;

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
  const [optimisticAlarms, setOptimisticAlarms] = useState<Alarm[]>([]);
  const [useOptimisticState, setUseOptimisticState] = useState(false);
  const [timeUpdateInterval, setTimeUpdateInterval] =
    useState<NodeJS.Timeout | null>(null);

  // Use the new BLE hook
  const {
    connectionState,
    error,
    alarms: bleAlarms,
    deviceStatus,
    requestPermissions,
    scanForPeripherals,
    connectToDevice: bleConnectToDevice,
    disconnect: bleDisconnect,
    listAlarms,
    addAlarm: bleAddAlarm,
    removeAlarm: bleRemoveAlarm,
    toggleAlarm: bleToggleAlarm,
    editAlarm: bleEditAlarm,
    getStatus: bleGetStatus,
    ping: blePing,
    previewVibration: blePreviewVibration,
    allDevices,
    onResponse,
    autoConnect: bleAutoConnect,
  } = useAlarmClockBLE();

  // Calculate time until next alarm
  const calculateTimeUntil = useCallback((alarm: Alarm): string => {
    if (!alarm.enabled) return "disabled";

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;

    // Convert alarm time to minutes
    const alarmTime = alarm.hour * 60 + alarm.minute;

    let targetDate = new Date();
    let minutesDiff: number;

    if (alarm.days && alarm.days.length > 0) {
      // Weekday-based alarm
      const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const currentDayMapped = currentDay === 0 ? 6 : currentDay - 1; // Convert to 0 = Monday format

      let nextAlarmDay = -1;

      // Check if alarm could trigger today
      if (alarm.days.includes(currentDayMapped) && alarmTime > currentTime) {
        nextAlarmDay = currentDayMapped;
      } else {
        // Find next occurrence
        for (let i = 1; i <= 7; i++) {
          const checkDay = (currentDayMapped + i) % 7;
          if (alarm.days.includes(checkDay)) {
            nextAlarmDay = checkDay;
            break;
          }
        }
      }

      if (nextAlarmDay === -1) return "unknown";

      // Calculate days until
      let daysUntil: number;
      if (nextAlarmDay === currentDayMapped) {
        daysUntil = 0;
      } else if (nextAlarmDay > currentDayMapped) {
        daysUntil = nextAlarmDay - currentDayMapped;
      } else {
        daysUntil = 7 - currentDayMapped + nextAlarmDay;
      }

      targetDate.setDate(targetDate.getDate() + daysUntil);
      targetDate.setHours(alarm.hour, alarm.minute, 0, 0);

      minutesDiff = Math.floor(
        (targetDate.getTime() - now.getTime()) / (1000 * 60)
      );
    } else {
      // Daily alarm
      if (alarmTime > currentTime) {
        // Today
        targetDate.setHours(alarm.hour, alarm.minute, 0, 0);
      } else {
        // Tomorrow
        targetDate.setDate(targetDate.getDate() + 1);
        targetDate.setHours(alarm.hour, alarm.minute, 0, 0);
      }

      minutesDiff = Math.floor(
        (targetDate.getTime() - now.getTime()) / (1000 * 60)
      );
    }

    if (minutesDiff < 0) return "unknown";
    if (minutesDiff === 0) return "now";
    if (minutesDiff < 60) return `in ${minutesDiff}m`;
    if (minutesDiff < 1440) {
      const hours = Math.floor(minutesDiff / 60);
      const minutes = minutesDiff % 60;
      return minutes > 0 ? `in ${hours}h ${minutes}m` : `in ${hours}h`;
    }

    const days = Math.floor(minutesDiff / 1440);
    const remainingHours = Math.floor((minutesDiff % 1440) / 60);
    return remainingHours > 0
      ? `in ${days}d ${remainingHours}h`
      : `in ${days}d`;
  }, []);

  // Get the current alarms (either optimistic or BLE)
  const currentAlarms = useOptimisticState ? optimisticAlarms : bleAlarms;

  // Sort alarms by time and calculate time until
  const alarmsWithTimeUntil = useMemo(() => {
    const sortedAlarms = [...currentAlarms].sort((a, b) => {
      // First sort by time (hour * 60 + minute)
      const timeA = a.hour * 60 + a.minute;
      const timeB = b.hour * 60 + b.minute;
      return timeA - timeB;
    });

    // Add calculated time until for each alarm
    return sortedAlarms.map((alarm) => ({
      ...alarm,
      timeUntil: calculateTimeUntil(alarm),
    }));
  }, [currentAlarms, calculateTimeUntil]);

  // Auto-update time calculations every minute
  useEffect(() => {
    const interval = setInterval(() => {
      // Force recalculation by updating dependency
      setTimeUpdateInterval((prev) => prev);
    }, 60000); // Update every minute

    setTimeUpdateInterval(interval);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

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

  // When BLE alarms update, clear optimistic state (only on manual refresh)
  useEffect(() => {
    if (bleAlarms.length > 0 && useOptimisticState && isLoading) {
      // Only clear optimistic state during explicit loading (manual refresh)
      // and when we've received the expected number of alarms
      if (expectedAlarmCount > 0 && bleAlarms.length >= expectedAlarmCount) {
        setUseOptimisticState(false);
      }
    }
  }, [bleAlarms, useOptimisticState, isLoading, expectedAlarmCount]);

  // Define refreshAlarms first to avoid circular dependencies
  const refreshAlarms = useCallback(async (): Promise<void> => {
    if (connectionState !== "connected") return;

    setIsLoading(true);
    setUseOptimisticState(false); // Clear optimistic updates
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

        // Only set loading state if this is a manual refresh
        if (isLoading) {
          // Set timeout to stop loading if we don't receive all alarms
          if (count > 0) {
            const timeoutId = setTimeout(() => {
              console.log("⏰ Alarm loading timeout, stopping load");
              setIsLoading(false);
            }, 3000); // 3 second timeout
            setLoadingTimeoutId(timeoutId);
          }
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
        if (isLoading) {
          setIsLoading(false);
        }
      } else if (
        response.startsWith("OK:ADDED:") ||
        response.startsWith("OK:REMOVED:") ||
        response.startsWith("OK:TOGGLE:")
      ) {
        // Operations completed - keep optimistic state, don't auto-clear
        console.log("✅ Operation completed successfully");
        // Don't automatically clear optimistic state anymore
      } else if (response.startsWith("HEARTBEAT:")) {
        // Just log heartbeat, no action needed
        console.log("💓 Heartbeat received");
      }
    });

    return unsubscribe;
  }, [onResponse, loadingTimeoutId, isLoading]);

  // Check if we've received all expected alarms
  useEffect(() => {
    if (
      expectedAlarmCount > 0 &&
      bleAlarms.length >= expectedAlarmCount &&
      isLoading
    ) {
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
  }, [bleAlarms.length, expectedAlarmCount, loadingTimeoutId, isLoading]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (loadingTimeoutId) {
        clearTimeout(loadingTimeoutId);
      }
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
      }
      if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
      }
    };
  }, [loadingTimeoutId, reconnectTimeoutId, timeUpdateInterval]);

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
      recurring: boolean = true,
      vibration_strength?: number
    ): Promise<boolean> => {
      if (connectionState !== "connected") return false;

      // Optimistic update
      const newAlarm: Alarm = {
        index: Math.max(...currentAlarms.map((a) => a.index), -1) + 1, // Generate next index
        hour,
        minute,
        name: name || "New Alarm",
        enabled: true,
        recurring,
        timeUntil: "calculating...",
        days,
        vibration_strength,
      };

      setOptimisticAlarms([...currentAlarms, newAlarm]);
      setUseOptimisticState(true);

      setLastError(null);
      const success = await bleAddAlarm(
        hour,
        minute,
        name,
        days,
        recurring,
        vibration_strength
      );

      if (!success) {
        // Revert optimistic update on failure
        setUseOptimisticState(false);
      }

      return success;
    },
    [connectionState, bleAddAlarm, currentAlarms]
  );

  const removeAlarm = useCallback(
    async (nameOrIndex: string | number): Promise<boolean> => {
      if (connectionState !== "connected") return false;

      // Find alarm to remove for optimistic update
      let alarmToRemove: Alarm | undefined;
      if (typeof nameOrIndex === "number") {
        alarmToRemove = currentAlarms.find((a) => a.index === nameOrIndex);
      } else {
        alarmToRemove = currentAlarms.find((a) => a.name === nameOrIndex);
      }

      if (alarmToRemove) {
        // Optimistic update
        const updatedAlarms = currentAlarms.filter(
          (a) => a.index !== alarmToRemove!.index
        );
        setOptimisticAlarms(updatedAlarms);
        setUseOptimisticState(true);
      }

      setLastError(null);
      const success = await bleRemoveAlarm(nameOrIndex);

      if (!success && alarmToRemove) {
        // Revert optimistic update on failure
        setUseOptimisticState(false);
      }

      return success;
    },
    [connectionState, bleRemoveAlarm, currentAlarms]
  );

  const toggleAlarm = useCallback(
    async (nameOrIndex: string | number): Promise<boolean> => {
      if (connectionState !== "connected") return false;

      // Find alarm to toggle for optimistic update
      let alarmToToggle: Alarm | undefined;
      if (typeof nameOrIndex === "number") {
        alarmToToggle = currentAlarms.find((a) => a.index === nameOrIndex);
      } else {
        alarmToToggle = currentAlarms.find((a) => a.name === nameOrIndex);
      }

      if (alarmToToggle) {
        // Optimistic update
        const updatedAlarms = currentAlarms.map((a) =>
          a.index === alarmToToggle!.index ? { ...a, enabled: !a.enabled } : a
        );
        setOptimisticAlarms(updatedAlarms);
        setUseOptimisticState(true);
      }

      setLastError(null);
      const success = await bleToggleAlarm(nameOrIndex);

      if (!success && alarmToToggle) {
        // Revert optimistic update on failure
        setUseOptimisticState(false);
      }

      return success;
    },
    [connectionState, bleToggleAlarm, currentAlarms]
  );

  const editAlarm = useCallback(
    async (
      index: number,
      hour: number,
      minute: number,
      name?: string,
      days?: number[],
      recurring: boolean = true,
      vibration_strength?: number
    ): Promise<boolean> => {
      if (connectionState !== "connected") return false;

      // Find alarm to edit for optimistic update
      const alarmToEdit = currentAlarms.find((a) => a.index === index);

      if (alarmToEdit) {
        // Optimistic update
        const updatedAlarm: Alarm = {
          ...alarmToEdit,
          hour,
          minute,
          name: name || alarmToEdit.name,
          days,
          recurring,
          timeUntil: "calculating...",
          vibration_strength,
        };

        const updatedAlarms = currentAlarms.map((a) =>
          a.index === index ? updatedAlarm : a
        );
        setOptimisticAlarms(updatedAlarms);
        setUseOptimisticState(true);
      }

      setLastError(null);

      // First remove the old alarm, then add the new one
      const removeSuccess = await bleRemoveAlarm(index);
      if (!removeSuccess) {
        if (alarmToEdit) {
          setUseOptimisticState(false);
        }
        return false;
      }

      const addSuccess = await bleAddAlarm(
        hour,
        minute,
        name,
        days,
        recurring,
        vibration_strength
      );
      if (!addSuccess) {
        if (alarmToEdit) {
          setUseOptimisticState(false);
        }
        return false;
      }

      return true;
    },
    [connectionState, bleRemoveAlarm, bleAddAlarm, currentAlarms]
  );

  const ping = useCallback(async (): Promise<boolean> => {
    if (connectionState !== "connected") return false;
    return await blePing();
  }, [connectionState, blePing]);

  const previewVibration = useCallback(
    async (strength?: number): Promise<boolean> => {
      if (connectionState !== "connected") return false;
      return await blePreviewVibration(strength);
    },
    [connectionState, blePreviewVibration]
  );

  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  const state: AlarmClockState = {
    connectionState,
    isConnecting:
      connectionState === "scanning" || connectionState === "connecting",
    lastError,
    alarms: currentAlarms,
    isLoading,
    deviceStatus,
    isAutoConnecting,
    alarmsWithTimeUntil,
  };

  const actions: AlarmClockActions = {
    refreshAlarms,
    addAlarm,
    removeAlarm,
    toggleAlarm,
    editAlarm,
    getStatus,
    ping,
    previewVibration,
    clearError,
  };

  return [state, actions];
}
