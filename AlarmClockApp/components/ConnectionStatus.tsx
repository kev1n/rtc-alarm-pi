import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Device } from "react-native-ble-plx";
import { ConnectionState } from "../hooks/useAlarmClockBLE";
import DeviceSelectionModal from "./DeviceSelectionModal";

interface ConnectionStatusProps {
  connectionState: ConnectionState;
  isConnecting: boolean;
  onScanForDevices: () => Promise<boolean>;
  onConnectToDevice: (device: Device) => Promise<boolean>;
  onDisconnect: () => void;
  error: string | null;
  onClearError: () => void;
  availableDevices: Device[];
  isScanning: boolean;
  isAutoConnecting?: boolean;
}

export default function ConnectionStatus({
  connectionState,
  isConnecting,
  onScanForDevices,
  onConnectToDevice,
  onDisconnect,
  error,
  onClearError,
  availableDevices,
  isScanning,
  isAutoConnecting = false,
}: ConnectionStatusProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const getStatusInfo = () => {
    if (isAutoConnecting) {
      return {
        icon: "bluetooth" as const,
        color: "#FF9500",
        text: "Connecting to alarm clock...",
        action: null,
        onAction: null,
      };
    }

    switch (connectionState) {
      case "connected":
        return {
          icon: "bluetooth" as const,
          color: "#34C759",
          text: "Connected to Pi Alarm Clock",
          action: "Disconnect",
          onAction: onDisconnect,
        };
      case "connecting":
        return {
          icon: "bluetooth" as const,
          color: "#FF9500",
          text: "Connecting...",
          action: null,
          onAction: null,
        };
      case "scanning":
        return {
          icon: "bluetooth" as const,
          color: "#FF9500",
          text: "Scanning for devices...",
          action: null,
          onAction: null,
        };
      default:
        return {
          icon: "bluetooth-outline" as const,
          color: "#999",
          text: error ? "Connection failed" : "Not connected",
          action: error ? "Retry" : "Manual Connect",
          onAction: handleConnect,
        };
    }
  };

  const handleConnect = async () => {
    const success = await onScanForDevices();
    if (success || availableDevices.length > 0) {
      setIsModalVisible(true);
    }
  };

  const handleSelectDevice = async (device: Device) => {
    setIsModalVisible(false);
    await onConnectToDevice(device);
  };

  const handleCloseModal = () => {
    setIsModalVisible(false);
  };

  const statusInfo = getStatusInfo();

  const handleErrorPress = () => {
    if (error) {
      Alert.alert("Connection Error", error, [
        { text: "Dismiss", onPress: onClearError },
        { text: "Retry", onPress: handleConnect },
      ]);
    }
  };

  return (
    <>
      <View style={styles.container}>
        <View style={styles.statusSection}>
          <View style={styles.statusInfo}>
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: statusInfo.color + "20" },
              ]}
            >
              {isConnecting || isScanning || isAutoConnecting ? (
                <ActivityIndicator size="small" color={statusInfo.color} />
              ) : (
                <Ionicons
                  name={statusInfo.icon}
                  size={20}
                  color={statusInfo.color}
                />
              )}
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.statusText}>{statusInfo.text}</Text>
              {error && (
                <TouchableOpacity onPress={handleErrorPress}>
                  <Text style={styles.errorText}>Tap to see error details</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {statusInfo.action && statusInfo.onAction && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                connectionState === "connected"
                  ? styles.disconnectButton
                  : styles.connectButton,
              ]}
              onPress={statusInfo.onAction}
              disabled={isConnecting || isScanning || isAutoConnecting}
            >
              <Text
                style={[
                  styles.actionButtonText,
                  connectionState === "connected"
                    ? styles.disconnectButtonText
                    : styles.connectButtonText,
                ]}
              >
                {statusInfo.action}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <DeviceSelectionModal
        visible={isModalVisible}
        devices={availableDevices}
        isScanning={isScanning}
        onClose={handleCloseModal}
        onSelectDevice={handleSelectDevice}
        onRefreshScan={onScanForDevices}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statusSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  statusInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1a1a1a",
    marginBottom: 2,
  },
  errorText: {
    fontSize: 12,
    color: "#FF3B30",
    textDecorationLine: "underline",
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  connectButton: {
    backgroundColor: "#007AFF",
  },
  disconnectButton: {
    backgroundColor: "#FF3B30",
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  connectButtonText: {
    color: "#fff",
  },
  disconnectButtonText: {
    color: "#fff",
  },
});
