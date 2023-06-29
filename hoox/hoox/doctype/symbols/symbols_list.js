frappe.listview_settings["Symbols"] = {
  onload: function (listview) {
    listview.page.add_inner_button(
      __("Sync All Symbols"),
      function () {
        frappe.call({
          method: "hoox.action.sync_all_symbols_from_enabled_exchanges",
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
          freeze_message: __("Syncing Symbols From Enabled Exchanges..."),
          progress: (percent) => {
            frappe.show_progress(__("Progress"), percent, 100);
          },
        });
      },
      __("Symbols")
    );
    listview.page.add_inner_button(
      __("Activate All Symbols"),
      function () {
        frappe.call({
          method: "hoox.action.activate_all_symbols",
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
          freeze_message: __("Activating Symbols..."),
          progress: (percent) => {
            frappe.show_progress(__("Progress"), percent, 100);
          },
        });
      },
      __("Symbols")
    );
    listview.page.add_inner_button(
      __("Delete All Symbols"),
      function () {
        frappe.call({
          method: "hoox.action.delete_symbols",
          args: {
            force: true,
          },
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
          freeze_message: __("Deleting Symbols..."),
          progress: (percent) => {
            frappe.show_progress(__("Progress"), percent, 100);
          },
        });
      },
      __("Symbols")
    );
  },
  button: {
    show(doc) {
      return doc.name;
    },
    get_label() {
      return "Market Data";
    },
    get_description(doc) {
      return __("Show Full Market Data");
    },
    action(doc) {
      frappe.db.get_doc("Symbols", doc.name).then((row) => {
        let jsonContent = JSON.parse(row.params);
        let Fields = [];
        for (let key in jsonContent) {
          if (jsonContent.hasOwnProperty(key)) {
            let value = jsonContent[key];
            Fields.push({
              fieldtype: "Data",
              label: key,
              fieldname: key,
              default: value,
              read_only: true,
            });
          }
        }
        let d = new frappe.ui.Dialog({
          title: __("Symbol Market Data"),
          fields: Fields,
          size: "small",
          primary_action_label: __("Hide"),
          primary_action(values) {
            d.hide();
          },
        });
        d.show();
      });
    },
  },
};
