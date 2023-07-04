frappe.listview_settings["Symbol"] = {
  onload: function (listview) {
    listview.page.add_inner_button(
      __("Sync Symbol"),
      function () {
        frappe.call({
          method: "hoox.hoox.doctype.symbol.symbol.sync_symbols",
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
      function () {
        frappe.call({
          method: "hoox.hoox.doctype.symbol.symbol.activate_symbols",
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
      function () {
        frappe.call({
          method: "hoox.hoox.doctype.symbol.symbol.delete_symbols",
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
