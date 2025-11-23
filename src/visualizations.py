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
        if df.empty or len(df) == 0:
            print("❌ No hay datos suficientes para generar el gráfico de evolución")
            return self._create_empty_plot("No hay datos disponibles")
        
        # Filtrar solo filas con al menos un dato numérico
        df = df[df[['Entrada total', 'Salidas', 'Ahorro']].notna().any(axis=1)]
        
        if len(df) == 0:
            print("❌ No hay valores numéricos en las columnas requeridas")
            return self._create_empty_plot("Datos numéricos no disponibles")
        
        fig = go.Figure()
        
        # Solo agregar trazas para columnas con datos
        if df['Entrada total'].notna().any():
            fig.add_trace(go.Scatter(
                x=df['Fecha'], y=df['Entrada total'],
                mode='lines+markers',
                name='Entradas Totales',
                line=dict(color='#2E8B57', width=3),
                marker=dict(size=8)
            ))
        
        if df['Salidas'].notna().any():
            fig.add_trace(go.Scatter(
                x=df['Fecha'], y=df['Salidas'],
                mode='lines+markers',
                name='Salidas',
                line=dict(color='#DC143C', width=3),
                marker=dict(size=8)
            ))
        
        if df['Ahorro'].notna().any():
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
    
    def _create_empty_plot(self, message):
        """Crea un gráfico vacío con mensaje"""
        fig = go.Figure()
        fig.add_annotation(
            text=message,
            xref="paper", yref="paper",
            x=0.5, y=0.5,
            showarrow=False,
            font=dict(size=16)
        )
        fig.update_layout(
            title="⚠️ Datos no disponibles",
            xaxis=dict(visible=False),
            yaxis=dict(visible=False),
            height=400
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
    
    def plot_gastos_mensuales_por_categoria(self, categoria=None, año=None, top_categorias=8):
        """Gráfico de barras de gastos mensuales por categoría"""
        
        # Obtener datos
        datos = self.processor.get_gastos_por_categoria_mensual(categoria, año)
        
        if datos.empty:
            print("❌ No hay datos para generar el gráfico de gastos mensuales por categoría")
            return self._create_empty_plot("No hay datos disponibles")
        
        if categoria:
            # Gráfico para una categoría específica
            fig = px.bar(
                datos,
                x='Mes_Año',
                y='Total',
                title=f'📊 Gastos Mensuales - {categoria} ({año if año else "Todos los años"})',
                labels={'Mes_Año': 'Mes - Año', 'Total': 'Total Gastado (CLP)'},
                color_discrete_sequence=['#FF6B6B']
            )
            
            fig.update_layout(
                xaxis_title='Mes - Año',
                yaxis_title='Total Gastado (CLP)',
                template='plotly_white',
                height=500
            )
            
            # Formatear eje Y con separadores de miles
            fig.update_yaxes(tickformat=",.")
            
        else:
            # Gráfico para todas las categorías (top N)
            # Obtener las categorías con más gastos totales
            gastos_totales = self.processor.get_gastos_por_categoria(año=año)
            top_cats = gastos_totales.head(top_categorias).index.tolist()
            
            # Filtrar datos para solo las top categorías
            datos_filtrados = datos[datos['Categoría'].isin(top_cats)]
            
            if datos_filtrados.empty:
                print("❌ No hay datos para las categorías seleccionadas")
                return self._create_empty_plot("No hay datos para las categorías seleccionadas")
            
            fig = px.bar(
                datos_filtrados,
                x='Mes_Año',
                y='Total',
                color='Categoría',
                title=f'📊 Gastos Mensuales por Categoría ({año if año else "Todos los años"})',
                labels={'Mes_Año': 'Mes - Año', 'Total': 'Total Gastado (CLP)'},
                barmode='group'
            )
            
            fig.update_layout(
                xaxis_title='Mes - Año',
                yaxis_title='Total Gastado (CLP)',
                template='plotly_white',
                height=600,
                legend=dict(
                    orientation="h",
                    yanchor="bottom",
                    y=1.02,
                    xanchor="right",
                    x=1
                )
            )
            
            # Formatear eje Y con separadores de miles
            fig.update_yaxes(tickformat=",.")
        
        return fig

    def plot_evolucion_categorias_individuales(self, año=None, top_categorias=6):
        """Gráficos individuales de evolución para cada categoría top"""
        
        # Obtener categorías con más gastos
        gastos_totales = self.processor.get_gastos_por_categoria(año=año)
        top_cats = gastos_totales.head(top_categorias).index.tolist()
        
        if not top_cats:
            print("❌ No hay categorías para mostrar")
            return self._create_empty_plot("No hay datos de categorías")
        
        # Crear subplots
        from plotly.subplots import make_subplots
        import plotly.graph_objects as go
        
        fig = make_subplots(
            rows=len(top_cats), 
            cols=1,
            subplot_titles=[f'📈 {categoria}' for categoria in top_cats],
            vertical_spacing=0.05
        )
        
        colors = px.colors.qualitative.Set3
        
        for i, categoria in enumerate(top_cats, 1):
            datos_categoria = self.processor.get_gastos_por_categoria_mensual(categoria, año)
            
            if not datos_categoria.empty:
                fig.add_trace(
                    go.Bar(
                        x=datos_categoria['Mes_Año'],
                        y=datos_categoria['Total'],
                        name=categoria,
                        marker_color=colors[i % len(colors)],
                        showlegend=False
                    ),
                    row=i, col=1
                )
        
        fig.update_layout(
            title_text=f'📊 Evolución Mensual por Categoría ({año if año else "Todos los años"})',
            height=300 * len(top_cats),
            template='plotly_white',
            showlegend=False
        )
        
        fig.update_yaxes(tickformat=",.")
        
        return fig


    def plot_gastos_individual_por_categoria(self, año=None, categorias=None):
        """Genera un gráfico independiente para CADA categoría"""
        
        # Obtener datos organizados por categoría
        datos_por_categoria = self.processor.get_gastos_mensuales_por_categoria_individual(año)
        
        if not datos_por_categoria:
            print("❌ No hay datos para generar gráficos por categoría")
            return []
        
        # Filtrar categorías si se especifican
        if categorias:
            datos_por_categoria = {cat: data for cat, data in datos_por_categoria.items() 
                                if cat in categorias}
        
        if not datos_por_categoria:
            print("❌ No hay datos para las categorías seleccionadas")
            return []
        
        figuras = []
        
        for categoria, datos in datos_por_categoria.items():
            if datos.empty:
                continue
                
            # Crear gráfico para esta categoría
            fig = px.bar(
                datos,
                x='Mes_Año',
                y='Total',
                title=f'📊 {categoria} - Gastos Mensuales ({año if año else "Todos los años"})',
                labels={'Mes_Año': 'Mes - Año', 'Total': 'Total Gastado (CLP)'},
                color_discrete_sequence=['#FF6B6B']
            )
            
            # Personalizar el gráfico
            fig.update_layout(
                xaxis_title='Mes - Año',
                yaxis_title='Total Gastado (CLP)',
                template='plotly_white',
                height=500,
                showlegend=False
            )
            
            # Formatear eje Y con separadores de miles
            fig.update_yaxes(tickformat=",.")
            
            # Agregar anotaciones con estadísticas
            total_categoria = datos['Total'].sum()
            max_gasto = datos['Total'].max()
            min_gasto = datos['Total'].min()
            
            fig.add_annotation(
                text=f"Total: ${total_categoria:,} CLP<br>Máximo: ${max_gasto:,} CLP<br>Mínimo: ${min_gasto:,} CLP",
                xref="paper", yref="paper",
                x=0.02, y=0.98,
                showarrow=False,
                bgcolor="white",
                bordercolor="black",
                borderwidth=1,
                font=dict(size=10)
            )
            
            figuras.append((categoria, fig))
        
        return figuras
    
    def plot_gastos_individual_por_categoria(self, año=None, categorias=None):
        """Genera un gráfico independiente para CADA categoría con etiquetas de valor y colores personalizados"""
        
        # ⚡️ ÚNICO DICCIONARIO DE COLORES - MODIFICA SOLO AQUÍ
        colores_categorias = {
            # MODIFICA ESTOS COLORES HEX SEGÚN TUS PREFERENCIAS
            'Arriendo/Hipoteca': "#BB1A1A",
            'Servicios básicos': '#BB1A1A',
            'Internet/Telefonía': "#EB7670",
            'Suscripciones': "#EFAC7C",
            'Transporte': '#EB7670',
            'Seguros': "#73E5F2",
            'Educación': '#EB7670',
            'Supermercado/Feria': "#109624",
            'Salud': "#3C53FF",
            'Compras personales': "#5CFAFF",
            'Restaurantes/Comida rápida': "#FFED47",
            'Entretenimiento': '#FFED47',
            'Regalos': "#FF9FF2",
            'Viajes': '#73E5F2',
            'Imprevistos': "#B5FFE6",
            'Ahorro': "#961EFF"
            # Agrega más categorías según necesites con formato HEX: '#RRGGBB'
        }
        
        # Obtener datos organizados por categoría
        datos_por_categoria = self.processor.get_gastos_mensuales_por_categoria_individual(año)
        
        if not datos_por_categoria:
            print("❌ No hay datos para generar gráficos por categoría")
            return []
        
        # Filtrar categorías si se especifican
        if categorias:
            datos_por_categoria = {cat: data for cat, data in datos_por_categoria.items() 
                                if cat in categorias}
        
        if not datos_por_categoria:
            print("❌ No hay datos para las categorías seleccionadas")
            return []
        
        figuras = []
        
        for categoria, datos in datos_por_categoria.items():
            if datos.empty:
                continue
                
            # Obtener color para esta categoría (usar color por defecto si no está en el diccionario)
            color_categoria = colores_categorias.get(categoria, '#6495ED')  # Azul por defecto
            
            # Crear gráfico para esta categoría
            fig = px.bar(
                datos,
                x='Mes_Año',
                y='Total',
                title=f'📊 {categoria} - Gastos Mensuales ({año if año else "Todos los años"})',
                labels={'Mes_Año': 'Mes - Año', 'Total': 'Total Gastado (CLP)'},
                color_discrete_sequence=[color_categoria]
            )
            
            # AGREGAR ETIQUETAS DE VALOR EN LAS BARRAS
            fig.update_traces(
                texttemplate='$%{y:,}',
                textposition='outside',
                textfont=dict(size=10, color='black'),
                hovertemplate='<b>%{x}</b><br>Total: $%{y:,} CLP<extra></extra>'
            )
            
            # Personalizar el gráfico
            fig.update_layout(
                xaxis_title='Mes - Año',
                yaxis_title='Total Gastado (CLP)',
                template='plotly_white',
                height=500,
                showlegend=False,
                # Ajustar márgenes para que quepan las etiquetas
                margin=dict(t=80, b=100, l=80, r=80)
            )
            
            # Formatear eje Y con separadores de miles
            fig.update_yaxes(tickformat=",.")
            
            # Rotar etiquetas del eje X para mejor legibilidad
            fig.update_xaxes(tickangle=45)
            
            # Agregar anotaciones con estadísticas
            total_categoria = datos['Total'].sum()
            max_gasto = datos['Total'].max()
            min_gasto = datos['Total'].min()
            promedio_gasto = datos['Total'].mean()
            
            fig.add_annotation(
                text=f"<b>Estadísticas:</b><br>"
                    f"Total: ${total_categoria:,} CLP<br>"
                    f"Promedio: ${promedio_gasto:,.0f} CLP<br>"
                    f"Máximo: ${max_gasto:,} CLP<br>"
                    f"Mínimo: ${min_gasto:,} CLP",
                xref="paper", yref="paper",
                x=0.02, y=0.98,
                showarrow=False,
                bgcolor="rgba(255, 255, 255, 0.8)",
                bordercolor="black",
                borderwidth=1,
                borderpad=4,
                font=dict(size=10, color="black"),
                align="left"
            )
            
            # Agregar número de meses con datos
            fig.add_annotation(
                text=f"Meses con datos: {len(datos)}",
                xref="paper", yref="paper",
                x=0.98, y=0.98,
                showarrow=False,
                bgcolor="rgba(255, 255, 255, 0.8)",
                bordercolor="black",
                borderwidth=1,
                borderpad=4,
                font=dict(size=10, color="black"),
                align="right"
            )
            
            figuras.append((categoria, fig))
        
        return figuras

    def mostrar_diccionario_colores(self):
        """Muestra el diccionario de colores actual (usa el MISMO diccionario)"""
        # ⚡️ USA EL MISMO DICCIONARIO - NO CREA UNO NUEVO
        from .visualizations import FinanceVisualizations
        
        # Crear instancia temporal para acceder al diccionario
        temp_instance = FinanceVisualizations(self.processor)
        
        print("🎨 DICCIONARIO DE COLORES ACTUAL (formato HEX):")
        print("Para modificar, edita el diccionario 'colores_categorias' en la función 'plot_gastos_individual_por_categoria'")
        print("\nColores actuales:")
        
        # Obtener el diccionario actual llamando a la función
        figuras = temp_instance.plot_gastos_individual_por_categoria()
        if hasattr(temp_instance, 'colores_categorias'):
            colores_actuales = temp_instance.colores_categorias
        else:
            # Si no se puede acceder, mostrar el diccionario por defecto
            colores_actuales = {
                'Arriendo/Hipoteca': "#BB1A1A",
                'Servicios básicos': '#BB1A1A',
                'Internet/Telefonía': "#EB7670",
                'Suscripciones': "#EFAC7C",
                'Transporte': '#EB7670',
                'Seguros': "#73E5F2",
                'Educación': '#EB7670',
                'Supermercado/Feria': "#109624",
                'Salud': "#3C53FF",
                'Compras personales': "#5CFAFF",
                'Restaurantes/Comida rápida': "#FFED47",
                'Entretenimiento': '#FFED47',
                'Regalos': "#FF9FF2",
                'Viajes': '#73E5F2',
                'Imprevistos': "#B5FFE6",
                'Ahorro': "#961EFF"
            }
        
        for categoria, color in colores_actuales.items():
            print(f"  '{categoria}': '{color}'")
        
        return colores_actuales
