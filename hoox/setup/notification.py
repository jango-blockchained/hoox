import frappe


def add_hoox_notification_channel():
    """
    This will add Hoox to existing list of Channels.
    This will not overwrite other custom channels that came in via custom-apps
    """
    meta = frappe.get_meta("Notification")
    channels = meta.get_field("channel").options.split("\n")
    if "Hoox" in channels:
        return

    channels.append("Hoox")
    frappe.get_doc({
        "doctype": "Property Setter",
        "doctype_or_field": "DocField",
        "doc_type": "Notification",
        "field_name": "channel",
        "property": "options",
        "value": "\n".join(channels),
        "property_type": "Small Text"
    }).insert()
