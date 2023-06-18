frappe.ui.form.on("ExchangeCredentials", {
  refresh: function (frm) {
    // Add the copy-to-clipboard icon to the input field with the fieldname 'your_fieldname'
    const input_group = frm.fields_dict["secret_hash"].$wrapper;
    input_group.css("position", "relative");

    const copy_icon = $(
      '<i class="octicon octicon-clippy copy-to-clipboard"></i>'
    );
    copy_icon.appendTo(input_group);

    // Add the copy-to-clipboard functionality
    copy_icon.on("click", () => {
      const input_value = frm.fields_dict["secret_hash"].get_value();
      frappe.utils.copy_to_clipboard(input_value);
      frappe.show_alert({
        message: __("Secret Hash copied to clipboard"),
        indicator: "success",
      });
    });
  },
});
