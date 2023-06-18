frappe.listview_settings["CCXT Exchanges"] = {
  add_fields: [
    "exchange_id",
    "exchange_name",
    "precision_mode",
    "rate_limit",
    "testnet",
  ],
  filters: [["docstatus", "=", 1]],
  onload: function (listview) {
    listview.page.add_inner_button(
      __("Sync Exchanges"),
      function () {
        frappe.call({
          method: "hoox.action.sync_exchanges",
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
          freeze_message: __("Syncing Exchanges..."),
        });
      },
      __("Actions")
    );
    listview.page.add_inner_button(
      __("<i class='fa fa-delete'></i> Delete Exchanges"),
      function () {
        frappe.call({
          method: "hoox.action.delete_exchanges",
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
          freeze_message: __(
            "<i class='fa fa-sync fa-rotate'></i> Deleting Exchanges..."
          ),
        });
      },
      __("Actions")
    );
    // --
    listview.page.add_inner_button(
      __("<i class='fa fa-download'></i> Preload Exchange Logos"),
      function () {
        frappe.call({
          method: "hoox.action.download_all_exchange_logos",
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
          freeze_message: __("Downloading Exchange Logos..."),
        });
      },
      __("Actions")
    );
  },
};
