# src/data_processor.py
import pandas as pd
import numpy as np
from datetime import datetime
import re

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
        
    def _clean_numeric_value_clp(self, value, column_name=""):
        """Limpia y convierte valores CLP - TODOS LOS VALORES SON ENTEROS SIN DECIMALES"""
        if pd.isna(value) or value == '' or value is None:
            return np.nan
        
        # DEBUG: Mostrar valores problemáticos
        debug_columns = ['Ahorro', 'Monto', 'Entrada total', 'Salidas', 'Sueldo', 'Residuo', 'Cuenta']
        if column_name in debug_columns:
            print(f"      DEBUG {column_name}: Procesando '{value}'")
        
        # Si es string, limpiarlo
        if isinstance(value, str):
            original_value = value
            value = value.strip()
            
            # Para CLP, asumimos que NO hay decimales
            # Ejemplos: "85.5" -> 85500, "1.234" -> 1234, "89.6" -> 89600
            
            # Remover símbolos de moneda y espacios
            value = value.replace('$', '').replace(' ', '').replace('CLP', '').replace('clp', '')
            
            # Si hay un punto, es separador de miles, NO decimal
            # En CLP: "1.234" significa 1234, "85.5" significa 85500
            if '.' in value:
                parts = value.split('.')
                if len(parts) == 2:
                    # Caso como "85.5" - interpretar como 85.500
                    if len(parts[1]) == 1:
                        # "85.5" -> 85 + 500 = 85500
                        value = parts[0] + parts[1] + "00"
                    elif len(parts[1]) == 2:
                        # "85.50" -> 85 + 50 = 8550? No, mejor asumir sin decimales
                        # Para seguridad, tratar como enteros
                        value = parts[0] + parts[1]
                    else:
                        # "1.234" -> 1234 (separador de miles)
                        value = parts[0] + parts[1]
                else:
                    # Más de un punto - quitar todos los puntos
                    value = value.replace('.', '')
            
            # También manejar comas (por si acaso)
            value = value.replace(',', '')
            
            # Remover cualquier caracter no numérico
            value = re.sub(r'[^\d]', '', value)
            
            if value == '':
                return np.nan
            
            try:
                result = int(value)  # Usar INT en lugar de FLOAT para CLP
                if column_name in debug_columns:
                    print(f"      DEBUG {column_name}: '{original_value}' -> {result}")
                return result
            except (ValueError, TypeError) as e:
                print(f"      ERROR convirtiendo {column_name} '{original_value}': {e}")
                return np.nan
        else:
            # Si ya es numérico
            try:
                # Si es float como 85.5, convertirlo a 85500
                if isinstance(value, float) and value != int(value):
                    # Ejemplo: 85.5 -> "85.5" -> procesar como string
                    return self._clean_numeric_value_clp(str(value), column_name)
                return int(value)
            except (ValueError, TypeError):
                return np.nan
    
    def _clean_column_specific(self, df, column_name):
        """Limpia una columna específica para valores CLP"""
        if column_name not in df.columns:
            return df
            
        print(f"     Limpiando {column_name} (CLP)...")
        
        # Mostrar valores antes de limpiar
        sample_before = df[column_name].head(3).tolist()
        print(f"       Antes: {sample_before}")
        
        # Aplicar limpieza CLP
        df[column_name] = df[column_name].apply(
            lambda x: self._clean_numeric_value_clp(x, column_name)
        )
        
        # Mostrar valores después de limpiar
        sample_after = df[column_name].head(3).tolist()
        non_nan = df[column_name].notna().sum()
        print(f"       Después: {sample_after}")
        print(f"       No nulos: {non_nan}/{len(df)}")
        
        return df
    
    def _create_date_from_year_month(self, df, year_col='Año', month_col='Mes'):
        """Crea columna de fecha a partir de año y mes en español"""
        if year_col not in df.columns or month_col not in df.columns:
            print(f"❌ No se pueden crear fechas: faltan {year_col} o {month_col}")
            return df
            
        print(f"   Creando fechas desde {year_col} y {month_col}...")
        
        # Mapeo de meses en español a números
        meses_espanol = {
            'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
            'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
        }
        
        dates = []
        problems = []
        
        for idx, row in df.iterrows():
            try:
                year_str = str(row[year_col]).strip()
                month_str = str(row[month_col]).strip().lower()
                
                if not year_str or year_str == 'nan':
                    problems.append(f"Fila {idx}: Año vacío")
                    dates.append(pd.NaT)
                    continue
                    
                if not month_str or month_str == 'nan':
                    problems.append(f"Fila {idx}: Mes vacío")
                    dates.append(pd.NaT)
                    continue
                
                # Convertir año a entero
                year = int(float(year_str))
                
                # Buscar mes en el mapeo
                month = None
                for mes_es, num in meses_espanol.items():
                    if mes_es in month_str:
                        month = num
                        break
                
                if month:
                    date = datetime(year, month, 1)
                    dates.append(date)
                else:
                    problems.append(f"Fila {idx}: Mes '{month_str}' no reconocido")
                    dates.append(pd.NaT)
                    
            except (ValueError, TypeError) as e:
                problems.append(f"Fila {idx}: Error {e}")
                dates.append(pd.NaT)
        
        df['Fecha'] = dates
        valid_dates = pd.notna(df['Fecha']).sum()
        
        print(f"   ✅ Fechas creadas: {valid_dates}/{len(df)} válidas")
        if problems:
            print(f"   ⚠️ Problemas: {problems[:2]}")
        
        return df
    
    def _calculate_missing_formulas(self, df):
        """Calcula manualmente las fórmulas faltantes para CLP"""
        print("   🔧 Calculando fórmulas faltantes...")
        
        # Calcular Entrada total = Sueldo + Entradas (en CLP)
        if 'Entrada total' in df.columns and 'Sueldo' in df.columns and 'Entradas' in df.columns:
            missing_entrada = df['Entrada total'].isna()
            if missing_entrada.any():
                df.loc[missing_entrada, 'Entrada total'] = (
                    df.loc[missing_entrada, 'Sueldo'] + df.loc[missing_entrada, 'Entradas']
                )
                calculated = missing_entrada.sum()
                print(f"     Entrada total: {calculated} valores calculados")
        
        # Para Salidas, necesitamos saber la fórmula exacta
        # Supongamos: Salidas = Entrada total - Ahorro - Cuenta_siguiente?
        if 'Salidas' in df.columns and 'Entrada total' in df.columns and 'Ahorro' in df.columns:
            missing_salidas = df['Salidas'].isna()
            if missing_salidas.any():
                # Esta es una suposición - AJUSTA SEGÚN TU FÓRMULA REAL
                df.loc[missing_salidas, 'Salidas'] = (
                    df.loc[missing_salidas, 'Entrada total'] - 
                    df.loc[missing_salidas, 'Ahorro']
                )
                calculated = missing_salidas.sum()
                print(f"     Salidas: {calculated} valores calculados")
        
        return df
        
    def _clean_data(self):
        """Limpia y formatea los datos para CLP"""
        print("🔄 Limpiando y formateando datos CLP...")
        
        # Limpiar datos de control mensual
        if not self.df_control.empty:
            print("   - Procesando Control mensual (CLP)...")
            
            # Limpiar todas las columnas monetarias como CLP
            clp_columns = ['Ahorro', 'Residuo', 'Sueldo', 'Entradas', 'Entrada total', 'Salidas', 'Cuenta']
            for col in clp_columns:
                if col in self.df_control.columns:
                    self.df_control = self._clean_column_specific(self.df_control, col)
            
            # Calcular fórmulas faltantes
            self.df_control = self._calculate_missing_formulas(self.df_control)
            
            # Crear fechas
            self.df_control = self._create_date_from_year_month(self.df_control)
            
            # Ordenar por fecha
            if 'Fecha' in self.df_control.columns and self.df_control['Fecha'].notna().any():
                self.df_control = self.df_control.sort_values('Fecha')
                print("     ✅ Datos ordenados por fecha")
        
        # Limpiar datos de salidas (CLP)
        if not self.df_salidas.empty:
            print("   - Procesando Salidas (CLP)...")
            clp_cols_salidas = ['Valor', 'Dcto', 'Total']
            for col in clp_cols_salidas:
                if col in self.df_salidas.columns:
                    self.df_salidas = self._clean_column_specific(self.df_salidas, col)
            
            # Otras columnas numéricas (no monetarias)
            other_numeric = ['Unidades', 'Kg']
            for col in other_numeric:
                if col in self.df_salidas.columns:
                    # Para estas, usar limpieza normal (no CLP)
                    self.df_salidas[col] = self.df_salidas[col].apply(
                        lambda x: self._clean_numeric_value_clp(x, col) if pd.notna(x) else np.nan
                    )
        
        # Limpiar datos de entradas (CLP)
        if not self.df_entradas.empty:
            print("   - Procesando Entradas (CLP)...")
            if 'Monto' in self.df_entradas.columns:
                self.df_entradas = self._clean_column_specific(self.df_entradas, 'Monto')
        
        print("✅ Datos CLP limpiados y formateados")
        self._show_cleaning_summary()
    
    def _show_cleaning_summary(self):
        """Muestra un resumen de los datos CLP después de la limpieza"""
        print("\n📊 RESUMEN FINAL DE DATOS CLP:")
        
        if not self.df_control.empty:
            print("   Control mensual (CLP):")
            key_columns = ['Ahorro', 'Entrada total', 'Salidas', 'Residuo', 'Sueldo', 'Entradas', 'Cuenta', 'Fecha']
            for col in key_columns:
                if col in self.df_control.columns:
                    non_nan = self.df_control[col].notna().sum()
                    if non_nan > 0:
                        if col == 'Fecha':
                            min_date = self.df_control[col].min()
                            max_date = self.df_control[col].max()
                            print(f"     {col}: {non_nan} fechas, desde {min_date} hasta {max_date}")
                        else:
                            avg_val = self.df_control[col].mean()
                            total_val = self.df_control[col].sum()
                            print(f"     {col}: {non_nan} valores, total: ${total_val:,} CLP, avg: ${avg_val:,.0f} CLP")
        
        if not self.df_entradas.empty and 'Monto' in self.df_entradas.columns:
            monto_data = self.df_entradas['Monto']
            non_nan = monto_data.notna().sum()
            if non_nan > 0:
                total_monto = monto_data.sum()
                avg_monto = monto_data.mean()
                print(f"   Entradas - Monto: {non_nan} valores, total: ${total_monto:,} CLP, avg: ${avg_monto:,.0f} CLP")
        
        if not self.df_salidas.empty and 'Total' in self.df_salidas.columns:
            total_data = self.df_salidas['Total']
            non_nan = total_data.notna().sum()
            if non_nan > 0:
                total_gastos = total_data.sum()
                avg_gasto = total_data.mean()
                print(f"   Salidas - Total: {non_nan} valores, total: ${total_gastos:,} CLP, avg: ${avg_gasto:,.0f} CLP")
    
    def get_resumen_mensual(self):
        """Retorna resumen mensual de finanzas"""
        return self.df_control
    
    def get_gastos_por_categoria(self, mes=None, año=None):
        """Agrupa gastos por categoría"""
        if self.df_salidas is None or self.df_salidas.empty:
            return pd.Series()
            
        df = self.df_salidas.copy()
        
        if 'Categoría' in df.columns and 'Total' in df.columns:
            # Filtrar valores NaN
            df = df[df['Total'].notna()]
            
            # Filtrar por mes y año si se especifican
            if mes and año:
                df = df[(df['Mes'] == str(mes)) & (df['Año'] == str(año))]
            elif año:
                df = df[df['Año'] == str(año)]
            
            gastos_categoria = df.groupby('Categoría')['Total'].sum().sort_values(ascending=False)
            return gastos_categoria
        return pd.Series()
    
    def get_evolucion_ahorro(self):
        """Retorna la evolución del ahorro mensual"""
        if self.df_control is not None and not self.df_control.empty:
            if all(col in self.df_control.columns for col in ['Fecha', 'Ahorro', 'Cuenta']):
                # Filtrar filas con fecha y ahorro válidos
                result = self.df_control[self.df_control['Fecha'].notna()].copy()
                result = result[['Fecha', 'Ahorro', 'Cuenta']].sort_values('Fecha')
                return result
        return pd.DataFrame()
    
    def get_entradas_vs_salidas(self):
        """Compara entradas vs salidas mensuales"""
        if self.df_control is not None and not self.df_control.empty:
            required_cols = ['Fecha', 'Entrada total', 'Salidas', 'Ahorro']
            if all(col in self.df_control.columns for col in required_cols):
                # Filtrar filas con fecha válida
                result = self.df_control[self.df_control['Fecha'].notna()].copy()
                result = result[required_cols].sort_values('Fecha')
                return result
        return pd.DataFrame()
    
    def get_estadisticas_basicas(self):
        """Retorna estadísticas básicas de los datos"""
        stats = {
            'total_meses': len(self.df_control),
            'total_gastos': len(self.df_salidas),
            'total_entradas': len(self.df_entradas),
        }
        
        # Agregar estadísticas solo si hay datos válidos
        if not self.df_control.empty and 'Fecha' in self.df_control.columns:
            valid_dates = self.df_control['Fecha'].notna()
            if valid_dates.any():
                stats['periodo_inicio'] = self.df_control[valid_dates]['Fecha'].min()
                stats['periodo_fin'] = self.df_control[valid_dates]['Fecha'].max()
        
        # Calcular totales solo para columnas con datos
        numeric_columns = {
            'Ahorro': 'total_ahorrado',
            'Entrada total': 'promedio_mensual_entradas', 
            'Salidas': 'promedio_mensual_salidas'
        }
        
        for col, stat_name in numeric_columns.items():
            if col in self.df_control.columns:
                valid_data = self.df_control[col].notna()
                if valid_data.any():
                    if stat_name == 'total_ahorrado':
                        stats[stat_name] = self.df_control[valid_data][col].sum()
                    else:
                        stats[stat_name] = self.df_control[valid_data][col].mean()
        
        return stats
    
    def get_top_gastos(self, n=10):
        """Retorna los n gastos más grandes"""
        if self.df_salidas is None or self.df_salidas.empty:
            return pd.DataFrame()
        
        if 'Total' in self.df_salidas.columns and 'Compra' in self.df_salidas.columns:
            # Filtrar valores válidos
            df_filtered = self.df_salidas[self.df_salidas['Total'].notna()]
            result_cols = ['Compra', 'Total']
            if 'Categoría' in self.df_salidas.columns:
                result_cols.append('Categoría')
            if 'Fecha compra' in self.df_salidas.columns:
                result_cols.append('Fecha compra')
            
            return df_filtered.nlargest(n, 'Total')[result_cols]
        return pd.DataFrame()
    
    def get_datos_para_graficos(self):
        """Prepara datos optimizados para gráficos"""
        datos = {
            'control_mensual': self.get_entradas_vs_salidas(),
            'evolucion_ahorro': self.get_evolucion_ahorro(),
            'gastos_categoria': self.get_gastos_por_categoria(),
            'top_gastos': self.get_top_gastos(15)
        }
        return datos
    
    def get_gastos_por_categoria_mensual(self, categoria=None, año=None):
        """Retorna gastos mensuales por categoría específica o todas las categorías"""
        if self.df_salidas is None or self.df_salidas.empty:
            return pd.DataFrame()
        
        if 'Categoría' not in self.df_salidas.columns or 'Total' not in self.df_salidas.columns:
            return pd.DataFrame()
        
        # Filtrar datos
        df = self.df_salidas.copy()
        df = df[df['Total'].notna()]
        
        # Filtrar por año si se especifica
        if año and 'Año' in df.columns:
            df = df[df['Año'] == str(año)]
        
        # Filtrar por categoría específica si se especifica
        if categoria and 'Categoría' in df.columns:
            df = df[df['Categoría'] == categoria]
        
        # Crear columna Mes-Año para el eje x
        if 'Mes' in df.columns and 'Año' in df.columns:
            df['Mes_Año'] = df['Mes'] + ' ' + df['Año']
            
            # Ordenar por fecha (necesitamos crear una fecha temporal para ordenar)
            meses_orden = {
                'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
                'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
            }
            
            def obtener_orden(mes_año):
                try:
                    mes, año = mes_año.split(' ')
                    return (int(año), meses_orden.get(mes.lower(), 13))
                except:
                    return (9999, 13)
            
            # Agrupar por categoría y mes-año
            if categoria:
                # Para una categoría específica, agrupar solo por mes-año
                grouped = df.groupby('Mes_Año')['Total'].sum().reset_index()
            else:
                # Para todas las categorías, agrupar por categoría y mes-año
                grouped = df.groupby(['Categoría', 'Mes_Año'])['Total'].sum().reset_index()
            
            # Ordenar por fecha
            grouped['orden'] = grouped['Mes_Año'].apply(obtener_orden)
            grouped = grouped.sort_values('orden')
            
            return grouped.drop('orden', axis=1)
        
        return pd.DataFrame()
    
    def get_gastos_mensuales_por_categoria_individual(self, año=None):
        """Retorna un diccionario con DataFrames separados para cada categoría"""
        if self.df_salidas is None or self.df_salidas.empty:
            return {}
        
        if 'Categoría' not in self.df_salidas.columns or 'Total' not in self.df_salidas.columns:
            return {}
        
        # Filtrar datos
        df = self.df_salidas.copy()
        df = df[df['Total'].notna()]
        
        # Filtrar por año si se especifica
        if año and 'Año' in df.columns:
            df = df[df['Año'] == str(año)]
        
        # Obtener todas las categorías únicas
        categorias = df['Categoría'].unique()
        
        resultados = {}
        
        for categoria in categorias:
            # Filtrar por categoría
            df_categoria = df[df['Categoría'] == categoria].copy()
            
            if df_categoria.empty:
                continue
                
            # Crear columna Mes-Año
            if 'Mes' in df_categoria.columns and 'Año' in df_categoria.columns:
                df_categoria['Mes_Año'] = df_categoria['Mes'] + ' ' + df_categoria['Año']
                
                # Agrupar por Mes-Año y sumar Total
                grouped = df_categoria.groupby('Mes_Año')['Total'].sum().reset_index()
                
                # Ordenar por fecha
                meses_orden = {
                    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
                    'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
                }
                
                def obtener_orden(mes_año):
                    try:
                        mes, año = mes_año.split(' ')
                        return (int(año), meses_orden.get(mes.lower(), 13))
                    except:
                        return (9999, 13)
                
                grouped['orden'] = grouped['Mes_Año'].apply(obtener_orden)
                grouped = grouped.sort_values('orden')
                grouped = grouped.drop('orden', axis=1)
                
                resultados[categoria] = grouped
        
        return resultados
