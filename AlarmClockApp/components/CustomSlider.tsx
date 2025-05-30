import React from "react";
import {
  StyleSheet,
  View,
  Text,
  PanResponder,
  Dimensions,
  Animated,
} from "react-native";

interface CustomSliderProps {
  value: number;
  minimumValue: number;
  maximumValue: number;
  onValueChange: (value: number) => void;
  step?: number;
  style?: any;
}

const CustomSlider: React.FC<CustomSliderProps> = ({
  value,
  minimumValue,
  maximumValue,
  onValueChange,
  step = 1,
  style,
}) => {
  const sliderWidth = 250; // Fixed width for consistency
  const thumbSize = 20;

  const animatedValue = React.useRef(new Animated.Value(value)).current;
  const [sliderLength, setSliderLength] = React.useState(sliderWidth);

  // Calculate thumb position based on value
  const getThumbPosition = (val: number) => {
    const percentage = (val - minimumValue) / (maximumValue - minimumValue);
    return percentage * (sliderLength - thumbSize);
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      // Set initial position
    },
    onPanResponderMove: (event, gestureState) => {
      const { dx } = gestureState;
      const currentPosition = getThumbPosition(value);
      let newPosition = currentPosition + dx;

      // Constrain to slider bounds
      newPosition = Math.max(
        0,
        Math.min(sliderLength - thumbSize, newPosition)
      );

      // Convert position to value
      const percentage = newPosition / (sliderLength - thumbSize);
      let newValue = minimumValue + percentage * (maximumValue - minimumValue);

      // Apply step if specified
      if (step > 0) {
        newValue = Math.round(newValue / step) * step;
      }

      // Constrain to min/max
      newValue = Math.max(minimumValue, Math.min(maximumValue, newValue));

      onValueChange(newValue);
    },
    onPanResponderRelease: () => {
      // Optional: Add haptic feedback or animation
    },
  });

  const thumbPosition = getThumbPosition(value);

  return (
    <View style={[styles.container, style]}>
      <View
        style={[styles.track, { width: sliderLength }]}
        onLayout={(event) => {
          const { width } = event.nativeEvent.layout;
          setSliderLength(width);
        }}
      >
        {/* Background track */}
        <View style={styles.trackBackground} />

        {/* Active track */}
        <View
          style={[styles.trackActive, { width: thumbPosition + thumbSize / 2 }]}
        />

        {/* Thumb */}
        <Animated.View
          style={[
            styles.thumb,
            {
              left: thumbPosition,
            },
          ]}
          {...panResponder.panHandlers}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 40,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  track: {
    height: 4,
    backgroundColor: "#e1e5e9",
    borderRadius: 2,
    position: "relative",
  },
  trackBackground: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#e1e5e9",
    borderRadius: 2,
  },
  trackActive: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#007AFF",
    borderRadius: 2,
  },
  thumb: {
    position: "absolute",
    top: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#007AFF",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
});

export default CustomSlider;
