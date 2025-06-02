import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAlarmClock } from "./hooks/useAlarmClock";
import AlarmItem from "./components/AlarmItem";
import AddAlarmModal from "./components/AddAlarmModal";
import EditAlarmModal from "./components/EditAlarmModal";
import Toast from "./components/Toast";
import ErrorBoundary from "./components/ErrorBoundary";
import { Alarm } from "./hooks/useAlarmClockBLE";

function AlarmClockApp() {
  const [alarmState, alarmActions] = useAlarmClock();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [alarmToEdit, setAlarmToEdit] = useState<Alarm | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "error" | "info">(
    "success"
  );

  const calculateTimeUntilAlarm = (
    hour: number,
    minute: number,
    alarmDays?: number[]
  ): string => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;
    const alarmTime = hour * 60 + minute;

    let minutesDiff: number;

    if (alarmDays && alarmDays.length > 0) {
      // Weekday-based alarm
      const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const currentDayMapped = currentDay === 0 ? 6 : currentDay - 1; // Convert to 0 = Monday format

      let nextAlarmDay = -1;

      // Check if alarm could trigger today
      if (alarmDays.includes(currentDayMapped) && alarmTime > currentTime) {
        nextAlarmDay = currentDayMapped;
      } else {
        // Find next occurrence
        for (let i = 1; i <= 7; i++) {
          const checkDay = (currentDayMapped + i) % 7;
          if (alarmDays.includes(checkDay)) {
            nextAlarmDay = checkDay;
            break;
          }
        }
      }

      if (nextAlarmDay === -1) return "";

      // Calculate days until
      let daysUntil: number;
      if (nextAlarmDay === currentDayMapped) {
        daysUntil = 0;
      } else if (nextAlarmDay > currentDayMapped) {
        daysUntil = nextAlarmDay - currentDayMapped;
      } else {
        daysUntil = 7 - currentDayMapped + nextAlarmDay;
      }

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + daysUntil);
      targetDate.setHours(hour, minute, 0, 0);

      minutesDiff = Math.floor(
        (targetDate.getTime() - now.getTime()) / (1000 * 60)
      );
    } else {
      // Daily alarm
      if (alarmTime > currentTime) {
        // Today
        const targetDate = new Date();
        targetDate.setHours(hour, minute, 0, 0);
        minutesDiff = Math.floor(
          (targetDate.getTime() - now.getTime()) / (1000 * 60)
        );
      } else {
        // Tomorrow
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 1);
        targetDate.setHours(hour, minute, 0, 0);
        minutesDiff = Math.floor(
          (targetDate.getTime() - now.getTime()) / (1000 * 60)
        );
      }
    }

    if (minutesDiff < 0) return "";
    if (minutesDiff === 0) return "now";
    if (minutesDiff < 60) return `${minutesDiff} minutes`;
    if (minutesDiff < 1440) {
      const hours = Math.floor(minutesDiff / 60);
      const minutes = minutesDiff % 60;
      return minutes > 0
        ? `${hours} hours and ${minutes} minutes`
        : `${hours} hours`;
    }

    const days = Math.floor(minutesDiff / 1440);
    const remainingHours = Math.floor((minutesDiff % 1440) / 60);
    return remainingHours > 0
      ? `${days} days and ${remainingHours} hours`
      : `${days} days`;
  };

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "success"
  ) => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  };

  const hideToast = () => {
    setToastVisible(false);
  };

  const handleToggleAlarm = async (index: number) => {
    const success = await alarmActions.toggleAlarm(index);
    if (!success && alarmState.lastError) {
      Alert.alert("Error", alarmState.lastError);
    }
  };

  const handleEditAlarm = (alarm: Alarm) => {
    setAlarmToEdit(alarm);
    setShowEditModal(true);
  };

  const handleEditAlarmSave = async (
    index: number,
    hour: number,
    minute: number,
    name?: string,
    days?: number[],
    recurring?: boolean,
    vibration_strength?: number
  ) => {
    const success = await alarmActions.editAlarm(
      index,
      hour,
      minute,
      name,
      days,
      recurring,
      vibration_strength
    );
    if (!success && alarmState.lastError) {
      Alert.alert("Error", alarmState.lastError);
    } else if (success) {
      const timeUntil = calculateTimeUntilAlarm(hour, minute, days);
      if (timeUntil) {
        showToast(`Alarm set for ${timeUntil}`);
      } else {
        showToast("Alarm updated successfully");
      }
    }
    return success;
  };

  const handleAddAlarm = async (
    hour: number,
    minute: number,
    name?: string,
    days?: number[],
    recurring?: boolean,
    vibration_strength?: number
  ) => {
    const success = await alarmActions.addAlarm(
      hour,
      minute,
      name,
      days,
      recurring,
      vibration_strength
    );
    if (!success && alarmState.lastError) {
      Alert.alert("Error", alarmState.lastError);
    } else if (success) {
      const timeUntil = calculateTimeUntilAlarm(hour, minute, days);
      if (timeUntil) {
        showToast(`Alarm set for ${timeUntil}`);
      } else {
        showToast("Alarm added successfully");
      }
    }
    return success;
  };

  const handleDeleteAlarm = async (index: number, name: string) => {
    const success = await alarmActions.removeAlarm(index);
    if (!success && alarmState.lastError) {
      Alert.alert("Error", alarmState.lastError);
    }
  };

  const handleRefresh = async () => {
    await alarmActions.refreshAlarms();
  };

  const handlePreviewVibration = async (strength: number): Promise<boolean> => {
    const success = await alarmActions.previewVibration(strength);
    if (!success && alarmState.lastError) {
      Alert.alert("Error", alarmState.lastError);
    } else if (success) {
      showToast(`Vibration preview at ${strength}%`, "info");
    }
    return success;
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="alarm-outline" size={64} color="#999" />
      <Text style={styles.emptyStateText}>No alarms set</Text>
      <Text style={styles.emptyStateSubtext}>
        {alarmState.connectionState === "connected"
          ? "Tap the + button to add your first alarm"
          : alarmState.isAutoConnecting
          ? "Connecting to your alarm clock..."
          : "Make sure your VibraWake is nearby and powered on"}
      </Text>
    </View>
  );

  const getHeaderTitle = () => {
    if (alarmState.connectionState === "connecting") {
      return "VibraWake - Connecting...";
    }
    if (alarmState.connectionState === "connected") {
      return "VibraWake";
    }
    return "VibraWake - Offline";
  };

  const getConnectionIndicator = () => {
    if (alarmState.isAutoConnecting) {
      return <Ionicons name="bluetooth" size={20} color="#FF9500" />;
    }
    if (alarmState.connectionState === "connected") {
      return <Ionicons name="bluetooth" size={20} color="#34C759" />;
    }
    return <Ionicons name="bluetooth" size={20} color="#FF3B30" />;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
          {getConnectionIndicator()}
        </View>
        <View style={styles.headerActions}>
          {alarmState.connectionState === "connected" && (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowAddModal(true)}
            >
              <Ionicons name="add" size={24} color="#007AFF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Error Display */}
      {alarmState.lastError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{alarmState.lastError}</Text>
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={alarmActions.clearError}
          >
            <Ionicons name="close" size={16} color="#666" />
          </TouchableOpacity>
        </View>
      )}

      {/* Alarms List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={alarmState.isLoading}
            onRefresh={handleRefresh}
            enabled={alarmState.connectionState === "connected"}
          />
        }
      >
        {alarmState.alarmsWithTimeUntil.length === 0
          ? renderEmptyState()
          : alarmState.alarmsWithTimeUntil.map((alarm) => (
              <AlarmItem
                key={alarm.index}
                alarm={alarm}
                onToggle={() => handleToggleAlarm(alarm.index)}
                onEdit={() => handleEditAlarm(alarm)}
              />
            ))}
      </ScrollView>

      {/* Add Alarm Modal */}
      <AddAlarmModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAddAlarm={handleAddAlarm}
        onPreviewVibration={handlePreviewVibration}
      />

      {/* Edit Alarm Modal */}
      <EditAlarmModal
        visible={showEditModal}
        alarm={alarmToEdit}
        onClose={() => {
          setShowEditModal(false);
          setAlarmToEdit(null);
        }}
        onEditAlarm={handleEditAlarmSave}
        onDeleteAlarm={handleDeleteAlarm}
        onPreviewVibration={handlePreviewVibration}
      />

      {/* Toast */}
      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={hideToast}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AlarmClockApp />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e1e5e9",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerButton: {
    padding: 8,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF2F2",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#FF3B30",
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: "#D70015",
  },
  dismissButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  emptyStateText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#666",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
    lineHeight: 22,
  },
});
