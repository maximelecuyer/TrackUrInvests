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
        self.list_actions = set()
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
        
        self.lister_actions(self.dataframes)


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

    def lister_actions(self, dataframes):
        for df in dataframes.values():
            self.list_actions.update(df['data']['Libellé'].unique())

    def get_list_actions(self):
         return self.list_actions

    def get_action_values(dataframes, action_name):
        action_values = []
        
        for df in dataframes.values():
            df_action = df[df['data']['Libellé'] == action_name]
            if not df_action.empty:
                action_values.append(df_action.iloc[0].values)
        
        return action_values


    # TODO : ici on va créer toutes les fonctions pour faire les opérations sur les dataframes et on les appellera ensuite en paramètres des fonctions contenues dans gui.py