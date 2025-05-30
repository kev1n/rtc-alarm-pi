from machine import Pin, I2C, PWM
import time
from picozero import pico_led # type: ignore
import json
from DS3231 import DS3231
from bluetooth_alarm_manager import BluetoothAlarmManager

# Button setup for alarm disable (GP0 with internal pull-up)
button = Pin(0, Pin.IN, Pin.PULL_UP)
BUTTON_HOLD_MS = 5_000  # 5 seconds to disable alarm

# Motor control setup
motor1a = PWM(Pin(14))
motor1a.freq(1000)
motor1b = PWM(Pin(15))
motor1b.freq(1000)

def motor_forward(strength=100):
    """Move motor forward with specified strength (0-100)"""
    duty_value = int((strength / 100) * 65535)
    motor1a.duty_u16(duty_value)
    motor1b.duty_u16(0)

def motor_backward(strength=100):
    """Move motor backward with specified strength (0-100)"""
    duty_value = int((strength / 100) * 65535)
    motor1a.duty_u16(0)
    motor1b.duty_u16(duty_value)

def motor_stop():
    motor1a.duty_u16(0)
    motor1b.duty_u16(0)

def preview_vibration(strength=100, duration=2):
    """Preview vibration at specified strength for testing"""
    try:
        print(f"🎯 Previewing vibration at {strength}% strength for {duration}s")
        
        # Brief vibration pattern for preview
        for _ in range(duration):
            motor_forward(strength)
            time.sleep(0.25)
            motor_backward(strength)
            time.sleep(0.25)
        
        # Stop the motor when done
        motor_stop()
        print("✅ Vibration preview completed")
        
    except Exception as e:
        print(f"❌ Error during vibration preview: {e}")
        motor_stop()

class Alarm:
    def __init__(self, hour, minute, days=None, name="Alarm", enabled=True, recurring=True, vibration_strength=75):
        """
        Create an alarm
        hour: 0-23
        minute: 0-59
        days: None (daily), list of weekdays (0=Monday, 6=Sunday), or specific date tuple (year, month, day)
        name: Alarm identifier
        enabled: Whether alarm is active
        recurring: True for repeating alarm, False for one-time
        vibration_strength: Motor strength 0-100 (default 75%)
        """
        self.hour = hour
        self.minute = minute
        self.days = days  # None = daily, list = specific weekdays, tuple = specific date
        self.name = name
        self.enabled = enabled
        self.recurring = recurring
        self.vibration_strength = max(0, min(100, vibration_strength))  # Clamp to 0-100
        self.last_triggered = None
        
    def to_dict(self):
        """Convert alarm to dictionary for JSON serialization"""
        return {
            'hour': self.hour,
            'minute': self.minute,
            'days': self.days,
            'name': self.name,
            'enabled': self.enabled,
            'recurring': self.recurring,
            'vibration_strength': self.vibration_strength
        }
    
    @classmethod
    def from_dict(cls, data):
        """Create alarm from dictionary"""
        return cls(
            hour=data['hour'],
            minute=data['minute'],
            days=data.get('days'),
            name=data.get('name', 'Alarm'),
            enabled=data.get('enabled', True),
            recurring=data.get('recurring', True),
            vibration_strength=data.get('vibration_strength', 75)
        )
        
    def should_trigger(self, current_time):
        if not self.enabled:
            return False
            
        year, month, day, hour, minute, second = current_time
        
        # Check if time matches
        if hour != self.hour or minute != self.minute:
            return False
            
        # Prevent triggering multiple times in the same minute
        current_minute_key = (year, month, day, hour, minute)
        if self.last_triggered == current_minute_key:
            return False
            
        # Check day conditions
        if self.days is None:
            # Daily alarm
            should_trigger = True
        elif isinstance(self.days, list):
            # Weekday-based alarm (0=Monday, 6=Sunday)
            # Convert date to weekday
            weekday = self._get_weekday(year, month, day)
            should_trigger = weekday in self.days
        elif isinstance(self.days, tuple) and len(self.days) == 3:
            # Specific date alarm
            alarm_year, alarm_month, alarm_day = self.days
            should_trigger = (year == alarm_year and month == alarm_month and day == alarm_day)
        else:
            should_trigger = False
            
        if should_trigger:
            self.last_triggered = current_minute_key
            
            # Disable one-time alarms after triggering
            if not self.recurring:
                self.enabled = False
                
        return should_trigger
        
    def _get_weekday(self, year, month, day):
        """Calculate weekday (0=Monday, 6=Sunday) using Zeller's congruence"""
        if month < 3:
            month += 12
            year -= 1
        k = year % 100
        j = year // 100
        weekday = (day + (13 * (month + 1)) // 5 + k + k // 4 + j // 4 - 2 * j) % 7
        return (weekday + 5) % 7  # Convert to Monday=0 format
        
    def __str__(self):
        days_str = "Daily"
        if isinstance(self.days, list):
            day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            days_str = ", ".join([day_names[d] for d in sorted(self.days)])
        elif isinstance(self.days, tuple):
            days_str = f"{self.days[0]}-{self.days[1]:02d}-{self.days[2]:02d}"
            
        status = "ON" if self.enabled else "OFF"
        type_str = "Recurring" if self.recurring else "One-time"
        
        return f"{self.name}: {self.hour:02d}:{self.minute:02d} ({days_str}) [{type_str}] [{status}] [Vibration: {self.vibration_strength}%]"

class AlarmClock:
    def __init__(self, rtc, alarms_file="alarms.json"):
        self.rtc = rtc
        self.alarms = []
        self.alarm_duration = 5  # seconds
        self.snooze_duration = 60  # seconds
        self.alarms_file = alarms_file
        
        # Load existing alarms from file
        self.load_alarms_from_file()
        
    def save_alarms_to_file(self):
        """Save all alarms to JSON file"""
        try:
            alarm_data = [alarm.to_dict() for alarm in self.alarms]
            with open(self.alarms_file, 'w') as f:
                json.dump(alarm_data, f)
            print(f"✅ Saved {len(self.alarms)} alarms to {self.alarms_file}")
        except Exception as e:
            print(f"❌ Error saving alarms to file: {e}")
            
    def load_alarms_from_file(self):
        """Load alarms from JSON file"""
        try:
            with open(self.alarms_file, 'r') as f:
                alarm_data = json.load(f)
            
            self.alarms = []
            for data in alarm_data:
                try:
                    alarm = Alarm.from_dict(data)
                    self.alarms.append(alarm)
                    print(f"📋 Loaded alarm: {alarm.name} with vibration strength {alarm.vibration_strength}%")
                except Exception as e:
                    print(f"⚠️ Error loading alarm from data {data}: {e}")
                    
            print(f"✅ Loaded {len(self.alarms)} alarms from {self.alarms_file}")
            return True
            
        except OSError:
            # File doesn't exist - this is normal for first run
            print(f"📝 No existing alarms file found. Starting with empty alarm list.")
            self.alarms = []
            return False
        except Exception as e:
            print(f"❌ Error loading alarms from file: {e}")
            self.alarms = []
            return False
            
    def _calculate_next_trigger(self, alarm):
        """Calculate when an alarm will next trigger"""
        current_time = self.rtc.get_time()
        if not current_time:
            return None
            
        year, month, day, hour, minute, second = current_time
        
        if alarm.days is None:
            # Daily alarm - check today first, then tomorrow
            if (alarm.hour > hour) or (alarm.hour == hour and alarm.minute > minute):
                # Today
                return (year, month, day, alarm.hour, alarm.minute, 0)
            else:
                # Tomorrow
                next_day = self._add_days_to_date(year, month, day, 1)
                return (next_day[0], next_day[1], next_day[2], alarm.hour, alarm.minute, 0)
                
        elif isinstance(alarm.days, list):
            # Weekday-based alarm
            current_weekday = alarm._get_weekday(year, month, day)
            
            # Check if alarm could trigger today
            if (current_weekday in alarm.days and 
                ((alarm.hour > hour) or (alarm.hour == hour and alarm.minute > minute))):
                return (year, month, day, alarm.hour, alarm.minute, 0)
            
            # Find next occurrence
            for days_ahead in range(1, 8):
                check_date = self._add_days_to_date(year, month, day, days_ahead)
                check_weekday = alarm._get_weekday(check_date[0], check_date[1], check_date[2])
                if check_weekday in alarm.days:
                    return (check_date[0], check_date[1], check_date[2], alarm.hour, alarm.minute, 0)
                    
        elif isinstance(alarm.days, tuple) and len(alarm.days) == 3:
            # Specific date alarm
            alarm_year, alarm_month, alarm_day = alarm.days
            return (alarm_year, alarm_month, alarm_day, alarm.hour, alarm.minute, 0)
            
        return None
        
    def _add_days_to_date(self, year, month, day, days_to_add):
        """Add days to a date (simple implementation)"""
        days_in_month = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        
        # Check for leap year
        if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0):
            days_in_month[1] = 29
            
        day += days_to_add
        
        while day > days_in_month[month - 1]:
            day -= days_in_month[month - 1]
            month += 1
            if month > 12:
                month = 1
                year += 1
                # Recalculate for new year
                if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0):
                    days_in_month[1] = 29
                else:
                    days_in_month[1] = 28
                    
        return (year, month, day)
        
    def _format_time_until(self, target_time):
        """Format time difference in human-readable format"""
        current_time = self.rtc.get_time()
        if not current_time or not target_time:
            return "unknown"
            
        # Convert to total minutes for easier calculation
        def time_to_minutes(time_tuple):
            year, month, day, hour, minute, second = time_tuple
            # Simple approximation: treat each day as 24*60 minutes from epoch
            return ((year - 2025) * 365 * 24 * 60 + 
                   (month - 1) * 30 * 24 * 60 + 
                   (day - 1) * 24 * 60 + 
                   hour * 60 + minute)
        
        current_minutes = time_to_minutes(current_time)
        target_minutes = time_to_minutes(target_time)
        diff_minutes = target_minutes - current_minutes
        
        if diff_minutes < 0:
            return "in the past"
        elif diff_minutes == 0:
            return "now"
        elif diff_minutes < 60:
            return f"in {diff_minutes} minute{'s' if diff_minutes != 1 else ''}"
        elif diff_minutes < 1440:  # Less than 24 hours
            hours = diff_minutes // 60
            minutes = diff_minutes % 60
            if minutes == 0:
                return f"in {hours} hour{'s' if hours != 1 else ''}"
            else:
                return f"in {hours} hour{'s' if hours != 1 else ''} and {minutes} minute{'s' if minutes != 1 else ''}"
        else:  # 24+ hours
            days = diff_minutes // 1440
            remaining_minutes = diff_minutes % 1440
            hours = remaining_minutes // 60
            minutes = remaining_minutes % 60
            
            result = f"in {days} day{'s' if days != 1 else ''}"
            if hours > 0:
                result += f" and {hours} hour{'s' if hours != 1 else ''}"
            if hours == 0 and minutes > 0:
                result += f" and {minutes} minute{'s' if minutes != 1 else ''}"
            return result

    def add_alarm(self, hour, minute, days=None, name=None, recurring=True, vibration_strength=75):
        """Add a new alarm"""
        if name is None:
            name = f"Alarm {len(self.alarms) + 1}"
            
        if not (0 <= hour <= 23):
            print("Error: Hour must be between 0-23")
            return False
            
        if not (0 <= minute <= 59):
            print("Error: Minute must be between 0-59")
            return False
            
        if not (0 <= vibration_strength <= 100):
            print("Error: Vibration strength must be between 0-100")
            return False
            
        alarm = Alarm(hour, minute, days, name, True, recurring, vibration_strength)
        self.alarms.append(alarm)
        
        # Save alarms to file after adding
        self.save_alarms_to_file()
        
        # Calculate and display next trigger time
        next_trigger = self._calculate_next_trigger(alarm)
        if next_trigger:
            time_until = self._format_time_until(next_trigger)
            next_year, next_month, next_day, next_hour, next_minute, _ = next_trigger
            print(f"Added: {alarm}")
            print(f"Next alarm: {next_year}-{next_month:02d}-{next_day:02d} {next_hour:02d}:{next_minute:02d} ({time_until})")
        else:
            print(f"Added: {alarm}")
            print("Next trigger time could not be calculated")
            
        return True
        
    def remove_alarm(self, name_or_index):
        """Remove an alarm by name or index"""
        try:
            if isinstance(name_or_index, int):
                if 0 <= name_or_index < len(self.alarms):
                    removed = self.alarms.pop(name_or_index)
                    # Save alarms to file after removing
                    self.save_alarms_to_file()
                    print(f"Removed: {removed}")
                    return True
            else:
                for i, alarm in enumerate(self.alarms):
                    if alarm.name == name_or_index:
                        removed = self.alarms.pop(i)
                        # Save alarms to file after removing
                        self.save_alarms_to_file()
                        print(f"Removed: {removed}")
                        return True
        except Exception as e:
            print(f"Error removing alarm: {e}")
        
        print("Alarm not found")
        return False
        
    def toggle_alarm(self, name_or_index):
        """Enable/disable an alarm"""
        alarm = self._get_alarm(name_or_index)
        if alarm:
            alarm.enabled = not alarm.enabled
            # Save alarms to file after toggling
            self.save_alarms_to_file()
            status = "enabled" if alarm.enabled else "disabled"
            print(f"Alarm '{alarm.name}' {status}")
            return True
        return False
        
    def _get_alarm(self, name_or_index):
        """Get alarm by name or index"""
        try:
            if isinstance(name_or_index, int):
                if 0 <= name_or_index < len(self.alarms):
                    return self.alarms[name_or_index]
            else:
                for alarm in self.alarms:
                    if alarm.name == name_or_index:
                        return alarm
        except Exception as e:
            print(f"Error getting alarm: {e}")
        return None
        
    def list_alarms(self):
        """Display all alarms"""
        if not self.alarms:
            print("No alarms set")
            return
            
        print("\n=== ALARMS ===")
        for i, alarm in enumerate(self.alarms):
            print(f"{i}: {alarm}")
        print("==============\n")
        
    def trigger_alarm(self, alarm):
        """Trigger alarm - activate motor"""
        try:
            print(f"\n🚨 ALARM: {alarm.name} - {alarm.hour:02d}:{alarm.minute:02d} 🚨")
            print(f"🎯 Using vibration strength: {alarm.vibration_strength}%")
            
            # Activate motor pattern for alarm
            for _ in range(self.alarm_duration):
                motor_forward(alarm.vibration_strength)
                time.sleep(0.5)
                motor_backward(alarm.vibration_strength)
                time.sleep(0.5)
            
            # Stop the motor when done
            motor_stop()
            print(f"✅ Alarm completed with {alarm.vibration_strength}% strength")
                
            # Save alarms after triggering (in case a one-time alarm was disabled)
            self.save_alarms_to_file()
                
        except Exception as e:
            print(f"Error triggering alarm: {e}")
            motor_stop()
            
    def check_alarms(self, current_time):
        """Check if any alarms should trigger"""
        if not current_time:
            return
            
        alarms_modified = False
        for alarm in self.alarms:
            try:
                if alarm.should_trigger(current_time):
                    self.trigger_alarm(alarm)
                    # Check if alarm was disabled (one-time alarms)
                    if not alarm.enabled and not alarm.recurring:
                        alarms_modified = True
            except Exception as e:
                print(f"Error checking alarm '{alarm.name}': {e}")
                
        # Save if any alarms were modified (disabled one-time alarms)
        if alarms_modified:
            self.save_alarms_to_file()
                
    def run(self, bluetooth_manager=None):
        """Main alarm clock loop with optional Bluetooth support"""
        print("🕐 Alarm Clock Started 🕐")
        self.list_alarms()
        
        if bluetooth_manager:
            print("🔵 Bluetooth support enabled")
            bluetooth_manager.start_advertising()
        
        consecutive_errors = 0
        max_errors = 5
        
        while True:
            try:
                current_time = self.rtc.get_time()
                
                if current_time:
                    year, month, day, hour, minute, second = current_time
                    
                    # Display time every 30 seconds
                    if second % 30 == 0:
                        print(f"Current time: {year}-{month:02d}-{day:02d} {hour:02d}:{minute:02d}:{second:02d}")
                        
                    # Check alarms
                    self.check_alarms(current_time)
                    
                    # Run Bluetooth tasks if available
                    if bluetooth_manager:
                        bluetooth_manager.run_bluetooth_tasks()
                    
                    # Blink LED every 5 seconds (original functionality)
                    if second % 5 == 0:
                        pico_led.on()
                        time.sleep(0.1)
                        pico_led.off()
                        
                    consecutive_errors = 0  # Reset error count on success
                else:
                    consecutive_errors += 1
                    print("Failed to read time from RTC")
                    
            except KeyboardInterrupt:
                print("\nAlarm clock stopped by user")
                if bluetooth_manager:
                    bluetooth_manager.stop_advertising()
                break
            except Exception as e:
                consecutive_errors += 1
                print(f"Error in main loop: {e}")
                
            # If too many consecutive errors, wait longer
            if consecutive_errors >= max_errors:
                print(f"Too many errors ({consecutive_errors}), waiting longer...")
                time.sleep(5)
            else:
                time.sleep(1)

# Example usage and setup
def setup_example_alarms():
    """Setup some example alarms"""
    
    # Initialize I2C and RTC
    try:
        i2c = I2C(1, scl=Pin(27), sda=Pin(26))
        rtc = DS3231(i2c)
    except Exception as e:
        print(f"Error initializing I2C/RTC: {e}")
        return None, None
        
    # Create alarm clock (this will automatically load existing alarms)
    alarm_clock = AlarmClock(rtc)
    
    # Set current time (run once, then comment out)
    # rtc.set_time(2025, 5, 23, 14, 30, 0)  # YYYY, MM, DD, HH, MM, SS
    
    # Only add example alarms if no alarms were loaded from file
    if len(alarm_clock.alarms) == 0:
        print("🆕 No existing alarms found. Adding example alarms...")
        
        # Daily alarm at 7:00 AM
        alarm_clock.add_alarm(7, 0, name="Morning Alarm", recurring=True)
        
        # Weekday alarm at 6:30 AM (Monday to Friday)
        alarm_clock.add_alarm(6, 30, days=[0, 1, 2, 3, 4], name="Work Alarm", recurring=True)
        
        # Weekend alarm at 9:00 AM (Saturday and Sunday)
        alarm_clock.add_alarm(9, 0, days=[5, 6], name="Weekend Alarm", recurring=True)
        
    else:
        print(f"📋 Loaded {len(alarm_clock.alarms)} existing alarms from file")
    
    # Initialize Bluetooth manager
    try:
        bluetooth_manager = BluetoothAlarmManager(alarm_clock, "PicoAlarmClock")
        print("✅ Bluetooth manager initialized successfully")
        return alarm_clock, bluetooth_manager
    except Exception as e:
        print(f"⚠️ Bluetooth initialization failed: {e}")
        print("📱 Running without Bluetooth support")
        return alarm_clock, None

# Run the alarm clock
if __name__ == "__main__":
    # Set current time (run once, then comment out)
    # i2c = I2C(1, scl=Pin(27), sda=Pin(26))
    # rtc = DS3231(i2c)
    # rtc.set_time(2025, 5, 27, 17, 31, 50)  # YYYY, MM, DD, HH, MM, SS

    alarm_clock, bluetooth_manager = setup_example_alarms()
    if alarm_clock:
        try:
            alarm_clock.run(bluetooth_manager)
        except Exception as e:
            print(f"Fatal error: {e}")
            # Keep LED off on exit
            pico_led.off()