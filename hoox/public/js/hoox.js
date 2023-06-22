frappe.realtime.on("hoox", function (data) {
  frappe.show_alert(data.message);
  console.log(data.message);
});

// frappe.form.link_formatters['CCXT Exchanges'] = function(value, doc) {
//     if(doc.exchange_id && doc.exchange_name !== value) {
//         return '' value + ': ' + doc.employee_name;
//     } else {
//         return value;
//     }
// }

