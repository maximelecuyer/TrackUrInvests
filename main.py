# -*- coding: utf-8 -*-
import pandas as pd
import matplotlib.pyplot as plt
import glob
import numpy as np
import os.path, time

# getting excel files from Directory Desktop
path = "C:\\Users\\thema\\Documents\\Fortuneo"
# read all the files with extension .xlsx i.e. excel 
filenames = glob.glob(path + "\*.xls")
filenames.sort(key=lambda x: os.path.getmtime(x))
print('File names:', filenames)

total_invested = np.array([])
time_invested = np.array([])

# for loop to iterate all excel files 
for file in filenames:
    # reading excel files
    print("Reading file = ",file)
    df = pd.read_excel(file, 'Sheet0', skiprows=4)
    total_invested = np.append(total_invested, sum(pd.to_numeric(df['Valorisation'])))
    time_invested = np.append(time_invested, time.ctime(os.path.getctime(file)))
    

# Displaying pie chart of investments
df['Poids'] = pd.to_numeric(df['Poids'],errors='coerce')
plot = df.plot.pie(y='Poids', labels=df['Libellé'],figsize=(11, 6),autopct='%1.1f%%')
plot.get_legend().remove()
plot.axes.get_yaxis().set_visible(False)
plt.show()

# Displaying wallet value over time
plt.plot(time_invested, total_invested)
plt.show()