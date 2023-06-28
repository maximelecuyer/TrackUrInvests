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
        return file_path

    def compute_files(self,file_path):
        
        # for loop to iterate all excel files
        i = 0
        for file in file_path:

            print("FILE : ", i)
            # Reading excel files
            df = pd.read_excel(file, 'Sheet0', skiprows=4)
            self.dataframes[file] = {'data': df, 'creation_date': time.ctime(os.path.getctime(file))}


    # TODO : ici on va créer toutes les fonctions pour faire les opérations sur les dataframes et on les appellera ensuite en paramètres des fonctions contenues dans gui.py