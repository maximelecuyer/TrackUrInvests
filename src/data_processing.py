# -*- coding: utf-8 -*-
import pandas as pd
import matplotlib.pyplot as plt
import glob
import numpy as np
import os.path, time

class DataProcessing():
    
    def __init__(self):
        self.dataframes = {}

    def get_files_path(self,path):
        # Getting excel files from the specified directory
        directory_path = path
        file_path = glob.glob(directory_path + "\\*.xls")
        file_path.sort(key=lambda x: os.path.getmtime(x))
        print(file_path)
        return file_path

    def compute_files(self,file_path):
        
        # for loop to iterate all excel files 
        for file in file_path:
            # Reading excel files
            print("Reading file:", file)
            df = pd.read_excel(file, 'Sheet0', skiprows=4)
            file_name = os.path.basename(file)
            df['Date de création'] = pd.to_datetime(os.path.getctime(file), unit='s')
            self.dataframes[file_name] = df
