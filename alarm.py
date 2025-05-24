from machine import Pin, I2C
import time
from picozero import pico_led
import json
from DS3231 import DS3231

class Alarm:
    def __init__(self, hour, minute, days=None, name="Alarm", enabled=True, recurring=True):
        """
        Create an alarm
        hour: 0-23
        minute: 0-59
        days: None (daily), list of weekdays (0=Monday, 6=Sunday), or specific date tuple (year, month, day)
        name: Alarm identifier
        enabled: Whether alarm is active
        recurring: True for repeating alarm, False for one-time
        """
        self.hour = hour
        self.minute = minute
        self.days = days  # None = daily, list = specific weekdays, tuple = specific date
        self.name = name
        self.enabled = enabled
        self.recurring = recurring
        self.last_triggered = None
        
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
        
        return f"{self.name}: {self.hour:02d}:{self.minute:02d} ({days_str}) [{type_str}] [{status}]"

class AlarmClock:
    def __init__(self, rtc):
        self.rtc = rtc
        self.alarms = []
        self.alarm_duration = 5  # seconds
        self.snooze_duration = 60  # seconds
        
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

    def add_alarm(self, hour, minute, days=None, name=None, recurring=True):
        """Add a new alarm"""
        if name is None:
            name = f"Alarm {len(self.alarms) + 1}"
            
        if not (0 <= hour <= 23):
            print("Error: Hour must be between 0-23")
            return False
            
        if not (0 <= minute <= 59):
            print("Error: Minute must be between 0-59")
            return False
            
        alarm = Alarm(hour, minute, days, name, True, recurring)
        self.alarms.append(alarm)
        
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
                    print(f"Removed: {removed}")
                    return True
            else:
                for i, alarm in enumerate(self.alarms):
                    if alarm.name == name_or_index:
                        removed = self.alarms.pop(i)
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
        """Trigger alarm - flash LED"""
        try:
            print(f"\n🚨 ALARM: {alarm.name} - {alarm.hour:02d}:{alarm.minute:02d} 🚨")
            
            # Flash LED pattern for alarm
            for _ in range(self.alarm_duration):
                pico_led.on()
                time.sleep(0.5)
                pico_led.off()
                time.sleep(0.5)
                
        except Exception as e:
            print(f"Error triggering alarm: {e}")
            
    def check_alarms(self, current_time):
        """Check if any alarms should trigger"""
        if not current_time:
            return
            
        for alarm in self.alarms:
            try:
                if alarm.should_trigger(current_time):
                    self.trigger_alarm(alarm)
            except Exception as e:
                print(f"Error checking alarm '{alarm.name}': {e}")
                
    def run(self):
        """Main alarm clock loop"""
        print("🕐 Alarm Clock Started 🕐")
        self.list_alarms()
        
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
        i2c = I2C(0, scl=Pin(1), sda=Pin(0))
        rtc = DS3231(i2c)
    except Exception as e:
        print(f"Error initializing I2C/RTC: {e}")
        return None
        
    # Create alarm clock
    alarm_clock = AlarmClock(rtc)
    
    # Set current time (run once, then comment out)
    # rtc.set_time(2025, 5, 23, 14, 30, 0)  # YYYY, MM, DD, HH, MM, SS
    
    # Add example alarms
    
    # Daily alarm at 7:00 AM
    alarm_clock.add_alarm(19, 42, name="Morning Alarm", recurring=True)
    
    # Weekday alarm at 6:30 AM (Monday to Friday)
    alarm_clock.add_alarm(6, 30, days=[0, 1, 2, 3, 4], name="Work Alarm", recurring=True)
    
    # Weekend alarm at 9:00 AM (Saturday and Sunday)
    alarm_clock.add_alarm(9, 0, days=[5, 6], name="Weekend Alarm", recurring=True)
    
    # One-time alarm for today at current time + 2 minutes (for testing)
    current_time = rtc.get_time()
    if current_time:
        year, month, day, hour, minute, second = current_time
        test_minute = (minute + 2) % 60
        test_hour = hour + (1 if minute + 2 >= 60 else 0)
        alarm_clock.add_alarm(test_hour, test_minute, 
                             days=(year, month, day), 
                             name="Test Alarm", 
                             recurring=False)
    
    return alarm_clock

# Run the alarm clock
if __name__ == "__main__":
    alarm_clock = setup_example_alarms()
    if alarm_clock:
        try:
            alarm_clock.run()
        except Exception as e:
            print(f"Fatal error: {e}")
            # Keep LED off on exit
            pico_led.off()