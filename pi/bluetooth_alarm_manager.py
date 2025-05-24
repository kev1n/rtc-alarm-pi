import bluetooth
import json
import time
import gc
from machine import Pin
from micropython import const

# BLE Service and Characteristic UUIDs
_ALARM_SERVICE_UUID = bluetooth.UUID("12345678-1234-5678-9abc-123456789abc")
_COMMAND_CHAR_UUID = bluetooth.UUID("12345678-1234-5678-9abc-123456789abd")
_RESPONSE_CHAR_UUID = bluetooth.UUID("12345678-1234-5678-9abc-123456789abe")
_STATUS_CHAR_UUID = bluetooth.UUID("12345678-1234-5678-9abc-123456789abf")

# BLE Events
_IRQ_CENTRAL_CONNECT = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_IRQ_GATTS_WRITE = const(3)
_IRQ_GATTS_READ_REQUEST = const(4)

# BLE Flags
_FLAG_READ = const(0x02)
_FLAG_WRITE = const(0x08)
_FLAG_NOTIFY = const(0x10)

class BluetoothAlarmManager:
    def __init__(self, alarm_clock, device_name="PicoAlarmClock"):
        self.alarm_clock = alarm_clock
        self.device_name = device_name
        
        # BLE setup
        self.ble = bluetooth.BLE()
        self.ble.active(True)
        self.ble.irq(self._ble_irq)
        
        # Connection state
        self.connected = False
        self.conn_handle = None
        self.last_heartbeat = time.time()
        
        # Error tracking
        self.error_count = 0
        self.max_errors = 5
        self.last_error = None
        
        # Command queue for resilience
        self.command_queue = []
        self.max_queue_size = 10
        
        # Response buffer
        self.response_buffer = ""
        self.status_buffer = "Ready"
        
        # Setup BLE service
        self._setup_service()
        
        print(f"🔵 Bluetooth Alarm Manager initialized for {device_name}")
        
    def _setup_service(self):
        """Setup BLE GATT service and characteristics"""
        try:
            # Define characteristics
            self.command_char = (
                _COMMAND_CHAR_UUID,
                _FLAG_WRITE,
            )
            
            self.response_char = (
                _RESPONSE_CHAR_UUID,
                _FLAG_READ | _FLAG_NOTIFY,
            )
            
            self.status_char = (
                _STATUS_CHAR_UUID,
                _FLAG_READ | _FLAG_NOTIFY,
            )
            
            # Create service
            self.service = (
                _ALARM_SERVICE_UUID,
                (self.command_char, self.response_char, self.status_char),
            )
            
            # Register service
            ((self.command_handle, self.response_handle, self.status_handle),) = self.ble.gatts_register_services((self.service,))
            
            # Set initial values
            self.ble.gatts_write(self.response_handle, "Ready".encode('utf-8'))
            self.ble.gatts_write(self.status_handle, "Disconnected".encode('utf-8'))
            
            print("✅ BLE service registered successfully")
            
        except Exception as e:
            print(f"❌ Error setting up BLE service: {e}")
            self.last_error = str(e)
            self.error_count += 1
            
    def _ble_irq(self, event, data):
        """Handle BLE events"""
        try:
            if event == _IRQ_CENTRAL_CONNECT:
                self._handle_connect(data)
            elif event == _IRQ_CENTRAL_DISCONNECT:
                self._handle_disconnect(data)
            elif event == _IRQ_GATTS_WRITE:
                self._handle_write(data)
            elif event == _IRQ_GATTS_READ_REQUEST:
                self._handle_read_request(data)
                
        except Exception as e:
            print(f"❌ BLE IRQ error: {e}")
            self.last_error = str(e)
            self.error_count += 1
            
    def _handle_connect(self, data):
        """Handle client connection"""
        self.conn_handle, _, _ = data
        self.connected = True
        self.last_heartbeat = time.time()
        self.error_count = 0  # Reset error count on successful connection
        
        self.status_buffer = "Connected"
        self.ble.gatts_write(self.status_handle, self.status_buffer.encode('utf-8'))
        
        print(f"🔗 Client connected: handle {self.conn_handle}")
        
        # Send welcome message (compact format)
        welcome_msg = "OK:CONNECTED"
        self._send_response(welcome_msg)
        
    def _handle_disconnect(self, data):
        """Handle client disconnection"""
        conn_handle, _, _ = data
        if conn_handle == self.conn_handle:
            self.connected = False
            self.conn_handle = None
            
            self.status_buffer = "Disconnected"
            self.ble.gatts_write(self.status_handle, self.status_buffer.encode('utf-8'))
            
            print(f"🔌 Client disconnected: handle {conn_handle}")
            
            # Restart advertising
            self.start_advertising()
            
    def _handle_write(self, data):
        """Handle write requests (commands)"""
        conn_handle, value_handle = data
        
        if value_handle == self.command_handle and conn_handle == self.conn_handle:
            try:
                # Read the command data
                command_data = self.ble.gatts_read(self.command_handle)
                command_str = command_data.decode('utf-8')
                
                print(f"📝 Received command: {command_str}")
                
                # Add to queue for processing
                self._queue_command(command_str)
                
                # Update heartbeat
                self.last_heartbeat = time.time()
                
            except Exception as e:
                print(f"❌ Error processing write: {e}")
                self._send_error_response(f"Write error: {e}")
                
    def _handle_read_request(self, data):
        """Handle read requests"""
        conn_handle, value_handle = data
        
        if conn_handle == self.conn_handle:
            try:
                if value_handle == self.response_handle:
                    # Return current response
                    return self.response_buffer.encode('utf-8')
                elif value_handle == self.status_handle:
                    # Return current status
                    return self.status_buffer.encode('utf-8')
            except Exception as e:
                print(f"❌ Error handling read request: {e}")
                return f"Error: {e}".encode('utf-8')
                
    def _queue_command(self, command_str):
        """Add command to processing queue"""
        try:
            if len(self.command_queue) >= self.max_queue_size:
                self.command_queue.pop(0)  # Remove oldest command
                
            self.command_queue.append({
                'command': command_str,
                'timestamp': time.time(),
                'retries': 0
            })
            
        except Exception as e:
            print(f"❌ Error queuing command: {e}")
            self._send_error_response(f"Queue error: {e}")
            
    def _process_command_queue(self):
        """Process queued commands"""
        while self.command_queue:
            try:
                cmd_item = self.command_queue.pop(0)
                command_str = cmd_item['command']
                
                # Parse and execute command
                self._execute_command(command_str)
                
            except Exception as e:
                print(f"❌ Error processing command: {e}")
                
                # Retry logic
                cmd_item['retries'] += 1
                if cmd_item['retries'] < 3:
                    self.command_queue.append(cmd_item)
                else:
                    self._send_error_response(f"Command failed after retries: {e}")
                    
                break  # Stop processing on error
                
    def _execute_command(self, command_str):
        """Execute a command and send response - Custom compact protocol"""
        try:
            command_str = command_str.strip()
            
            if not command_str:
                self._send_error_response("Empty command")
                return
                
            cmd_type = command_str[0].lower()
            
            print(f"🎯 Executing command: {cmd_type} -> {command_str}")
            
            if cmd_type == 'a':  # Add alarm
                self._handle_add_alarm_compact(command_str)
            elif cmd_type == 'r':  # Remove alarm
                self._handle_remove_alarm_compact(command_str)
            elif cmd_type == 'l':  # List alarms
                self._handle_list_alarms_compact()
            elif cmd_type == 't':  # Toggle alarm
                self._handle_toggle_alarm_compact(command_str)
            elif cmd_type == 's':  # Status
                self._handle_status_request_compact()
            elif cmd_type == 'p':  # Ping
                self._handle_ping_compact()
            else:
                self._send_error_response(f"Unknown command: {cmd_type}")
                
        except Exception as e:
            self._send_error_response(f"Command error: {e}")
            
    def _handle_add_alarm_compact(self, command_str):
        """Handle ADD alarm command - Format: aHH:MM[:days][:name][:R/O]
        Examples:
        a07:30 - Daily alarm at 7:30
        a06:30:0,1,2,3,4 - Weekday alarm at 6:30
        a09:00:5,6:Weekend:R - Weekend recurring alarm
        a15:30::Meeting:O - One-time alarm at 3:30 PM
        """
        try:
            parts = command_str[1:].split(':')  # Remove 'a' prefix
            
            if len(parts) < 2:
                self._send_error_response("Format: aHH:MM[:days][:name][:R/O]")
                return
                
            # Parse hour and minute
            try:
                hour = int(parts[0])
                minute = int(parts[1])
            except ValueError:
                self._send_error_response("Invalid time format")
                return
                
            # Parse days (optional)
            days = None
            if len(parts) > 2 and parts[2]:
                if parts[2].replace(',', '').replace(' ', '').isdigit():
                    days = [int(d.strip()) for d in parts[2].split(',') if d.strip().isdigit()]
                    
            # Parse name (optional)
            name = f"BT Alarm {len(self.alarm_clock.alarms) + 1}"
            if len(parts) > 3 and parts[3]:
                name = parts[3]
                
            # Parse recurring flag (optional)
            recurring = True
            if len(parts) > 4 and parts[4]:
                recurring = parts[4].upper() != 'O'  # 'O' = One-time, anything else = Recurring
                
            # Validate parameters
            if not (0 <= hour <= 23):
                self._send_error_response("Hour must be 0-23")
                return
                
            if not (0 <= minute <= 59):
                self._send_error_response("Minute must be 0-59")
                return
                
            # Add alarm
            success = self.alarm_clock.add_alarm(hour, minute, days, name, recurring)
            
            if success:
                next_trigger = self.alarm_clock._calculate_next_trigger(self.alarm_clock.alarms[-1])
                time_until = self.alarm_clock._format_time_until(next_trigger) if next_trigger else "unknown"
                
                response = f"OK:ADDED:{name}:{hour:02d}:{minute:02d}:{time_until}"
                self._send_response(response)
            else:
                self._send_error_response("Failed to add alarm")
                
        except Exception as e:
            self._send_error_response(f"Add alarm error: {e}")
            
    def _handle_remove_alarm_compact(self, command_str):
        """Handle REMOVE alarm command - Format: rX (where X is index or name)"""
        try:
            target = command_str[1:].strip()  # Remove 'r' prefix
            
            if not target:
                self._send_error_response("Format: rX (index or name)")
                return
                
            # Try to convert to int if it's a number
            try:
                target = int(target)
            except ValueError:
                pass  # Keep as string (name)
                
            success = self.alarm_clock.remove_alarm(target)
            
            if success:
                response = f"OK:REMOVED:{target}"
                self._send_response(response)
            else:
                self._send_error_response("Alarm not found")
                
        except Exception as e:
            self._send_error_response(f"Remove alarm error: {e}")
            
    def _handle_toggle_alarm_compact(self, command_str):
        """Handle TOGGLE alarm command - Format: tX (where X is index or name)"""
        try:
            target = command_str[1:].strip()  # Remove 't' prefix
            
            if not target:
                self._send_error_response("Format: tX (index or name)")
                return
                
            # Try to convert to int if it's a number
            try:
                target = int(target)
            except ValueError:
                pass  # Keep as string (name)
                
            success = self.alarm_clock.toggle_alarm(target)
            
            if success:
                alarm = self.alarm_clock._get_alarm(target)
                status = "ON" if alarm.enabled else "OFF"
                response = f"OK:TOGGLE:{alarm.name}:{status}"
                self._send_response(response)
            else:
                self._send_error_response("Alarm not found")
                
        except Exception as e:
            self._send_error_response(f"Toggle alarm error: {e}")
            
    def _handle_list_alarms_compact(self):
        """Handle LIST alarms command - Format: l"""
        try:
            if not self.alarm_clock.alarms:
                response = "OK:LIST:0"
                self._send_response(response)
                # Send explicit clear message
                time.sleep(0.1)  # Small delay
                self._send_response("OK:CLEAR")
                return
                
            # Send count first
            count = len(self.alarm_clock.alarms)
            response = f"OK:LIST:{count}"
            self._send_response(response)
            
            # Send each alarm in readable format with delays
            for i, alarm in enumerate(self.alarm_clock.alarms):
                # Add delay to prevent BLE buffer overflow
                time.sleep(0.15)  # 150ms delay between responses
                
                next_trigger = self.alarm_clock._calculate_next_trigger(alarm)
                time_until = self.alarm_clock._format_time_until(next_trigger) if next_trigger else "unknown"
                
                # Truncate name to reasonable size (max 12 chars)
                alarm_name = alarm.name[:12] if len(alarm.name) > 12 else alarm.name
                
                # Truncate time_until to reasonable size (max 25 chars)
                if len(time_until) > 25:
                    time_until = time_until[:22] + "..."
                
                status = "ON" if alarm.enabled else "OFF"
                rec = "R" if alarm.recurring else "O"
                
                # Readable format: ALARM:INDEX:NAME:HH:MM:STATUS:TYPE:TIME_UNTIL
                alarm_response = f"ALARM:{i}:{alarm_name}:{alarm.hour:02d}:{alarm.minute:02d}:{status}:{rec}:{time_until}"
                
                # Should now fit in larger MTU (aiming for <150 chars)
                if len(alarm_response) > 150:
                    # Create shorter version if still too long
                    short_time = time_until[:15] + "..." if len(time_until) > 15 else time_until
                    short_name = alarm_name[:8] if len(alarm_name) > 8 else alarm_name
                    alarm_response = f"ALARM:{i}:{short_name}:{alarm.hour:02d}:{alarm.minute:02d}:{status}:{rec}:{short_time}"
                
                self._send_response(alarm_response)
                
        except Exception as e:
            self._send_error_response(f"List error: {e}")
            
    def _handle_status_request_compact(self):
        """Handle STATUS request - Format: s"""
        try:
            current_time = self.alarm_clock.rtc.get_time()
            
            if current_time:
                year, month, day, hour, minute, second = current_time
                time_str = f"{year}-{month:02d}-{day:02d}_{hour:02d}:{minute:02d}:{second:02d}"
            else:
                time_str = "unknown"
                
            alarm_count = len(self.alarm_clock.alarms)
            error_count = self.error_count
            
            response = f"OK:STATUS:{time_str}:{alarm_count}:{error_count}"
            self._send_response(response)
            
        except Exception as e:
            self._send_error_response(f"Status error: {e}")
            
    def _handle_ping_compact(self):
        """Handle PING command - Format: p"""
        try:
            response = "OK:PONG"
            self._send_response(response)
            
        except Exception as e:
            self._send_error_response(f"Ping error: {e}")
            
    def _send_response(self, response_str):
        """Send response via BLE (with larger MTU support)"""
        try:
            self.response_buffer = response_str
            
            if self.connected and self.conn_handle is not None:
                # With larger MTU, we can send much bigger responses
                if len(response_str.encode('utf-8')) > 180:  # Conservative limit for 185 MTU
                    print(f"⚠️ Response too long ({len(response_str)} chars), truncating: {response_str}")
                    response_str = response_str[:177] + "..."
                    
                self.ble.gatts_write(self.response_handle, response_str.encode('utf-8'))
                self.ble.gatts_notify(self.conn_handle, self.response_handle)
                
            print(f"📤 Sent response: {response_str} (length: {len(response_str)})")
            
        except Exception as e:
            print(f"❌ Error sending response: {e}")
            self.last_error = str(e)
            self.error_count += 1
            
    def _send_error_response(self, error_msg):
        """Send error response"""
        error_response = f"ERROR:{error_msg}"
        self._send_response(error_response)
        
    def start_advertising(self):
        """Start BLE advertising"""
        try:
            # Create advertising payload
            name = self.device_name.encode('utf-8')
            
            # Advertising data
            adv_data = bytearray()
            
            # Flags (general discoverable, BR/EDR not supported)
            adv_data.extend(b'\x02\x01\x06')
            
            # Complete local name
            adv_data.extend(bytes([len(name) + 1, 0x09]) + name)
            
            # Start advertising
            self.ble.gap_advertise(100000, adv_data)  # 100ms interval
            
            print(f"📻 Started advertising as '{self.device_name}'")
            
        except Exception as e:
            print(f"❌ Error starting advertising: {e}")
            self.last_error = str(e)
            self.error_count += 1
            
    def stop_advertising(self):
        """Stop BLE advertising"""
        try:
            self.ble.gap_advertise(0)  # 0 interval stops advertising
            print("📻 Stopped advertising")
            
        except Exception as e:
            print(f"❌ Error stopping advertising: {e}")
            
    def check_connection_health(self):
        """Check connection health and handle timeouts"""
        try:
            current_time = time.time()
            
            if self.connected:
                # Check for heartbeat timeout (5 minutes)
                if current_time - self.last_heartbeat > 300:
                    print("💔 Connection heartbeat timeout")
                    self.connected = False
                    self.conn_handle = None
                    self.start_advertising()
                    
                # Send periodic status updates
                elif (current_time - self.last_heartbeat) % 60 == 0:
                    status_update = "HEARTBEAT:OK"
                    self._send_response(status_update)
                    
        except Exception as e:
            print(f"❌ Connection health check error: {e}")
            
    def run_bluetooth_tasks(self):
        """Run Bluetooth management tasks (call from main loop)"""
        try:
            # Process command queue
            self._process_command_queue()
            
            # Check connection health
            self.check_connection_health()
            
            # Handle error recovery
            if self.error_count >= self.max_errors:
                print(f"🔄 Too many errors ({self.error_count}), attempting recovery...")
                self._recover_bluetooth()
                
            # Garbage collection to prevent memory issues
            if time.time() % 30 == 0:  # Every 30 seconds
                gc.collect()
                
        except Exception as e:
            print(f"❌ Bluetooth task error: {e}")
            self.error_count += 1
            
    def _recover_bluetooth(self):
        """Attempt to recover from Bluetooth errors"""
        try:
            print("🔄 Attempting Bluetooth recovery...")
            
            # Reset connection state
            self.connected = False
            self.conn_handle = None
            
            # Clear command queue
            self.command_queue.clear()
            
            # Reset BLE
            self.ble.active(False)
            time.sleep(1)
            self.ble.active(True)
            
            # Re-setup service
            self._setup_service()
            
            # Restart advertising
            self.start_advertising()
            
            # Reset error count
            self.error_count = 0
            self.last_error = None
            
            print("✅ Bluetooth recovery completed")
            
        except Exception as e:
            print(f"❌ Bluetooth recovery failed: {e}")
            self.last_error = str(e) 