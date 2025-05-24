import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import * as ExpoDevice from "expo-device";
import base64 from "react-native-base64";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  BleError,
  BleManager,
  Characteristic,
  Device,
  State,
} from "react-native-ble-plx";

// Service and Characteristic UUIDs (matching your Pi code)
const ALARM_SERVICE_UUID = "12345678-1234-5678-9abc-123456789abc";
const COMMAND_CHAR_UUID = "12345678-1234-5678-9abc-123456789abd";
const RESPONSE_CHAR_UUID = "12345678-1234-5678-9abc-123456789abe";
const STATUS_CHAR_UUID = "12345678-1234-5678-9abc-123456789abf";

// Storage keys
const STORED_DEVICE_ID_KEY = "alarm_clock_device_id";
const STORED_DEVICE_NAME_KEY = "alarm_clock_device_name";

export interface Alarm {
  index: number;
  name: string;
  hour: number;
  minute: number;
  enabled: boolean;
  recurring: boolean;
  timeUntil: string;
  days?: number[]; // 0=Monday, 6=Sunday
}

export interface DeviceStatus {
  time: string;
  alarmCount: number;
  errorCount: number;
}

export type ConnectionState =
  | "disconnected"
  | "scanning"
  | "connecting"
  | "connected";

function useAlarmClockBLE() {
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [lastResponse, setLastResponse] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const bleManagerRef = useRef<BleManager | null>(null);
  const responseListenersRef = useRef<Set<(response: string) => void>>(
    new Set()
  );

  // Lazy initialization of BLE Manager - only when needed
  const initializeBleManager = useCallback(async (): Promise<boolean> => {
    if (bleManagerRef.current) {
      return true; // Already initialized
    }

    try {
      console.log("🔄 Initializing BLE Manager...");

      // Add a small delay to ensure native bridge is ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      bleManagerRef.current = new BleManager();

      // Set up state change listener
      bleManagerRef.current.onStateChange((state) => {
        console.log("BLE State changed:", state);
        if (state === State.PoweredOn) {
          console.log("✅ BLE is ready");
        }
      }, true);

      console.log("✅ BLE Manager initialized successfully");
      return true;
    } catch (err) {
      console.error("❌ Failed to initialize BLE Manager:", err);
      setError("Failed to initialize Bluetooth");
      return false;
    }
  }, []);

  // Response parsing utilities (defined first to avoid circular dependencies)
  const parseAlarmResponse = useCallback((response: string): Alarm | null => {
    try {
      // Handle both formats: original ALARM and compact A
      if (response.startsWith("ALARM:")) {
        // Original format: ALARM:INDEX:NAME:HH:MM:STATUS:TYPE:TIME_UNTIL
        const parts = response.split(":");
        if (parts.length < 7) {
          console.error("Invalid ALARM response format:", response);
          return null;
        }

        const index = parseInt(parts[1]);
        const name = parts[2] || `Alarm ${index}`;
        const hour = parseInt(parts[3]);
        const minute = parseInt(parts[4]);
        const enabled = parts[5] === "ON";
        const recurring = parts[6] === "R";

        // Handle timeUntil which might be split across multiple parts due to colons
        let timeUntil = "unknown";
        if (parts.length > 7) {
          timeUntil = parts.slice(7).join(":") || "unknown"; // Rejoin in case time had colons
        }

        // Validate parsed values
        if (isNaN(index) || isNaN(hour) || isNaN(minute)) {
          console.error("Invalid numeric values in ALARM response:", response);
          return null;
        }

        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
          console.error("Invalid time values in ALARM response:", response);
          return null;
        }

        return {
          index,
          name,
          hour,
          minute,
          enabled,
          recurring,
          timeUntil,
        };
      } else if (response.startsWith("A")) {
        // Compact format: A{index}:{name}:{HHMM}:{enabled}:{recurring}:{minutes}
        const parts = response.split(":");
        if (parts.length < 4) {
          console.error("Insufficient compact alarm response parts:", response);
          return null;
        }

        // Extract index from A{index}
        const indexStr = parts[0].substring(1); // Remove 'A' prefix
        const index = parseInt(indexStr);

        if (isNaN(index)) {
          console.error("Invalid alarm index in compact format:", response);
          return null;
        }

        let name: string;
        let timeStr: string;
        let enabled: boolean;
        let recurring: boolean;
        let minutesUntil: number;

        if (parts.length === 6) {
          // Full format: A{i}:{name}:{HHMM}:{enabled}:{recurring}:{minutes}
          name = parts[1] || `Alarm ${index}`;
          timeStr = parts[2];
          enabled = parts[3] === "1";
          recurring = parts[4] === "1";
          minutesUntil = parseInt(parts[5]) || 0;
        } else if (parts.length === 4) {
          // Ultra-compact format: A{i}:{HHMM}:{ER}:{minutes}
          name = `Alarm ${index}`;
          timeStr = parts[1];
          const flags = parts[2];
          enabled = flags.charAt(0) === "1";
          recurring = flags.charAt(1) === "1";
          minutesUntil = parseInt(parts[3]) || 0;
        } else {
          console.error("Unexpected compact alarm response format:", response);
          return null;
        }

        // Parse time (HHMM format)
        if (timeStr.length !== 4) {
          console.error("Invalid time format in compact response:", timeStr);
          return null;
        }

        const hour = parseInt(timeStr.substring(0, 2));
        const minute = parseInt(timeStr.substring(2, 4));

        if (
          isNaN(hour) ||
          isNaN(minute) ||
          hour < 0 ||
          hour > 23 ||
          minute < 0 ||
          minute > 59
        ) {
          console.error(
            "Invalid time values in compact response:",
            hour,
            minute
          );
          return null;
        }

        // Convert minutes until to human readable format
        let timeUntil = "unknown";
        if (minutesUntil > 0) {
          if (minutesUntil < 60) {
            timeUntil = `in ${minutesUntil}m`;
          } else if (minutesUntil < 1440) {
            const hours = Math.floor(minutesUntil / 60);
            const mins = minutesUntil % 60;
            timeUntil = mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h`;
          } else {
            const days = Math.floor(minutesUntil / 1440);
            const remainingHours = Math.floor((minutesUntil % 1440) / 60);
            timeUntil =
              remainingHours > 0
                ? `in ${days}d ${remainingHours}h`
                : `in ${days}d`;
          }
        }

        return {
          index,
          name,
          hour,
          minute,
          enabled,
          recurring,
          timeUntil,
        };
      } else {
        console.error("Unknown alarm response format:", response);
        return null;
      }
    } catch (error) {
      console.error(
        "Error parsing alarm response:",
        error,
        "Response:",
        response
      );
      return null;
    }
  }, []);

  const parseStatusResponse = useCallback(
    (response: string): DeviceStatus | null => {
      // Format: OK:STATUS:time:alarm_count:error_count
      const parts = response.split(":");
      if (parts.length >= 5 && parts[0] === "OK" && parts[1] === "STATUS") {
        return {
          time: parts[2].replace("_", " "),
          alarmCount: parseInt(parts[3]),
          errorCount: parseInt(parts[4]),
        };
      }
      return null;
    },
    []
  );

  const isOkResponse = useCallback((response: string): boolean => {
    return response.startsWith("OK:");
  }, []);

  const isErrorResponse = useCallback((response: string): boolean => {
    return response.startsWith("ERROR:");
  }, []);

  const getErrorMessage = useCallback(
    (response: string): string => {
      if (isErrorResponse(response)) {
        const parts = response.split(":", 2);
        return parts.length > 1 ? parts[1] : "Unknown error";
      }
      return "";
    },
    [isErrorResponse]
  );

  // Command sending
  const sendCommand = useCallback(
    async (command: string): Promise<boolean> => {
      if (!connectedDevice) {
        return false;
      }

      try {
        const commandBuffer = base64.encode(command);

        await connectedDevice.writeCharacteristicWithResponseForService(
          ALARM_SERVICE_UUID,
          COMMAND_CHAR_UUID,
          commandBuffer
        );

        console.log(`📤 Sent command: ${command}`);
        setError(null);
        return true;
      } catch (err) {
        console.error("❌ Send command error:", err);
        setError(`Command failed: ${err}`);
        return false;
      }
    },
    [connectedDevice, connectionState]
  );

  // Alarm management methods using compact protocol
  const ping = useCallback(async (): Promise<boolean> => {
    return await sendCommand("p");
  }, [sendCommand]);

  const getStatus = useCallback(async (): Promise<boolean> => {
    return await sendCommand("s");
  }, [sendCommand]);

  const listAlarms = useCallback(async (): Promise<boolean> => {
    return await sendCommand("l");
  }, [sendCommand]);

  const onDataUpdate = useCallback(
    (error: BleError | null, characteristic: Characteristic | null) => {
      if (error) {
        console.error("❌ Monitor error:", error);
        setError(`Monitor error: ${error.message}`);
        return;
      }

      if (!characteristic?.value) {
        console.log("No Data was received");
        return;
      }

      const response = base64.decode(characteristic.value);
      console.log("📨 Received response:", response);
      setLastResponse(response);

      // Parse different types of responses
      if (response.startsWith("OK:LIST:")) {
        // Handle alarm list start - clear existing alarms and prepare for new list
        const parts = response.split(":");
        const count = parseInt(parts[2] || "0");
        console.log(`🗂️ Starting alarm list with ${count} items`);

        if (count === 0) {
          // No alarms, clear the list immediately
          setAlarms([]);
        } else {
          // Clear alarms to prepare for fresh list
          setAlarms([]);
        }
      } else if (response.startsWith("ALARM:") || response.startsWith("A")) {
        // Handle both original ALARM format and compact A format
        const alarm = parseAlarmResponse(response);
        if (alarm) {
          console.log(
            `📋 Adding alarm ${alarm.index}: ${alarm.name} at ${
              alarm.hour
            }:${alarm.minute.toString().padStart(2, "0")}`
          );
          setAlarms((prev) => {
            const index = prev.findIndex((a) => a.index === alarm.index);
            if (index >= 0) {
              const updated = [...prev];
              updated[index] = alarm;
              return updated;
            } else {
              return [...prev, alarm].sort((a, b) => a.index - b.index);
            }
          });
        } else {
          console.error("❌ Failed to parse alarm response:", response);
        }
      } else if (response.startsWith("OK:STATUS:")) {
        const status = parseStatusResponse(response);
        if (status) {
          setDeviceStatus(status);
        }
      } else if (
        response.startsWith("OK:CLEAR") ||
        response.startsWith("OK:ALARMS_CLEARED")
      ) {
        console.log("🗑️ Alarms cleared");
        setAlarms([]);
      } else if (response.startsWith("ERROR:")) {
        const errorMsg = getErrorMessage(response);
        console.error("❌ Device error:", errorMsg);
        setError(errorMsg);
      } else if (response.startsWith("HEARTBEAT:")) {
        console.log("💓 Heartbeat received");
        // Heartbeat - just acknowledge, no action needed
      } else {
        console.log("📨 Unknown response format:", response);
      }

      // Notify any response listeners
      responseListenersRef.current.forEach((listener) => listener(response));
    },
    [parseAlarmResponse, parseStatusResponse, getErrorMessage]
  );

  // Auto-load data when connected
  useEffect(() => {
    if (connectionState === "connected") {
      console.log("🔄 Connection established, auto-loading data...");
      // Small delay to ensure connection is stable
      const timeoutId = setTimeout(async () => {
        try {
          await listAlarms();
          await getStatus();
        } catch (error) {
          console.warn("⚠️ Failed to auto-load data:", error);
        }
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [connectionState, listAlarms, getStatus]);

  const requestAndroid31Permissions = async () => {
    console.log("🔐 Requesting Android 31 Permissions...");
    const bluetoothScanPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      {
        title: "Bluetooth Scan Permission",
        message:
          "This app needs Bluetooth scan permission to find your alarm clock",
        buttonPositive: "OK",
      }
    );
    const bluetoothConnectPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      {
        title: "Bluetooth Connect Permission",
        message:
          "This app needs Bluetooth connect permission to connect to your alarm clock",
        buttonPositive: "OK",
      }
    );
    const fineLocationPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: "Location Permission",
        message: "Bluetooth Low Energy requires Location access",
        buttonPositive: "OK",
      }
    );

    console.log(
      bluetoothScanPermission,
      bluetoothConnectPermission,
      fineLocationPermission
    );
    console.log(
      bluetoothScanPermission === "granted",
      bluetoothConnectPermission === "granted",
      fineLocationPermission === "granted"
    );

    return (
      bluetoothScanPermission === "granted" &&
      bluetoothConnectPermission === "granted" &&
      fineLocationPermission === "granted"
    );
  };

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    console.log("🔐 Requesting Bluetooth permissions...");

    if (Platform.OS === "android") {
      console.log(ExpoDevice.platformApiLevel);
      if ((ExpoDevice.platformApiLevel ?? -1) < 31) {
        console.log("🔐 Requesting Location Permission...");
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location Permission",
            message: "Bluetooth Low Energy requires Location access",
            buttonPositive: "OK",
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        console.log("🔐 Requesting Android 31 Permissions...");
        const isAndroid31PermissionsGranted =
          await requestAndroid31Permissions();
        console.log(
          "🔐 Android 31 Permissions granted:",
          isAndroid31PermissionsGranted
        );
        return isAndroid31PermissionsGranted;
      }
    } else {
      console.log("🔐 Permissions already granted");
      return true;
    }
  }, []);

  const isDuplicateDevice = (devices: Device[], nextDevice: Device) =>
    devices.findIndex((device) => nextDevice.id === device.id) > -1;

  const scanForPeripherals = useCallback(
    async (deviceName: string = "PicoAlarmClock", timeout: number = 10000) => {
      console.log("🚀 Starting scan for devices...");

      // First request permissions
      const hasPermissions = await requestPermissions();
      if (!hasPermissions) {
        setError("Bluetooth permissions not granted");
        return false;
      }

      // Then initialize BLE manager
      const initialized = await initializeBleManager();
      if (!initialized) {
        return false;
      }

      setConnectionState("scanning");
      setError(null);
      setAllDevices([]);
      console.log(`🔍 Scanning for ${deviceName}...`);

      // Stop any existing scan
      await bleManagerRef.current!.stopDeviceScan();

      return new Promise<boolean>((resolve) => {
        const timeoutId = setTimeout(() => {
          bleManagerRef.current?.stopDeviceScan();
          setConnectionState("disconnected");
          console.log("❌ Scan timeout");
          setError("Scan timeout - device not found");
          resolve(false);
        }, timeout);

        bleManagerRef.current!.startDeviceScan(
          null, // Scan for all devices instead of filtering by service UUID
          null,
          async (error, device) => {
            if (error) {
              console.error("❌ Scan error:", error);
              clearTimeout(timeoutId);
              setConnectionState("disconnected");
              setError(`Scan error: ${error.message}`);
              resolve(false);
              return;
            }

            if (device && device.name && device.name.includes(deviceName)) {
              console.log(`✅ Found device: ${device.name} (${device.id})`);

              // Stop scanning immediately when device is found
              clearTimeout(timeoutId);
              await bleManagerRef.current!.stopDeviceScan();

              // Add to devices list for potential use later
              setAllDevices([device]);

              console.log("✅ Device found and scan stopped");
              resolve(true);
            }
          }
        );
      });
    },
    [requestPermissions, initializeBleManager]
  );

  const connectToDevice = useCallback(
    async (device: Device) => {
      if (!bleManagerRef.current) {
        setError("BLE Manager not initialized");
        return false;
      }

      try {
        setConnectionState("connecting");
        setError(null);
        console.log(`🔗 Connecting to ${device.name}...`);

        // Stop scanning
        await bleManagerRef.current.stopDeviceScan();

        const deviceConnection = await bleManagerRef.current.connectToDevice(
          device.id
        );
        setConnectedDevice(deviceConnection);

        // Request larger MTU for bigger packets (up to 185 bytes)
        try {
          const mtu = await deviceConnection.requestMTU(185);
          console.log(`📦 MTU negotiated: ${mtu} bytes`);
        } catch (mtuError) {
          console.warn("⚠️ MTU request failed, using default:", mtuError);
          // Continue anyway with default MTU
        }

        await deviceConnection.discoverAllServicesAndCharacteristics();

        // Subscribe to response notifications
        await deviceConnection.monitorCharacteristicForService(
          ALARM_SERVICE_UUID,
          RESPONSE_CHAR_UUID,
          onDataUpdate
        );

        // Handle disconnections
        deviceConnection.onDisconnected(() => {
          console.log("🔌 Device disconnected");
          setConnectedDevice(null);
          setConnectionState("disconnected");
          setAlarms([]);
          setDeviceStatus(null);
        });

        setConnectionState("connected");
        console.log("✅ Connected successfully");

        // Get initial data automatically
        console.log("📋 Loading initial alarm data...");
        setTimeout(async () => {
          await listAlarms();
          await getStatus();
        }, 500); // Small delay to ensure connection is stable

        return true;
      } catch (err) {
        console.error("❌ Connection error:", err);
        setConnectionState("disconnected");
        setError(`Connection failed: ${err}`);
        return false;
      }
    },
    [onDataUpdate, listAlarms, getStatus]
  );

  const addAlarm = useCallback(
    async (
      hour: number,
      minute: number,
      name?: string,
      days?: number[],
      recurring: boolean = true
    ): Promise<boolean> => {
      let command = `a${hour.toString().padStart(2, "0")}:${minute
        .toString()
        .padStart(2, "0")}`;

      // Add days if specified
      if (days && days.length > 0) {
        command += `:${days.join(",")}`;
      } else {
        command += ":";
      }

      // Add name if specified
      if (name && name.trim()) {
        command += `:${name.trim()}`;
      } else {
        command += ":";
      }

      // Add recurring flag
      command += recurring ? ":R" : ":O";

      return await sendCommand(command);
    },
    [sendCommand]
  );

  const removeAlarm = useCallback(
    async (nameOrIndex: string | number): Promise<boolean> => {
      return await sendCommand(`r${nameOrIndex}`);
    },
    [sendCommand]
  );

  const toggleAlarm = useCallback(
    async (nameOrIndex: string | number): Promise<boolean> => {
      return await sendCommand(`t${nameOrIndex}`);
    },
    [sendCommand]
  );

  const disconnect = useCallback(async (): Promise<void> => {
    if (connectedDevice) {
      try {
        await connectedDevice.cancelConnection();
        setConnectedDevice(null);
        setConnectionState("disconnected");
        setAlarms([]);
        setDeviceStatus(null);
        console.log("🔌 Disconnected");
      } catch (err) {
        console.error("❌ Disconnect error:", err);
      }
    }
  }, [connectedDevice]);

  // Response listener management
  const onResponse = useCallback(
    (listener: (response: string) => void): (() => void) => {
      responseListenersRef.current.add(listener);
      return () => responseListenersRef.current.delete(listener);
    },
    []
  );

  // Device storage utilities
  const storeDeviceInfo = useCallback(async (device: Device): Promise<void> => {
    try {
      await AsyncStorage.setItem(STORED_DEVICE_ID_KEY, device.id);
      if (device.name) {
        await AsyncStorage.setItem(STORED_DEVICE_NAME_KEY, device.name);
      }
      console.log(`💾 Stored device info: ${device.name} (${device.id})`);
    } catch (error) {
      console.error("❌ Failed to store device info:", error);
    }
  }, []);

  const getStoredDeviceInfo = useCallback(async (): Promise<{
    id: string | null;
    name: string | null;
  }> => {
    try {
      const id = await AsyncStorage.getItem(STORED_DEVICE_ID_KEY);
      const name = await AsyncStorage.getItem(STORED_DEVICE_NAME_KEY);
      return { id, name };
    } catch (error) {
      console.error("❌ Failed to get stored device info:", error);
      return { id: null, name: null };
    }
  }, []);

  const clearStoredDeviceInfo = useCallback(async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(STORED_DEVICE_ID_KEY);
      await AsyncStorage.removeItem(STORED_DEVICE_NAME_KEY);
      console.log("🧹 Cleared stored device info");
    } catch (error) {
      console.error("❌ Failed to clear stored device info:", error);
    }
  }, []);

  // Direct connection by device ID
  const connectToDeviceById = useCallback(
    async (deviceId: string): Promise<boolean> => {
      if (!bleManagerRef.current) {
        const initialized = await initializeBleManager();
        if (!initialized) {
          return false;
        }
      }

      try {
        setConnectionState("connecting");
        setError(null);
        console.log(`🔗 Connecting directly to device: ${deviceId}`);

        const deviceConnection = await bleManagerRef.current!.connectToDevice(
          deviceId
        );
        setConnectedDevice(deviceConnection);

        // Request larger MTU for bigger packets (up to 185 bytes)
        try {
          const mtu = await deviceConnection.requestMTU(185);
          console.log(`📦 MTU negotiated: ${mtu} bytes`);
        } catch (mtuError) {
          console.warn("⚠️ MTU request failed, using default:", mtuError);
          // Continue anyway with default MTU
        }

        await deviceConnection.discoverAllServicesAndCharacteristics();

        // Subscribe to response notifications
        await deviceConnection.monitorCharacteristicForService(
          ALARM_SERVICE_UUID,
          RESPONSE_CHAR_UUID,
          onDataUpdate
        );

        // Handle disconnections
        deviceConnection.onDisconnected(() => {
          console.log("🔌 Device disconnected");
          setConnectedDevice(null);
          setConnectionState("disconnected");
          setAlarms([]);
          setDeviceStatus(null);
        });

        setConnectionState("connected");
        console.log("✅ Connected successfully");

        // Get initial data automatically
        console.log("📋 Loading initial alarm data...");
        setTimeout(async () => {
          await listAlarms();
          await getStatus();
        }, 500); // Small delay to ensure connection is stable

        return true;
      } catch (err) {
        console.error("❌ Direct connection error:", err);
        setError(`Direct connection failed: ${err}`);
        return false;
      }
    },
    [initializeBleManager, onDataUpdate, listAlarms, getStatus]
  );

  // Auto-connect functionality
  const autoConnect = useCallback(async (): Promise<boolean> => {
    console.log("🔄 Starting auto-connect...");

    // First request permissions
    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      setError("Bluetooth permissions not granted");
      return false;
    }

    // Initialize BLE manager
    const initialized = await initializeBleManager();
    if (!initialized) {
      return false;
    }

    // Try to get stored device info for direct connection first
    const storedDevice = await getStoredDeviceInfo();

    if (storedDevice.id) {
      console.log(
        `📱 Found stored device: ${storedDevice.name} (${storedDevice.id})`
      );

      // Try direct connection first
      console.log("🎯 Attempting direct connection...");
      const directConnected = await connectToDeviceById(storedDevice.id);
      if (directConnected) {
        console.log("✅ Direct connection successful!");
        return true;
      }

      console.log("⚠️ Direct connection failed, will scan for device...");
    }

    // If no stored device or direct connection failed, scan and connect
    console.log("🔍 Scanning for PicoAlarmClock...");
    setConnectionState("scanning");
    setError(null);
    setAllDevices([]);

    // Stop any existing scan
    await bleManagerRef.current!.stopDeviceScan();

    return new Promise<boolean>((resolve) => {
      const timeout = 15000; // 15 second timeout
      const timeoutId = setTimeout(() => {
        bleManagerRef.current?.stopDeviceScan();
        setConnectionState("disconnected");
        console.log("❌ Auto-connect scan timeout");
        setError("Could not find alarm clock device");
        resolve(false);
      }, timeout);

      bleManagerRef.current!.startDeviceScan(
        null,
        null,
        async (error, device) => {
          if (error) {
            console.error("❌ Auto-connect scan error:", error);
            clearTimeout(timeoutId);
            setConnectionState("disconnected");
            setError(`Scan error: ${error.message}`);
            resolve(false);
            return;
          }

          if (device && device.name && device.name.includes("PicoAlarmClock")) {
            console.log(
              `✅ Found PicoAlarmClock: ${device.name} (${device.id})`
            );
            clearTimeout(timeoutId);

            // Stop scanning
            await bleManagerRef.current!.stopDeviceScan();

            // Attempt connection immediately
            try {
              setConnectionState("connecting");
              setError(null);
              console.log(`🔗 Connecting to ${device.name}...`);

              const deviceConnection =
                await bleManagerRef.current!.connectToDevice(device.id);
              setConnectedDevice(deviceConnection);

              // Request larger MTU for bigger packets (up to 185 bytes)
              try {
                const mtu = await deviceConnection.requestMTU(185);
                console.log(`📦 MTU negotiated: ${mtu} bytes`);
              } catch (mtuError) {
                console.warn("⚠️ MTU request failed, using default:", mtuError);
                // Continue anyway with default MTU
              }

              await deviceConnection.discoverAllServicesAndCharacteristics();

              // Subscribe to response notifications
              await deviceConnection.monitorCharacteristicForService(
                ALARM_SERVICE_UUID,
                RESPONSE_CHAR_UUID,
                onDataUpdate
              );

              // Handle disconnections
              deviceConnection.onDisconnected(() => {
                console.log("🔌 Device disconnected");
                setConnectedDevice(null);
                setConnectionState("disconnected");
                setAlarms([]);
                setDeviceStatus(null);
              });

              setConnectionState("connected");
              console.log("✅ Connected successfully");

              // Store device info for future auto-connects
              await storeDeviceInfo(device);

              // Get initial data automatically
              console.log("📋 Loading initial alarm data...");
              setTimeout(async () => {
                await listAlarms();
                await getStatus();
              }, 500); // Small delay to ensure connection is stable

              console.log("✅ Auto-connect successful!");
              resolve(true);
            } catch (err) {
              console.error("❌ Connection error:", err);
              setConnectionState("disconnected");
              setError(`Connection failed: ${err}`);
              resolve(false);
            }
          }
        }
      );
    });
  }, [
    requestPermissions,
    initializeBleManager,
    getStoredDeviceInfo,
    connectToDeviceById,
    storeDeviceInfo,
    onDataUpdate,
    listAlarms,
    getStatus,
  ]);

  return {
    // Device management
    allDevices,
    connectedDevice,
    connectionState,
    error,

    // Data
    alarms,
    deviceStatus,
    lastResponse,

    // Connection methods
    requestPermissions,
    scanForPeripherals,
    connectToDevice,
    disconnect,

    // Alarm management
    ping,
    getStatus,
    listAlarms,
    addAlarm,
    removeAlarm,
    toggleAlarm,

    // Utilities
    onResponse,
    parseAlarmResponse,
    parseStatusResponse,
    isOkResponse,
    isErrorResponse,
    getErrorMessage,

    // Device storage utilities
    storeDeviceInfo,
    getStoredDeviceInfo,
    clearStoredDeviceInfo,

    // Auto-connect functionality
    autoConnect,
  };
}

export default useAlarmClockBLE;
