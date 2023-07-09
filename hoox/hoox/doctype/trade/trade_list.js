frappe.listview_settings["Trade"] = {
  add_fields: ["exchange", "action", "pair", "quantity", "price", "creation"],
  onload: function (listview) {
    listview.page.add_inner_button(__("Delete Trade"), function () {
      frappe.confirm(
        __("Are you sure you want to delete all Trade?"),
        function () {
          frappe.call({
            method: "hoox.action.delete_trades",
            callback: function (r) {
              if (r.message) {
                frappe.msgprint(r.message);
              }
            },
            freeze: true,
            freeze_message: __("Deleting Trade..."),
          });
        }
      );
    });
  },
};
