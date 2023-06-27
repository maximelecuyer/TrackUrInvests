# -*- coding: utf-8 -*-
import sys
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
    def __init__(self, dataframes):
        super().__init__()
        self.setWindowTitle("Suivi de Performance - Portefeuille")
        self.setGeometry(100, 100, 800, 600)

        # Champ de texte pour la valorisation totale
        self.portfolio_value_label = QLabel()
        self.portfolio_value_label.setAlignment(Qt.AlignLeft)
        self.portfolio_value_label.setFont(QFont("Arial", 12))

        self.dataframes = dataframes
        
        # Bouton pour le mode sombre / clair
        dark_mode = False
        self.dark_mode_button = QPushButton("Dark Mode")
        self.dark_mode_button.clicked.connect(self.toggle_dark_mode)
        self.dark_mode_button.setFixedSize(100, 30)  # Définir une taille fixe pour le bouton


        # Bouton pour sélectionner le dossier de relevés de compte
        self.choose_folder_button = QPushButton("Sélectionner le dossier")
        self.choose_folder_button.clicked.connect(self.choose_folder)

        # Onglets
        self.tabs = QTabWidget()

        # Onglet pour la courbe de valorisation
        self.portfolio_curve_tab = QWidget()
        self.tabs.addTab(self.portfolio_curve_tab, "Valorisation")

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
        header_layout.addWidget(self.dark_mode_button)
        main_layout.addLayout(header_layout)
        main_layout.addWidget(self.choose_folder_button)
        main_layout.addWidget(self.tabs)
        # Crée le layout pour l'onglet "Diversification"
        self.diversification_tab.setLayout(QVBoxLayout())
        # Onglet pour la courbe de valorisation
        self.valorisation_tab = QWidget()
        self.tabs.addTab(self.valorisation_tab, "Valorisation")

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
        # Traiter le dossier sélectionné ici
        self.file_path = folder_path

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

    def choose_folder(self):
        folder_path = QFileDialog.getExistingDirectory(self, "Choisir un dossier")
        # Traiter le dossier sélectionné ici

    def set_button_style(self, style):
        for button in self.findChildren(QPushButton):
            button.setStyleSheet(style)

    def set_tab_style(self, style):
        tabs = self.findChildren(QTabBar)
        for tab in tabs:
            tab.setStyleSheet(style)

    def plot_valorisation(self):
        
        # Récupère les données de valorisation totale pour chaque DataFrame
        valorisation_data = {}
        for file_name, df in self.dataframes.items():
            valorisation_data[file_name] = df['Valorisation'].sum()

        # Crée la figure et le graphique de la courbe de valorisation totale
        figure = Figure()
        ax = figure.add_subplot(111)
        ax.plot(list(valorisation_data.keys()), list(valorisation_data.values()), marker='o')
        ax.set_xlabel('Fichier Excel')
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

    
    def plot_diversification(self):
        # Crée le layout pour l'onglet "Diversification"
        self.diversification_tab.setLayout(QVBoxLayout())

        # Obtient les données de la dernière période de chaque DataFrame
        last_period_data = {}
        for file_name, df in self.dataframes.items():
            last_period_data[file_name] = df.iloc[-1]

        # Obtient les noms et les valeurs des colonnes de diversification
        diversification_columns = ['Libellé', 'Valorisation']
        diversification_data = {}
        for file_name, data in last_period_data.items():
            diversification_values = data[diversification_columns].values
            diversification_data[file_name] = diversification_values

        # Crée la figure et le graphique camembert de la diversification
        figure = Figure()
        ax = figure.add_subplot(111)
        labels = []
        values = []
        for file_name, data in diversification_data.items():
            labels.append(file_name)
            values.append(data[1])  # Utilise la colonne 'Valorisation'
        ax.pie(values, labels=labels, autopct='%1.1f%%')
        ax.set_title('Diversification du portefeuille (Dernière période)')

        # Affiche la figure dans l'onglet "Diversification"
        self.diversification_canvas = FigureCanvas(figure)
        self.diversification_tab.layout().addWidget(self.diversification_canvas)

    def plot_diversification(self):
        # Obtient les données de la dernière période du fichier Excel le plus récent
        latest_dataframe = None
        latest_date = pd.Timestamp.min
        for file_name, df in self.dataframes.items():
            file_date = df['Date de création'].max()
            if file_date > latest_date:
                latest_date = file_date
                latest_dataframe = df

        # Vérifie si un fichier a été trouvé
        if latest_dataframe is not None:
            # Obtient les colonnes pour la répartition des actions
            columns = ['Libellé', 'Valorisation']

            # Obtient les données pour la répartition des actions
            diversification_data = latest_dataframe[columns]

            # Crée le graphique camembert
            figure = Figure()
            ax = figure.add_subplot(111)
            ax.pie(diversification_data['Valorisation'], labels=diversification_data['Libellé'], autopct='%1.1f%%')
            ax.set_title('Répartition des actions')

             # Affiche la figure dans l'onglet "Diversification"
            self.diversification_canvas = FigureCanvas(figure)
            self.diversification_tab.layout().addWidget(self.diversification_canvas)
