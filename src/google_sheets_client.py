# src/google_sheets_client.py
import os
import gspread
import pandas as pd
import numpy as np
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials

# Cargar variables del entorno
load_dotenv('../.env')

class GoogleSheetsClient:
    def __init__(self):
        self.spreadsheet_id = os.getenv('SPREADSHEET_ID')
        self.credentials_file = os.getenv('CREDENTIALS_FILE')
        self.sheet_control = os.getenv('SHEET_CONTROL', 'Control mensual')
        self.sheet_salidas = os.getenv('SHEET_SALIDAS', 'Salidas')
        self.sheet_entradas = os.getenv('SHEET_ENTRADAS', 'Entradas')
        
        self.client = self._authenticate()
    
    def _authenticate(self):
        """Autenticación con cuenta de servicio"""
        try:
            if not os.path.exists(self.credentials_file):
                raise FileNotFoundError(f"Archivo de credenciales no encontrado: {self.credentials_file}")
            
            creds = Credentials.from_service_account_file(
                self.credentials_file,
                scopes=['https://www.googleapis.com/auth/spreadsheets']
            )
            gc = gspread.authorize(creds)
            print("✅ Autenticación con Google Sheets exitosa")
            return gc
        except Exception as e:
            print(f"❌ Error en autenticación: {e}")
            return None
    
    def get_sheet_data_with_formulas(self, sheet_name):
        """Obtiene datos incluyendo resultados de fórmulas usando la API de Sheets v4"""
        try:
            if not self.client:
                print("Cliente no autenticado")
                return pd.DataFrame()
            
            # Usar la API de Sheets v4 directamente para obtener valores formateados
            spreadsheet = self.client.open_by_key(self.spreadsheet_id)
            worksheet = spreadsheet.worksheet(sheet_name)
            
            # Obtener todos los valores (incluyendo resultados de fórmulas)
            all_values = worksheet.get_all_values()
            
            if not all_values or len(all_values) <= 1:
                print(f'No se encontraron datos en {sheet_name}')
                return pd.DataFrame()
            
            # La primera fila son los headers
            headers = all_values[0]
            data_rows = all_values[1:]
            
            # Crear DataFrame
            df = pd.DataFrame(data_rows, columns=headers)
            
            print(f"✅ Datos obtenidos de '{sheet_name}': {len(df)} registros, {len(df.columns)} columnas")
            return df
            
        except Exception as e:
            print(f"❌ Error obteniendo '{sheet_name}': {e}")
            return pd.DataFrame()
    
    def get_control_mensual(self):
        """Obtiene datos de Control mensual con fórmulas ejecutadas"""
        return self.get_sheet_data_with_formulas(self.sheet_control)
    
    def get_salidas(self):
        """Obtiene datos de Salidas con fórmulas ejecutadas"""
        return self.get_sheet_data_with_formulas(self.sheet_salidas)
    
    def get_entradas(self):
        """Obtiene datos de Entradas con fórmulas ejecutadas"""
        return self.get_sheet_data_with_formulas(self.sheet_entradas)
    
    def get_sheet_names(self):
        """Obtiene los nombres de todas las hojas disponibles"""
        try:
            if not self.client:
                print("❌ Cliente no autenticado")
                return []
            
            spreadsheet = self.client.open_by_key(self.spreadsheet_id)
            worksheets = spreadsheet.worksheets()
            sheet_names = [worksheet.title for worksheet in worksheets]
            print(f"📊 Hojas disponibles: {sheet_names}")
            return sheet_names
            
        except Exception as e:
            print(f"❌ Error al obtener nombres de hojas: {e}")
            return []
