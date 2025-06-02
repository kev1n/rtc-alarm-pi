import React from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Device } from "react-native-ble-plx";

interface DeviceSelectionModalProps {
  visible: boolean;
  devices: Device[];
  isScanning: boolean;
  onClose: () => void;
  onSelectDevice: (device: Device) => void;
  onRefreshScan: () => void;
}

export default function DeviceSelectionModal({
  visible,
  devices,
  isScanning,
  onClose,
  onSelectDevice,
  onRefreshScan,
}: DeviceSelectionModalProps) {
  const renderDevice = ({ item }: { item: Device }) => (
    <TouchableOpacity
      style={styles.deviceItem}
      onPress={() => onSelectDevice(item)}
    >
      <View style={styles.deviceInfo}>
        <View style={styles.deviceIconContainer}>
          <Ionicons name="bluetooth" size={20} color="#007AFF" />
        </View>
        <View style={styles.deviceDetails}>
          <Text style={styles.deviceName}>{item.name || "Unknown Device"}</Text>
          <Text style={styles.deviceId}>{item.id}</Text>
          {item.rssi && (
            <Text style={styles.deviceSignal}>Signal: {item.rssi} dBm</Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#999" />
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="bluetooth-outline" size={48} color="#999" />
      <Text style={styles.emptyStateTitle}>
        {isScanning ? "Scanning for devices..." : "No devices found"}
      </Text>
      <Text style={styles.emptyStateSubtitle}>
        {isScanning
          ? "Looking for your VibraWake"
          : "Make sure your VibraWake is powered on and in range"}
      </Text>
      {!isScanning && (
        <TouchableOpacity style={styles.retryButton} onPress={onRefreshScan}>
          <Text style={styles.retryButtonText}>Scan Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Select Device</Text>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={onRefreshScan}
            disabled={isScanning}
          >
            {isScanning ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Ionicons name="refresh" size={20} color="#007AFF" />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {devices.length > 0 ? (
            <FlatList
              data={devices}
              renderItem={renderDevice}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.deviceList}
            />
          ) : (
            renderEmptyState()
          )}
        </View>

        {isScanning && (
          <View style={styles.scanningIndicator}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.scanningText}>Scanning for devices...</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e1e5e9",
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  refreshButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  deviceList: {
    padding: 16,
  },
  deviceItem: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  deviceInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  deviceIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#007AFF20",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  deviceDetails: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1a1a1a",
    marginBottom: 2,
  },
  deviceId: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  deviceSignal: {
    fontSize: 11,
    color: "#999",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "500",
    color: "#1a1a1a",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },
  scanningIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e1e5e9",
  },
  scanningText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#666",
  },
});
