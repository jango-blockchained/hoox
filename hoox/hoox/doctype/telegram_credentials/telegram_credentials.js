// Copyright (c) 2023, jango_blockchained and contributors
// For license information, please see license.txt

frappe.ui.form.on("Telegram Credentials", {
  refresh: function (frm) {
    frm
      .add_custom_button(__("Get Chat-ID"), function () {
        window.open("https://t.me/myidbot", "_blank");
      })
      .css({ "background-color": "#0088cc", color: "#fff" });
  },
});
