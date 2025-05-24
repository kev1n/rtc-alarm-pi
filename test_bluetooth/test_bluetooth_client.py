#!/usr/bin/env python3
"""
Bluetooth Test Client for Pico Alarm Clock

This script allows you to test the Bluetooth functionality of your 
Raspberry Pi Pico W alarm clock from your computer.

Requirements:
    pip install bleak

Usage:
    python test_bluetooth_client.py
"""

import asyncio
import json
import time
from bleak import BleakClient, BleakScanner
from bleak.backends.characteristic import BleakGATTCharacteristic

# Service and Characteristic UUIDs (must match the Pico code)
ALARM_SERVICE_UUID = "12345678-1234-5678-9abc-123456789abc"
COMMAND_CHAR_UUID = "12345678-1234-5678-9abc-123456789abd"
RESPONSE_CHAR_UUID = "12345678-1234-5678-9abc-123456789abe"
STATUS_CHAR_UUID = "12345678-1234-5678-9abc-123456789abf"

class AlarmClockClient:
    def __init__(self):
        self.client = None
        self.device = None
        self.connected = False
        self.response_queue = []
        
    async def scan_for_device(self, device_name="PicoAlarmClock", timeout=10):
        """Scan for the alarm clock device"""
        print(f"🔍 Scanning for '{device_name}'...")
        
        devices = await BleakScanner.discover(timeout=timeout)
        
        for device in devices:
            if device.name and device_name.lower() in device.name.lower():
                print(f"✅ Found device: {device.name} ({device.address})")
                return device
                
        print(f"❌ Device '{device_name}' not found")
        print("Available devices:")
        for device in devices:
            if device.name:
                print(f"  - {device.name} ({device.address})")
        return None
        
    async def connect(self, device_name="PicoAlarmClock"):
        """Connect to the alarm clock device"""
        try:
            self.device = await self.scan_for_device(device_name)
            if not self.device:
                return False
                
            print(f"🔗 Connecting to {self.device.name}...")
            self.client = BleakClient(self.device.address)
            
            await self.client.connect()
            self.connected = True
            
            # Subscribe to response notifications
            await self.client.start_notify(RESPONSE_CHAR_UUID, self._response_callback)
            
            print(f"✅ Connected to {self.device.name}")
            return True
            
        except Exception as e:
            print(f"❌ Connection failed: {e}")
            return False
            
    async def disconnect(self):
        """Disconnect from the device"""
        if self.client and self.connected:
            try:
                await self.client.stop_notify(RESPONSE_CHAR_UUID)
                await self.client.disconnect()
                self.connected = False
                print("🔌 Disconnected")
            except Exception as e:
                print(f"❌ Disconnect error: {e}")
                
    def _response_callback(self, characteristic: BleakGATTCharacteristic, data: bytearray):
        """Handle response notifications"""
        try:
            response_str = data.decode('utf-8')
            self.response_queue.append(response_str)
            
            print(f"📨 Raw response: {response_str}")
            
            # Parse compact response format
            if response_str.startswith("OK:"):
                self._handle_ok_response(response_str)
            elif response_str.startswith("ERROR:"):
                self._handle_error_response(response_str)
            elif response_str.startswith("ALARM:"):
                self._handle_alarm_response(response_str)
            elif response_str.startswith("HEARTBEAT:"):
                print("💓 HEARTBEAT: System running normally")
            else:
                print(f"📨 UNKNOWN: {response_str}")
                    
        except Exception as e:
            print(f"❌ Error processing response: {e}")
            
    def _handle_ok_response(self, response_str):
        """Handle OK responses"""
        parts = response_str.split(':')
        if len(parts) < 2:
            return
            
        response_type = parts[1]
        
        if response_type == "CONNECTED":
            print("🎉 CONNECTED: Ready to send commands")
        elif response_type == "PONG":
            print("🏓 PONG: Connection is alive")
        elif response_type == "ADDED" and len(parts) >= 6:
            name, hour, minute, time_until = parts[2], parts[3], parts[4], parts[5]
            print(f"➕ ADDED: {name} at {hour}:{minute} - triggers {time_until}")
        elif response_type == "REMOVED" and len(parts) >= 3:
            target = parts[2]
            print(f"➖ REMOVED: Alarm '{target}' deleted")
        elif response_type == "TOGGLE" and len(parts) >= 4:
            name, status = parts[2], parts[3]
            emoji = "🟢" if status == "ON" else "🔴"
            print(f"🔄 TOGGLE: {name} is now {emoji} {status}")
        elif response_type == "LIST" and len(parts) >= 3:
            count = int(parts[2])
            if count == 0:
                print("📋 LIST: No alarms set")
            else:
                print(f"📋 LIST: Found {count} alarm(s):")
        elif response_type == "STATUS" and len(parts) >= 5:
            time_str, alarm_count, error_count = parts[2], parts[3], parts[4]
            print(f"📊 STATUS: Time={time_str}, Alarms={alarm_count}, Errors={error_count}")
        else:
            print(f"✅ OK: {response_str}")
            
    def _handle_error_response(self, response_str):
        """Handle ERROR responses"""
        parts = response_str.split(':', 1)
        if len(parts) >= 2:
            error_msg = parts[1]
            print(f"❌ ERROR: {error_msg}")
        else:
            print(f"❌ ERROR: {response_str}")
            
    def _handle_alarm_response(self, response_str):
        """Handle ALARM list responses"""
        # Format: ALARM:INDEX:NAME:HH:MM:STATUS:TYPE:TIME_UNTIL
        parts = response_str.split(':')
        if len(parts) >= 7:
            index, name, hour, minute, status, alarm_type, time_until = parts[1:8]
            status_emoji = "🟢" if status == "ON" else "🔴"
            type_emoji = "🔄" if alarm_type == "R" else "🔔"
            print(f"     {index}: {status_emoji} {name} - {hour}:{minute} {type_emoji} - {time_until}")
            
    async def send_command(self, command_str):
        """Send a command to the device"""
        if not self.connected or not self.client:
            print("❌ Not connected to device")
            return False
            
        try:
            await self.client.write_gatt_char(COMMAND_CHAR_UUID, command_str.encode('utf-8'))
            print(f"📤 Sent: {command_str}")
            return True
        except Exception as e:
            print(f"❌ Failed to send command: {e}")
            return False
            
    async def ping(self):
        """Send a ping command"""
        return await self.send_command("p")
        
    async def get_status(self):
        """Get system status"""
        return await self.send_command("s")
        
    async def list_alarms(self):
        """List all alarms"""
        return await self.send_command("l")
        
    async def add_alarm(self, hour, minute, name=None, days=None, recurring=True):
        """Add a new alarm using compact format: aHH:MM[:days][:name][:R/O]"""
        command = f"a{hour:02d}:{minute:02d}"
        
        # Add days if specified
        if days is not None:
            if isinstance(days, list):
                days_str = ",".join(map(str, days))
            else:
                days_str = str(days)
            command += f":{days_str}"
        else:
            command += ":"  # Empty days field
            
        # Add name if specified
        if name:
            command += f":{name}"
        else:
            command += ":"  # Empty name field
            
        # Add recurring flag
        if not recurring:
            command += ":O"  # One-time
        else:
            command += ":R"  # Recurring
            
        return await self.send_command(command)
        
    async def remove_alarm(self, name_or_index):
        """Remove an alarm"""
        return await self.send_command(f"r{name_or_index}")
        
    async def toggle_alarm(self, name_or_index):
        """Toggle an alarm on/off"""
        return await self.send_command(f"t{name_or_index}")

async def interactive_menu(client):
    """Interactive menu for testing"""
    
    print("\n🎮 Interactive Alarm Clock Control")
    print("=" * 40)
    print("📖 Compact Protocol Commands:")
    print("   a07:30          - Daily alarm at 7:30")
    print("   a06:30:0,1,2,3,4 - Weekday alarm")
    print("   a09:00:5,6:Weekend:R - Weekend alarm")
    print("   r0              - Remove alarm index 0")
    print("   t0              - Toggle alarm index 0")
    print("   l               - List alarms")
    print("   s               - Status")
    print("   p               - Ping")
    
    while True:
        print("\nCommands:")
        print("1. Ping device")
        print("2. Get status")
        print("3. List alarms")
        print("4. Add alarm")
        print("5. Remove alarm")
        print("6. Toggle alarm")
        print("7. Add test alarm (1 minute from now)")
        print("8. Add weekday alarm")
        print("9. Add weekend alarm")
        print("c. Send custom command")
        print("0. Quit")
        
        try:
            choice = input("\nSelect option (0-9,c): ").strip().lower()
            
            if choice == "0":
                break
            elif choice == "1":
                await client.ping()
            elif choice == "2":
                await client.get_status()
            elif choice == "3":
                await client.list_alarms()
            elif choice == "4":
                await add_alarm_interactive(client)
            elif choice == "5":
                await remove_alarm_interactive(client)
            elif choice == "6":
                await toggle_alarm_interactive(client)
            elif choice == "7":
                await add_test_alarm(client)
            elif choice == "8":
                await add_weekday_alarm(client)
            elif choice == "9":
                await add_weekend_alarm(client)
            elif choice == "c":
                await send_custom_command(client)
            else:
                print("❌ Invalid option")
                
            # Wait a bit for response
            await asyncio.sleep(0.5)
            
        except KeyboardInterrupt:
            print("\n👋 Goodbye!")
            break
        except Exception as e:
            print(f"❌ Error: {e}")

async def send_custom_command(client):
    """Send a custom command"""
    try:
        command = input("Enter custom command: ").strip()
        if command:
            await client.send_command(command)
        
    except Exception as e:
        print(f"❌ Error: {e}")

async def add_alarm_interactive(client):
    """Interactive alarm addition"""
    try:
        hour = int(input("Hour (0-23): "))
        minute = int(input("Minute (0-59): "))
        name = input("Name (optional): ").strip() or None
        
        print("Days (leave empty for daily):")
        print("  Enter comma-separated numbers: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun")
        days_input = input("Days: ").strip()
        
        days = None
        if days_input:
            days = [int(d.strip()) for d in days_input.split(',')]
            
        recurring = input("Recurring? (y/n, default=y): ").strip().lower() != 'n'
        
        await client.add_alarm(hour, minute, name, days, recurring)
        
    except ValueError as e:
        print(f"❌ Invalid input: {e}")

async def remove_alarm_interactive(client):
    """Interactive alarm removal"""
    try:
        # First list alarms
        await client.list_alarms()
        await asyncio.sleep(0.5)
        
        alarm_input = input("Enter alarm name or index: ").strip()
        
        # Try to convert to int if it's a number
        try:
            alarm_input = int(alarm_input)
        except ValueError:
            pass  # Keep as string
            
        await client.remove_alarm(alarm_input)
        
    except Exception as e:
        print(f"❌ Error: {e}")

async def toggle_alarm_interactive(client):
    """Interactive alarm toggle"""
    try:
        # First list alarms
        await client.list_alarms()
        await asyncio.sleep(0.5)
        
        alarm_input = input("Enter alarm name or index to toggle: ").strip()
        
        # Try to convert to int if it's a number
        try:
            alarm_input = int(alarm_input)
        except ValueError:
            pass  # Keep as string
            
        await client.toggle_alarm(alarm_input)
        
    except Exception as e:
        print(f"❌ Error: {e}")

async def add_test_alarm(client):
    """Add a test alarm 1 minute from now"""
    import datetime
    
    now = datetime.datetime.now()
    test_time = now + datetime.timedelta(minutes=1)
    
    await client.add_alarm(
        test_time.hour, 
        test_time.minute, 
        "Test Alarm", 
        None, 
        False  # One-time only
    )
    print(f"🕐 Test alarm set for {test_time.strftime('%H:%M')} (1 minute from now)")

async def add_weekday_alarm(client):
    """Add a weekday alarm"""
    try:
        hour = int(input("Hour for weekday alarm (0-23): "))
        minute = int(input("Minute for weekday alarm (0-59): "))
        
        await client.add_alarm(
            hour, minute, 
            "Weekday Alarm", 
            [0, 1, 2, 3, 4],  # Monday to Friday
            True
        )
        print(f"🗓️ Weekday alarm set for {hour:02d}:{minute:02d} (Mon-Fri)")
        
    except ValueError as e:
        print(f"❌ Invalid input: {e}")

async def add_weekend_alarm(client):
    """Add a weekend alarm"""
    try:
        hour = int(input("Hour for weekend alarm (0-23): "))
        minute = int(input("Minute for weekend alarm (0-59): "))
        
        await client.add_alarm(
            hour, minute, 
            "Weekend Alarm", 
            [5, 6],  # Saturday and Sunday
            True
        )
        print(f"🎉 Weekend alarm set for {hour:02d}:{minute:02d} (Sat-Sun)")
        
    except ValueError as e:
        print(f"❌ Invalid input: {e}")

async def run_automated_tests(client):
    """Run automated tests"""
    print("\n🧪 Running Automated Tests")
    print("=" * 30)
    
    tests = [
        ("Ping test", "p"),
        ("Status check", "s"),
        ("List alarms", "l"),
        ("Add test alarm", "a12:30::Test:O"),
        ("List alarms again", "l"),
        ("Toggle test alarm", "tTest"),
        ("Remove test alarm", "rTest"),
        ("Final alarm list", "l")
    ]
    
    for test_name, command in tests:
        print(f"\n▶️ {test_name}...")
        await client.send_command(command)
        await asyncio.sleep(1)  # Wait for response
        
    print("\n✅ Automated tests completed")

async def main():
    print("🔵 Pico Alarm Clock Bluetooth Test Client")
    print("=" * 45)
    print("🆕 Now using COMPACT PROTOCOL (no more JSON size limits!)")
    
    client = AlarmClockClient()
    
    try:
        # Connect to device
        if not await client.connect():
            print("❌ Failed to connect to device")
            return
            
        # Wait for welcome message
        await asyncio.sleep(2)
        
        # Choose test mode
        print("\n🎯 Test Mode Selection:")
        print("1. Interactive mode")
        print("2. Automated tests")
        
        mode = input("Select mode (1 or 2): ").strip()
        
        if mode == "1":
            await interactive_menu(client)
        elif mode == "2":
            await run_automated_tests(client)
        else:
            print("❌ Invalid mode, running interactive mode")
            await interactive_menu(client)
            
    except KeyboardInterrupt:
        print("\n👋 Test interrupted by user")
    except Exception as e:
        print(f"❌ Test error: {e}")
    finally:
        await client.disconnect()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
    except Exception as e:
        print(f"❌ Fatal error: {e}") 