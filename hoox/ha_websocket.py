import websocket
import json

# Specify the URL of your Home Assistant instance
ha_url = "wss://iflost.duckdns.org:8123/api/websocket"

# Define the callback functions
def on_message(ws, message):
    print(f"Received message: {message}")

def on_error(ws, error):
    print(f"Error occurred: {error}")

def on_close(ws, close_status_code, close_msg):
    print("WebSocket connection closed")

def on_open(ws):
    # Example of sending an authentication message
    auth_message = json.dumps({"type": "auth", "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjYzA3MjE0N2UxNmI0OTMxYjU5ODYyM2YwNGJkNTM2OCIsImlhdCI6MTY4NTAwMTQ5NSwiZXhwIjoyMDAwMzYxNDk1fQ.pRJ6qL0EDa-Ts3tjFZuvIav-mUhc4zskFmjLwXgrYHc"})
    ws.send(auth_message)


def main():
    # Create a WebSocket connection
    ws = websocket.WebSocketApp(ha_url,
                                on_message=on_message,
                                on_error=on_error,
                                on_close=on_close)
    ws.on_open = on_open

    # Start the WebSocket connection
    ws.run_forever()

if __name__ == "__main__":
    main()