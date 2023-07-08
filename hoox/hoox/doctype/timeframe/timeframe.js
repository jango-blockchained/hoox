// Copyright (c) 2023, jango_blockchained and contributors
// For license information, please see license.txt

frappe.ui.form.on("Timeframe", {
  refresh: function (frm) {},
  value: function (frm, cdt, cdn) {
    let row = frappe.get_doc(cdt, cdn);
    row.timeframe_id = row.value + row.unit;
    cur_frm.refresh_field("timeframe");
  },
  unit: function (frm, cdt, cdn) {
    let row = frappe.get_doc(cdt, cdn);
    row.timeframe_id = row.value + row.unit;
    cur_frm.refresh_field("timeframe");
  },
});
