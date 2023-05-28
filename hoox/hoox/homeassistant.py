import requests
import frappe

def send_to_haas(user, entity_id, service, data):
    # Get Home Assistant credentials for the user from the DocType
    haas_creds = frappe.get_doc("HomeAssistant Credentials", {"user": user})

    # Check if credentials exist and are enabled
    if not haas_creds:
        raise Exception(f"No HomeAssistant credentials found for user {user}")
    else if not haas_creds.enabled:
        raise Exception(f"HomeAssistant credentials for user {user} are not enabled")
    
    # Define the endpoint for the Home Assistant REST API
    url = f"{haas_creds.protocol}://{haas_creds.url}/api/services/{service}/{entity_id}"

    # Define the headers for the API call
    headers = {
        "Authorization": f"Bearer {haas_creds.auth_token}",
        "Content-Type": "application/json",
    }

    # Make the API call
    response = requests.post(url, headers=headers, data=data)

    # Check the response
    if response.status_code != 200:
        raise Exception(f"Failed to send to haas: {response.content}")

    return response.content
