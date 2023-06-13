from frappe import _


def get_data():
    return [
        {
            "module_name": "Hoox",
            "color": "grey",
            "icon": "octicon octicon-file-directory",
            "type": "module",
            "label": _("Hoox"),
        },
        {
            "label": _("Smart Trading"),
            "items": [
                {
                    "type": "page",
                    "name": "smart_trading",
                    "label": _("Smart Trading"),
                    "icon": "fa fa-line-chart",
                    "route": "/smart-trading",
                    "role": "System Manager",
                }
            ],
        },
    ]


hoox = {
    "hoox": {
        "color": "#589494",
        "icon": "fa fa-line-chart",
        "label": _("Smart Trading"),
        "website_route_rules": [
            {
                "from_route": "/smart-trading",
                "to_route": "smart_trading",
                "role": "System Manager",
            },
        ],
        "website_context": "hoox.www.smart_trading.index.get_context",
        "get_data": "hoox.hoox.config.desktop.get_data",
    }
}
# "onboard_settings": "app_name.app_name.onboarding.get_setup_stages",
