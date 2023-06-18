frappe.listview_settings["IP Whitelist"] = {
  onload: function (listview) {
    listview.page.add_inner_button(__("Add TradingView™ Server"), function () {
      frappe.call({
        method: "hoox.action.add_ip_addresses",
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
  },
};