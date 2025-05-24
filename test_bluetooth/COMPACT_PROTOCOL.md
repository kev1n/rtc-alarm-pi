# Bluetooth Compact Protocol

## Overview

Due to BLE characteristic size limitations (~20 bytes), we've replaced JSON with a compact custom protocol that fits within these constraints.

## Command Format

Commands are single letters followed by parameters separated by colons:

### Commands

| Command       | Format                       | Description                | Example               |
| ------------- | ---------------------------- | -------------------------- | --------------------- |
| **Add Alarm** | `aHH:MM[:days][:name][:R/O]` | Add new alarm              | `a07:30` (daily 7:30) |
| **Remove**    | `rX`                         | Remove alarm by index/name | `r0` (remove index 0) |
| **Toggle**    | `tX`                         | Toggle alarm by index/name | `t0` (toggle index 0) |
| **List**      | `l`                          | List all alarms            | `l`                   |
| **Status**    | `s`                          | Get system status          | `s`                   |
| **Ping**      | `p`                          | Test connection            | `p`                   |

### Add Alarm Examples

```
a07:30                    # Daily alarm at 7:30 AM
a06:30:0,1,2,3,4         # Weekday alarm (Mon-Fri) at 6:30 AM
a09:00:5,6:Weekend:R     # Weekend recurring alarm at 9:00 AM
a15:30::Meeting:O        # One-time alarm at 3:30 PM named "Meeting"
a22:00::Bedtime          # Daily alarm at 10:00 PM named "Bedtime"
```

### Days Format

- Empty or omitted = Daily
- Comma-separated numbers: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
- Examples: `0,1,2,3,4` (weekdays), `5,6` (weekend)

### Recurring Flag

- `R` = Recurring (default)
- `O` = One-time only

## Response Format

Responses start with a type prefix followed by colon-separated data:

### Response Types

| Type          | Format                                          | Description      | Example                            |
| ------------- | ----------------------------------------------- | ---------------- | ---------------------------------- |
| **OK**        | `OK:TYPE:data...`                               | Success response | `OK:ADDED:Test:07:30:tomorrow`     |
| **ERROR**     | `ERROR:message`                                 | Error response   | `ERROR:Invalid time format`        |
| **ALARM**     | `ALARM:index:name:HH:MM:status:type:time_until` | Alarm info       | `ALARM:0:Wake:07:30:ON:R:tomorrow` |
| **HEARTBEAT** | `HEARTBEAT:OK`                                  | System alive     | `HEARTBEAT:OK`                     |

### OK Response Examples

```
OK:CONNECTED                           # Connected successfully
OK:PONG                               # Ping response
OK:ADDED:Test:07:30:in 2 hours        # Alarm added
OK:REMOVED:0                          # Alarm removed
OK:TOGGLE:Test:ON                     # Alarm toggled on
OK:LIST:2                             # 2 alarms found
OK:STATUS:2024-01-15_14:30:25:2:0     # Status: time:alarms:errors
```

### ALARM Response Examples

```
ALARM:0:Wake:07:30:ON:R:tomorrow
ALARM:1:Meeting:15:30:OFF:O:unknown
```

Format: `ALARM:index:name:hour:minute:status:type:time_until`

- status: `ON`/`OFF`
- type: `R` (recurring) / `O` (one-time)

## Size Benefits

| Old JSON                              | Size     | New Compact | Size    |
| ------------------------------------- | -------- | ----------- | ------- |
| `{"type":"add","hour":7,"minute":30}` | 35 bytes | `a07:30`    | 6 bytes |
| `{"type":"ping"}`                     | 15 bytes | `p`         | 1 byte  |
| `{"type":"list"}`                     | 15 bytes | `l`         | 1 byte  |

The compact protocol reduces command sizes by **80-95%**, ensuring reliable transmission within BLE limits!

## Testing

Use the test client to send commands:

```bash
cd test_bluetooth
python test_bluetooth_client.py
```

Select option "c" for custom commands to test the protocol directly.
