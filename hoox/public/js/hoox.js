frappe.realtime.on("hoox", function (data) {
  frappe.show_alert(data.message);
  console.log(data.message);
});

// frappe.form.link_formatters["Exchange"] = function (value, doc) {
//   frappe
//     .call({
//       method: "hoox.hoox.doctype.exchange.exchange.get_logo_html",
//       args: { exchange_id: value },
//     })
//     .then((r) => {
//       if (ex.logo_url) {
//         return r.message + value;
//       } else {
//         return value;
//       }
//     });
// };
frappe.form.link_formatters["Exchange"] = function (value, doc) {
  return value;
};
