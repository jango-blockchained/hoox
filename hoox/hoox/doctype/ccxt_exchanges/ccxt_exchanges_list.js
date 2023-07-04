frappe.listview_settings["Exchange"] = {
  add_fields: [
    "exchange_name",
    "status",
    "logo_url",
    "precision_mode",
    "testnet",
    "rate_limit",
  ],
  hide_name_column: true,
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
          progress: (percent) => {
            frappe.show_progress(__("Progress"), percent, 100);
          },
        });
      },
      __("Exchange")
    );

    listview.page.add_inner_button(
      __("Delete Exchanges (Force)"),
      function () {
        frappe.call({
          method: "hoox.action.delete_exchanges",
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
          freeze_message: __("Deleting Exchanges..."),
          progress: (percent) => {
            frappe.show_progress(__("Progress"), percent, 100);
          },
        });
      },
      __("Exchange")
    );
  },
  formatters: {
    logo_url(val) {
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
