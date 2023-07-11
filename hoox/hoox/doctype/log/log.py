# # IMPORTS
# # -------

import frappe
# import os
from frappe.model.document import Document


# # CLASS
# # -----

# class Log(Document):
    
#     DEFAULT_FILE: str = "frappe.log"
#     PATH: str 

#     def __init__(self):
#         super().__init__()
#         self.file_list = Log.get_log_files(Log.get_path())

#     def load_from_db(self):
#         with open(os.path.join(self.path, self.file_list[0]), 'r') as file:
#             return file.read()

#     @staticmethod
#     def get_list(args):
#         file = args.log_file or Log.DEFAULT_FILE
#         log_file_path = os.path.join(Log.get_path(), file)
#         with open(log_file_path, 'r') as file:
#             return file.readlines()

#     @staticmethod
#     def get_count(args):
#         file = args.log_file or Log.DEFAULT_FILE
#         log_file_path = os.path.join(Log.get_path(), file)
#         with open(log_file_path, 'r') as file:
#             return len(file.readlines())

#     @staticmethod
#     def get_stats(args):
#         pass

#     @staticmethod
#     def get_log_files(directory):
#         with os.scandir(directory) as entries:
#             return [entry.name for entry in entries if entry.is_file() and entry.name.endswith('.log')]

#     @staticmethod
#     def get_path():
#         return os.path.join(frappe.get_site_path(), 'logs')

import os

class Log(Document):
    """This is a virtual doctype controller for demo purposes.

    - It uses log files on disk as the "backend".
    - Each log file represents a document, and the file name is the docname.
    """

    _doctype = "Log"
    _table_fieldnames = []

    def validate(self):
        pass

    def on_update(self):
        pass

    def on_cancel(self):
        pass

    def on_trash(self):
        pass

    def on_submit(self):
        pass

    @staticmethod
    def get_current_data() -> dict[str, dict]:
        """Read data from log files"""
        data = {}

        log_files = Log.get_log_files()
        for log_file in log_files:
            docname = os.path.splitext(log_file)[0]
            with open(os.path.join(Log.get_path(), log_file)) as f:
                data[docname] = {
                    "name": docname,
                    "content": f.read()
                }

        return data

    def load_from_db(self):
        data = self.get_current_data()
        d = data.get(self.name)
        if d:
            self.update(d)

    def get_content(self):
        log_file = f"{self.name}.log"
        with open(os.path.join(Log.get_path(), log_file)) as f:
            return f.read()

    @staticmethod
    def get_list(args):
        data = Log.get_current_data()
        return [frappe._dict(doc) for doc in data.values()]

    @staticmethod
    def get_count(args):
        data = Log.get_current_data()
        return len(data)

    @staticmethod
    def get_stats(args):
        return {}

    @staticmethod
    def get_log_files():
        with os.scandir(Log.get_path()) as entries:
            return [entry.name for entry in entries if entry.is_file() and entry.name.endswith('.log')]

    @staticmethod
    def get_path():
        return os.path.join(frappe.get_site_path(), 'logs')