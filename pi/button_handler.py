from machine import Pin
import time

class ButtonHandler:
    def __init__(self, display_manager=None):
        """Initialize button handler"""
        self.display_manager = display_manager
        
        # Button setup
        self.button = Pin(0, Pin.IN, Pin.PULL_UP)
        
        # Timing constants
        self.ALARM_DISABLE_HOLD_MS = 5000  # 5 seconds to disable alarm
        self.DEBOUNCE_MS = 50  # Debounce time
        self.POST_ALARM_DELAY_MS = 3000  # 3 seconds delay after alarm stops
        
        # State tracking
        self.last_button_press = 0
        self.alarm_active = False
        self.button_start_time = None
        self.alarm_finished_time = None  # Track when alarm finished
        
    def set_alarm_active(self, active):
        """Set whether an alarm is currently active"""
        if self.alarm_active and not active:
            # Alarm just finished - start delay period
            self.alarm_finished_time = time.ticks_ms()
            print("⏰ Alarm finished - display control disabled for 3 seconds")
        
        self.alarm_active = active
        if active:
            # Reset button state when alarm starts
            self.last_button_press = 0
            self.button_start_time = None
            self.alarm_finished_time = None
            
    def _is_in_post_alarm_delay(self):
        """Check if we're still in the post-alarm delay period"""
        if self.alarm_finished_time is None:
            return False
        
        current_time = time.ticks_ms()
        return time.ticks_diff(current_time, self.alarm_finished_time) < self.POST_ALARM_DELAY_MS
            
    def check_alarm_disable_button(self):
        """Check for button hold to disable alarm (returns True if alarm should stop)"""
        if not self.alarm_active:
            return False
            
        current_time = time.ticks_ms()
        
        # Check for sustained button press
        if self.button.value() == 0:  # Button pressed (LOW)
            if self.button_start_time is None:
                self.button_start_time = current_time
                print("🔘 Button pressed - hold for 5 seconds to stop alarm")
            elif time.ticks_diff(current_time, self.button_start_time) >= self.ALARM_DISABLE_HOLD_MS:
                print("✅ Button held for 5 seconds - stopping alarm!")
                self.button_start_time = None  # Reset for next time
                return True
        else:
            if self.button_start_time is not None:
                print("🔘 Button released - alarm continues")
                self.button_start_time = None
            
        return False
        
    def check_display_control_button(self):
        """Check for single button press to toggle display (only when alarm not active and delay passed)"""
        if self.alarm_active or not self.display_manager or not self.display_manager.is_available():
            return
            
        # Don't allow display control during post-alarm delay
        if self._is_in_post_alarm_delay():
            return
            
        current_time = time.ticks_ms()
        
        # Check for button press (LOW when pressed)
        if self.button.value() == 0:
            # Debounce - ignore if too recent
            if time.ticks_diff(current_time, self.last_button_press) > self.DEBOUNCE_MS:
                self.last_button_press = current_time
                
                # Wait for button release
                while self.button.value() == 0:
                    time.sleep_ms(10)
                
                # Single press - toggle display
                self.display_manager.toggle_display()
            
    def run_button_tasks(self):
        """Run button-related tasks (call this in main loop)"""
        if self.alarm_active:
            return self.check_alarm_disable_button()
        else:
            self.check_display_control_button()
            return False 