frappe.listview_settings["CCXT Exchanges"] = {
  add_fields: [
    "exchange_name",
    "status",
    "logo_url",
    "exchange_id",
    "precision_mode",
    "rate_limit",
    "testnet",
  ],
  // filters: [["docstatus", "=", 1]],
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
        });
      },
      __("Exchange")
    );
    listview.page.add_inner_button(
      __("Delete Exchanges"),
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
      __("Exchange")
    );
    // --
    // listview.page.add_inner_button(
    //   __("Preload Exchange Logos"),
    //   function () {
    //     frappe.call({
    //       method: "hoox.action.download_all_exchange_logos",
    //       callback: function (r) {
    //         if (r.message) {
    //           frappe.msgprint(r.message);
    //         }
    //       },
    //       error: function (r) {
    //         if (r.message) {
    //           frappe.msgprint(r.message);
    //         }
    //       },
    //       freeze: true,
    //       freeze_message: __("Downloading Exchange Logos..."),
    //     });
    //   },
    //   __("Exchange")
    // );
  },
  formatters: {
    logo_url(val) {
      return '<img src="' + val + '" class="rounded img-fluid" alt="logo" />';
    },
  },
  button: {
    show(doc) {
      return doc.reference_name;
    },
    get_label() {
      return "Features";
    },
    get_description(doc) {
      return __("View {0}", [`${doc.reference_type} ${doc.reference_name}`]);
    },
    action(doc) {
      frappe.set_route("Form", doc.reference_type, doc.reference_name);
    },
  },
};

// frappe.listview_settings['MQTT Logs'] = {
//     // add_fields: ['title', 'public'],
//     // filters: [
//     //     ['public', '=', 1]
//     // ],
//     // hide_name_column: true,
//     onload(listview) {

//     },
//     before_render() {

//     },
//     primary_action() {
//         // triggers when the primary action is clicked
//     },
//     get_form_link(doc) {
//         // override the form route for this doc
//     },
//     // add a custom button for each row
//     button: {
//         show(doc) {
//             return doc.reference_name;
//         },
//         get_label() {
//             return 'View';
//         },
//         get_description(doc) {
//             return __('View {0}', [`${doc.reference_type} ${doc.reference_name}`])
//         },
//         action(doc) {
//             frappe.set_route('Form', doc.reference_type, doc.reference_name);
//         }
//     },
//     formatters: {
//         title(val) {
//             return val.bold();
//         }
//     }
// }
