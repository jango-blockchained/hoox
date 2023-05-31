frappe.realtime.on('hoox_notification', function(data) {
    frappe.show_alert(data.message);
});
