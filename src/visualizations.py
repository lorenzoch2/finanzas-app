# src/visualizations.py
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd

class FinanceVisualizations:
    def __init__(self, data_processor):
        self.processor = data_processor
    
    def plot_evolucion_finanzas(self):
        """Gráfico de evolución de entradas, salidas y ahorro"""
        df = self.processor.get_entradas_vs_salidas()
        if df.empty:
            print("❌ No hay datos para generar el gráfico")
            return None
        
        fig = go.Figure()
        
        fig.add_trace(go.Scatter(
            x=df['Fecha'], y=df['Entrada total'],
            mode='lines+markers',
            name='Entradas Totales',
            line=dict(color='#2E8B57', width=3),
            marker=dict(size=8)
        ))
        
        fig.add_trace(go.Scatter(
            x=df['Fecha'], y=df['Salidas'],
            mode='lines+markers',
            name='Salidas',
            line=dict(color='#DC143C', width=3),
            marker=dict(size=8)
        ))
        
        fig.add_trace(go.Scatter(
            x=df['Fecha'], y=df['Ahorro'],
            mode='lines+markers',
            name='Ahorro',
            line=dict(color='#4169E1', width=3),
            marker=dict(size=8)
        ))
        
        fig.update_layout(
            title='📈 Evolución de Finanzas Mensuales',
            xaxis_title='Mes',
            yaxis_title='Monto ($)',
            template='plotly_white',
            hovermode='x unified',
            height=500
        )
        
        return fig
    
    def plot_gastos_por_categoria(self, año=None, top_n=10):
        """Gráfico de torta de gastos por categoría"""
        gastos_categoria = self.processor.get_gastos_por_categoria(año=año)
        
        if gastos_categoria.empty:
            print("❌ No hay datos de gastos por categoría")
            return None
        
        # Tomar solo las top_n categorías
        top_gastos = gastos_categoria.head(top_n)
        
        fig = px.pie(
            values=top_gastos.values,
            names=top_gastos.index,
            title=f'🛍️ Distribución de Gastos por Categoría ({año if año else "Total"})',
            color_discrete_sequence=px.colors.qualitative.Set3
        )
        
        fig.update_traces(
            textposition='inside', 
            textinfo='percent+label',
            hovertemplate='<b>%{label}</b><br>%{value:$,.0f}<br>%{percent}'
        )
        
        fig.update_layout(height=500)
        
        return fig
    
    def plot_tendencia_ahorro(self):
        """Gráfico de tendencia de ahorro acumulado"""
        df_ahorro = self.processor.get_evolucion_ahorro()
        
        if df_ahorro.empty:
            print("❌ No hay datos de ahorro")
            return None
        
        fig = go.Figure()
        
        fig.add_trace(go.Scatter(
            x=df_ahorro['Fecha'], 
            y=df_ahorro['Ahorro'].cumsum(),
            mode='lines+markers',
            name='Ahorro Acumulado',
            line=dict(color='#8A2BE2', width=4),
            marker=dict(size=8)
        ))
        
        fig.add_trace(go.Scatter(
            x=df_ahorro['Fecha'], 
            y=df_ahorro['Cuenta'],
            mode='lines+markers',
            name='Cuenta',
            line=dict(color='#FF8C00', width=3),
            marker=dict(size=6)
        ))
        
        fig.update_layout(
            title='💰 Tendencia de Ahorro Acumulado',
            xaxis_title='Mes',
            yaxis_title='Monto Acumulado ($)',
            template='plotly_white',
            hovermode='x unified',
            height=500
        )
        
        return fig
    
    def plot_comparativo_mensual(self):
        """Gráfico de barras comparativo mensual"""
        df = self.processor.get_entradas_vs_salidas()
        
        if df.empty:
            print("❌ No hay datos para comparativo mensual")
            return None
        
        fig = go.Figure(data=[
            go.Bar(name='💰 Entradas', x=df['Fecha'], y=df['Entrada total'], 
                   marker_color='#2E8B57', opacity=0.8),
            go.Bar(name='🛍️ Salidas', x=df['Fecha'], y=df['Salidas'], 
                   marker_color='#DC143C', opacity=0.8),
            go.Bar(name='💸 Ahorro', x=df['Fecha'], y=df['Ahorro'], 
                   marker_color='#4169E1', opacity=0.8)
        ])
        
        fig.update_layout(
            title='📊 Comparativo Mensual: Entradas vs Salidas vs Ahorro',
            xaxis_title='Mes',
            yaxis_title='Monto ($)',
            barmode='group',
            template='plotly_white',
            hovermode='x unified',
            height=500
        )
        
        return fig
    
    def plot_top_gastos(self, n=15):
        """Gráfico de los gastos individuales más grandes"""
        top_gastos = self.processor.get_top_gastos(n)
        
        if top_gastos.empty:
            print("❌ No hay datos de gastos individuales")
            return None
        
        fig = px.bar(
            top_gastos,
            x='Total',
            y='Compra',
            orientation='h',
            color='Categoría',
            title=f'🔥 Top {n} Gastos Más Grandes',
            labels={'Total': 'Monto ($)', 'Compra': 'Descripción'}
        )
        
        fig.update_layout(
            yaxis={'categoryorder': 'total ascending'},
            height=600,
            template='plotly_white'
        )
        
        return fig
