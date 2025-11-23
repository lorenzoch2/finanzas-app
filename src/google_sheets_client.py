# src/google_sheets_client.py
import os
import gspread
import pandas as pd
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
    
    def get_sheet_data(self, sheet_name):
        """Obtiene datos de una hoja específica como DataFrame"""
        try:
            if not self.client:
                print("Cliente no autenticado")
                return pd.DataFrame()
            
            spreadsheet = self.client.open_by_key(self.spreadsheet_id)
            worksheet = spreadsheet.worksheet(sheet_name)
            data = worksheet.get_all_records()
            
            print(f"✅ Datos obtenidos de '{sheet_name}': {len(data)} registros")
            return pd.DataFrame(data)
            
        except Exception as e:
            print(f"❌ Error obteniendo datos de '{sheet_name}': {e}")
            return pd.DataFrame()
    
    def get_control_mensual(self):
        """Obtiene datos de la hoja Control mensual"""
        return self.get_sheet_data(self.sheet_control)
    
    def get_salidas(self):
        """Obtiene datos de la hoja Salidas"""
        return self.get_sheet_data(self.sheet_salidas)
    
    def get_entradas(self):
        """Obtiene datos de la hoja Entradas"""
        return self.get_sheet_data(self.sheet_entradas)
    
    def get_sheet_names(self):
        """Obtiene los nombres de todas las hojas disponibles"""
        try:
            if not self.client:
                return []
            
            spreadsheet = self.client.open_by_key(self.spreadsheet_id)
            worksheets = spreadsheet.worksheets()
            sheet_names = [worksheet.title for worksheet in worksheets]
            print(f"📊 Hojas disponibles: {sheet_names}")
            return sheet_names
        except Exception as e:
            print(f"Error al obtener nombres de hojas: {e}")
            return []
