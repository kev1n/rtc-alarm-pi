class DS3231:
    def __init__(self, i2c, address=0x68):
        self.i2c = i2c
        self.address = address
        
    def _bcd2dec(self, bcd):
        return (bcd // 16) * 10 + (bcd % 16)
        
    def _dec2bcd(self, dec):
        return (dec // 10) * 16 + (dec % 10)
        
    def get_time(self):
        try:
            data = self.i2c.readfrom_mem(self.address, 0x00, 7)
            second = self._bcd2dec(data[0])
            minute = self._bcd2dec(data[1])
            hour = self._bcd2dec(data[2])
            day = self._bcd2dec(data[4])
            month = self._bcd2dec(data[5])
            year = self._bcd2dec(data[6]) + 2000
            return (year, month, day, hour, minute, second)
        except Exception as e:
            print(f"Error reading time: {e}")
            return None
            
    def set_time(self, year, month, day, hour, minute, second):
        try:
            self.i2c.writeto_mem(self.address, 0x00, bytes([
                self._dec2bcd(second),
                self._dec2bcd(minute),
                self._dec2bcd(hour),
                0,  # Day of week (not used)
                self._dec2bcd(day),
                self._dec2bcd(month),
                self._dec2bcd(year - 2000)
            ]))
            return True
        except Exception as e:
            print(f"Error setting time: {e}")
            return False