frappe.pages['wallet'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Wallet Manager',
		single_column: true
	});
}