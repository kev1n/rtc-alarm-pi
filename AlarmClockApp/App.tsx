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
import ErrorBoundary from "./components/ErrorBoundary";

function AlarmClockApp() {
  const [alarmState, alarmActions] = useAlarmClock();
  const [showAddModal, setShowAddModal] = useState(false);

  const handleToggleAlarm = async (index: number) => {
    const success = await alarmActions.toggleAlarm(index);
    if (!success && alarmState.lastError) {
      Alert.alert("Error", alarmState.lastError);
    }
  };

  const handleDeleteAlarm = async (index: number, name: string) => {
    Alert.alert("Delete Alarm", `Are you sure you want to delete "${name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const success = await alarmActions.removeAlarm(index);
          if (!success && alarmState.lastError) {
            Alert.alert("Error", alarmState.lastError);
          }
        },
      },
    ]);
  };

  const handleRefresh = async () => {
    await alarmActions.refreshAlarms();
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
          : "Make sure your Pi Alarm Clock is nearby and powered on"}
      </Text>
    </View>
  );

  const getHeaderTitle = () => {
    if (alarmState.connectionState === "connecting") {
      return "Pi Alarm Clock - Connecting...";
    }
    if (alarmState.connectionState === "connected") {
      return "Pi Alarm Clock";
    }
    return "Pi Alarm Clock - Offline";
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
        {alarmState.alarms.length === 0
          ? renderEmptyState()
          : alarmState.alarms.map((alarm) => (
              <AlarmItem
                key={alarm.index}
                alarm={alarm}
                onToggle={() => handleToggleAlarm(alarm.index)}
                onDelete={() => handleDeleteAlarm(alarm.index, alarm.name)}
              />
            ))}
      </ScrollView>

      {/* Add Alarm Modal */}
      <AddAlarmModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAddAlarm={alarmActions.addAlarm}
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
