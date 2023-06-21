function toClipboard(val) {
  navigator.clipboard.writeText(val);
  // Show a message to inform the user that the text has been copied
  frappe.show_alert("Copied to clipboard: " + val);
}

frappe.ui.form.on("Exchange Credentials", "refresh", function (frm) {
  frm.add_custom_button("Copy Secret Hash", function () {
    toClipboard(frm.doc.secret_hash);
  });
});
