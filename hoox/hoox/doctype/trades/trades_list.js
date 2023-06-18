frappe.listview_settings["Trades"] = {
  add_fields: ["exchange", "action", "symbol", "quantity", "price", "creation"],
  onload: function (listview) {
    listview.page.add_inner_button(__("Delete Trades"), function () {
      frappe.confirm(
        __("Are you sure you want to delete all Trades?"),
        function () {
          frappe.call({
            method: "hoox.action.delete_trades",
            callback: function (r) {
              if (r.message) {
                frappe.msgprint(r.message);
              }
            },
            freeze: true,
            freeze_message: __("Deleting Trades..."),
          });
        }
      );
    });
  },
};
