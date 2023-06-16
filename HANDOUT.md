# Account Information

- Username: user@domain.tld
- Password: **\*\*\*\***
- URL:
- Frontend:
- Backend:

## Alert Configuration

Alerts get sent over Tradingview to this endpoint: [https://erp.abigruppe.de/api/method/hoox.api.receive_alert](https://erp.abigruppe.de/api/method/hoox.api.receive_alert)

## Example Alert

```json
{
    // always required
    "secret_hash": "56e56e8993",
    // optional, but needed for trading
    "action": "buy|sell|close",
    "symbol": "KEYUSDT",
    "price": "",
    "quantity": "100",
    "order_type": "market|limit",
    "market_type": "spot|future",
    // optional, but needed for telegram
    "telegram": {
        // required
        "message": "Extra Message",
        // optional
        "chat_id": "123456789",
    },
    // optional, but needed for home assistant
    "haas": {
        // required
        "entity_id": "light.living_room",
        "service": "turn_on|turn_off|toggle|...",
        // optional
        "data": {
            "rgb_color": [
                255,
                255,
                255
            ],
            "brightness": 255,
            "color_temp": 255,
            "effect": "colorloop|random|flash|...",
            "flash": "short|long",
            "transition": 255,
            "xy_color": [
                0.5,
                0.5
            ],
            "profile": "relax|energize|concentrate|..."
            **** all available fields ....
        }
    }
}
```
