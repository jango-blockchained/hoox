frappe.ui.form.on("CCXT Exchanges", {
  refresh: function (frm) {
    frm
      .add_custom_button(__("Show Features"), function () {
        let jsonContent = JSON.parse(frm.doc.has);
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
      })
      .css({ "background-color": "#5451f0", color: "#fff" });
  },
});

// frappe.form.link_formatters['exchange'] = function(value, doc) {
//     if(doc.employee_name && doc.employee_name !== value) {
//         return value + ': ' + doc.employee_name;
//     } else {
//         return value;
//     }
// }
