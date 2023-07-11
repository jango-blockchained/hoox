from frappe import _
import frappe
from hoox.hoox.doctype.


# Your controller or view function
def balance_page():
    # Fetch the data and create the `total` dictionary
    # (Assuming you have already retrieved the data and stored it in the `data` variable)

    # # Extract the coin balances from the data
    # coin_balances = data.get('total', {})

    # Create the `total` dictionary with the required structure
    # total = {}
    # for coin, balance in coin_balances.items():
    #     total[coin] = {
    #         'balance': balance,
    #         'free': data.get('free', {}).get(coin, 0),
    #         'used': data.get('used', {}).get(coin, 0),
    #         'debt': data.get('debt', {}).get(coin, 0)
    #     }

    # # Render the template with the context data
    # context = {
    #     'total': total
    # }

    return frappe.render_template('exchange_balance.html', context)
