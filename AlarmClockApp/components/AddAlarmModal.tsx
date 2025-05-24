import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface AddAlarmModalProps {
  visible: boolean;
  onClose: () => void;
  onAddAlarm: (
    hour: number,
    minute: number,
    name?: string,
    days?: number[],
    recurring?: boolean
  ) => Promise<boolean>;
}

const WEEKDAYS = [
  { index: 0, short: "M", long: "Monday" },
  { index: 1, short: "T", long: "Tuesday" },
  { index: 2, short: "W", long: "Wednesday" },
  { index: 3, short: "T", long: "Thursday" },
  { index: 4, short: "F", long: "Friday" },
  { index: 5, short: "S", long: "Saturday" },
  { index: 6, short: "S", long: "Sunday" },
];

export default function AddAlarmModal({
  visible,
  onClose,
  onAddAlarm,
}: AddAlarmModalProps) {
  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(0);
  const [name, setName] = useState("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [recurring, setRecurring] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  const handleReset = () => {
    setHour(7);
    setMinute(0);
    setName("");
    setSelectedDays([]);
    setRecurring(true);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleDayToggle = (dayIndex: number) => {
    setSelectedDays((prev) => {
      if (prev.includes(dayIndex)) {
        return prev.filter((d) => d !== dayIndex);
      } else {
        return [...prev, dayIndex].sort();
      }
    });
  };

  const handleQuickSelect = (
    type: "weekdays" | "weekends" | "daily" | "clear"
  ) => {
    switch (type) {
      case "weekdays":
        setSelectedDays([0, 1, 2, 3, 4]);
        break;
      case "weekends":
        setSelectedDays([5, 6]);
        break;
      case "daily":
        setSelectedDays([]);
        break;
      case "clear":
        setSelectedDays([]);
        break;
    }
  };

  const formatTime = (h: number, m: number) => {
    const period = h >= 12 ? "PM" : "AM";
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:${m.toString().padStart(2, "0")} ${period}`;
  };

  const generateHours = () => {
    return Array.from({ length: 24 }, (_, i) => i);
  };

  const generateMinutes = () => {
    return Array.from({ length: 60 }, (_, i) => i);
  };

  const getDayDescription = () => {
    if (selectedDays.length === 0) {
      return "Daily";
    }
    if (selectedDays.length === 7) {
      return "Daily";
    }
    if (
      selectedDays.length === 5 &&
      selectedDays.every((d) => d >= 0 && d <= 4)
    ) {
      return "Weekdays";
    }
    if (
      selectedDays.length === 2 &&
      selectedDays.includes(5) &&
      selectedDays.includes(6)
    ) {
      return "Weekends";
    }
    return selectedDays.map((d) => WEEKDAYS[d].short).join(", ");
  };

  const handleAddAlarm = async () => {
    setIsAdding(true);

    try {
      const alarmName = name.trim() || "New Alarm";
      const days = selectedDays.length === 0 ? undefined : selectedDays;

      const success = await onAddAlarm(
        hour,
        minute,
        alarmName,
        days,
        recurring
      );

      if (success) {
        handleClose();
      } else {
        Alert.alert("Error", "Failed to add alarm. Please try again.");
      }
    } catch (error) {
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Alarm</Text>
          <TouchableOpacity
            onPress={handleAddAlarm}
            style={[styles.headerButton, isAdding && styles.disabledButton]}
            disabled={isAdding}
          >
            <Text style={[styles.saveText, isAdding && styles.disabledText]}>
              {isAdding ? "Adding..." : "Save"}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Time Display */}
          <View style={styles.timeDisplay}>
            <Text style={styles.timeText}>{formatTime(hour, minute)}</Text>
            <Text style={styles.dayText}>{getDayDescription()}</Text>
          </View>

          {/* Time Pickers */}
          <View style={styles.timePickerContainer}>
            <View style={styles.timePicker}>
              <Text style={styles.pickerLabel}>Hour</Text>
              <ScrollView
                style={styles.pickerScroll}
                showsVerticalScrollIndicator={false}
                snapToInterval={40}
                decelerationRate="fast"
              >
                {generateHours().map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={[
                      styles.pickerItem,
                      h === hour && styles.selectedPickerItem,
                    ]}
                    onPress={() => setHour(h)}
                  >
                    <Text
                      style={[
                        styles.pickerText,
                        h === hour && styles.selectedPickerText,
                      ]}
                    >
                      {h.toString().padStart(2, "0")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.timePicker}>
              <Text style={styles.pickerLabel}>Minute</Text>
              <ScrollView
                style={styles.pickerScroll}
                showsVerticalScrollIndicator={false}
                snapToInterval={40}
                decelerationRate="fast"
              >
                {generateMinutes().map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.pickerItem,
                      m === minute && styles.selectedPickerItem,
                    ]}
                    onPress={() => setMinute(m)}
                  >
                    <Text
                      style={[
                        styles.pickerText,
                        m === minute && styles.selectedPickerText,
                      ]}
                    >
                      {m.toString().padStart(2, "0")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Alarm Name */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Alarm Name</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="Enter alarm name (optional)"
              placeholderTextColor="#999"
              maxLength={30}
            />
          </View>

          {/* Recurring Toggle */}
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchLabel}>Recurring Alarm</Text>
                <Text style={styles.switchDescription}>
                  {recurring ? "Alarm will repeat" : "One-time alarm only"}
                </Text>
              </View>
              <Switch
                value={recurring}
                onValueChange={setRecurring}
                trackColor={{ false: "#e1e5e9", true: "#007AFF" }}
                thumbColor={recurring ? "#fff" : "#f4f3f4"}
              />
            </View>
          </View>

          {/* Day Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Repeat</Text>

            {/* Quick Select Buttons */}
            <View style={styles.quickSelectContainer}>
              <TouchableOpacity
                style={[
                  styles.quickSelectButton,
                  selectedDays.length === 0 && styles.activeQuickSelect,
                ]}
                onPress={() => handleQuickSelect("daily")}
              >
                <Text
                  style={[
                    styles.quickSelectText,
                    selectedDays.length === 0 && styles.activeQuickSelectText,
                  ]}
                >
                  Daily
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.quickSelectButton,
                  selectedDays.length === 5 &&
                    selectedDays.every((d) => d >= 0 && d <= 4) &&
                    styles.activeQuickSelect,
                ]}
                onPress={() => handleQuickSelect("weekdays")}
              >
                <Text
                  style={[
                    styles.quickSelectText,
                    selectedDays.length === 5 &&
                      selectedDays.every((d) => d >= 0 && d <= 4) &&
                      styles.activeQuickSelectText,
                  ]}
                >
                  Weekdays
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.quickSelectButton,
                  selectedDays.length === 2 &&
                    selectedDays.includes(5) &&
                    selectedDays.includes(6) &&
                    styles.activeQuickSelect,
                ]}
                onPress={() => handleQuickSelect("weekends")}
              >
                <Text
                  style={[
                    styles.quickSelectText,
                    selectedDays.length === 2 &&
                      selectedDays.includes(5) &&
                      selectedDays.includes(6) &&
                      styles.activeQuickSelectText,
                  ]}
                >
                  Weekends
                </Text>
              </TouchableOpacity>
            </View>

            {/* Individual Day Selection */}
            <View style={styles.daySelector}>
              {WEEKDAYS.map((day) => (
                <TouchableOpacity
                  key={day.index}
                  style={[
                    styles.dayButton,
                    selectedDays.includes(day.index) &&
                      styles.selectedDayButton,
                  ]}
                  onPress={() => handleDayToggle(day.index)}
                >
                  <Text
                    style={[
                      styles.dayButtonText,
                      selectedDays.includes(day.index) &&
                        styles.selectedDayButtonText,
                    ]}
                  >
                    {day.short}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e1e5e9",
  },
  headerButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  cancelText: {
    fontSize: 16,
    color: "#007AFF",
  },
  saveText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledText: {
    color: "#999",
  },
  content: {
    flex: 1,
  },
  timeDisplay: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: "#fff",
    marginBottom: 16,
  },
  timeText: {
    fontSize: 48,
    fontWeight: "200",
    color: "#1a1a1a",
    marginBottom: 8,
  },
  dayText: {
    fontSize: 16,
    color: "#666",
  },
  timePickerContainer: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  timePicker: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
    marginBottom: 8,
  },
  pickerScroll: {
    height: 120,
    width: 60,
  },
  pickerItem: {
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  selectedPickerItem: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
  },
  pickerText: {
    fontSize: 18,
    color: "#1a1a1a",
  },
  selectedPickerText: {
    color: "#fff",
    fontWeight: "600",
  },
  section: {
    backgroundColor: "#fff",
    marginBottom: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  nameInput: {
    borderWidth: 1,
    borderColor: "#e1e5e9",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#1a1a1a",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1a1a1a",
    marginBottom: 2,
  },
  switchDescription: {
    fontSize: 14,
    color: "#666",
  },
  quickSelectContainer: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 8,
  },
  quickSelectButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e1e5e9",
    alignItems: "center",
  },
  activeQuickSelect: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  quickSelectText: {
    fontSize: 14,
    color: "#666",
  },
  activeQuickSelectText: {
    color: "#fff",
    fontWeight: "500",
  },
  daySelector: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e1e5e9",
  },
  selectedDayButton: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  dayButtonText: {
    fontSize: 14,
    color: "#666",
  },
  selectedDayButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
