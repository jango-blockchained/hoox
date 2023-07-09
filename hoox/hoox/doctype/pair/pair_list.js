frappe.listview_settings["Pair"] = {
  add_fields: [""],
  onload: function (listview) {
    listview.page.add_inner_button(
      __("Sync Pair"),
      function (listview) {
        frappe.call({
          method: "hoox.hoox.doctype.pair.pair.sync_pairs",
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
          freeze_message: __("Syncing Pair From Enabled Exchanges..."),
          progress: (percent) => {
            frappe.show_progress(__("Progress"), percent, 100);
          },
        });
      },
      __("Pair")
    );
    listview.page.add_inner_button(
      __("Activate Pair"),
      function (listview) {
        frappe.call({
          method: "hoox.hoox.doctype.pair.pair.activate_pairs",
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
          freeze_message: __("Activating Pair..."),
          progress: (percent) => {
            frappe.show_progress(__("Progress"), percent, 100);
          },
        });
      },
      __("Pair")
    );
    listview.page.add_inner_button(
      __("Delete Pair"),
      function (listview) {
        frappe.call({
          method: "hoox.hoox.doctype.pair.pair.delete_pairs",
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
          freeze_message: __("Deleting Pair..."),
          progress: (percent) => {
            frappe.show_progress(__("Progress"), percent, 100);
          },
        });
      },
      __("Pair")
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
      frappe.db.get_doc("Pair", doc.name).then((row) => {
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
          title: __("Pair Market Data"),
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
