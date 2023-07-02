# -*- coding: utf-8 -*-
import sys
import os.path
import time
import pandas as pd
import numpy as np
import os
import glob
import os.path, time
from PyQt5.QtWidgets import QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QTabWidget, QLabel, QPushButton, QFileDialog, QTabBar
from PyQt5.QtCore import Qt
from PyQt5.QtGui import QFont

import matplotlib.pyplot as plt
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
from matplotlib.figure import Figure

# Importe la classe DataProcessing de data_processing.py
from data_processing import DataProcessing

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Suivi de Performance - Portefeuille")
        self.setGeometry(100, 100, 800, 600)

        # Champ de texte pour la valorisation totale
        self.portfolio_value_label = QLabel()
        self.portfolio_value_label.setAlignment(Qt.AlignLeft)
        self.portfolio_value_label.setFont(QFont("Arial", 12))

        self.dataframes = None
        self.folder_path = None
        
        # Bouton pour le mode sombre / clair
        dark_mode = False
        self.dark_mode_button = QPushButton("Dark Mode")
        self.dark_mode_button.clicked.connect(self.toggle_dark_mode)
        self.dark_mode_button.setFixedSize(100, 30)  # Définir une taille fixe pour le bouton

        self.choose_folder_button = QPushButton("Sélectionner le dossier")
        self.choose_folder_button.clicked.connect(self.choose_folder)
        self.choose_folder_button.setFixedSize(200, 30)

        self.validate_button = QPushButton("Valider")
        self.validate_button.hide()
        self.validate_button.clicked.connect(self.load_data)
        self.validate_button.setFixedSize(200, 30)

        # Onglets
        self.tabs = QTabWidget()

        # Onglet pour la courbe de valorisation
        self.valorisation_tab = QWidget()
        self.tabs.addTab(self.valorisation_tab, "Valorisation")

        # Onglet pour la diversification
        self.diversification_tab = QWidget()
        self.tabs.addTab(self.diversification_tab, "Diversification")

        # Onglet pour les performances mensuelles du portefeuille
        self.monthly_performance_tab = QWidget()
        self.tabs.addTab(self.monthly_performance_tab, "Performances mensuelles")

        # Onglet pour les performances mensuelles d'une action
        self.action_performance_tab = QWidget()
        self.tabs.addTab(self.action_performance_tab, "Performances par action")

        # Layouts
        main_layout = QVBoxLayout()
        header_layout = QHBoxLayout()
        header_layout.addWidget(self.portfolio_value_label)

        main_layout.addLayout(header_layout)

        buttons_layout = QHBoxLayout()
        buttons_layout.addWidget(self.choose_folder_button)
        buttons_layout.addWidget(self.validate_button)
        buttons_layout.addWidget(self.dark_mode_button)
        buttons_layout.addStretch(1)
        main_layout.addLayout(buttons_layout)
        
        main_layout.addWidget(self.tabs)

        # Widget central
        central_widget = QWidget()
        central_widget.setLayout(main_layout)
        self.setCentralWidget(central_widget)

    def toggle_dark_mode(self):
        if self.dark_mode_button.text() == "Dark Mode":
            self.dark_mode = True
            self.dark_mode_button.setText("Light Mode")
            # Appliquer le style sombre
            self.setStyleSheet("background-color: #333333; color: #FFFFFF;")
            self.set_button_style("background-color: gray; color: white;")
            self.set_tab_style("background-color: gray; color: black;")
        else:
            self.dark_mode = False
            self.dark_mode_button.setText("Dark Mode")
            # Appliquer le style clair
            self.setStyleSheet("background-color: #FFFFFF; color: #000000;")
            self.set_button_style("")
            self.set_tab_style("")

    
    def choose_folder(self):
        folder_path = QFileDialog.getExistingDirectory(self, "Sélectionner le dossier")
        if folder_path:
            self.folder_path = folder_path
            self.validate_button.show()


    def load_data(self):
        self.dataframes = DataProcessing(self.folder_path)
        self.plot_diversification(self.dataframes.get_oldest_dataframe())
        self.plot_valorisation(self.dataframes.get_dataframes())
        self.show()


    def create_graph_tab(self):
        layout = QVBoxLayout()
        label = QLabel("Valorisation totale du portefeuille:")
        layout.addWidget(label)

        self.portfolio_value_label = QLabel()
        self.portfolio_value_label.setFont(QFont("Arial", 14))
        layout.addWidget(self.portfolio_value_label)

        self.choose_folder_button = QPushButton("Choisir un dossier")
        self.choose_folder_button.clicked.connect(self.choose_folder)
        layout.addWidget(self.choose_folder_button)

        self.graph_tab.setLayout(layout)


    def create_settings_tab(self):
        layout = QHBoxLayout()
        self.dark_mode_button = QPushButton("Dark Mode")
        self.dark_mode_button.clicked.connect(self.toggle_dark_mode)
        layout.addWidget(self.dark_mode_button)
        self.settings_tab.setLayout(layout)


    def set_button_style(self, style):
        for button in self.findChildren(QPushButton):
            button.setStyleSheet(style)


    def set_tab_style(self, style):
        tabs = self.findChildren(QTabBar)
        for tab in tabs:
            tab.setStyleSheet(style)


    def plot_valorisation(self, dataframes):
            # Récupère les données de valorisation totale et de date de création pour chaque DataFrame
        valorisation_data = {}
        creation_dates = {}
        for file_name, data in dataframes.items():
            print(file_name)
            df = data['data']
            print(df)
            valorisation_data[file_name] = pd.to_numeric(df['Valorisation'], errors='coerce').sum()            
            creation_dates[file_name] = pd.to_datetime(data['creation_date'])

        # Trie les données par date de création
        sorted_data = sorted(zip(creation_dates.values(), valorisation_data.values()))

        # Sépare les dates et les valorisations
        sorted_dates, sorted_valorisations = zip(*sorted_data)

        # Crée la figure et le graphique de la courbe de valorisation totale
        figure = Figure()
        ax = figure.add_subplot(111)
        
        # Filtrer les données pour ne conserver que les dates avec des valorisations correspondantes
        filtered_dates = []
        filtered_valorisations = []
        for date, valorisation in zip(sorted_dates, sorted_valorisations):
            if not pd.isnull(valorisation):
                filtered_dates.append(date)
                filtered_valorisations.append(valorisation)

        ax.plot(filtered_dates, filtered_valorisations, marker='o')
        ax.set_xlabel('Date de création')
        ax.set_ylabel('Valorisation totale')
        ax.set_title('Valorisation totale du portefeuille')

        # Supprime le layout existant du widget valorisation_tab s'il en a déjà un
        if self.valorisation_tab.layout() is not None:
            old_layout = self.valorisation_tab.layout()
            old_layout.deleteLater()

        # Crée un nouveau layout pour le widget valorisation_tab
        layout = QVBoxLayout(self.valorisation_tab)
        layout.addWidget(FigureCanvas(figure))
        self.valorisation_tab.setLayout(layout)

        
    def plot_diversification(self, dataframe):

        # Crée le graphique camembert
        figure = Figure()
        ax = figure.add_subplot(111)
        ax.pie(dataframe['Poids'], labels=dataframe['Libellé'])
        ax.set_title('Diversification du portefeuille')

        # Supprime le layout existant du widget diversification_tab s'il en a déjà un
        if self.diversification_tab.layout() is not None:
            old_layout = self.diversification_tab.layout()
            old_layout.deleteLater()

        # Crée un nouveau layout pour le widget diversification_tab
        layout = QVBoxLayout(self.diversification_tab)
        layout.addWidget(FigureCanvas(figure))
        self.diversification_tab.setLayout(layout)
