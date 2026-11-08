# Copy to config.py on the ESP32, then fill in your own local values.
# Keep this file off GitHub after adding your Wi-Fi password and device token.
WIFI_SSID = "YOUR_WIFI_NAME"
WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"
SERVER_HOST = "192.168.1.10"  # Computer's LAN address; never use localhost here.
SERVER_PORT = 8080
DEVICE_TOKEN = "SAME_LONG_RANDOM_TOKEN_AS_SERVER"
PUMP_ON_AT_START = False
