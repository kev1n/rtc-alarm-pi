import React, { useState, useEffect, useRef } from "react";
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
import CustomSlider from "./CustomSlider";
import { Alarm } from "../hooks/useAlarmClockBLE";

interface EditAlarmModalProps {
  visible: boolean;
  alarm: Alarm | null;
  onClose: () => void;
  onEditAlarm: (
    index: number,
    hour: number,
    minute: number,
    name?: string,
    days?: number[],
    recurring?: boolean,
    vibration_strength?: number
  ) => Promise<boolean>;
  onDeleteAlarm: (index: number, name: string) => Promise<void>;
  onPreviewVibration?: (strength: number) => Promise<boolean>;
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

export default function EditAlarmModal({
  visible,
  alarm,
  onClose,
  onEditAlarm,
  onDeleteAlarm,
  onPreviewVibration,
}: EditAlarmModalProps) {
  const [hour, setHour] = useState(1);
  const [minute, setMinute] = useState(0);
  const [isAM, setIsAM] = useState(true);
  const [name, setName] = useState("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [recurring, setRecurring] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [vibrationStrength, setVibrationStrength] = useState(75);

  const scrollViewRef = useRef<ScrollView>(null);

  // Initialize form with alarm data when modal opens
  useEffect(() => {
    if (alarm && visible) {
      // Convert 24-hour to 12-hour format
      const hour12 =
        alarm.hour === 0 ? 12 : alarm.hour > 12 ? alarm.hour - 12 : alarm.hour;
      const am = alarm.hour < 12;

      setHour(hour12);
      setMinute(alarm.minute);
      setIsAM(am);
      setName(alarm.name);
      setSelectedDays(alarm.days || []);
      setRecurring(alarm.recurring);
      setVibrationStrength(alarm.vibration_strength || 75);

      // Auto-scroll to time picker after a short delay
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 200, animated: true });
      }, 300);
    }
  }, [alarm, visible]);

  const handleReset = () => {
    if (alarm) {
      const hour12 =
        alarm.hour === 0 ? 12 : alarm.hour > 12 ? alarm.hour - 12 : alarm.hour;
      const am = alarm.hour < 12;

      setHour(hour12);
      setMinute(alarm.minute);
      setIsAM(am);
      setName(alarm.name);
      setSelectedDays(alarm.days || []);
      setRecurring(alarm.recurring);
      setVibrationStrength(alarm.vibration_strength || 75);
    }
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

  const formatTime = (h: number, m: number, am: boolean) => {
    return `${h}:${m.toString().padStart(2, "0")} ${am ? "AM" : "PM"}`;
  };

  const generateHours = () => {
    return Array.from({ length: 12 }, (_, i) => i + 1);
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

  const convertTo24Hour = (hour12: number, am: boolean): number => {
    if (hour12 === 12) {
      return am ? 0 : 12;
    }
    return am ? hour12 : hour12 + 12;
  };

  const handleEditAlarm = async () => {
    if (!alarm) return;

    setIsEditing(true);

    try {
      const hour24 = convertTo24Hour(hour, isAM);
      const alarmName = name.trim() || "Alarm";
      const days = selectedDays.length === 0 ? undefined : selectedDays;

      const success = await onEditAlarm(
        alarm.index,
        hour24,
        minute,
        alarmName,
        days,
        recurring,
        Math.round(vibrationStrength)
      );

      if (success) {
        handleClose();
      } else {
        Alert.alert("Error", "Failed to edit alarm. Please try again.");
      }
    } catch (error) {
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteAlarm = async () => {
    if (!alarm) return;

    Alert.alert(
      "Delete Alarm",
      `Are you sure you want to delete "${alarm.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              await onDeleteAlarm(alarm.index, alarm.name);
              handleClose();
            } catch (error) {
              Alert.alert("Error", "Failed to delete alarm.");
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handlePreviewVibration = async () => {
    if (onPreviewVibration) {
      try {
        await onPreviewVibration(Math.round(vibrationStrength));
      } catch (error) {
        Alert.alert("Error", "Failed to preview vibration.");
      }
    }
  };

  if (!alarm) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Alarm</Text>
          <TouchableOpacity
            onPress={handleEditAlarm}
            style={[
              styles.headerButton,
              (isEditing || isDeleting) && styles.disabledButton,
            ]}
            disabled={isEditing || isDeleting}
          >
            <Text
              style={[
                styles.saveText,
                (isEditing || isDeleting) && styles.disabledText,
              ]}
            >
              {isEditing ? "Saving..." : "Save"}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Time Display */}
          <View style={styles.timeDisplay}>
            <Text style={styles.timeText}>
              {formatTime(hour, minute, isAM)}
            </Text>
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
                nestedScrollEnabled={true}
                bounces={false}
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
                      {h}
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
                nestedScrollEnabled={true}
                bounces={false}
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

            <View style={styles.timePicker}>
              <Text style={styles.pickerLabel}>Period</Text>
              <View style={styles.periodContainer}>
                <TouchableOpacity
                  style={[
                    styles.periodButton,
                    isAM && styles.selectedPeriodButton,
                  ]}
                  onPress={() => setIsAM(true)}
                >
                  <Text
                    style={[
                      styles.periodText,
                      isAM && styles.selectedPeriodText,
                    ]}
                  >
                    AM
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.periodButton,
                    !isAM && styles.selectedPeriodButton,
                  ]}
                  onPress={() => setIsAM(false)}
                >
                  <Text
                    style={[
                      styles.periodText,
                      !isAM && styles.selectedPeriodText,
                    ]}
                  >
                    PM
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Alarm Name */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Alarm Name</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="Enter alarm name"
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

          {/* Vibration Strength */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Vibration Strength</Text>
              <View style={styles.strengthBadge}>
                <Text style={styles.strengthBadgeText}>
                  {Math.round(vibrationStrength)}%
                </Text>
              </View>
            </View>
            <View style={styles.sliderContainer}>
              <Text style={styles.sliderLabel}>0%</Text>
              <CustomSlider
                value={vibrationStrength}
                onValueChange={setVibrationStrength}
                minimumValue={0}
                maximumValue={100}
                step={1}
                style={styles.slider}
              />
              <Text style={styles.sliderLabel}>100%</Text>
            </View>
            <TouchableOpacity
              style={styles.previewButton}
              onPress={handlePreviewVibration}
            >
              <Ionicons name="play" size={16} color="#007AFF" />
              <Text style={styles.previewButtonText}>Preview</Text>
            </TouchableOpacity>
          </View>

          {/* Delete Section */}
          <View style={styles.deleteSection}>
            <TouchableOpacity
              style={[styles.deleteButton, isDeleting && styles.disabledButton]}
              onPress={handleDeleteAlarm}
              disabled={isDeleting || isEditing}
            >
              <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              <Text style={styles.deleteButtonText}>
                {isDeleting ? "Deleting..." : "Delete Alarm"}
              </Text>
            </TouchableOpacity>
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
  periodContainer: {
    flexDirection: "column",
    gap: 8,
    marginTop: 8,
  },
  periodButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e1e5e9",
    alignItems: "center",
  },
  selectedPeriodButton: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  periodText: {
    fontSize: 16,
    color: "#666",
  },
  selectedPeriodText: {
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
  deleteSection: {
    backgroundColor: "#fff",
    marginBottom: 32,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FF3B30",
    backgroundColor: "#FFF2F2",
    gap: 8,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FF3B30",
  },
  sliderContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  sliderLabel: {
    fontSize: 14,
    color: "#666",
  },
  slider: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  strengthBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f0f7ff",
    borderWidth: 1,
    borderColor: "#007AFF",
    borderRadius: 16,
  },
  strengthBadgeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
  },
  previewButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e1e5e9",
    backgroundColor: "#fff",
    gap: 8,
  },
  previewButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
  },
});
