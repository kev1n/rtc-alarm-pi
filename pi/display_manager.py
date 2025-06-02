from machine import Pin, I2C
import ssd1306
import time

class DisplayManager:
    def __init__(self, rtc, alarm_clock, bluetooth_manager=None):
        """Initialize display manager"""
        self.rtc = rtc
        self.alarm_clock = alarm_clock
        self.bluetooth_manager = bluetooth_manager
        
        # Set up I2C and OLED display using GP16 (SDA), GP17 (SCL)
        try:
            self.i2c = I2C(0, scl=Pin(17), sda=Pin(16), freq=400000)
            self.oled = ssd1306.SSD1306_I2C(128, 64, self.i2c)
            self.display_available = True
            print("✅ OLED display initialized successfully")
        except Exception as e:
            print(f"❌ Failed to initialize OLED display: {e}")
            self.display_available = False
            return
            
        # Display state
        self.display_on = True
        self.last_update_minute = -1
        
        # Display dimensions
        self.width = 128
        self.height = 64
        self.line_height = 8
        self.max_lines = 8
        
        # Update display immediately
        self.update_display()
        
    def is_available(self):
        """Check if display is available"""
        return self.display_available
        
    def toggle_display(self):
        """Toggle display on/off"""
        if not self.display_available:
            return
            
        self.display_on = not self.display_on
        if self.display_on:
            self.update_display()
            print("📺 Display turned ON")
        else:
            self.oled.fill(0)
            self.oled.show()
            print("📺 Display turned OFF")
            
    def format_time_until(self, target_time):
        """Format time difference in compact format for display"""
        current_time = self.rtc.get_time()
        if not current_time or not target_time:
            return "???"
            
        # Convert to total minutes for easier calculation
        def time_to_minutes(time_tuple):
            year, month, day, hour, minute, second = time_tuple
            return ((year - 2025) * 365 * 24 * 60 + 
                   (month - 1) * 30 * 24 * 60 + 
                   (day - 1) * 24 * 60 + 
                   hour * 60 + minute)
        
        current_minutes = time_to_minutes(current_time)
        target_minutes = time_to_minutes(target_time)
        diff_minutes = target_minutes - current_minutes
        
        if diff_minutes < 0:
            return "past"
        elif diff_minutes == 0:
            return "now"
        elif diff_minutes < 60:
            return f"{diff_minutes}m"
        elif diff_minutes < 1440:  # Less than 24 hours
            hours = diff_minutes // 60
            minutes = diff_minutes % 60
            if minutes == 0:
                return f"{hours}h"
            else:
                return f"{hours}h{minutes}m"
        else:  # 24+ hours
            days = diff_minutes // 1440
            remaining_hours = (diff_minutes % 1440) // 60
            if remaining_hours == 0:
                return f"{days}d"
            else:
                return f"{days}d{remaining_hours}h"
                
    def get_bluetooth_icon(self):
        """Get Bluetooth connection status icon"""
        if self.bluetooth_manager and hasattr(self.bluetooth_manager, 'connected'):
            return "B" if self.bluetooth_manager.connected else ""
        return ""
        
    def sort_alarms_by_next_trigger(self, alarms):
        """Sort alarms by when they will next trigger (earliest first)"""
        def get_sort_key(alarm):
            next_trigger = self.alarm_clock._calculate_next_trigger(alarm)
            if next_trigger:
                # Convert to total minutes for sorting
                year, month, day, hour, minute, second = next_trigger
                return ((year - 2025) * 365 * 24 * 60 + 
                       (month - 1) * 30 * 24 * 60 + 
                       (day - 1) * 24 * 60 + 
                       hour * 60 + minute)
            else:
                # Put alarms without next trigger at the end
                return float('inf')
        
        return sorted(alarms, key=get_sort_key)
        
    def format_12_hour_time(self, hour, minute):
        """Convert 24-hour time to 12-hour format with AM/PM"""
        if hour == 0:
            return f"12:{minute:02d} AM"
        elif hour < 12:
            return f"{hour}:{minute:02d} AM"
        elif hour == 12:
            return f"12:{minute:02d} PM"
        else:
            return f"{hour-12}:{minute:02d} PM"
    
    def draw_large_text(self, text, x, y):
        """Draw text in a larger font by drawing each character multiple times"""
        # Simple 2x scaling by drawing the text offset by 1 pixel in multiple directions
        self.oled.text(text, x, y)
        self.oled.text(text, x+1, y)
        self.oled.text(text, x, y+1)
        self.oled.text(text, x+1, y+1)
        
    def force_update_display(self):
        """Force immediate display update (called when alarms change)"""
        if self.display_available and self.display_on:
            print("📺 Forcing display update due to alarm changes")
            self.update_display()
            
    def update_display(self):
        """Update the OLED display with current time and alarms"""
        if not self.display_available or not self.display_on:
            return
            
        try:
            # Clear screen
            self.oled.fill(0)
            
            # Get current time
            current_time = self.rtc.get_time()
            if current_time:
                year, month, day, hour, minute, second = current_time
                
                # Display large time in 12-hour format (first two lines)
                time_str = self.format_12_hour_time(hour, minute)
                
                # Add Bluetooth icon if connected (move it left to ensure visibility)
                bt_icon = self.get_bluetooth_icon()
                if bt_icon:
                    self.oled.text(bt_icon, 115, 0)  # Moved from 120 to 115 for better visibility
                
                # Draw large time text spanning two lines
                self.draw_large_text(time_str, 0, 0)   # Large time display
                
                # Display alarms starting from line 3 (y=16)
                y_pos = 16  # Start after time lines
                line_count = 2  # Already used 2 lines for time
                
                # Get only ENABLED alarms (more explicit filtering)
                enabled_alarms = []
                for alarm in self.alarm_clock.alarms:
                    if alarm.enabled == True:  # Explicitly check for True
                        enabled_alarms.append(alarm)
                        
                print(f"📺 Display showing {len(enabled_alarms)} enabled alarms out of {len(self.alarm_clock.alarms)} total")
                
                # Sort enabled alarms by next trigger time
                enabled_alarms = self.sort_alarms_by_next_trigger(enabled_alarms)
                
                if enabled_alarms:
                    # Show as many alarms as fit on screen
                    max_displayable = self.max_lines - 2  # Reserve 2 lines for time
                    display_count = min(len(enabled_alarms), max_displayable)
                    
                    for i in range(display_count):
                        if line_count >= self.max_lines:
                            break
                            
                        alarm = enabled_alarms[i]
                        
                        # Double-check that this alarm is enabled
                        if not alarm.enabled:
                            print(f"⚠️ Warning: Alarm '{alarm.name}' is disabled but still in enabled list!")
                            continue
                        
                        # Calculate next trigger time
                        next_trigger = self.alarm_clock._calculate_next_trigger(alarm)
                        time_until = self.format_time_until(next_trigger)
                        
                        # Format alarm display - split into two lines if needed
                        alarm_time_12h = self.format_12_hour_time(alarm.hour, alarm.minute)
                        
                        # Calculate available space for name on first line
                        time_length = len(alarm_time_12h)
                        available_space_line1 = 21 - time_length - 1  # -1 for space between time and name
                        
                        # Split the name across two lines
                        if len(alarm.name) <= available_space_line1:
                            # Name fits on first line
                            line1 = f"{alarm_time_12h} {alarm.name}"
                            remaining_name = ""
                        else:
                            # Split name across lines
                            first_part = alarm.name[:available_space_line1]
                            remaining_name = alarm.name[available_space_line1:]
                            line1 = f"{alarm_time_12h} {first_part}"
                        
                        self.oled.text(line1, 0, y_pos)
                        y_pos += self.line_height
                        line_count += 1
                        
                        # Second line: Remaining name and time until (if we have space)
                        if line_count < self.max_lines:
                            # Calculate space needed for time_until
                            time_until_str = f"({time_until})"
                            available_space_line2 = 21 - len(time_until_str) - 1  # -1 for space
                            
                            if remaining_name:
                                # Continue the name from first line
                                if len(remaining_name) <= available_space_line2:
                                    line2 = f"{remaining_name} {time_until_str}"
                                else:
                                    # Truncate if still too long
                                    truncated_remaining = remaining_name[:available_space_line2-3]
                                    line2 = f"{truncated_remaining}... {time_until_str}"
                            else:
                                # Just show time until (with some padding)
                                line2 = f"  {time_until_str}"
                            
                            # Ensure line fits in display width
                            if len(line2) > 21:
                                line2 = line2[:21]
                                
                            self.oled.text(line2, 0, y_pos)
                            y_pos += self.line_height
                            line_count += 1
                        
                    # Show indicator if there are more alarms than can be displayed
                    if len(enabled_alarms) > max_displayable:
                        self.oled.text(f"+{len(enabled_alarms) - max_displayable}", 110, 56)  # Show count of additional alarms
                else:
                    self.oled.text("No enabled alarms", 0, 16)
            else:
                self.oled.text("Time unavailable", 0, 0)
                
            # Update display
            self.oled.show()
            
        except Exception as e:
            print(f"❌ Error updating display: {e}")
            
    def run_display_tasks(self):
        """Run display-related tasks (call this in main loop)"""
        if not self.display_available:
            return
        
        # Update display every minute or when alarms change
        current_time = self.rtc.get_time()
        if current_time:
            _, _, _, _, minute, _ = current_time
            if minute != self.last_update_minute:
                self.last_update_minute = minute
                if self.display_on:
                    self.update_display() 