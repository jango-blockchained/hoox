import requests

def get_crypto_logo(symbol):
    base_url = "https://api.coingecko.com/api/v3"
    endpoint = f"/coins/{symbol.lower()}"

    try:
        response = requests.get(url=f"{base_url}{endpoint}")
        response.raise_for_status()
        data = response.json()

        # Get the URL of the logo
        logo_url = data.get("image", {}).get("large")

        if logo_url:
            logo_response = requests.get(url=logo_url)
            logo_response.raise_for_status()
            return logo_response.content

    except requests.exceptions.RequestException as e:
        print(f"Error fetching logo for {symbol}: {e}")
        return None

# Usage
logo = get_crypto_logo("bitcoin")
if logo:
    with open("bitcoin_logo.png", "wb") as logo_file:
        logo_file.write(logo)
