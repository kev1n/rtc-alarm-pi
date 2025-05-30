import React from "react";
import { StyleSheet, Text, View, TouchableOpacity, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MaterialIcons } from "@expo/vector-icons";
import { Alarm } from "../hooks/useAlarmClockBLE";

interface AlarmItemProps {
  alarm: Alarm;
  onToggle: () => void;
  onEdit: () => void;
}

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function AlarmItem({ alarm, onToggle, onEdit }: AlarmItemProps) {
  const formatTime = (hour: number, minute: number) => {
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minute.toString().padStart(2, "0")} ${period}`;
  };

  const formatDays = (days?: number[]) => {
    if (!days || days.length === 0) {
      return "Daily";
    }

    if (days.length === 7) {
      return "Daily";
    }

    if (days.length === 5 && days.every((d) => d >= 0 && d <= 4)) {
      return "Weekdays";
    }

    if (days.length === 2 && days.includes(5) && days.includes(6)) {
      return "Weekends";
    }

    return days.map((d) => WEEKDAY_NAMES[d]).join(", ");
  };

  return (
    <View
      style={[styles.container, !alarm.enabled && styles.disabledContainer]}
    >
      <TouchableOpacity
        style={styles.content}
        onPress={onEdit}
        activeOpacity={0.7}
      >
        <View style={styles.timeSection}>
          <Text
            style={[styles.timeText, !alarm.enabled && styles.disabledText]}
          >
            {formatTime(alarm.hour, alarm.minute)}
          </Text>
          <View style={styles.infoRow}>
            <Text
              style={[styles.nameText, !alarm.enabled && styles.disabledText]}
            >
              {alarm.name}
            </Text>
          </View>
          <Text
            style={[styles.scheduleText, !alarm.enabled && styles.disabledText]}
          >
            {formatDays(alarm.days)}
          </Text>
        </View>

        <View style={styles.toggleContainer}>
          <Switch
            style={styles.toggle}
            value={alarm.enabled}
            onValueChange={onToggle}
            trackColor={{ false: "#e1e5e9", true: "#007AFF" }}
            thumbColor={alarm.enabled ? "#fff" : "#f4f3f4"}
            ios_backgroundColor="#e1e5e9"
          />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginVertical: 4,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  disabledContainer: {
    opacity: 0.6,
  },
  content: {
    flexDirection: "row",
    padding: 16,
    alignItems: "center",
  },
  timeSection: {
    flex: 1,
  },
  timeText: {
    fontSize: 24,
    fontWeight: "300",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  disabledText: {
    color: "#999",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  nameText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1a1a1a",
    flex: 1,
  },
  typeIndicator: {
    marginLeft: 8,
  },
  scheduleText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  nextAlarmText: {
    fontSize: 12,
    color: "#007AFF",
    fontWeight: "500",
  },
  toggleContainer: {
    paddingLeft: 16,
  },
  toggle: {
    transform: [{ scaleX: 1.2 }, { scaleY: 1.2 }],
  },
});
