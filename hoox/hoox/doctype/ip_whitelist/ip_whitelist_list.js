frappe.listview_settings["IP Whitelist"] = {
  onload: function (listview) {
    listview.page.add_inner_button(__("Add TradingView™ Server"), function () {
      frappe.call({
        method: "hoox.hoox.doctype.ip_whitelist.ip_whitelist.add_ip_addresses",
        callback: function (r) {
          if (r.message) {
            frappe.msgprint(r.message);
          }
        },
        error: function (r) {
          if (r.message) {
            frappe.msgprint(r.message);
          }
        },
        freeze: true,
        freeze_message: __("Adding 4 TradingView™ Alert Server"),
      });
    });
    listview.page.add_inner_button(__("Add Whitelist All"), function () {
      if (
        frappe.user.has_role("System Manager")
        // && frappe.user.is_allowed("Custom", "write")
      ) {
        frappe.confirm(
          __(
            "Are you sure you want to add an IP address placeholder to whitelist all IP addresses?"
          ),
          function () {
            frappe.call({
              method:
                "hoox.hoox.doctype.ip_whitelist.ip_whitelist.add_whitelist_all",
              callback: function (r) {
                if (r.message) {
                  frappe.msgprint(r.message);
                }
              },
              error: function (r) {
                if (r.message) {
                  frappe.msgprint(r.message);
                }
              },
              freeze: true,
              freeze_message: __("Adding whitelisting for all IP Addresses."),
            });
          }
        );
      } else {
        frappe.msgprint(__("You are not authorized to perform this action."));
      }
    });
  },
};
