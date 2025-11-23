# src/data_processor.py
import pandas as pd
import numpy as np
from datetime import datetime

class DataProcessor:
    def __init__(self, sheets_client):
        self.client = sheets_client
        self.df_control = None
        self.df_salidas = None
        self.df_entradas = None
        
    def load_all_data(self):
        """Carga todos los datos de las hojas"""
        print("📥 Cargando datos de Google Sheets...")
        
        self.df_control = self.client.get_control_mensual()
        self.df_salidas = self.client.get_salidas()
        self.df_entradas = self.client.get_entradas()
        
        print(f"✅ Datos cargados:")
        print(f"   - Control mensual: {len(self.df_control)} registros")
        print(f"   - Salidas: {len(self.df_salidas)} registros")
        print(f"   - Entradas: {len(self.df_entradas)} registros")
        
        self._clean_data()
        return self
        
    def _clean_data(self):
        """Limpia y formatea los datos"""
        # Limpiar datos de control mensual
        if not self.df_control.empty:
            numeric_cols = ['Residuo', 'Sueldo', 'Entradas', 'Entrada total', 
                           'Salidas', 'Ahorro', 'Cuenta']
            for col in numeric_cols:
                if col in self.df_control.columns:
                    self.df_control[col] = pd.to_numeric(
                        self.df_control[col].astype(str).str.replace(',', '').str.replace('$', ''), 
                        errors='coerce'
                    )
            
            # Crear columna de fecha
            if 'Año' in self.df_control.columns and 'Mes' in self.df_control.columns:
                self.df_control['Fecha'] = pd.to_datetime(
                    self.df_control['Año'].astype(str) + '-' + 
                    self.df_control['Mes'].astype(str), 
                    format='%Y-%m', 
                    errors='coerce'
                )
        
        # Limpiar datos de salidas
        if not self.df_salidas.empty:
            numeric_cols_salidas = ['Unidades', 'Kg', 'Valor', 'Dcto', 'Total']
            for col in numeric_cols_salidas:
                if col in self.df_salidas.columns:
                    self.df_salidas[col] = pd.to_numeric(
                        self.df_salidas[col].astype(str).str.replace(',', '').str.replace('$', ''), 
                        errors='coerce'
                    )
            
            # Convertir fecha de compra
            if 'Fecha compra' in self.df_salidas.columns:
                self.df_salidas['Fecha compra'] = pd.to_datetime(
                    self.df_salidas['Fecha compra'], errors='coerce'
                )
        
        # Limpiar datos de entradas
        if not self.df_entradas.empty:
            if 'Monto' in self.df_entradas.columns:
                self.df_entradas['Monto'] = pd.to_numeric(
                    self.df_entradas['Monto'].astype(str).str.replace(',', '').str.replace('$', ''), 
                    errors='coerce'
                )
            
            if 'Fecha' in self.df_entradas.columns:
                self.df_entradas['Fecha'] = pd.to_datetime(
                    self.df_entradas['Fecha'], errors='coerce'
                )
        
        print("✅ Datos limpiados y formateados")
    
    def get_resumen_mensual(self):
        """Retorna resumen mensual de finanzas"""
        return self.df_control
    
    def get_gastos_por_categoria(self, mes=None, año=None):
        """Agrupa gastos por categoría"""
        if self.df_salidas is None or self.df_salidas.empty:
            return pd.Series()
            
        df = self.df_salidas.copy()
        
        if mes and año:
            df = df[(df['Mes'] == str(mes)) & (df['Año'] == str(año))]
        elif año:
            df = df[df['Año'] == str(año)]
        
        if 'Categoría' in df.columns and 'Total' in df.columns:
            gastos_categoria = df.groupby('Categoría')['Total'].sum().sort_values(ascending=False)
            return gastos_categoria
        return pd.Series()
    
    def get_evolucion_ahorro(self):
        """Retorna la evolución del ahorro mensual"""
        if self.df_control is not None and not self.df_control.empty:
            return self.df_control[['Fecha', 'Ahorro', 'Cuenta']].sort_values('Fecha')
        return pd.DataFrame()
    
    def get_entradas_vs_salidas(self):
        """Compara entradas vs salidas mensuales"""
        if self.df_control is not None and not self.df_control.empty:
            return self.df_control[['Fecha', 'Entrada total', 'Salidas', 'Ahorro']]
        return pd.DataFrame()
    
    def get_estadisticas_basicas(self):
        """Retorna estadísticas básicas de los datos"""
        stats = {
            'total_meses': len(self.df_control),
            'total_gastos': len(self.df_salidas),
            'total_entradas': len(self.df_entradas),
            'periodo_inicio': self.df_control['Fecha'].min() if not self.df_control.empty else None,
            'periodo_fin': self.df_control['Fecha'].max() if not self.df_control.empty else None,
            'total_ahorrado': self.df_control['Ahorro'].sum() if not self.df_control.empty else 0,
            'promedio_mensual_entradas': self.df_control['Entrada total'].mean() if not self.df_control.empty else 0,
            'promedio_mensual_salidas': self.df_control['Salidas'].mean() if not self.df_control.empty else 0
        }
        return stats
    
    def get_top_gastos(self, n=10):
        """Retorna los n gastos más grandes"""
        if self.df_salidas is None or self.df_salidas.empty:
            return pd.DataFrame()
        
        if 'Total' in self.df_salidas.columns and 'Compra' in self.df_salidas.columns:
            return self.df_salidas.nlargest(n, 'Total')[['Compra', 'Total', 'Categoría', 'Fecha compra']]
        return pd.DataFrame()
