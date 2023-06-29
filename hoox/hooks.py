from . import __version__ as app_version

app_name = "hoox"
app_title = "Hoox"
app_publisher = "jango_blockchained"
app_description = (
    "An API Gateway to handle Tradingview Alerts and execute trades using ccxt."
)
app_icon = "fa fa-line-chart"
app_color = "orange"
app_email = "info@cryptolinx.de"
app_license = "MIT"

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
app_include_css = "/assets/hoox/css/copy_icon.css"
app_include_js = "/assets/hoox/js/hoox.js"

# include js, css files in header of web template
# web_include_css = "/assets/hoox/css/hoox.css"
web_include_js = "/assets/hoox/js/hoox_web.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "hoox/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Installation
# ------------

# before_install = "hoox.install.before_install"
# after_install = "hoox.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "hoox.uninstall.before_uninstall"
# after_uninstall = "hoox.uninstall.after_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "hoox.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
#     "*": {
#         "on_update": "method",
#         "on_cancel": "method",
#         "on_trash": "method"
#     }
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"hoox.tasks.all"
# 	],
# 	"daily": [
# 		"hoox.tasks.daily"
# 	],
# 	"hourly": [
# 		"hoox.tasks.hourly"
# 	],
# 	"weekly": [
# 		"hoox.tasks.weekly"
# 	]
# 	"monthly": [
# 		"hoox.tasks.monthly"
# 	]
# }exit()

# Testing
# -------

# before_tests = "hoox.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "hoox.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "hoox.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Request Events
# ----------------
# before_request = ["hoox.utils.before_request"]
# after_request = ["hoox.utils.after_request"]

# Job Events
# ----------
# before_job = ["hoox.utils.before_job"]
# after_job = ["hoox.utils.after_job"]

# User Data Protection
# --------------------

user_data_fields = [
    {
        "doctype": "{doctype_1}",
        "filter_by": "{filter_by}",
        "redact_fields": ["{field_1}", "{field_2}"],
        "partial": 1,
    },
    {
        "doctype": "{doctype_2}",
        "filter_by": "{filter_by}",
        "partial": 1,
    },
    {
        "doctype": "{doctype_3}",
        "strict": False,
    },
    {"doctype": "{doctype_4}"},
]

# Authentication and authorization
# --------------------------------

auth_hooks = [
    "hoox.user.auth"
]


# Fixtures
# --------

fixtures = ['Signal Provider', 'Supported Markets', 'Hoox Settings']
