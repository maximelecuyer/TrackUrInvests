# main.py
import sys
from PyQt5.QtWidgets import QApplication
from gui import MainWindow
# Importe la classe DataProcessing de data_processing.py
from data_processing import DataProcessing



if __name__ == '__main__':
    app = QApplication(sys.argv)

    data_processing = DataProcessing()
    path = "C:\\Users\\thema\\Documents\\Fortuneo"
    file_paths = data_processing.get_files_path(path)
    data_processing.compute_files(file_paths)
    dataframes = data_processing.dataframes  # Obtenez les dataframes ici

    main_window = MainWindow(dataframes)
    main_window.plot_diversification()
    main_window.plot_valorisation()
    main_window.show()

    sys.exit(app.exec_())