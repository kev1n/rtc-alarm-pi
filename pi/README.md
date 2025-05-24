# Raspberry Pi Pico W Bluetooth Alarm Clock

A resilient alarm clock system for Raspberry Pi Pico W with Bluetooth Low Energy (BLE) support for remote alarm management.

## Features

🕐 **Real-Time Clock Integration**

- DS3231 RTC module for accurate timekeeping
- Automatic time sync and battery backup

⏰ **Flexible Alarm System**

- Daily, weekday, weekend, and one-time alarms
- Named alarms for easy identification
- Enable/disable individual alarms
- Visual LED feedback when alarms trigger

🔵 **Bluetooth Low Energy Support**

- Remote alarm management via smartphone or computer
- JSON-based command protocol
- Real-time status updates and notifications
- Error recovery and connection resilience

🛡️ **Resilient Design**

- Automatic reconnection on Bluetooth failures
- Command queuing with retry logic
- Comprehensive error handling
- Memory management with garbage collection

## Hardware Requirements

- Raspberry Pi Pico W (with Bluetooth support)
- DS3231 Real-Time Clock module
- I2C connections:
  - SDA → GPIO 0 (Pin 1)
  - SCL → GPIO 1 (Pin 2)
  - VCC → 3.3V
  - GND → GND

## Software Setup

### 1. MicroPython Installation

1. Install MicroPython on your Pico W
2. Upload the following files to your Pico:
   - `alarm.py` - Main alarm clock system
   - `bluetooth_alarm_manager.py` - Bluetooth BLE manager
   - `DS3231.py` - RTC driver

### 2. Required Libraries

The Pico W needs:

- `picozero` - For LED control (usually pre-installed)
- `bluetooth` - Built-in BLE support
- `machine`, `time`, `json` - Standard MicroPython libraries

### 3. Time Configuration

Before first use, set the current time by uncommenting and running this line in `alarm.py`:

```python
rtc.set_time(2025, 1, 15, 14, 30, 0)  # YYYY, MM, DD, HH, MM, SS
```

## Bluetooth Testing

### Method 1: Python Test Client (Recommended)

#### Prerequisites

Install the required Python package on your computer:

```bash
pip install bleak
```

#### Running Tests

1. **Start the Pico W alarm clock**:

   ```python
   # On the Pico W (via Thonny or similar)
   exec(open('alarm.py').read())
   ```

2. **Run the test client on your computer**:

   ```bash
   python test_bluetooth_client.py
   ```

3. **Follow the interactive menu** to test various functions:
   - Ping device
   - List alarms
   - Add/remove/toggle alarms
   - Check system status

#### Automated Testing

Choose option 2 in the test client for automated tests that will:

- Connect to the device
- Test all major functions
- Add/modify/remove test alarms
- Verify responses

### Method 2: Mobile App Testing

#### Android (using nRF Connect)

1. **Install nRF Connect** from Google Play Store
2. **Scan for devices** - look for "PicoAlarmClock"
3. **Connect to device**
4. **Find the Alarm Service** (`12345678-1234-5678-9abc-123456789abc`)
5. **Use characteristics**:
   - **Command** (`...abd`): Write JSON commands
   - **Response** (`...abe`): Read responses and enable notifications
   - **Status** (`...abf`): Read current status

#### iOS (using LightBlue Explorer)

1. **Install LightBlue Explorer** from App Store
2. **Scan and connect** to "PicoAlarmClock"
3. **Navigate to services** and find the Alarm Service
4. **Write commands** to the Command characteristic
5. **Enable notifications** on Response characteristic

## Command Protocol

All commands are JSON-formatted strings sent to the Command characteristic.

### Basic Commands

#### Ping Device

```json
{ "type": "ping" }
```

#### Get Status

```json
{ "type": "status" }
```

#### List All Alarms

```json
{ "type": "list" }
```

### Alarm Management

#### Add Alarm

```json
{
  "type": "add",
  "hour": 7,
  "minute": 30,
  "name": "Morning Alarm",
  "days": null,
  "recurring": true
}
```

**Parameters:**

- `hour`: 0-23 (required)
- `minute`: 0-59 (required)
- `name`: Alarm identifier (optional)
- `days`:
  - `null` for daily alarms
  - `[0,1,2,3,4]` for weekdays (0=Monday, 6=Sunday)
  - `[5,6]` for weekends
- `recurring`: `true` for repeating, `false` for one-time

#### Remove Alarm

```json
{
  "type": "remove",
  "alarm": "Morning Alarm"
}
```

_Use alarm name or index number_

#### Toggle Alarm

```json
{
  "type": "toggle",
  "alarm": 0
}
```

_Enable/disable alarm by name or index_

### Example Alarm Scenarios

#### Daily Wake-up Alarm

```json
{
  "type": "add",
  "hour": 7,
  "minute": 0,
  "name": "Daily Wake-up",
  "days": null,
  "recurring": true
}
```

#### Weekday Work Alarm

```json
{
  "type": "add",
  "hour": 6,
  "minute": 30,
  "name": "Work Alarm",
  "days": [0, 1, 2, 3, 4],
  "recurring": true
}
```

#### One-time Reminder

```json
{
  "type": "add",
  "hour": 15,
  "minute": 30,
  "name": "Doctor Appointment",
  "recurring": false
}
```

## Response Format

All responses are JSON with the following structure:

```json
{
  "type": "response_type",
  "message": "Human readable message",
  "time": 1640995200,
  "data": {
    /* Additional response data */
  }
}
```

### Response Types

- `welcome` - Connection established
- `add_success` - Alarm added successfully
- `remove_success` - Alarm removed
- `toggle_success` - Alarm toggled
- `list_success` - Alarm list (includes `alarms` array)
- `status_success` - System status
- `pong` - Response to ping
- `heartbeat` - Periodic status update
- `error` - Error occurred

## Troubleshooting

### Connection Issues

**Problem**: Can't find "PicoAlarmClock" device

- Ensure Pico W is running and Bluetooth is initialized
- Check for error messages in Pico console
- Try resetting the Pico W
- Make sure you're within Bluetooth range (< 10 meters)

**Problem**: Connection drops frequently

- Check power supply to Pico W
- Ensure stable Wi-Fi environment
- Monitor error count in status responses

### Command Issues

**Problem**: Commands not working

- Verify JSON format is correct
- Check characteristic UUIDs match
- Ensure you're writing to Command characteristic
- Enable notifications on Response characteristic

**Problem**: "Invalid JSON" errors

- Use proper JSON formatting (double quotes)
- Escape special characters
- Test JSON validity online

### Time Issues

**Problem**: Alarms not triggering at correct time

- Verify RTC time is set correctly
- Check timezone settings
- Ensure DS3231 battery is good

## Development and Customization

### Extending Commands

To add new commands:

1. **Add command handler** in `bluetooth_alarm_manager.py`:

   ```python
   elif cmd_type == 'MYCOMMAND':
       self._handle_my_command(command)
   ```

2. **Implement handler method**:
   ```python
   def _handle_my_command(self, command):
       # Your command logic here
       self._send_response({"type": "success", "message": "Done"})
   ```

### Customizing UUIDs

Update these constants in both files if needed:

```python
_ALARM_SERVICE_UUID = bluetooth.UUID("your-service-uuid")
_COMMAND_CHAR_UUID = bluetooth.UUID("your-command-uuid")
# etc.
```

### Error Recovery

The system includes several resilience features:

- **Command Queue**: Commands are queued and retried on failure
- **Connection Health**: Automatic timeout detection and recovery
- **Error Counting**: System recovery after too many errors
- **Memory Management**: Periodic garbage collection

## Testing Checklist

Use this checklist to verify your Bluetooth alarm system:

### Basic Connectivity

- [ ] Device appears in Bluetooth scan
- [ ] Successfully connects to device
- [ ] Receives welcome message
- [ ] Ping command works
- [ ] Status command returns valid data

### Alarm Management

- [ ] Can list existing alarms
- [ ] Can add new alarm
- [ ] Can remove alarm
- [ ] Can toggle alarm on/off
- [ ] Alarm triggers at correct time
- [ ] LED flashes when alarm triggers

### Edge Cases

- [ ] Invalid JSON command handling
- [ ] Invalid time values rejection
- [ ] Non-existent alarm removal
- [ ] Connection recovery after disconnect
- [ ] System behavior after multiple errors

### Performance

- [ ] Commands respond within 2 seconds
- [ ] No memory errors during extended use
- [ ] Bluetooth remains stable during alarm triggering
- [ ] System recovers from temporary errors

## API Reference

### AlarmClock Class Methods

- `add_alarm(hour, minute, days, name, recurring)` - Add new alarm
- `remove_alarm(name_or_index)` - Remove alarm
- `toggle_alarm(name_or_index)` - Enable/disable alarm
- `list_alarms()` - Display all alarms
- `run(bluetooth_manager)` - Main loop with optional Bluetooth

### BluetoothAlarmManager Class Methods

- `start_advertising()` - Begin BLE advertising
- `stop_advertising()` - Stop BLE advertising
- `run_bluetooth_tasks()` - Process BLE tasks (call from main loop)
- `check_connection_health()` - Monitor connection status

## License

This project is open source. Feel free to modify and distribute according to your needs.

## Support

For issues and questions:

1. Check the troubleshooting section above
2. Verify hardware connections
3. Test with the provided test client
4. Check MicroPython and Pico W documentation
