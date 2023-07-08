frappe.listview_settings["Symbol"] = {
  add_fields: [""],
  onload: function (listview) {
    listview.page.add_inner_button(
      __("Sync Symbol"),
      function (listview) {
        frappe.call({
          method: "hoox.hoox.doctype.symbol.symbol.sync_symbols",
          callback: function (response) {
            if (response.message) {
              frappe.show_alert({
                message: __("Synced Successfully"),
                indicator: "green",
              });
              cur_list.refresh();
            }
          },
          error: function (response) {
            if (response.message) {
              frappe.show_alert({
                message: __("Error While Syncing Symbols"),
                indicator: "red",
              });
              cur_list.refresh();
            }
          },
          freeze: true,
          freeze_message: __("Syncing Symbol From Enabled Exchanges..."),
          progress: (percent) => {
            frappe.show_progress(__("Progress"), percent, 100);
          },
        });
      },
      __("Symbol")
    );
    listview.page.add_inner_button(
      __("Activate Symbol"),
      function (listview) {
        frappe.call({
          method: "hoox.hoox.doctype.symbol.symbol.activate_symbols",
          callback: function (response) {
            if (response.message) {
              frappe.show_alert({
                message: __("Activated Successfully"),
                indicator: "green",
              });
              listview.refresh();
            }
          },
          error: function (response) {
            // Handle the response here
            if (response.message) {
              frappe.show_alert({
                message: __("Error While Activating Symbols"),
                indicator: "red",
              });
              cur_list.refresh();
            }
          },
          freeze: true,
          freeze_message: __("Activating Symbol..."),
          progress: (percent) => {
            frappe.show_progress(__("Progress"), percent, 100);
          },
        });
      },
      __("Symbol")
    );
    listview.page.add_inner_button(
      __("Delete Symbol"),
      function (listview) {
        frappe.call({
          method: "hoox.hoox.doctype.symbol.symbol.delete_symbols",
          callback: function (response) {
            if (response.message) {
              frappe.show_alert({
                message: __("Deleted Successfully"),
                indicator: "green",
              });
              cur_list.refresh();
            }
          },
          error: function (response) {
            if (response.message) {
              frappe.show_alert({
                message: __("Error While Deleting Symbols"),
                indicator: "red",
              });
              cur_list.refresh();
            }
          },
          freeze: true,
          freeze_message: __("Deleting Symbol..."),
          progress: (percent) => {
            frappe.show_progress(__("Progress"), percent, 100);
          },
        });
      },
      __("Symbol")
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
      frappe.db.get_doc("Symbol", doc.name).then((row) => {
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
  formatters: {
    logo_url(val) {
      return (
        '<img src="' +
        val +
        '" class="rounded img-fluid" alt="logo" width="32" height="32" />'
      );
    },
  },
};
