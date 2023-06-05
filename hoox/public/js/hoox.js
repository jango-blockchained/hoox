frappe.realtime.on("hoox_alert", function (data) {
  frappe.show_alert(data.message);
  console.log(data.message);
});
