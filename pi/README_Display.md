# OLED Display Integration for Alarm Clock

This project now includes support for an SSD1306 OLED display to show the current time and alarm information.

## Hardware Setup

### Required Components

- SSD1306 OLED display (128x64 pixels)
- Raspberry Pi Pico W
- Jumper wires

### Wiring Connections

Connect the OLED display to your Raspberry Pi Pico W as follows:

| OLED Pin | Pico Pin | Description  |
| -------- | -------- | ------------ |
| VCC      | 3V3      | Power (3.3V) |
| GND      | GND      | Ground       |
| SDA      | GP16     | I2C Data     |
| SCL      | GP17     | I2C Clock    |

## Software Setup

### Install Required Libraries

You need to install the `ssd1306` library on your Pico W:

```bash
# Using mpremote (if you have it installed)
mpremote mip install ssd1306

# Or manually download and copy ssd1306.py to your Pico
```

### Files Added

- `display_manager.py` - Handles all display functionality
- `button_handler.py` - Manages button press detection for display control
- `requirements.txt` - Documents required libraries

## Display Features

### What's Displayed

1. **Top two lines:**

   - Large current time in 12-hour format (HH:MM AM/PM)
   - Bluetooth connection icon ("B") in top-right corner when connected

2. **Remaining lines:**
   - List of **active** alarms only (disabled alarms are hidden)
   - **Sorted by next trigger time** (earliest alarms first)
   - Each alarm spans **two lines** for better readability:
     - Line 1: `HH:MM AM/PM AlarmName` (time + start of name)
     - Line 2: `remaining_name (time_until)` (continuation of name + time until)
   - Examples:
     ```
     7:00 AM Work Alarm
     (2h30m)
     ```
     ```
     6:30 AM Very Long
     Alarm Name (45m)
     ```
   - Shows up to 3 alarms on screen (6 lines total)

### Button Controls

The button connected to GP0 has the following functionality:

**When an alarm is active:**

- **Hold for 5 seconds**: Disable the alarm (original functionality)

**When no alarm is active:**

- **Single Press**: Toggle display ON/OFF
- **Note**: After an alarm finishes, there's a **3-second delay** before display controls become active again (prevents accidental display toggle)

**Note:** Alarm scrolling functionality has been removed to prevent interference with alarm disable functionality.

### Auto-Update

- Display updates every minute automatically
- Shows up to 3 alarms on screen (6 lines total)
- If there are more alarms, shows "+X" indicator (e.g., "+2" means 2 more alarms)
- Only active/enabled alarms are shown

### Alarm Behavior

- **Recurring alarms**: Continue to be active after ringing
- **One-time alarms**: Automatically disabled after they finish ringing
- **Display updates**: Immediate when alarms are changed via Bluetooth or after alarms finish

## Usage Examples

### Basic Display Test

```python
from machine import Pin, I2C
import ssd1306

# Test display connection
i2c = I2C(0, scl=Pin(17), sda=Pin(16), freq=400000)
oled = ssd1306.SSD1306_I2C(128, 64, i2c)
oled.fill(0)
oled.text("Display Works!", 0, 0)
oled.show()
```

### Integration with Alarm Clock

The display is automatically initialized when you run the main alarm clock:

```python
# In alarm.py, the display is set up automatically
alarm_clock, bluetooth_manager, display_manager, button_handler = setup_example_alarms()
if alarm_clock:
    alarm_clock.run(bluetooth_manager, display_manager, button_handler)
```

## Troubleshooting

### Display Not Working

1. Check wiring connections
2. Verify I2C address (should be 0x3C)
3. Ensure `ssd1306` library is installed
4. Check console for initialization error messages

### Button Not Responding

1. Ensure button is connected to GP0
2. Check that no alarms are currently active
3. Try single press first, then double press for scrolling

### Display Shows Wrong Information

1. Verify RTC is working correctly
2. Check that alarms are properly loaded
3. Look for error messages in console output

## Customization

### Display Layout

Modify `display_manager.py` to customize:

- Text positioning
- Font size (limited by ssd1306 library)
- Information displayed
- Update frequency

### Button Behavior

Modify `button_handler.py` to customize:

- Double-press timeout
- Button debounce time
- Additional button functions

## Performance Notes

- Display updates are limited to once per minute to reduce CPU usage
- Button checking happens in the main loop without blocking
- I2C communication is handled efficiently with error recovery
- Display automatically turns off to save power when requested
