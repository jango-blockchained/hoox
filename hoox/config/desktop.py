from frappe import _


def get_data():
    return {
        "Frappe Apps": {
            "module_name": "Hoox",
            "color": "orange",
            "icon": "fa fa-line-chart",
            "type": "module",
            "label": _("Hoox"),
        }
    }


# hoox = {
#     "hoox": {
#         "color": "#589494",
#         "icon": "fa fa-line-chart",
#         "label": _("Smart Trading"),
#         "website_route_rules": [
#             {
#                 "from_route": "/smart-trading",
#                 "to_route": "smart_trading",
#                 "role": "System Manager",
#             },
#         ],
#         "website_context": "hoox.www.smart_trading.index.get_context",
#         "get_data": "hoox.hoox.config.desktop.get_data",
#     }
# }
# "onboard_settings": "app_name.app_name.onboarding.get_setup_stages",
