from frappe.model.document import Document


class KlineData(Document):
    def get_list(self, args):
        # read the CSV files and return the data
        data = pd.read_csv('path_to_csv_file')
        return data.to_dict('records')
