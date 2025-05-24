# Pi Alarm Clock - React Native App

A beautiful, native-looking React Native app for managing your Raspberry Pi Pico W alarm clock over Bluetooth Low Energy.

## 🚀 Features

### Core Functionality

- 📱 **Native alarm clock interface** - Looks and feels like iOS/Android system alarm apps
- 🔵 **Bluetooth Low Energy connectivity** - Connects wirelessly to your Pi Pico device
- ⏰ **Full alarm management** - Add, edit, toggle, and delete alarms remotely
- 🔄 **Real-time synchronization** - See live updates from your Pi device
- 📊 **Device status monitoring** - View Pi time, health status, and error counts

### Alarm Features

- ⏰ **Flexible scheduling** - Daily, weekday, weekend, or custom day combinations
- 🔁 **Recurring vs one-time** alarms
- 📝 **Custom alarm names**
- 🕐 **Visual time picker** with hour/minute selection
- 🎯 **Quick presets** - Weekdays, weekends, daily options
- ⏰ **Time-until-alarm** display

### Technical Features

- 📱 **Cross-platform** - Works on iOS and Android
- 🔵 **Robust BLE handling** - Auto-reconnection, error recovery
- 📦 **Compact protocol** - Efficient communication with Pi device
- 🎨 **Modern UI** - Following iOS/Android design guidelines

## 📋 Prerequisites

### Development Environment

- Node.js 18+ and npm
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator (Mac) or Android Studio (all platforms)
- Physical device recommended for Bluetooth testing

### Hardware Requirements

- Raspberry Pi Pico W running the alarm clock firmware
- Mobile device with Bluetooth LE support

## 🛠 Setup Instructions

### 1. Install Dependencies

```bash
cd AlarmClockApp
npm install
```

### 2. Start Development Server

```bash
npm start
```

### 3. Run on Device/Simulator

```bash
# iOS (requires Mac)
npm run ios

# Android
npm run android

# Web (limited Bluetooth support)
npm run web
```

## 📱 Using the App

### First-Time Setup

1. **Ensure your Pi is running** - Make sure your Pi Pico alarm clock is powered on and advertising
2. **Open the app** - Launch the Pi Alarm Clock app on your phone
3. **Connect to device** - Tap "Connect" to scan for and connect to your Pi
4. **Start managing alarms** - Once connected, you can add, edit, and manage alarms

### Adding Alarms

1. **Tap the + button** in the top right corner
2. **Set the time** using the visual time picker
3. **Choose repeat schedule**:
   - **Daily** - Every day
   - **Weekdays** - Monday through Friday
   - **Weekends** - Saturday and Sunday
   - **Custom** - Select specific days
4. **Add a name** (optional) - Give your alarm a descriptive name
5. **Set recurring** - Choose if alarm repeats or is one-time only
6. **Save** - Tap "Save" to add the alarm to your Pi

### Managing Alarms

- **Toggle on/off** - Use the switch on each alarm card
- **Delete alarms** - Tap the trash icon to remove an alarm
- **View schedule** - See when each alarm will next trigger
- **Pull to refresh** - Refresh the alarm list from your Pi

### Connection Management

- **Auto-connect** - App remembers and reconnects to your Pi
- **Connection status** - Clear visual indicators show connection state
- **Error handling** - Tap error messages to see details and retry
- **Manual reconnect** - Use Connect/Disconnect buttons as needed

## 🔧 Technical Details

### Bluetooth Protocol

The app uses a compact custom protocol to communicate efficiently with the Pi:

```
Commands (sent to Pi):
- a07:30          - Add daily alarm at 7:30 AM
- a06:30:0,1,2,3,4 - Add weekday alarm at 6:30 AM
- r0              - Remove alarm index 0
- t0              - Toggle alarm index 0
- l               - List all alarms
- s               - Get device status
- p               - Ping device

Responses (from Pi):
- OK:CONNECTED    - Connection successful
- OK:ADDED:name:07:30:in 2 hours - Alarm added
- ALARM:0:Morning:07:30:ON:R:in 2 hours - Alarm details
- ERROR:message   - Error occurred
```

### App Architecture

```
AlarmClockApp/
├── services/
│   └── BluetoothService.ts    # BLE communication & protocol
├── hooks/
│   └── useAlarmClock.ts       # State management hook
├── components/
│   ├── AlarmItem.tsx          # Individual alarm display
│   ├── AddAlarmModal.tsx      # Add alarm interface
│   ├── ConnectionStatus.tsx   # Connection indicator
│   └── DeviceStatusCard.tsx   # Device info display
└── App.tsx                    # Main app component
```

## 🎨 UI/UX Design

### Design Principles

- **Native feel** - Follows iOS/Android design guidelines
- **Familiar interface** - Similar to system alarm apps
- **Clear visual hierarchy** - Easy to scan and understand
- **Consistent interactions** - Predictable touch targets and gestures

### Color Scheme

- **Primary blue** - #007AFF (iOS system blue)
- **Success green** - #34C759
- **Warning orange** - #FF9500
- **Destructive red** - #FF3B30
- **Neutral grays** - Various shades for text and backgrounds

## 🔍 Troubleshooting

### Connection Issues

**"Device not found"**

- Ensure Pi is powered on and running alarm firmware
- Check Pi is advertising (look for "PicoAlarmClock" in Bluetooth settings)
- Try moving closer to the Pi device

**"Connection failed"**

- Restart the app
- Turn Bluetooth off/on on your phone
- Restart the Pi device

**"Permission denied"**

- Grant Bluetooth and Location permissions in phone settings
- On Android 12+, ensure "Nearby devices" permission is granted

### Alarm Sync Issues

**"Alarms not updating"**

- Pull down to refresh the alarm list
- Disconnect and reconnect to the device
- Check device status for error count

**"Commands not working"**

- Verify connection status is "Connected"
- Try the ping command to test communication
- Check Pi console output for error messages

### Performance Issues

**"App feels slow"**

- Close other Bluetooth apps
- Restart the app
- Check available phone memory

## 🚀 Development Notes

### Building for Production

```bash
# Build standalone apps
expo build:ios
expo build:android

# Or using EAS Build (recommended)
eas build --platform ios
eas build --platform android
```

### Debugging BLE

Enable debug logs in the BluetoothService to see detailed communication:

```typescript
// In BluetoothService.ts, uncomment debug lines
console.log("📤 Sent command:", command);
console.log("📨 Received response:", response);
```

### Testing Without Hardware

The app includes connection state simulation for UI development:

```typescript
// Temporarily mock connection state for testing
const [state, setState] = useState({
  connectionState: "connected", // Force connected state
  // ... other state
});
```

## 📚 Related Documentation

- [Pi Alarm Clock Firmware](../pi/README.md) - Server-side documentation
- [Bluetooth Test Client](../test_bluetooth/README.md) - Python testing tools
- [Compact Protocol Spec](../test_bluetooth/COMPACT_PROTOCOL.md) - Communication protocol

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test on both iOS and Android
5. Submit a pull request

## 📄 License

This project is part of the Pi Alarm Clock system. See the main project LICENSE file for details.
