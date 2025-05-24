# Ultra-Compact Alarm Protocol

## Overview

Due to BLE MTU limitations (~20 bytes), alarm responses use an ultra-compact format to ensure reliable transmission.

## Alarm Response Format

### Full Format (when name fits)

```
A{index}:{name}:{HHMM}:{enabled}:{recurring}:{minutes}
```

**Example:** `A0:Morning:1942:1:1:90`

- `A0` = Alarm index 0
- `Morning` = Alarm name (max 8 chars)
- `1942` = Time 19:42 (7:42 PM)
- `1` = Enabled (1=on, 0=off)
- `1` = Recurring (1=recurring, 0=one-time)
- `90` = Minutes until trigger

### Compact Format (when space is tight)

```
A{index}:{HHMM}:{ER}:{minutes}
```

**Example:** `A0:1942:11:90`

- `A0` = Alarm index 0
- `1942` = Time 19:42
- `11` = Enabled+Recurring flags (first digit=enabled, second=recurring)
- `90` = Minutes until trigger

## Character Limits

- **Total response**: ≤20 characters
- **Alarm name**: ≤8 characters (truncated if longer)
- **Minutes until**: ≤9999 (capped for space)

## Minutes Conversion

The React Native app converts minutes back to human-readable format:

- `90` → "in 1h 30m"
- `30` → "in 30m"
- `1500` → "in 1d 1h"

## Benefits

- ✅ Fits within BLE MTU limits
- ✅ No truncation issues
- ✅ Reliable transmission
- ✅ Still human-readable
- ✅ Preserves all essential data
