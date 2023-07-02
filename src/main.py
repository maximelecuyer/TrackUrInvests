# main.py
import sys
from PyQt5.QtWidgets import QApplication
from gui import MainWindow
# Importe la classe DataProcessing de data_processing.py
from data_processing import DataProcessing



if __name__ == '__main__':
    app = QApplication(sys.argv)

    # path = "C:\\Users\\thema\\Documents\\Fortuneo"
    # data_processing = DataProcessing(path)
    # dataframes = data_processing.dataframes  # Obtenez les dataframes ici
    # main_window = MainWindow(dataframes)
    main_window = MainWindow()
    # main_window.plot_diversification(data_processing.get_oldest_dataframe())
    # main_window.plot_valorisation(dataframes)
    main_window.show()

    sys.exit(app.exec_())