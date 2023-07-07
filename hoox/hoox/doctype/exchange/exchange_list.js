frappe.listview_settings["Exchange"] = {
  add_fields: [
    "exchange_name",
    "status",
    "logo_clone",
    "precision_mode",
    "testnet",
    "rate_limit",
  ],
  hide_name_column: true,
  onload: function (listview) {
    listview.page.add_inner_button(
      __("Sync Exchanges"),
      async function (listview) {
        await frappe.call({
          method: "hoox.hoox.doctype.exchange.exchange.sync_exchanges",
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
                message: __("Error While Syncing Exchanges"),
                indicator: "red",
              });
            }
          },
          freeze: true,
          freeze_message: __("Syncing Exchanges..."),
          progress: (percent) => {
            frappe.show_progress(__("Progress"), percent, 100);
          },
        });
      },
      __("Exchange")
    );

    listview.page.add_inner_button(
      __("Delete Exchanges"),
      function (listview) {
        frappe.call({
          method: "hoox.hoox.doctype.exchange.exchange.delete_exchanges",
          args: {
            force: true,
          },
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
                message: __("Error While Deleting Exchanges"),
                indicator: "red",
              });
            }
          },
          freeze: true,
          freeze_message: __("Deleting Exchanges..."),
          // progress: (percent) => {
          //   frappe.show_progress(__("Progress"), percent, 100);
          // },
        });
      },
      __("Exchange")
    );
  },
  formatters: {
    logo_clone(val) {
      return '<img src="' + val + '" class="rounded img-fluid" alt="logo" />';
    },
  },
  button: {
    show(doc) {
      return doc.name;
    },
    get_label() {
      return "Features";
    },
    get_description(doc) {
      return __("Show Features");
    },
    action(doc) {
      frappe.db.get_doc("Exchange", doc.name).then((row) => {
        let jsonContent = JSON.parse(row.has);
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
          title: __("API Permissions"),
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
