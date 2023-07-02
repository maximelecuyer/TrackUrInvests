# -*- coding: utf-8 -*-
import pandas as pd
import matplotlib.pyplot as plt
import glob
import numpy as np
import os.path, time
import xlrd
from datetime import datetime

class DataProcessing():
    
    def __init__(self, path):
        self.dataframes = {}

        # Getting excel files from the specified directory
        directory_path = path
        self.file_path = glob.glob(directory_path + "\\*.xls")
        self.file_path.sort(key=lambda x: os.path.getmtime(x))
                
        # for loop to iterate all excel files
        for file in self.file_path:
            # Reading date of excel files
            workbook = xlrd.open_workbook(file)
            worksheet = workbook.sheet_by_name('Sheet0')
            creation_date = worksheet.cell(2,0)
            creation_date = datetime.strptime(creation_date.value, '%d/%m/%Y')
            # Reading data from excel files
            df = pd.read_excel(file, 'Sheet0', skiprows=4)
            self.dataframes[file] = {'data': df, 'creation_date': creation_date}

    def get_oldest_dataframe(self):
            oldest_dataframe = None
            oldest_date = pd.Timestamp.min
            oldest_file = None
            for file_name in self.dataframes:
                creation_date = pd.to_datetime(self.dataframes[file_name]['creation_date'])
                if creation_date > oldest_date:
                    oldest_date = creation_date
                    oldest_file = file_name
            oldest_dataframe = self.dataframes[oldest_file]['data']
            return oldest_dataframe

    def get_dataframes(self):
         return self.dataframes


    # TODO : ici on va créer toutes les fonctions pour faire les opérations sur les dataframes et on les appellera ensuite en paramètres des fonctions contenues dans gui.py